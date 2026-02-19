
/**
 * ============================================================
 * Sangen Sake Experience - Backend Script (Robust & Fast)
 * ============================================================
 */

function manualAuthorize() {
  const email = Session.getActiveUser().getEmail();
  const subject = "Sangen System: Authorization Check";
  const body = "This is a dummy email to trigger the Google permission dialog.";
  GmailApp.sendEmail(email, subject, body);
  return "Authorization process triggered.";
}

const getProp = (key) => PropertiesService.getScriptProperties().getProperty(key);

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
    else if (action === 'getMonthStatus') result = getMonthStatus(Number(payload.year), Number(payload.month), payload.type);
    else if (action === 'getBookings') result = getBookings();
    else if (action === 'createBooking') result = createBooking(payload);
    else if (action === 'updateStatus') result = updateBookingStatus(payload);
    else if (action === 'deleteBooking') result = deleteBooking(payload.id);
    else if (action === 'getEmailTemplate') result = getEmailTemplate();
    else if (action === 'updateEmailTemplate') result = updateEmailTemplate(payload);
    else if (action === 'sendTestEmail') result = sendTestEmail(payload);
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
    const calId = getProp('CALENDAR_ID');
    const ss = SpreadsheetApp.openById(ssId);
    const cal = calId ? CalendarApp.getCalendarById(calId) : CalendarApp.getDefaultCalendar();
    return { 
      success: true, 
      message: "Backend is active.",
      calendarName: cal ? cal.getName() : "Not Found",
      spreadsheetName: ss ? ss.getName() : "Not Found"
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getSheet() {
  const ssId = getProp('SPREADSHEET_ID');
  if (!ssId) throw new Error("SPREADSHEET_ID is not set in Script Properties.");
  const ss = SpreadsheetApp.openById(ssId);
  const sheetName = 'Bookings';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['ID', 'Type', 'Date', 'Time', 'Status', 'Adults', 'NonAlc', 'Children', 'Infants', 'Price', 'Name', 'Email', 'JSONData', 'CreatedAt']);
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
  const cal = calId ? CalendarApp.getCalendarById(calId) : CalendarApp.getDefaultCalendar();
  if (!cal) throw new Error("Calendar not found. Check CALENDAR_ID.");
  return cal;
}

/**
 * 月間ステータスと詳細スロットの一括取得
 */
function getMonthStatus(year, month, type) {
  const cacheKey = "month_data_v2_" + year + "_" + month + "_" + (type || "ANY");
  const cache = CacheService.getScriptCache();
  
  try {
    const cachedData = cache.get(cacheKey);
    if (cachedData) return JSON.parse(cachedData);
  } catch (e) { console.warn("Cache read failed"); }

  const results = {};
  const calendar = getCalendar();
  const tz = Session.getScriptTimeZone();
  
  // 指定した月の開始と終了（JSTを意識）
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  
  // 1. 予約状況の取得
  const bookingsMap = {};
  try {
    const sheet = getSheet();
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const bStatus = rows[i][4];
      if (bStatus === 'CANCELLED' || bStatus === 'REJECTED') continue;
      const key = rows[i][2] + "_" + rows[i][3];
      const total = Number(rows[i][5]) + Number(rows[i][6]) + Number(rows[i][7]) + Number(rows[i][8]);
      bookingsMap[key] = (bookingsMap[key] || 0) + total;
    }
  } catch (e) { console.error("Sheet read error: " + e.message); }

  // 2. カレンダーからイベント取得
  const events = calendar.getEvents(startDate, endDate);
  events.forEach(event => {
    if (event.isAllDayEvent()) return;
    
    const d = event.getStartTime();
    const dateStr = Utilities.formatDate(d, tz, "yyyy-MM-dd");
    const timeStr = Utilities.formatDate(d, tz, "HH:mm");
    
    if (!results[dateStr]) results[dateStr] = [];
    
    const currentCount = bookingsMap[dateStr + "_" + timeStr] || 0;
    results[dateStr].push({
      time: timeStr,
      available: true,
      currentGroupCount: currentCount
    });
  });

  for (let date in results) {
    results[date].sort((a, b) => a.time.localeCompare(b.time));
  }

  // キャッシュ保存（サイズ制限に配慮）
  try {
    const stringified = JSON.stringify(results);
    if (stringified.length < 100000) {
      cache.put(cacheKey, stringified, 600);
    }
  } catch (e) { console.warn("Cache write failed"); }

  return results;
}

function createBooking(payload) {
  const stripeKey = getProp('STRIPE_SECRET_KEY');
  let checkoutUrl = null;
  let sessionId = null;
  if (payload.totalPrice > 0 && stripeKey) {
    try {
      const session = createStripeSession(payload.totalPrice, payload.representative.email, payload.returnUrl, stripeKey, payload.date, payload.time);
      checkoutUrl = session.url;
      sessionId = session.id;
    } catch (e) { console.error("Stripe Error: " + e.message); }
  }
  
  const id = 'bk_' + new Date().getTime();
  const now = new Date();
  const createdAtISO = now.toISOString();
  const sheet = getSheet();
  
  payload.stripeSessionId = sessionId;
  payload.createdAt = createdAtISO;

  sheet.appendRow([
    id, payload.type, payload.date, payload.time, 'REQUESTED', 
    payload.adults, payload.adultsNonAlc, payload.children, payload.infants, 
    payload.totalPrice, payload.representative.lastName, payload.representative.email, 
    JSON.stringify(payload), createdAtISO
  ]);
  
  try { sendTemplatedEmail('RECEIVED', payload); } catch (e) {}

  const cache = CacheService.getScriptCache();
  const [y, m] = payload.date.split('-');
  cache.remove("month_data_v2_" + y + "_" + parseInt(m) + "_" + payload.type);
  cache.remove("month_data_v2_" + y + "_" + parseInt(m) + "_ANY");
  
  return { success: true, id, checkoutUrl };
}

