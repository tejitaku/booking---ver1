
/**
 * ============================================================
 * Sangen Sake Experience - Backend Script (Auth & Capture Ready)
 * ============================================================
 */

function manualAuthorize() {
  const cal = getCalendar();
  const name = cal.getName();
  const ss = getSheet();
  const email = Session.getActiveUser().getEmail();
  try { UrlFetchApp.fetch("https://google.com"); } catch(e) {}
  GmailApp.sendEmail(email, "Sangen System: Authorization Successful", "The system is now authorized for Calendar, Sheets, Gmail, and External Requests.");
  return "Authorization successful for: " + name;
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
    if (token) {
      const receivedToken = (postData && postData.token) ? postData.token : (params.token);
      if (receivedToken !== token) throw new Error('TOKEN_MISMATCH');
    }

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
    result = { error: err.message, stack: err.stack };
    logToSheet("ERROR", err.message);
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function getSheet() {
  const ssId = getProp('SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);
  const sheetName = 'Bookings';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['ID', 'Type', 'Date', 'Time', 'Status', 'Adults', 'NonAlc', 'Children', 'Infants', 'Price', 'Name', 'Email', 'JSONData', 'CreatedAt']);
  }
  return sheet;
}

function getPendingSheet() {
  const ssId = getProp('SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);
  const sheetName = 'PendingBookings';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['StripeSessionID', 'JSONPayload', 'CreatedAt']);
  }
  return sheet;
}

function getSettingsSheet() {
  const ssId = getProp('SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);
  const sheetName = 'Settings';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
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
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is missing.");
  logToSheet("CREATE_BOOKING", "Creating Stripe AUTH session for " + payload.representative.email);
  const session = createStripeSession(payload.totalPrice, payload.representative.email, payload.returnUrl, stripeKey, payload.date, payload.time);
  const pendingSheet = getPendingSheet();
  pendingSheet.appendRow([session.id, JSON.stringify(payload), new Date().toISOString()]);
  return { success: true, checkoutUrl: session.url };
}

function createStripeSession(amount, email, returnUrl, key, date, time) {
  const options = {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + key },
    payload: {
      'payment_method_types[]': 'card',
      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][product_data][name]': 'Sangen Sake Experience',
      'line_items[0][price_data][product_data][description]': "Auth for Reservation: " + date + " " + time,
      'line_items[0][price_data][unit_amount]': String(Math.round(amount)),
      'line_items[0][quantity]': '1',
      'mode': 'payment',
      'payment_intent_data[capture_method]': 'manual', // ← ここが重要：決済を保留にする
      'success_url': returnUrl + '?status=success&session_id={CHECKOUT_SESSION_ID}',
      'cancel_url': returnUrl + '?status=cancel',
      'customer_email': email,
    }
  };
  const response = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions', options);
  return JSON.parse(response.getContentText());
}

