
/**
 * ============================================================
 * SANGEN Sake Tasting Room - Backend Script
 * ============================================================
 */

function manualAuthorize() {
  const cal = getCalendar();
  const name = cal.getName();
  try { UrlFetchApp.fetch("https://google.com"); } catch(e) {}
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), "SANGEN System: Authorized", "The system is authorized for: " + name);
  return "Authorized: " + name;
}

function logToSheet(action, message) {
  try {
    const ssId = getProp('SPREADSHEET_ID');
    const ss = SpreadsheetApp.openById(ssId);
    let sheet = ss.getSheetByName('Logs');
    if (!sheet) {
      sheet = ss.insertSheet('Logs');
      sheet.appendRow(['Timestamp', 'Action', 'Message']);
    }
    sheet.appendRow([new Date(), action, message]);
  } catch(e) {}
}

const getProp = (key) => {
  const p = PropertiesService.getScriptProperties().getProperty(key);
  return p ? p.trim() : null;
};

function handleRequest(e) {
  let result = {};
  try {
    const params = e.parameter || {};
    let postData = null;
    if (e.postData && e.postData.contents) {
      try { postData = JSON.parse(e.postData.contents); } catch (jsonErr) {}
    }
    const action = (postData && postData.action) ? postData.action : params.action;
    const payload = { ...params, ...(postData && postData.payload ? postData.payload : {}) };
    const token = getProp('APP_SECURITY_TOKEN');
    if (token && ((postData && postData.token) || params.token) !== token) throw new Error('TOKEN_MISMATCH');

    if (action === 'testConfig') result = testConfig();
    else if (action === 'getMonthStatus') result = getMonthStatus(Number(payload.year), Number(payload.month), payload.type, payload.force);
    else if (action === 'getBookings') result = getBookings();
    else if (action === 'createBooking') result = createBooking(payload);
    else if (action === 'finalizeBooking') result = finalizeBooking(payload.sessionId);
    else if (action === 'updateStatus') result = updateBookingStatus(payload);
    else if (action === 'deleteBooking') result = deleteBooking(payload.id);
    else if (action === 'getEmailTemplate') result = getEmailTemplate();
    else if (action === 'updateEmailTemplate') result = updateEmailTemplate(payload);
    else if (action === 'login') result = login(payload);
    else throw new Error('INVALID_ACTION: ' + action);
  } catch (err) {
    result = { error: err.message };
    logToSheet("ERROR", err.message);
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function getSheet() {
  const ssId = getProp('SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);
  let sheet = ss.getSheetByName('Bookings');
  if (!sheet) {
    sheet = ss.insertSheet('Bookings');
    sheet.appendRow(['ID', 'Type', 'Date', 'Time', 'Status', 'Adults', 'NonAlc', 'Children', 'Infants', 'Price', 'Name', 'Email', 'JSONData', 'CreatedAt']);
  }
  return sheet;
}

function getPendingSheet() {
  const ssId = getProp('SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);
  let sheet = ss.getSheetByName('PendingBookings');
  if (!sheet) {
    sheet = ss.insertSheet('PendingBookings');
    sheet.appendRow(['StripeSessionID', 'JSONPayload', 'CreatedAt']);
  }
  return sheet;
}

function getSettingsSheet() {
  const ssId = getProp('SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);
  let sheet = ss.getSheetByName('Settings');
  if (!sheet) {
    sheet = ss.insertSheet('Settings');
    sheet.appendRow(['Key', 'Value']);
  }
  return sheet;
}

function getCalendar() {
  const calId = getProp('CALENDAR_ID');
  return calId ? CalendarApp.getCalendarById(calId) : CalendarApp.getDefaultCalendar();
}

function createBooking(payload) {
  const stripeKey = getProp('STRIPE_SECRET_KEY');
  const session = createStripeSession(payload.totalPrice, payload.representative.email, payload.returnUrl, stripeKey, payload.date, payload.time);
  const pendingSheet = getPendingSheet();
  pendingSheet.appendRow([session.id, JSON.stringify(payload), new Date().toISOString()]);
  SpreadsheetApp.flush();
  return { success: true, checkoutUrl: session.url };
}

function createStripeSession(amount, email, returnUrl, key, date, time) {
  const options = {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + key },
    payload: {
      'payment_method_types[]': 'card',
      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][product_data][name]': 'SANGEN Sake Tasting Room',
      'line_items[0][price_data][unit_amount]': String(Math.round(amount)),
      'line_items[0][quantity]': '1',
      'mode': 'payment',
      'payment_intent_data[capture_method]': 'manual',
      'success_url': returnUrl + '?status=success&session_id={CHECKOUT_SESSION_ID}',
      'cancel_url': returnUrl + '?status=cancel',
      'customer_email': email,
    }
  };
  const response = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions', options);
  return JSON.parse(response.getContentText());
}

function finalizeBooking(sessionId) {
  logToSheet("FINALIZE_START", "Processing Session: " + sessionId);
  const stripeKey = getProp('STRIPE_SECRET_KEY');
  
  let session;
  for (let i = 0; i < 5; i++) {
    const response = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions/' + sessionId, {
      headers: { 'Authorization': 'Bearer ' + stripeKey },
      muteHttpExceptions: true
    });
    session = JSON.parse(response.getContentText());
    if (session.payment_status === 'paid' || session.status === 'complete') break;
    Utilities.sleep(1000); 
  }

  if (session.status !== 'complete' && session.payment_status !== 'paid') {
    logToSheet("FINALIZE_ABORT", "Session not ready. Status: " + session.status);
    return { success: false, error: 'PAYMENT_NOT_COMPLETED' };
  }
  
  const paymentIntentId = session.payment_intent;
  const sheet = getSheet();
  const bookingsData = sheet.getDataRange().getValues();
  
  for (let i = 1; i < bookingsData.length; i++) {
    if (bookingsData[i][12] && bookingsData[i][12].indexOf(sessionId) !== -1) {
      logToSheet("FINALIZE_SKIP", "Already processed.");
      return { success: true, alreadyFinalized: true };
    }
  }

  const pendingSheet = getPendingSheet();
  const pendingData = pendingSheet.getDataRange().getValues();
  let bookingPayload = null;
  let rowIndex = -1;
  for (let i = 1; i < pendingData.length; i++) {
    if (pendingData[i][0] === sessionId) {
      bookingPayload = JSON.parse(pendingData[i][1]);
      rowIndex = i + 1;
      break;
    }
  }
  
  if (!bookingPayload) {
    logToSheet("FINALIZE_ERROR", "No pending data found.");
    return { success: false, error: "DATA_NOT_FOUND" };
  }

  const id = 'bk_' + new Date().getTime();
  const createdAtISO = new Date().toISOString();
  bookingPayload.stripeSessionId = sessionId;
  bookingPayload.paymentIntentId = paymentIntentId;
  bookingPayload.createdAt = createdAtISO;

  sheet.appendRow([
    id, bookingPayload.type, bookingPayload.date, bookingPayload.time, 'REQUESTED', 
    bookingPayload.adults, bookingPayload.adultsNonAlc, bookingPayload.children, bookingPayload.infants, 
    bookingPayload.totalPrice, bookingPayload.representative.lastName, bookingPayload.representative.email, 
    JSON.stringify(bookingPayload), createdAtISO
  ]);
  
  SpreadsheetApp.flush(); 
  logToSheet("FINALIZE_SUCCESS", "Booking saved: " + id);

  try { 
    sendTemplatedEmail('RECEIVED', bookingPayload); 
    logToSheet("EMAIL_SENT", "Customer email sent.");
  } catch (e) { logToSheet("ERR_EMAIL_CUST", e.message); }
  
  try {
    const adminEmail = getEmailTemplate()['ADMIN_NOTIFY_EMAIL'];
    if (adminEmail) {
      GmailApp.sendEmail(adminEmail, "[SANGEN] New Reservation Request", 
        "Name: " + bookingPayload.representative.lastName + "\nDate: " + bookingPayload.date + " " + bookingPayload.time + "\nPlease review in Admin Panel.");
    }
  } catch (e) { logToSheet("ERR_EMAIL_ADMIN", e.message); }

  try { 
    pendingSheet.deleteRow(rowIndex); 
    SpreadsheetApp.flush();
  } catch(e) {}

  return { success: true, id: id };
}

function sendTemplatedEmail(type, booking) {
  const templates = getEmailTemplate();
  let subject = templates[type + '_SUBJECT'];
  let body = templates[type + '_BODY'];
  
  if (!subject || !body) {
    if (type === 'RECEIVED') {
      subject = "Reservation Request Received - SANGEN";
      body = "Dear {{name}},\n\nWe have received your reservation request.\n\nDate: {{date}}\nTime: {{time}}\nType: {{type}}\n\nOur staff will review it and contact you within 3 days.\nThank you.";
    } else if (type === 'CONFIRMED') {
      subject = "Reservation Confirmed - SANGEN";
      body = "Dear {{name}},\n\nYour reservation is now CONFIRMED.\n\nDate: {{date}}\nTime: {{time}}\n\nSee you soon!";
    } else return;
  }

  const name = booking.representative.lastName + ' ' + booking.representative.firstName;
  const finalSubject = subject.replace(/{{name}}/g, name).replace(/{{date}}/g, booking.date).replace(/{{time}}/g, booking.time);
  const finalBody = body.replace(/{{name}}/g, name).replace(/{{date}}/g, booking.date).replace(/{{time}}/g, booking.time).replace(/{{type}}/g, booking.type);

  GmailApp.sendEmail(booking.representative.email, finalSubject, finalBody, { name: "SANGEN Sake Tasting Room" });
}

function updateBookingStatus(p) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const stripeKey = getProp('STRIPE_SECRET_KEY');

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == p.id) {
      let b = JSON.parse(data[i][12]);
      const piId = b.paymentIntentId;

      if (p.status) {
        if (p.status === 'CONFIRMED' && piId) {
          UrlFetchApp.fetch('https://api.stripe.com/v1/payment_intents/' + piId + '/capture', {
            method: 'post', headers: { 'Authorization': 'Bearer ' + stripeKey }
          });
        } else if ((p.status === 'REJECTED' || p.status === 'CANCELLED') && piId) {
          UrlFetchApp.fetch('https://api.stripe.com/v1/payment_intents/' + piId + '/cancel', {
            method: 'post', headers: { 'Authorization': 'Bearer ' + stripeKey }, muteHttpExceptions: true
          });
        }
        sheet.getRange(i + 1, 5).setValue(p.status);
        b.status = p.status;
        try { sendTemplatedEmail(p.status, b); } catch(e) {}
      }
      if (p.secondaryStatus !== undefined) b.secondaryStatus = p.secondaryStatus;
      sheet.getRange(i + 1, 13).setValue(JSON.stringify(b));
      SpreadsheetApp.flush();
      return { success: true };
    }
  }
  return { success: false };
}

