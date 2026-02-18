
// ■ 設定エリア =================================================================

// 1. 予約枠を管理するGoogleカレンダーID
const CALENDAR_ID = 'primary'; // または特定のカレンダーID

// 2. データを保存するスプレッドシートID (空欄の場合はスクリプトに紐づくシートを使用)
const SPREADSHEET_ID = ''; 

// 3. 店舗情報
const SHOP_NAME = "Sangen Sake Experience";
const SHEET_NAME = 'Bookings';

// Stripeキーは「プロジェクトの設定」>「スクリプトプロパティ」に 
// STRIPE_SECRET_KEY という名前で保存してください。
const getStripeKey = () => PropertiesService.getScriptProperties().getProperty('STRIPE_SECRET_KEY');

// =============================================================================

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
      throw new Error('Invalid action');
    }
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// カレンダーから予約可能枠を取得
function getAvailability(dateStr, type) {
  const dateObj = new Date(dateStr);
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
  const events = calendar.getEventsForDay(dateObj);
  const bookings = fetchBookingsFromSheet().filter(b => b.date === dateStr && b.status !== 'CANCELLED' && b.status !== 'REJECTED');
  
  const slots = events.filter(e => !e.isAllDayEvent()).map(event => {
    const start = event.getStartTime();
    const timeStr = Utilities.formatDate(start, Session.getScriptTimeZone(), "HH:mm");
    const bookingsAtTime = bookings.filter(b => b.time === timeStr);
    const totalPeople = bookingsAtTime.reduce((sum, b) => sum + (b.adults||0) + (b.adultsNonAlc||0) + (b.children||0) + (b.infants||0), 0);
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
  // 簡易版：すべての日付を一旦trueで返す（詳細はgetAvailabilityでチェック）
  const results = {};
  const days = new Date(year, month, 0).getDate();
  for(let d=1; d<=days; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    results[dateStr] = true; 
  }
  return results;
}

function createBooking(payload) {
  const key = getStripeKey();
  let checkoutUrl = null;
  if (payload.totalPrice > 0 && key) {
    const session = createStripeSession(payload.totalPrice, payload.representative.email, payload.returnUrl, key);
    checkoutUrl = session.url;
  }
  
  const id = 'bk_' + new Date().getTime();
  const sheet = getSheet();
  sheet.appendRow([id, payload.type, payload.date, payload.time, 'REQUESTED', payload.adults, payload.adultsNonAlc, payload.children, payload.infants, payload.totalPrice, payload.representative.lastName, payload.representative.email, JSON.stringify(payload), new Date()]);
  
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
      'line_items[0][price_data][product_data][name]': 'Sangen Experience',
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

function getBookings() { return fetchBookingsFromSheet(); }
function login(p) { return (p.email === 'admin@sangen.com' && p.password === 'sake') ? { success: true } : { success: false }; }

function getSheet() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['ID', 'Type', 'Date', 'Time', 'Status', 'Adults', 'NonAlc', 'Children', 'Infants', 'Price', 'Name', 'Email', 'Data', 'CreatedAt']);
  }
  return sheet;
}

function fetchBookingsFromSheet() {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
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
      sheet.getRange(i + 1, 5).setValue(p.status);
      return { success: true };
    }
  }
}