function createStripeSession(amount, email, returnUrl, key, date, time) {
  const jstTimeDisplay = date + " " + time + " (JST)";
  const options = {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + key },
    payload: {
      'payment_method_types[]': 'card',
      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][product_data][name]': 'Sangen Sake Experience',
      'line_items[0][price_data][product_data][description]': "Reservation: " + jstTimeDisplay,
      'line_items[0][price_data][unit_amount]': String(Math.round(amount)),
      'line_items[0][quantity]': '1',
      'mode': 'payment',
      'success_url': returnUrl + '?status=success',
      'cancel_url': returnUrl + '?status=cancel',
      'customer_email': email,
    }
  };
  const response = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions', options);
  return JSON.parse(response.getContentText());
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
  const nowISO = new Date().toISOString();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == p.id) {
      let bookingData = JSON.parse(data[i][12]);
      let oldStatus = bookingData.status;

      if (p.status) {
        sheet.getRange(i + 1, 5).setValue(p.status);
        bookingData.status = p.status;
        if (p.status === 'CONFIRMED' && oldStatus !== 'CONFIRMED') {
          bookingData.confirmedAt = nowISO;
          sendTemplatedEmail('CONFIRMED', bookingData);
        }
        if (p.status === 'REJECTED' && oldStatus !== 'REJECTED') sendTemplatedEmail('REJECTED', bookingData);
        if (p.status === 'CANCELLED' && oldStatus !== 'CANCELLED') {
          bookingData.cancelledAt = nowISO;
          if (p.refundAmount !== undefined) bookingData.refundAmount = p.refundAmount;
          sendTemplatedEmail('CANCELLED', bookingData);
        }
      }
      if (p.secondaryStatus !== undefined) bookingData.secondaryStatus = p.secondaryStatus;
      if (p.notes !== undefined) bookingData.adminNotes = p.notes;
      
      sheet.getRange(i + 1, 13).setValue(JSON.stringify(bookingData));

      const cache = CacheService.getScriptCache();
      const [y, m] = bookingData.date.split('-');
      cache.remove("month_data_v2_" + y + "_" + parseInt(m) + "_" + bookingData.type);
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
      const bData = JSON.parse(data[i][12]);
      sheet.deleteRow(i + 1);
      const [y, m] = bData.date.split('-');
      CacheService.getScriptCache().remove("month_data_v2_" + y + "_" + parseInt(m) + "_" + bData.type);
      return { success: true };
    }
  }
  return { success: false };
}

function sendTestEmail(payload) {
  const mockBooking = {
    representative: { firstName: 'Test', lastName: 'User', email: Session.getActiveUser().getEmail() },
    date: '202X-XX-XX', time: '12:00', type: 'PRIVATE', refundAmount: 10000
  };
  sendTemplatedEmail(payload.type, mockBooking);
  return { success: true, sentTo: mockBooking.representative.email };
}

function sendTemplatedEmail(type, booking) {
  try {
    const templates = getEmailTemplate();
    const subjectRaw = templates[type + '_SUBJECT'];
    const bodyRaw = templates[type + '_BODY'];
    if (!subjectRaw || !bodyRaw) return;
    const name = booking.representative.lastName + ' ' + booking.representative.firstName;
    const date = booking.date; const time = booking.time; const bType = booking.type;
    const refund = booking.refundAmount ? booking.refundAmount.toLocaleString() : '0';
    let subject = subjectRaw.replace(/{{name}}/g, name).replace(/{{date}}/g, date).replace(/{{time}}/g, time).replace(/{{type}}/g, bType);
    let body = bodyRaw.replace(/{{name}}/g, name).replace(/{{date}}/g, date).replace(/{{time}}/g, time).replace(/{{type}}/g, bType).replace(/{{refund_amount}}/g, refund);
    GmailApp.sendEmail(booking.representative.email, subject, body, { name: "Sangen Sake Experience" });
  } catch (e) { throw new Error("Email Error: " + e.toString()); }
}

function getEmailTemplate() {
  const data = getSettingsSheet().getDataRange().getValues();
  const templates = {};
  data.slice(1).forEach(row => { if (row[0]) templates[row[0]] = row[1]; });
  return templates;
}

function updateEmailTemplate(payload) {
  const sheet = getSettingsSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === payload.key) {
      sheet.getRange(i + 1, 2).setValue(payload.value);
      return { success: true };
    }
  }
  sheet.appendRow([payload.key, payload.value]);
  return { success: true };
}

function login(p) { 
  return (p.email === 'admin@sangen.com' && p.password === 'sake') ? { success: true } : { success: false }; 
}