function getBookings() {
  const rows = getSheet().getDataRange().getValues();
  if (rows.length <= 1) return [];
  return rows.slice(1).map(r => {
    try {
      let b = JSON.parse(r[12]);
      b.id = r[0]; b.status = r[4]; b.createdAt = r[13];
      return b;
    } catch(e) { return null; }
  }).filter(b => b !== null);
}

function deleteBooking(id) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      sheet.deleteRow(i + 1);
      SpreadsheetApp.flush();
      return { success: true };
    }
  }
  return { success: false };
}

function getEmailTemplate() {
  const data = getSettingsSheet().getDataRange().getValues();
  const t = {};
  data.slice(1).forEach(r => { if (r[0]) t[r[0]] = r[1]; });
  return t;
}

function updateEmailTemplate(p) {
  const sheet = getSettingsSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === p.key) {
      sheet.getRange(i + 1, 2).setValue(p.value);
      SpreadsheetApp.flush();
      return { success: true };
    }
  }
  sheet.appendRow([p.key, p.value]);
  SpreadsheetApp.flush();
  return { success: true };
}

function login(p) { 
  return (p.email === 'admin@sangen.com' && p.password === 'sake') ? { success: true } : { success: false }; 
}

function testConfig() {
  try { return { success: true, name: getSheet().getParent().getName() }; } catch(e) { return { error: e.message }; }
}

function getMonthStatus(year, month, type, force) {
  const results = {};
  const calendar = getCalendar();
  const tz = Session.getScriptTimeZone();
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);
  const bookingsMap = {};
  try {
    const rows = getSheet().getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (['CANCELLED', 'REJECTED'].indexOf(rows[i][4]) !== -1) continue;
      const key = rows[i][2] + "_" + rows[i][3];
      bookingsMap[key] = (bookingsMap[key] || 0) + Number(rows[i][5]) + Number(rows[i][6]) + Number(rows[i][7]) + Number(rows[i][8]);
    }
  } catch (e) {}
  calendar.getEvents(startDate, endDate).forEach(event => {
    if (event.isAllDayEvent()) return;
    const d = event.getStartTime();
    const ds = Utilities.formatDate(d, tz, "yyyy-MM-dd");
    const ts = Utilities.formatDate(d, tz, "HH:mm");
    if (!results[ds]) results[ds] = [];
    results[ds].push({ time: ts, available: true, currentGroupCount: bookingsMap[ds + "_" + ts] || 0 });
  });
  return results;
}
