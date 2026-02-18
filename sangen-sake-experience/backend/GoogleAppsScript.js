
/**
 * Sangen Sake Experience - Backend Script
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
    else if (action === 'deleteBooking') result = deleteBooking(payload.id);
    else if (action === 'getEmailTemplate') result = getEmailTemplate();
    else if (action === 'updateEmailTemplate') result = updateEmailTemplate(payload);
    else if (action === 'sendTestEmail') result = sendTestEmail(payload);
    else if (action === 'login') result = login(payload);
    else throw new Error('INVALID_ACTION: ' + action);
  } catch (err) {
    result = { error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function testConfig() {
  try {
    const ssId = getProp('SPREADSHEET_ID');
    if (!ssId) throw new Error("SPREADSHEET_ID is missing.");
    SpreadsheetApp.openById(ssId);
    return { success: true, message: "Backend is active." };
  } catch (e) {
    return { success: false, error: e.message };
  }
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

function getSettingsSheet() {
  const ssId = getProp('SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);
  const sheetName = 'Settings';
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['Key', 'Value']);
  }
  
  // テンプレートが空の場合のみデフォルトを投入
  if (sheet.getLastRow() <= 1) {
    const defaults = [
      ['RECEIVED_SUBJECT', '【Sangen】予約リクエストを受け付けました / Reservation Request Received'],
      ['RECEIVED_BODY', '{{name}} 様\n\nこの度はSangen Sake Experienceへのご予約リクエストありがとうございます。\n下記の日程でリクエストを承りました。\n\n日時：{{date}} {{time}}\nプラン：{{type}}\n\n現在、予約状況を確認しております。確定まで最大3営業日ほどお時間をいただく場合がございますので、そのままお待ちください。\n予約が確定しましたら、別途「確定メール」をお送りいたします。'],
      ['CONFIRMED_SUBJECT', '【Sangen】予約が確定しました / Your reservation is confirmed!'],
      ['CONFIRMED_BODY', '{{name}} 様\n\nお待たせいたしました。ご予約が確定いたしました！\n\n日時：{{date}} {{time}}\nプラン：{{type}}\n\n当日、皆様にお会いできることを楽しみにしております。'],
      ['REJECTED_SUBJECT', '【Sangen】ご予約をお受けすることができませんでした / Reservation Update'],
      ['REJECTED_BODY', '{{name}} 様\n\nこの度はご予約リクエストをいただき誠にありがとうございました。\n大変申し訳ございませんが、ご希望の日時は満席のためご予約を承ることができませんでした。\n\nまたの機会がございましたら、ぜひよろしくお願い申し上げます。'],
      ['CANCELLED_SUBJECT', '【Sangen】キャンセル・返金手続き完了のお知らせ / Cancellation Confirmed'],
      ['CANCELLED_BODY', '{{name}} 様\n\nご予約のキャンセル手続きが完了いたしました。\n\n日時：{{date}} {{time}}\n返金予定額：¥{{refund_amount}}\n\nStripeを通じて返金処理を行っております。クレジットカード会社により反映までお時間がかかる場合がございます。ご了承ください。']
    ];
    defaults.forEach(row => sheet.appendRow(row));
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
  
  // 自動返信メール (リクエスト受付)
  sendTemplatedEmail('RECEIVED', payload);
  
  return { success: true, id, checkoutUrl };
}

function createStripeSession(amount, email, returnUrl, key, date, time) {
  const jstTimeDisplay = date + " " + time + " (JST)";
  const description = "Reservation: " + jstTimeDisplay;
  const options = {
    method: 'post',
    headers: { 'Authorization': 'Bearer ' + key },
    payload: {
      'payment_method_types[]': 'card',
      'line_items[0][price_data][currency]': 'jpy',
      'line_items[0][price_data][product_data][name]': 'Sangen Sake Experience',
      'line_items[0][price_data][product_data][description]': description,
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
      b.id = r[0]; 
      b.status = r[4]; 
      b.createdAt = r[13];
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
        if (p.status === 'REJECTED' && oldStatus !== 'REJECTED') {
          sendTemplatedEmail('REJECTED', bookingData);
        }
        if (p.status === 'CANCELLED' && oldStatus !== 'CANCELLED') {
          bookingData.cancelledAt = nowISO;
          if (p.refundAmount !== undefined) bookingData.refundAmount = p.refundAmount;
          sendTemplatedEmail('CANCELLED', bookingData);
        }
      }
      if (p.secondaryStatus !== undefined) bookingData.secondaryStatus = p.secondaryStatus;
      if (p.notes !== undefined) bookingData.adminNotes = p.notes;
      
      sheet.getRange(i + 1, 13).setValue(JSON.stringify(bookingData));
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

/**
 * テストメールを送信する
 */
function sendTestEmail(payload) {
  const mockBooking = {
    representative: { firstName: 'Test', lastName: 'User', email: Session.getActiveUser().getEmail() },
    date: '202X-XX-XX',
    time: '12:00',
    type: 'PRIVATE',
    refundAmount: 10000
  };
  sendTemplatedEmail(payload.type, mockBooking);
  return { success: true, sentTo: mockBooking.representative.email };
}

/**
 * メールテンプレートを利用してメールを送信する
 */
function sendTemplatedEmail(type, booking) {
  try {
    const templates = getEmailTemplate();
    const subjectRaw = templates[type + '_SUBJECT'];
    const bodyRaw = templates[type + '_BODY'];
    
    if (!subjectRaw || !bodyRaw) {
      console.warn("Template missing for: " + type);
      return;
    }

    const name = booking.representative.lastName + ' ' + booking.representative.firstName;
    const date = booking.date;
    const time = booking.time;
    const bType = booking.type;
    const refund = booking.refundAmount ? booking.refundAmount.toLocaleString() : '0';

    let subject = subjectRaw
      .replace(/{{name}}/g, name)
      .replace(/{{date}}/g, date)
      .replace(/{{time}}/g, time)
      .replace(/{{type}}/g, bType);

    let body = bodyRaw
      .replace(/{{name}}/g, name)
      .replace(/{{date}}/g, date)
      .replace(/{{time}}/g, time)
      .replace(/{{type}}/g, bType)
      .replace(/{{refund_amount}}/g, refund);

    GmailApp.sendEmail(booking.representative.email, subject, body, {
      name: "Sangen Sake Experience"
    });
    console.log("Email sent to: " + booking.representative.email + " (Type: " + type + ")");
  } catch (e) {
    console.error("Email Sending Error: " + e.toString());
    throw new Error("メール送信エラー: " + e.toString());
  }
}

function getEmailTemplate() {
  const data = getSettingsSheet().getDataRange().getValues();
  const templates = {};
  data.slice(1).forEach(row => {
    if (row[0]) templates[row[0]] = row[1];
  });
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
