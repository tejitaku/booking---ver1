
/**
 * Sangen Sake Experience - Backend Script (Advanced Admin & Stripe Refund)
 */

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
    else if (action === 'getAvailability') result = getAvailability(payload.date);
    else if (action === 'getMonthStatus') result = getMonthStatus(Number(payload.year), Number(payload.month));
    else if (action === 'getBookings') result = getBookings();
    else if (action === 'createBooking') result = createBooking(payload);
    else if (action === 'updateStatus') result = updateBookingStatus(payload);
    else if (action === 'login') result = login(payload);
    else throw new Error('INVALID_ACTION: ' + action);
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
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

function getCalendar() {
  const calId = getProp('CALENDAR_ID');
  return calId ? CalendarApp.getCalendarById(calId) : CalendarApp.getDefaultCalendar();
}

function getMonthStatus(year, month) {
  const results = {};
  const calendar = getCalendar();
  const tz = Session.getScriptTimeZone();
  const startDate = new Date(year, month - 1, 1, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  const events = calendar.getEvents(startDate, endDate);
  events.forEach(event => {
    if (event.isAllDayEvent()) return;
    results[Utilities.formatDate(event.getStartTime(), tz, "yyyy-MM-dd")] = true;
  });
  return results;
}

function getAvailability(dateStr) {
  const events = getCalendar().getEventsForDay(new Date(dateStr));
  const tz = Session.getScriptTimeZone();
  return events.filter(e => !e.isAllDayEvent()).map(event => ({ 
    time: Utilities.formatDate(event.getStartTime(), tz, "HH:mm"), 
    available: true, 
    currentGroupCount: 0 
  })).sort((a, b) => a.time.localeCompare(b.time));
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
  const sheet = getSheet();
  payload.stripeSessionId = sessionId;
  sheet.appendRow([id, payload.type, payload.date, payload.time, 'REQUESTED', payload.adults, payload.adultsNonAlc, payload.children, payload.infants, payload.totalPrice, payload.representative.lastName, payload.representative.email, JSON.stringify(payload), new Date()]);
  return { success: true, id, checkoutUrl };
}

function createStripeSession(amount, email, returnUrl, key, date, time) {
  // Stripeダッシュボードで見やすいように説明文を作成
  const description = "Sangen Experience: " + date + " " + time + " (JST)";
  const options = {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + key },
    payload: {
      'payment_method_types[]': 'card',
      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][product_data][name]': 'Sangen Experience',
      'line_items[0][price_data][product_data][description]': description,
      'line_items[0][price_data][unit_amount]': String(Math.round(amount)),
      'line_items[0][quantity]': '1',
      'mode': 'payment',
      'success_url': returnUrl + '?status=success',
      'cancel_url': returnUrl + '?status=cancel',
      'customer_email': email,
      'payment_intent_data[description]': description // これによりダッシュボードの支払い一覧にJST時間が表示される
    }
  };
  const response = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions', options);
  return JSON.parse(response.getContentText());
}

function refundStripePayment(sessionId, amount, key) {
  if (!sessionId) return { success: false, error: 'No session ID' };
  try {
    const sessionRes = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions/' + sessionId, {
      headers: { 'Authorization': 'Bearer ' + key }
    });
    const session = JSON.parse(sessionRes.getContentText());
    const piId = session.payment_intent;
    if (!piId) return { success: false, error: 'Payment not completed yet' };

    const refundOptions = {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + key },
      payload: { 'payment_intent': piId, 'amount': String(Math.round(amount)) }
    };
    UrlFetchApp.fetch('https://api.stripe.com/v1/refunds', refundOptions);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
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
  const stripeKey = getProp('STRIPE_SECRET_KEY');
  const nowJST = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == p.id) {
      let bookingData = JSON.parse(data[i][12]);
      if (p.status) sheet.getRange(i + 1, 5).setValue(p.status);
      if (p.status === 'CONFIRMED') {
        bookingData.confirmedAt = nowJST;
      }
      if (p.status === 'CANCELLED' && bookingData.stripeSessionId && stripeKey && p.refundAmount) {
         refundStripePayment(bookingData.stripeSessionId, p.refundAmount, stripeKey);
      }
      if (p.status) bookingData.status = p.status;
      if (p.secondaryStatus) bookingData.secondaryStatus = p.secondaryStatus;
      if (p.notes) bookingData.adminNotes = p.notes;
      sheet.getRange(i + 1, 13).setValue(JSON.stringify(bookingData));
      return { success: true };
    }
  }
  return { success: false };
}

function login(p) { 
  return (p.email === 'admin@sangen.com' && p.password === 'sake') ? { success: true } : { success: false }; 
}