function finalizeBooking(sessionId) {
  logToSheet("FINALIZE_START", "Session ID: " + sessionId);
  const stripeKey = getProp('STRIPE_SECRET_KEY');
  
  let session;
  try {
    const response = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions/' + sessionId, {
      headers: { 'Authorization': 'Bearer ' + stripeKey },
      muteHttpExceptions: true
    });
    session = JSON.parse(response.getContentText());
  } catch(e) { throw e; }

  // 決済ステータスの確認 (Authorizeが完了しているか)
  if (session.payment_status === 'unpaid') return { success: false, error: 'PAYMENT_PENDING' };
  
  const paymentIntentId = session.payment_intent;
  logToSheet("STRIPE_PI", "PaymentIntent ID: " + paymentIntentId);

  const sheet = getSheet();
  const bookingsData = sheet.getDataRange().getValues();
  for (let i = 1; i < bookingsData.length; i++) {
    if (bookingsData[i][12] && bookingsData[i][12].indexOf(sessionId) !== -1) {
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
  if (!bookingPayload) throw new Error("Reservation data not found.");

  const id = 'bk_' + new Date().getTime();
  const createdAtISO = new Date().toISOString();
  bookingPayload.stripeSessionId = sessionId;
  bookingPayload.paymentIntentId = paymentIntentId; // PaymentIntent IDを保存
  bookingPayload.createdAt = createdAtISO;

  sheet.appendRow([
    id, bookingPayload.type, bookingPayload.date, bookingPayload.time, 'REQUESTED', 
    bookingPayload.adults, bookingPayload.adultsNonAlc, bookingPayload.children, bookingPayload.infants, 
    bookingPayload.totalPrice, bookingPayload.representative.lastName, bookingPayload.representative.email, 
    JSON.stringify(bookingPayload), createdAtISO
  ]);
  
  SpreadsheetApp.flush();
  try { sendTemplatedEmail('RECEIVED', bookingPayload); } catch (e) {}
  try {
    const templates = getEmailTemplate();
    const adminEmail = templates['ADMIN_NOTIFY_EMAIL'];
    if (adminEmail) GmailApp.sendEmail(adminEmail, "[Sangen] New Auth Booking", "New booking auth'd. Please Confirm or Reject.");
  } catch (e) {}
  try { pendingSheet.deleteRow(rowIndex); } catch(e) {}

  return { success: true, id: id };
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
        // --- Stripe連動ロジック ---
        if (p.status === 'CONFIRMED' && piId) {
          logToSheet("STRIPE_CAPTURE", "Capturing " + piId);
          try {
            UrlFetchApp.fetch('https://api.stripe.com/v1/payment_intents/' + piId + '/capture', {
              method: 'post',
              headers: { 'Authorization': 'Bearer ' + stripeKey }
            });
          } catch(e) {
            logToSheet("CAPTURE_ERROR", e.message);
            throw new Error("Stripe Capture Failed: " + e.message);
          }
        } else if ((p.status === 'REJECTED' || p.status === 'CANCELLED') && piId) {
          logToSheet("STRIPE_CANCEL", "Cancelling/Refunding " + piId);
          try {
            // 保留解除または返金
            UrlFetchApp.fetch('https://api.stripe.com/v1/payment_intents/' + piId + '/cancel', {
              method: 'post',
              headers: { 'Authorization': 'Bearer ' + stripeKey },
              muteHttpExceptions: true // すでに確定済みの場合はエラーになるため
            });
          } catch(e) { logToSheet("CANCEL_ERROR", e.message); }
        }

        sheet.getRange(i + 1, 5).setValue(p.status);
        b.status = p.status;
        sendTemplatedEmail(p.status, b);
      }
      
      if (p.secondaryStatus !== undefined) b.secondaryStatus = p.secondaryStatus;
      sheet.getRange(i + 1, 13).setValue(JSON.stringify(b));
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
      return { success: true };
    }
  }
  return { success: false };
}

function sendTemplatedEmail(type, booking) {
  const templates = getEmailTemplate();
  let sub = templates[type + '_SUBJECT'];
  let bodyRaw = templates[type + '_BODY'];
  if (!sub || !bodyRaw) return;

  const name = booking.representative.lastName + ' ' + booking.representative.firstName;
  const subject = sub.replace(/{{name}}/g, name).replace(/{{date}}/g, booking.date).replace(/{{time}}/g, booking.time);
  const message = bodyRaw.replace(/{{name}}/g, name).replace(/{{date}}/g, booking.date).replace(/{{time}}/g, booking.time).replace(/{{type}}/g, booking.type);
  GmailApp.sendEmail(booking.representative.email, subject, message, { name: "Sangen Sake Experience" });
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
      return { success: true };
    }
  }
  sheet.appendRow([p.key, p.value]);
  return { success: true };
}

function login(p) { 
  return (p.email === 'admin@sangen.com' && p.password === 'sake') ? { success: true } : { success: false }; 
}

function getMonthStatus(year, month, type, force) {
  const results = {};
  const calendar = getCalendar();
  const tz = Session.getScriptTimeZone();
  const startDate = new Date(year, month - 1, 1, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const bookingsMap = {};
  try {
    const sheet = getSheet();
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][4] === 'CANCELLED' || rows[i][4] === 'REJECTED') continue;
      const key = rows[i][2] + "_" + rows[i][3];
      const total = Number(rows[i][5]) + Number(rows[i][6]) + Number(rows[i][7]) + Number(rows[i][8]);
      bookingsMap[key] = (bookingsMap[key] || 0) + total;
    }
  } catch (e) {}
  const events = calendar.getEvents(startDate, endDate);
  events.forEach(event => {
    if (event.isAllDayEvent()) return;
    const d = event.getStartTime();
    const dateStr = Utilities.formatDate(d, tz, "yyyy-MM-dd");
    const timeStr = Utilities.formatDate(d, tz, "HH:mm");
    if (!results[dateStr]) results[dateStr] = [];
    results[dateStr].push({ time: timeStr, available: true, currentGroupCount: bookingsMap[dateStr + "_" + timeStr] || 0 });
  });
  return results;
}
