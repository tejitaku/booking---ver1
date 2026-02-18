
/**
 * Sangen Sake Experience - Backend Script (Secure Properties Version)
 */

// プロパティ取得のヘルパー
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

    // --- セキュリティチェック ---
    const token = getProp('APP_SECURITY_TOKEN');
    if (token) {
      const receivedToken = (postData && postData.token) ? postData.token : params.token;
      if (receivedToken !== token) {
        throw new Error('Unauthorized: 認証トークンが一致しません。スクリプトプロパティを確認してください。');
      }
    }

    if (action === 'getAvailability') {
      result = getAvailability(payload.date, payload.type);
    } else if (action === 'getMonthStatus') {
      result = getMonthStatus(Number(payload.year), Number(payload.month), payload.type);
    } else if (action === 'getBookings') {
      result = getBookings();
    } else if (action === 'createBooking') {
      result = createBooking(payload);
    } else if (action === 'updateStatus') {
      result = updateBookingStatus(payload);
    } else if (action === 'login') {
      result = login(payload);
    } else {
      throw new Error('Invalid action: ' + action);
    }
  } catch (err) {
    console.error(err);
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * スプレッドシートを取得
 */
function getSheet() {
  const ssId = getProp('SPREADSHEET_ID');
  if (!ssId) {
    throw new Error('SPREADSHEET_ID がスクリプトプロパティに設定されていません。');
  }

  let ss;
  try {
    ss = SpreadsheetApp.openById(ssId);
  } catch (e) {
    throw new Error('スプレッドシートを開けません。IDが正しいか、権限があるか確認してください。');
  }

  const sheetName = 'Bookings';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['ID', 'Type', 'Date', 'Time', 'Status', 'Adults', 'NonAlc', 'Children', 'Infants', 'Price', 'Name', 'Email', 'JSONData', 'CreatedAt']);
  }
  return sheet;
}

/**
 * カレンダーを取得
 */
function getCalendar() {
  const calId = getProp('CALENDAR_ID');
  let calendar = calId ? CalendarApp.getCalendarById(calId) : null;
  if (!calendar) {
    calendar = CalendarApp.getDefaultCalendar();
  }
  return calendar;
}

function getAvailability(dateStr, type) {
  const dateObj = new Date(dateStr);
  const calendar = getCalendar();
  
  const events = calendar.getEventsForDay(dateObj);
  const bookings = fetchBookingsFromSheet().filter(b => b.date === dateStr && b.status !== 'CANCELLED' && b.status !== 'REJECTED');
  
  const slots = events.filter(e => !e.isAllDayEvent()).map(event => {
    const start = event.getStartTime();
    const timeStr = Utilities.formatDate(start, Session.getScriptTimeZone(), "HH:mm");
    const bookingsAtTime = bookings.filter(b => b.time === timeStr);
    const totalPeople = bookingsAtTime.reduce((sum, b) => sum + (Number(b.adults)||0) + (Number(b.adultsNonAlc)||0) + (Number(b.children)||0) + (Number(b.infants)||0), 0);
    const hasPrivate = bookingsAtTime.some(b => b.type === 'PRIVATE');
    
    let available = true;
    if (type === 'PRIVATE') {
      if (bookingsAtTime.length > 0) available = false;
    } else {
      if (hasPrivate || totalPeople >= 6) available = false;
    }
    
    return { time: timeStr, available, currentGroupCount: totalPeople };
  });
  
  return slots.sort((a, b) => a.time.localeCompare(b.time));
}

function getMonthStatus(year, month, type) {
  const results = {};
  const days = new Date(year, month, 0).getDate();
  for(let d=1; d<=days; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    results[dateStr] = true; 
  }
  return results;
}

function createBooking(payload) {
  const stripeKey = getProp('STRIPE_SECRET_KEY');
  let checkoutUrl = null;
  
  if (payload.totalPrice > 0 && stripeKey) {
    try {
      const session = createStripeSession(payload.totalPrice, payload.representative.email, payload.returnUrl, stripeKey);
      checkoutUrl = session.url;
    } catch (e) {
      console.error("Stripe Session Error: " + e.message);
    }
  }
  
  const id = 'bk_' + new Date().getTime();
  const sheet = getSheet();
  sheet.appendRow([
    id, 
    payload.type, 
    payload.date, 
    payload.time, 
    'REQUESTED', 
    payload.adults, 
    payload.adultsNonAlc, 
    payload.children, 
    payload.infants, 
    payload.totalPrice, 
    payload.representative.lastName, 
    payload.representative.email, 
    JSON.stringify(payload), 
    new Date()
  ]);
  
  return { success: true, id, checkoutUrl };
}

function createStripeSession(amount, email, returnUrl, key) {
  const url = 'https://api.stripe.com/v1/checkout/sessions';
  const options = {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + key },
    payload: {
      'payment_method_types[]': 'card',
      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][product_data][name]': 'Sangen Experience Reservation',
      'line_items[0][price_data][unit_amount]': String(Math.round(amount)),
      'line_items[0][quantity]': '1',
      'mode': 'payment',
      'success_url': returnUrl + '?status=success',
      'cancel_url': returnUrl + '?status=cancel',
      'customer_email': email
    }
  };
  const response = UrlFetchApp.fetch(url, options);
  return JSON.parse(response.getContentText());
}

function fetchBookingsFromSheet() {
  try {
    const sheet = getSheet();
    const rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return [];
    
    return rows.slice(1).map(r => {
      try {
        let b = JSON.parse(r[12]);
        b.id = r[0]; 
        b.status = r[4]; 
        b.createdAt = r[13];
        return b;
      } catch(e) { return null; }
    }).filter(b => b !== null);
  } catch (e) {
    return [];
  }
}

function getBookings() { return fetchBookingsFromSheet(); }
function login(p) { return (p.email === 'admin@sangen.com' && p.password === 'sake') ? { success: true } : { success: false }; }

function updateBookingStatus(p) {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == p.id) {
      if (p.status) sheet.getRange(i + 1, 5).setValue(p.status);
      try {
        let bookingData = JSON.parse(data[i][12]);
        if (p.status) bookingData.status = p.status;
        if (p.secondaryStatus) bookingData.secondaryStatus = p.secondaryStatus;
        if (p.notes) bookingData.adminNotes = p.notes;
        sheet.getRange(i + 1, 13).setValue(JSON.stringify(bookingData));
      } catch (e) {}
      return { success: true };
    }
  }
  return { success: false, error: 'Booking ID not found' };
}
