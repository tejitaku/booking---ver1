
/**
 * ============================================================
 * Sangen Sake Experience - Backend Script (Robust & Transparent)
 * ============================================================
 */

function manualAuthorize() {
  const cal = getCalendar();
  const name = cal.getName();
  const ss = getSheet();
  const email = Session.getActiveUser().getEmail();
  GmailApp.sendEmail(email, "Sangen System: Authorization Successful", "The system is now authorized.");
  return "Authorization successful for: " + name;
}

const getProp = (key) => {
  const p = PropertiesService.getScriptProperties().getProperty(key);
  return p ? p.trim() : null;
};

function doOptions(e) {
  return ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON).append(JSON.stringify({ status: 'ok' }));
}

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

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
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function testConfig() {
  try {
    const ssId = getProp('SPREADSHEET_ID');
    const ss = SpreadsheetApp.openById(ssId);
    return { success: true, message: "Backend active", spreadsheetName: ss.getName() };
  } catch (e) { return { success: false, error: e.message }; }
}

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

function getMonthStatus(year, month, type, force) {
  const cacheKey = "month_data_v3_" + year + "_" + month + "_" + (type || "ANY");
  const cache = CacheService.getScriptCache();
  if (!force) {
    const cachedData = cache.get(cacheKey);
    if (cachedData) return JSON.parse(cachedData);
  }
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
  for (let date in results) results[date].sort((a, b) => a.time.localeCompare(b.time));
  try { cache.put(cacheKey, JSON.stringify(results), 600); } catch (e) {}
  return results;
}

function createBooking(payload) {
  const stripeKey = getProp('STRIPE_SECRET_KEY');
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is missing in Script Properties.");
  
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
      'line_items[0][price_data][product_data][description]': "Reservation: " + date + " " + time,
      'line_items[0][price_data][unit_amount]': String(Math.round(amount)),
      'line_items[0][quantity]': '1',
      'mode': 'payment',
      'success_url': returnUrl + '?status=success&session_id={CHECKOUT_SESSION_ID}',
      'cancel_url': returnUrl + '?status=cancel',
      'customer_email': email,
    }
  };
  const response = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions', options);
  return JSON.parse(response.getContentText());
}

function finalizeBooking(sessionId) {
  if (!sessionId) throw new Error("Session ID is required.");
  
  const stripeKey = getProp('STRIPE_SECRET_KEY');
  if (!stripeKey) throw new Error("Stripe Key not found.");

  const response = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions/' + sessionId, {
    headers: { 'Authorization': 'Bearer ' + stripeKey }
  });
  const session = JSON.parse(response.getContentText());
  
  if (session.payment_status !== 'paid') {
    return { success: false, error: 'PAYMENT_NOT_COMPLETED' };
  }
  
  const sheet = getSheet();
  const bookingsData = sheet.getDataRange().getValues();
  
  // セッションIDの重複チェック
  for (let i = 1; i < bookingsData.length; i++) {
    const jsonStr = bookingsData[i][12];
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.stripeSessionId === sessionId) {
          return { success: true, alreadyFinalized: true };
        }
      } catch(e) {}
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

  if (!bookingPayload) throw new Error("Reservation data for this session was not found. Please contact support.");

  const id = 'bk_' + new Date().getTime();
  const createdAtISO = new Date().toISOString();
  bookingPayload.stripeSessionId = sessionId;
  bookingPayload.createdAt = createdAtISO;

  // 1. まずスプレッドシートに書き込む (一番重要)
  sheet.appendRow([
    id, 
    bookingPayload.type, 
    bookingPayload.date, 
    bookingPayload.time, 
    'REQUESTED', 
    bookingPayload.adults, 
    bookingPayload.adultsNonAlc, 
    bookingPayload.children, 
    bookingPayload.infants, 
    bookingPayload.totalPrice, 
    bookingPayload.representative.lastName, 
    bookingPayload.representative.email, 
    JSON.stringify(bookingPayload), 
    createdAtISO
  ]);

  // 2. メール送信 (失敗しても登録は維持されるようtry-catch)
  try {
    sendTemplatedEmail('RECEIVED', bookingPayload);
  } catch (emailErr) {
    console.error("Confirmation Email Error: " + emailErr);
  }

  try {
    const templates = getEmailTemplate();
    const adminEmail = templates['ADMIN_NOTIFY_EMAIL'];
    if (adminEmail) {
      GmailApp.sendEmail(adminEmail, "[Sangen] New Booking Request Received (Paid)", 
        "A new booking has been finalized after successful payment.\n\n" +
        "Name: " + bookingPayload.representative.lastName + " " + bookingPayload.representative.firstName + "\n" +
        "Date: " + bookingPayload.date + " " + bookingPayload.time + "\n" +
        "Type: " + bookingPayload.type + "\n" +
        "Total Price: ¥" + bookingPayload.totalPrice.toLocaleString()
      );
    }
  } catch (adminEmailErr) {
    console.error("Admin Email Error: " + adminEmailErr);
  }

  // 3. 最後に仮予約データを削除
  try {
    pendingSheet.deleteRow(rowIndex);
  } catch(e) {}

  // キャッシュクリア
  try {
    const cache = CacheService.getScriptCache();
    const [y, m] = bookingPayload.date.split('-');
    cache.remove("month_data_v3_" + y + "_" + parseInt(m) + "_" + bookingPayload.type);
    cache.remove("month_data_v3_" + y + "_" + parseInt(m) + "_ANY");
  } catch(e) {}

  return { success: true, id: id };
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

function updateBookingStatus(p) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == p.id) {
      let b = JSON.parse(data[i][12]);
      if (p.status) {
        sheet.getRange(i + 1, 5).setValue(p.status);
        b.status = p.status;
        if (p.status === 'CONFIRMED') sendTemplatedEmail('CONFIRMED', b);
        if (p.status === 'REJECTED') sendTemplatedEmail('REJECTED', b);
        if (p.status === 'CANCELLED') sendTemplatedEmail('CANCELLED', b);
      }
      if (p.secondaryStatus !== undefined) b.secondaryStatus = p.secondaryStatus;
      sheet.getRange(i + 1, 13).setValue(JSON.stringify(b));
      return { success: true };
    }
  }
  return { success: false };
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
  
  // デフォルトテンプレート (管理画面で設定されていない場合のフォールバック)
  if (!sub || !bodyRaw) {
    if (type === 'RECEIVED') {
      sub = "Reservation Request Received - {{name}}";
      bodyRaw = "Dear {{name}},\n\nWe have received your reservation request for {{date}} at {{time}}.\nOur staff will contact you shortly to confirm your booking.\n\nThank you,\nSangen Sake Experience";
    } else {
      return; // 他のステータスはデフォルトなし
    }
  }

  const name = booking.representative.lastName + ' ' + booking.representative.firstName;
  const subject = sub.replace(/{{name}}/g, name).replace(/{{date}}/g, booking.date).replace(/{{time}}/g, booking.time);
  const message = bodyRaw
    .replace(/{{name}}/g, name)
    .replace(/{{date}}/g, booking.date)
    .replace(/{{time}}/g, booking.time)
    .replace(/{{type}}/g, booking.type);

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
