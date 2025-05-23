const TelegramBot = require('node-telegram-bot-api');
const { google } = require('googleapis');
const { tg_token, google_worksheet_id, google_sheet_id } = require('/app-configs/tokens.js');
// const { tg_token, google_worksheet_id, google_sheet_id } = require('./tokens.js');
const KEY_FILE = '/app-configs/google.json';
// const KEY_FILE = './google.json';
const TG_TOKEN = tg_token;
const USER_SHEET_ID = google_sheet_id;
const SERVICE_SHEET_ID = google_worksheet_id;
const bot = new TelegramBot(TG_TOKEN, {polling: true});

//единый клиент для всех запросов
const auth = new google.auth.GoogleAuth({
  keyFile: KEY_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Инициализация клиента при старте приложения
let sheetsClient;
(async function init() {
  sheetsClient = google.sheets({ 
    version: 'v4', 
    auth: await auth.getClient() 
  });
})();

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});

async function appendRow(spreadsheetId, range, values) {
  const resource = { values };
  const response = await sheetsClient.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'RAW', // Можно использовать RAW или USER_ENTERED
    resource,
  });

  console.log(`${response.data.updates.updatedCells} ячеек добавлено.`);
}

async function writeToCell(spreadsheetId, range, value) {
  const values = [ [value] ];
  const resource = { values };
  const response = await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED', // или 'RAW'
    resource,
  });

  console.log(`${response.data.updatedCells} ячеек обновлено.`);
}

function getRangeObject(input) {
  const [sheetName, cellsPart] = input.split('!');
  const [firstCell, secondCell] = cellsPart.split(':');

  // Извлекаем буквы и цифры из ячеек
  const letter1 = firstCell.match(/[A-Za-z]+/)[0];
  const letter2 = secondCell.match(/[A-Za-z]+/)[0];
  const row = firstCell.match(/\d+/)[0]; // предполагаем, что номер строки одинаков в обоих ячейках

  // Функция для преобразования буквы в индекс (A=0, B=1, ..., Z=25, AA=26, AB=27 и т.д.)
  function letterToIndex(letter) {
      let index = 0;
      letter = letter.toUpperCase();
      for (let i = 0; i < letter.length; i++) {
          index = index * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
      }
      return index - 1; // чтобы A было 0, а не 1
  }

  const cellIndex1 = letterToIndex(letter1);
  const cellIndex2 = letterToIndex(letter2);

  const result = {
      sheetName,
      firstCell,
      secondCell,
      cellIndex1,
      cellIndex2,
      row: parseInt(row)
  };
  return result
}

async function mergeCells(sheets, range) {
  const { sheetName, cellIndex1, cellIndex2, row } = getRangeObject(range);
  const spreadsheetId = USER_SHEET_ID;

  // Получаем sheetId по имени листа
  const sheetRes = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = sheetRes.data.sheets.find(s => s.properties.title === sheetName);
  const sheetIdToMerge = sheet.properties.sheetId;

  // Формируем запрос на объединение A2:B2 (строка 2 = индекс 1, столбцы A=0, B=1)
  const request = {
    spreadsheetId,
    resource: {
      requests: [
        {
          mergeCells: {
            range: {
              sheetId:sheetIdToMerge,
              startRowIndex: row-1,    // строка 2 (индексация с 0)
              endRowIndex: row,      // до строки 3 (не включая)
              startColumnIndex: cellIndex1, // столбец A (индексация с 0)
              endColumnIndex: cellIndex2+1    // до столбца C (не включая)
            },
            mergeType: 'MERGE_ALL'
          }
        }
      ]
    }
  };

  // Выполняем запрос
  await sheets.spreadsheets.batchUpdate(request);
  console.log(`Ячейки успешно объединены на листе ${sheetName}.`);
}

async function unmergeCells(sheets, range) {
  const { sheetName, cellIndex1, cellIndex2, row } = getRangeObject(range);
  const spreadsheetId = USER_SHEET_ID;

  // Получаем sheetId по имени листа
  const sheetRes = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = sheetRes.data.sheets.find(s => s.properties.title === sheetName);
  const sheetIdToUnmerge = sheet.properties.sheetId;

  // Формируем запрос на объединение A2:B2 (строка 2 = индекс 1, столбцы A=0, B=1)
  const request = {
    spreadsheetId,
    resource: {
      requests: [
        {
          unmergeCells: {
            range: {
              sheetId:sheetIdToUnmerge,
              startRowIndex: row-1,    // строка 2 (индексация с 0)
              endRowIndex: row,      // до строки 3 (не включая)
              startColumnIndex: cellIndex1, // столбец A (индексация с 0)
              endColumnIndex: cellIndex2+1    // до столбца C (не включая)
            },
          }
        }
      ]
    }
  };

  // Выполняем запрос
  await sheets.spreadsheets.batchUpdate(request);
  console.log(`Ячейки успешно разъединены на листе ${sheetName}.`);
}

async function writeToRange(spreadsheetId, range, value, unmerge = false) {
  const values = [ value ];
  const resource = { values };
  const response = await sheetsClient.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED', // или 'RAW'
    resource,
  });

  console.log(`${response.data.updatedCells} ячеек обновлено.`);
  if (unmerge) {
    unmergeCells(sheetsClient, range);
  } else {
    mergeCells(sheetsClient, range);
  }
}

async function getSheetLink(sheetName) {
  const spreadsheetId = USER_SHEET_ID;
  // Получаем список листов и их свойства
  const res = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const sheet = res.data.sheets.find(s => s.properties.title === sheetName);

  if (!sheet) {
    throw new Error(`Лист "${sheetName}" не найден.`);
  }

  const gid = sheet.properties.sheetId;
  const link = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`;
  return link;
}

async function deleteUserBookingRow(bookingId) {
  const spreadsheetId = SERVICE_SHEET_ID;
  const sheetName = 'userBooking';
  const valueToDelete = bookingId;

  // Получаем sheetId
  const spreadsheet = await sheetsClient.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
  const sheetId = sheet.properties.sheetId;

  // Получаем все строки
  const res = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
  });
  const rows = res.data.values;

  // Ищем нужную строку (столбец F, индекс 5)
  let rowIndexToDelete = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][5] === valueToDelete) {
      rowIndexToDelete = i;
      break;
    }
  }

  if (rowIndexToDelete !== null) {
    await sheetsClient.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: rowIndexToDelete,
                endIndex: rowIndexToDelete + 1,
              },
            },
          },
        ],
      },
    });
    console.log('Строка удалена');
  } else {
    console.log('Строка не найдена');
  }
}

function chunkIntoN (array, n) {
  const result = [];
  for (let i = 0; i < array.length; i += n) {
    const chunk = array.slice(i, i + n);
    result.push(chunk);
  }
  return result
}

function addDays(date, days) {
  var result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function generateDateButtons() {
  const TODAY = new Date();
  let buttonsBronInterimArr = []
  for (let i = 0; i < 10; i++) {
    let dtText = addDays(TODAY, i).toLocaleDateString('ru-Ru')
    let obj = {text: dtText, callback_data: `dayChosen_${dtText}`}
    buttonsBronInterimArr.push(obj)
  }
  return chunkIntoN(buttonsBronInterimArr,3)
}

function isWeekend(date) {
    const day = date.getDay(); // 0 - воскресенье, 1 - понедельник, ..., 6 - суббота
    return day === 0 || day === 5 || day === 6; // 0 (воскресенье), 5 (пятница), 6 (суббота)
}

function timeToHour(time) {
  return parseInt(time.split(":")[0], 10);
}

function dateFromString(dateString) {
  const [day, month, year] = dateString.split('.').map(Number);
  const date = new Date(year, month - 1, day);
  return date;
}

function convertedTimes (time) {
  let [hours, minutes] = time.split(':').map(Number);
  let toReturn = hours + (minutes / 60)
  if (toReturn < 12) {
    return toReturn+24
  }
  return toReturn
}  

// function formatDate(date) {
//   const pad = n => n.toString().padStart(2, '0');
//   const day = pad(date.getDate());
//   const month = pad(date.getMonth() + 1); // Месяцы начинаются с 0
//   const year = date.getFullYear();
//   const hours = pad(date.getHours());
//   const minutes = pad(date.getMinutes());
//   const seconds = pad(date.getSeconds());
//   return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
// }

function formatDate(date) {
  const pad = n => n.toString().padStart(2, '0');
  const [day, month, year] = dateFormat.format(date).split('.');
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map(pad).join(':');
  return `${day}.${month}.${year} ${time}`;
}

const BUTTONS_BEGIN_BOOKING = {
  "inline_keyboard": [
    [
      {text: 'есть окошко ))', callback_data: 'stol_bron'},
    ],
  ]
}

const BUTTONS_BACK_ONE_STEP = {
  "inline_keyboard": [
    [
      {text: '<< назад', callback_data: 'back_to_stol_bron'},
    ],
  ]
}

const BUTTONS_RETURN_BACK = {
  "inline_keyboard": [
      [
        {text: 'в начало', callback_data: 'back_to_stol_bron'},
      ],
    ]
}

const BUTTONS_RETURN_BACK_FROM_DELETION = {
  "inline_keyboard": [
      [
        {text: 'в начало', callback_data: 'back_to_stol_bron_from_delete'},
      ],
    ]
}

async function checkUserPhoneAndName(chatId) {
  try {
    // 1. Получаем все данные из листа
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SERVICE_SHEET_ID,
      range: 'uniqueUsers!A:C', // Получаем все колонки для поиска
    });

    const rows = response.data.values || [];
    const userInfo = {};

    // Ищем первую строку с совпадающим chatId (с конца листа)
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i][0] && rows[i][0].toString() === chatId.toString()) {
        // Забираем данные из колонок C и D той же строки
        userInfo.userName = rows[i][2] || ''; // Колонка C (индекс 2)
        break; // Прерываем цикл после первого совпадения (как unshift в оригинале)
      }
    }

    return userInfo;
  } catch (err) {
    console.error('Ошибка в checkUserPhoneAndName:', err);
    throw err;
  }
}

async function getSpreadsheetLink() {
  try {
    // Получаем метаданные таблицы
    const response = await sheetsClient.spreadsheets.get({
      spreadsheetId: USER_SHEET_ID,
      fields: 'spreadsheetUrl', // Запрашиваем только URL
    });

    return response.data.spreadsheetUrl;
    
  } catch (err) {
    console.error('Ошибка при получении ссылки на таблицу:', err);
    throw err;
  }
}

async function checkSheetHidden(sheetName) {
  try {
    // Получаем метаданные таблицы
    const spreadsheet = await sheetsClient.spreadsheets.get({
      spreadsheetId: USER_SHEET_ID,
      fields: 'sheets(properties(sheetId,title,hidden))',
    });

    const targetSheet = spreadsheet.data.sheets.find(
      (sheet) => sheet.properties.title === sheetName.trim(),
    );

    if (!targetSheet) {
      console.log(`Лист "${sheetName}" не найден.`);
      return false;
    }

    // Проверяем, скрыт ли лист
    const isHidden = targetSheet.properties.hidden || false;
    return !isHidden; // Возвращаем true, если лист НЕ скрыт (как в оригинальной функции)
  } catch (err) {
    console.error('Ошибка при проверке листа:', err);
    return false;
  }
}

async function getBookingsByDate(bookingDate) {
  try {
    const SHEET_NAME = 'userBooking';
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SERVICE_SHEET_ID,
      range: `${SHEET_NAME}!A2:G`, 
    });

    const rows = response.data.values || [];
    if (!rows.length) {
      return [];
    }

    const bookingArrayOfObj = rows.map((row) => {
      const [chat_id, , user_name, booking_date_str, n_hour, booking_id, booking_time_str] = row;

      // Парсим дату и время (если они есть)
      let booking_date = null;
      let booking_time = null;
      let booking_hours = null;
      let booking_minutes = null;

      if (booking_date_str) {
        booking_date = booking_date_str
      }

      if (booking_time_str) {
        const [hours, minutes] = booking_time_str.split(':').map(Number);
        booking_hours = hours;
        booking_minutes = minutes;
        booking_time = `${hours}:${minutes.toString().padStart(2, '0')}`;
      }

      return {
        chat_id: parseInt(chat_id, 10),
        user_name,
        booking_date,
        booking_id,
        booking_hours,
        booking_minutes,
        n_hour,
        booking_time,
      };
    });

    const filteredBookings = bookingArrayOfObj.filter((el) => {
      if (!el.booking_date) return false;
      return el.booking_date === bookingDate
    });

    return filteredBookings;
  } catch (err) {
    console.error('Ошибка при получении данных:', err);
    throw err;
  }
}

function generateTableMessages(bookings, booking_date) {
  const formatTime = hour => 
    `${hour >= 24 ? hour-24 : hour}:00`.padStart(5, '0');

  const getFreeSlots = (table) => {
    const workDay = { start: 14, end: 26 }; // 26 = 2:00 next day
    if (isWeekend(dateFromString(booking_date))) {
      workDay.start = 12;
    }

    const bookingsForTable = bookings
      .filter(b => b.table === table)
      .map(b => ({ 
        start: b.booking_hours, 
        end: b.booking_hours + b.n_hour 
      }))
      .sort((a, b) => a.start - b.start);

    let current = workDay.start;
    const freeSlots = [];

    for (const {start, end} of bookingsForTable) {
      if (start > current) {
        freeSlots.push([current, start]);
      }
      current = Math.max(current, end);
    }

    if (current < workDay.end) {
      freeSlots.push([current, workDay.end]);
    }

    return freeSlots;
  };
  let tables = [3,4,5,6]

  let messages = tables.map(table => {
    const slots = getFreeSlots(table);
    return slots.length 
      ? `🟢 Стол №${table} свободен для бронирования ${
          slots.map(([s,e]) => `с ${formatTime(s)} до ${formatTime(e)}`).join('; ')
        }`
      : `🔴 Стол №${table} занят на весь день`;
  });
  
  let buttons = []
  tables.forEach(table => {
    const slots = getFreeSlots(table);
    if (slots.length)  {
      buttons.push([{text: `стол №${table}`, callback_data: `tableChosen_${table}__${booking_date}`}])
    }
  })
  buttons.push([{text: '<< назад', callback_data: 'back_to_stol_bron'},])
  let responseButtons = { "inline_keyboard": buttons }
  let responseMessage = `${messages.join('\n')}`

  return {message:responseMessage, buttons:responseButtons} 
}

async function getTablesInfoOld(filteredBookings, bookingDate) {
  try {
    let mappedBookings = filteredBookings.map( (el) => { return {
        booking_hours: el.booking_hours, 
        n_hour: parseFloat(el.n_hour), 
        table: parseFloat(el.booking_id.substr(el.booking_id.length - 1))
      } 
    })

    let tableIfo = generateTableMessages(mappedBookings, bookingDate)
    return tableIfo
  } catch (err) {
    console.error('Ошибка при получении данных:', err);
    throw err;
  }
}

function generateTimeSlots(dt) {
  const startHour = isWeekend(dt) ? 12 : 14;
  const slots = [];
  // Генерация слотов до полуночи
  for (let hour = startHour; hour < 24; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00-${(hour + 1).toString().padStart(2, '0')}:00`);
  }
  // Добавляем ночные слоты
  slots.push('00:00-01:00', '01:00-02:00');
  return slots;
}

function checkNextSlots(timeArr, bookTime, tableName) {
  let nextSlotObj = {oneHour:null, twoHour:null } 
  let timeObj = timeArr.find(p => p.time.includes(`${bookTime}-`));
  let oneStep = timeObj[tableName] ? 1 : 0;
  try {
    if (!timeArr[timeArr.indexOf(timeObj) + oneStep][tableName]) {
      nextSlotObj.oneHour = 1
    }
    if (!timeArr[timeArr.indexOf(timeObj) + 1 + oneStep][tableName]) {
      nextSlotObj.twoHour = 2
    } 
  } catch {null}

  return nextSlotObj
}

function checkOtherTable(bookingDate, tableNum, bookingTime, bookingArray) {  
  let timeSlotsArr = generateTimeSlots(dateFromString(bookingDate))
  let bookingArrayFiltered = bookingArray.filter(e => e.booking_id[e.booking_id.length - 1] == tableNum)

  const bookingMap = new Map();
  bookingArrayFiltered.forEach(booking => {
    const startHour = booking.booking_hours;
    const duration = parseInt(booking.n_hour, 10);
    for (let i = 0; i < duration; i++) {
      bookingMap.set(startHour + i, booking.user_name);
    }
  });

  let arrSorted = timeSlotsArr.map(timeRange => {
    const startHour = timeToHour(timeRange.split("-")[0]);
    return {
      time: timeRange,
      [`table${tableNum}`]: bookingMap.get(startHour) || null
    };
  });

  let chosenTimeIndex = arrSorted.findIndex(object => {
    return object.time.includes(`${bookingTime}-`);
  });
  arrSorted = arrSorted.slice(chosenTimeIndex, chosenTimeIndex+4)
  

  let nextSlotObj = checkNextSlots(arrSorted, bookingTime, `table${tableNum}` )

  if(!Object.values(nextSlotObj).every(o => o === null)) {
    nextSlotObj.table = tableNum;
    nextSlotObj.isAvailable = true;
    return nextSlotObj;
  }
  nextSlotObj.isAvailable = false;
  
  return nextSlotObj;
}

async function getUniqueTimeButtonsForTable(sheetName, tableNum, hours, time = null) {
  let callbackDataFlag = time ? 'timeSecondBookChosen_' : 'timeChosen_'
  let firstBookTime = time ? `__${time}` : ''
  const bookingsByDate = await getBookingsByDate(sheetName)
  let timeSlotsArr = generateTimeSlots(dateFromString(sheetName))

  let bookingArrayFiltered = bookingsByDate.filter(e => e.booking_id[e.booking_id.length - 1] == tableNum)

  const bookingMap = new Map();
  bookingArrayFiltered.forEach(booking => {
    const startHour = booking.booking_hours;
    const duration = parseInt(booking.n_hour, 10);
    for (let i = 0; i < duration; i++) {
      bookingMap.set(startHour + i, booking.user_name);
    }
  });

  let arrSorted = timeSlotsArr.map(timeRange => {
    const startHour = timeToHour(timeRange.split("-")[0]);
    return {
      time: timeRange.split("-")[0],
      [`table${tableNum}`]: bookingMap.get(startHour) || ''
    };
  });

  if (time ) {
    const index = arrSorted.findIndex(object => {
      return object.time == time;
    });
    arrSorted = arrSorted.slice(index, index+4)
  }
  
  const getButtonsArray = (tableNum, hours, arr) => {
    let filteredTimeArrForButtons = []
    let count = 0;
    let string = '';
    for (let i = 0; i < arr.length - (hours - 0.5) / 0.5; i++) {
      while (count < (hours - 0.5) / 0.5) {
        count++;
        string = arr[i + count][`table${tableNum}`] + string;
      }
      count = 0;
      if( arr[i][`table${tableNum}`] === '' && string === '') {
        filteredTimeArrForButtons.push(arr[i].time)
      }
      string = '';
      }
    return filteredTimeArrForButtons;
  };

  let buttonsArrayRaw = getButtonsArray(tableNum, hours, arrSorted)
  buttonsArrayRaw = buttonsArrayRaw.map( timeElement => ({text: timeElement, callback_data: `${callbackDataFlag}${tableNum}__${sheetName}__${timeElement}${firstBookTime}`})   )

  const date = new Date();
  let localeDate = date.toLocaleDateString('ru-RU')
  let localeTime = date.toLocaleTimeString('ru-RU')
  if (localeDate == sheetName && localeTime.split(':').map(Number)[0] > 18) {
      buttonsArrayRaw = buttonsArrayRaw.filter( obj => convertedTimes(obj.text) > convertedTimes(localeTime))
  }
  let butArray = chunkIntoN(buttonsArrayRaw,4)
  
  let responseButtons = {  "inline_keyboard": butArray  }
  return responseButtons;
}

async function getUniqueTimeButtonsForTableNew(sheetName, tableNum, hours, time = null) {
  let callbackDataFlag = time ? 'timeSecondBookChosen_' : 'timeChosen_'
  let firstBookTime = time ? `__${time}` : ''

  let timeSlots = generateTimeSlots(dateFromString(sheetName))
  let userBookingArray = await getUserBookingsArray(sheetName)
  let tableIndex = tableNum-3
  let tableName = `table${tableNum}`

  let arrSorted = userBookingArray[tableIndex].values.map( (object, index) => {
    let time = timeSlots[index].split('-')[0]
    if (object.effectiveValue || !object.userEnteredFormat) {
      return {time, [tableName]:'occupied'} 
    } else {
      return {time, [tableName]:''} 
    }
  })

  if (time ) {
    const index = arrSorted.findIndex(object => {
      return object.time == time;
    });
    arrSorted = arrSorted.slice(index, index+4)
  }
  
  const getButtonsArray = (tableNum, hours, arr) => {
    let filteredTimeArrForButtons = []
    let count = 0;
    let string = '';
    for (let i = 0; i < arr.length - (hours - 0.5) / 0.5; i++) {
      while (count < (hours - 0.5) / 0.5) {
        count++;
        string = arr[i + count][`table${tableNum}`] + string;
      }
      count = 0;
      if( arr[i][`table${tableNum}`] === '' && string === '') {
        filteredTimeArrForButtons.push(arr[i].time)
      }
      string = '';
      }
    return filteredTimeArrForButtons;
  };

  let buttonsArrayRaw = getButtonsArray(tableNum, hours, arrSorted)
  buttonsArrayRaw = buttonsArrayRaw.map( timeElement => ({text: timeElement, callback_data: `${callbackDataFlag}${tableNum}__${sheetName}__${timeElement}${firstBookTime}`})   )

  const date = new Date();
  let localeDate = date.toLocaleDateString('ru-RU')
  let localeTime = date.toLocaleTimeString('ru-RU')
  if (localeDate == sheetName && localeTime.split(':').map(Number)[0] > 18) {
      buttonsArrayRaw = buttonsArrayRaw.filter( obj => convertedTimes(obj.text) > convertedTimes(localeTime))
  }
  let butArray = chunkIntoN(buttonsArrayRaw,4)
  
  let responseButtons = {  "inline_keyboard": butArray  }
  return responseButtons;
}

function setTableTimeArr(timesArr) {
  let tables = Object.keys(timesArr[0]).filter(key => key !== 'time');
  let obj = tables.reduce((acc, curr) => {
    let tableTimeArr = []
    timesArr.forEach( element => {
      if (!element[curr]) {
        tableTimeArr.push(element.time)
      }
    })
    acc[curr] = tableTimeArr;
    return acc;
  }, {});
  return obj
}

function checkHoursAvailability(objTimes) {
  let tables = Object.keys(objTimes);
  function getHours(hours, name, ) {
      let objAnyHour = tables.reduce((acc, curr) => {
      let splitedTimes = objTimes[curr].map( e=> {return [e.split('-')[0], e.split('-')[1]]} ).flat()
      let convertedTimes = splitedTimes.map(time => {
        let [hours, minutes] = time.split(':').map(Number);
        let toReturn = hours + (minutes / 60)
        if (toReturn < 12) {
          return toReturn+24
        }
        return toReturn
      });
      let filteredTimes = convertedTimes.filter( e => { if (!(convertedTimes.filter( el => el == e).length > 1 )) { return true }})

      let hoursAvailabilityFlag = null, prevVal = null 
      filteredTimes.forEach( (element, index) => {
        if (prevVal && (index+1) % 2 === 0 && element-prevVal >= hours ) {
          hoursAvailabilityFlag = 1
        }
        prevVal = element
      })
      acc[`${curr}${name}`] = hoursAvailabilityFlag
      return acc;
    }, {});
    return objAnyHour
  }

  let objToReturn = {
        ...getHours(0.5, 'moietyHour'),
        ...getHours(1, 'oneHour'),
        ...getHours(1.5, 'halfHour'),
        ...getHours(2, 'twoHour'),
  };
  return objToReturn
}

async function getHoursButtons(bookingDate, tableNum, bookingTime, firstBookTime) {
  const bookingsByDate = await getBookingsByDate(bookingDate)
  let timeSlotsArr = generateTimeSlots(dateFromString(bookingDate))
  let bookingArrayFiltered = bookingsByDate.filter(e => e.booking_id[e.booking_id.length - 1] == tableNum)

  const bookingMap = new Map();
  bookingArrayFiltered.forEach(booking => {
    const startHour = booking.booking_hours;
    const duration = parseInt(booking.n_hour, 10);
    for (let i = 0; i < duration; i++) {
      bookingMap.set(startHour + i, booking.user_name);
    }
  });

  let arrSorted = timeSlotsArr.map(timeRange => {
    const startHour = timeToHour(timeRange.split("-")[0]);
    return {
      time: timeRange,
      [`table${tableNum}`]: bookingMap.get(startHour) || ''
    };
  });

  let availableSlotCnt = 2;
  if (firstBookTime) {
    let chosenTimeIndex = arrSorted.findIndex(object => {
      return object.time.includes(`${firstBookTime}-`);
    });
    arrSorted = arrSorted.slice(chosenTimeIndex, chosenTimeIndex + availableSlotCnt)
  }

  let tablesTime = setTableTimeArr(arrSorted)
  let hoursAvailability = checkHoursAvailability(tablesTime)
  let nextSlotObj = checkNextSlots(arrSorted, bookingTime, `table${tableNum}` )
  let hoursButtons = []
  
  if (hoursAvailability[`table${tableNum}oneHour`] && nextSlotObj.oneHour) {
    hoursButtons.push([ {text: '1 час', callback_data: `hoursChosen_${tableNum}__${bookingDate}__${bookingTime}__1`}, ],)
  }
  if (hoursAvailability[`table${tableNum}twoHour`] && nextSlotObj.twoHour) {
    hoursButtons.push([ {text: '2 часа', callback_data: `hoursChosen_${tableNum}__${bookingDate}__${bookingTime}__2`}, ],)
  }

  let finalHoursButtons = { "inline_keyboard": hoursButtons }
  return finalHoursButtons
}

async function getHoursButtonsNew(bookingDate, tableNum, bookingTime, firstBookTime) {
  let timeSlots = generateTimeSlots(dateFromString(bookingDate))
  let userBookingArray = await getUserBookingsArray(bookingDate)
  let tableIndex = tableNum-3
  let tableName = `table${tableNum}`

  let arrSorted = userBookingArray[tableIndex].values.map( (object, index) => {
    let time = timeSlots[index]
    if (object.effectiveValue || !object.userEnteredFormat) {
      return {time, [tableName]:'occupied'} 
    } else {
      return {time, [tableName]:''} 
    }
  })
  

  let availableSlotCnt = 2;
  if (firstBookTime) {
    let chosenTimeIndex = arrSorted.findIndex(object => {
      return object.time.includes(`${firstBookTime}-`);
    });
    arrSorted = arrSorted.slice(chosenTimeIndex, chosenTimeIndex + availableSlotCnt)
  }

  let tablesTime = setTableTimeArr(arrSorted)
  let hoursAvailability = checkHoursAvailability(tablesTime)
  let nextSlotObj = checkNextSlots(arrSorted, bookingTime, `table${tableNum}` )
  let hoursButtons = []
  
  if (hoursAvailability[`table${tableNum}oneHour`] && nextSlotObj.oneHour) {
    hoursButtons.push([ {text: '1 час', callback_data: `hoursChosen_${tableNum}__${bookingDate}__${bookingTime}__1`}, ],)
  }
  if (hoursAvailability[`table${tableNum}twoHour`] && nextSlotObj.twoHour) {
    hoursButtons.push([ {text: '2 часа', callback_data: `hoursChosen_${tableNum}__${bookingDate}__${bookingTime}__2`}, ],)
  }

  let finalHoursButtons = { "inline_keyboard": hoursButtons }
  return finalHoursButtons
}

async function checkFirstBooking(chat_id, bookingDate, tableNum, secondBookingTime, hours) {   
  const bookingsByDate = await getBookingsByDate(bookingDate)
  const bookingInfo = bookingsByDate.filter((el) => { return el.chat_id === chat_id; });

  if (bookingInfo.length > 1) {
    return false;
  } else if (bookingInfo.length === 1) {
    if(convertedTimes(secondBookingTime) > convertedTimes(bookingInfo[0].booking_time) + 1 
      || convertedTimes(secondBookingTime) < convertedTimes(bookingInfo[0].booking_time)) {  
      return false;
    }
    if(hours == '2' && secondBookingTime != bookingInfo[0].booking_time) {
      return false;
    }
    if(convertedTimes(secondBookingTime) >= ((convertedTimes(bookingInfo[0].booking_time) + 2) - (parseFloat(hours) - 0.5))) {
      return false;
    }

    const otherTable = checkOtherTable(bookingDate, tableNum, bookingInfo[0].booking_time, bookingsByDate)

    if(!Object.values(otherTable).some(time => time == hours)) {
      return false;
    }
  }
  return true;
}

function generateBookingId(chatId, bookDate, bookTime, tableNum) {
  bookDate = bookDate.replaceAll('.','')
  bookTime = bookTime.replaceAll(':','')
  return `${chatId}${bookDate}${bookTime}${tableNum}`
}

async function bookTable(bookDate, bookTime, tableNum, hours, userName, chat_id) { 
    try {
      // Определяем колонку для времени
      let timeToColumn = {}
      isWeekend(dateFromString(bookDate)) ? timeToColumn = {
          '12:00': 'C',
          '13:00': 'D',
          '14:00': 'E',
          '15:00': 'F',
          '16:00': 'G',
          '17:00': 'H',
          '18:00': 'I',
          '19:00': 'J',
          '20:00': 'K',
          '21:00': 'L',
          '22:00': 'M',
          '23:00': 'N',
          '00:00': 'O',
          '01:00': 'P',
      } : timeToColumn = {
          '14:00': 'C',
          '15:00': 'D',
          '16:00': 'E',
          '17:00': 'F',
          '18:00': 'G',
          '19:00': 'H',
          '20:00': 'I',
          '21:00': 'J',
          '22:00': 'K',
          '23:00': 'L',
          '00:00': 'M',
          '01:00': 'N'
      };

      const startColumn = timeToColumn[bookTime];
      const startRow = parseInt(tableNum) + 1; // Строка = номер стола + 1

      if (parseInt(hours) === 2) {
          const nextColumn = String.fromCharCode(startColumn.charCodeAt(0) + 1);
          await writeToRange(USER_SHEET_ID, `${bookDate}!${startColumn}${startRow}:${nextColumn}${startRow}`, [userName, userName]);
      } else {
        await writeToCell(USER_SHEET_ID, `${bookDate}!${startColumn}${startRow}`, userName);
      }
      return true
    } catch (error) {
      console.log(error)
      return false
    }
    
}

async function deleteBooking(bookDate, bookTime, tableNum, hours) { 
    try {
      // Определяем колонку для времени
      let timeToColumn = {}
      isWeekend(dateFromString(bookDate)) ? timeToColumn = {
          '12:00': 'C',
          '13:00': 'D',
          '14:00': 'E',
          '15:00': 'F',
          '16:00': 'G',
          '17:00': 'H',
          '18:00': 'I',
          '19:00': 'J',
          '20:00': 'K',
          '21:00': 'L',
          '22:00': 'M',
          '23:00': 'N',
          '00:00': 'O',
          '01:00': 'P',
      } : timeToColumn = {
          '14:00': 'C',
          '15:00': 'D',
          '16:00': 'E',
          '17:00': 'F',
          '18:00': 'G',
          '19:00': 'H',
          '20:00': 'I',
          '21:00': 'J',
          '22:00': 'K',
          '23:00': 'L',
          '00:00': 'M',
          '01:00': 'N'
      };

      const startColumn = timeToColumn[bookTime];
      const startRow = parseInt(tableNum) + 1; // Строка = номер стола + 1

      if (parseInt(hours) === 2) {
          const nextColumn = String.fromCharCode(startColumn.charCodeAt(0) + 1);
          await writeToRange(USER_SHEET_ID, `${bookDate}!${startColumn}${startRow}:${nextColumn}${startRow}`, ['', ''], true);
      } else {
        await writeToCell(USER_SHEET_ID, `${bookDate}!${startColumn}${startRow}`, '');
      }
      return true
    } catch (error) {
      console.log(error)
      return false
    }
}

function generateMessageForTable(times) {
  function isDecimal(num) {
    return num % 1 !== 0;
  }

  let splitedTimes = times.map( e=> {return [e.split('-')[0], e.split('-')[1]]} ).flat() 
  const convertedTimes = splitedTimes.map(time => {
    const [hours, minutes] = time.split(':').map(Number);
    let toReturn = hours + (minutes / 60)
    if (toReturn < 12) {
      return toReturn+24
    }
    return toReturn
  });
  
  let filteredTimes = convertedTimes.filter( e => { if (!(convertedTimes.filter( el => el == e).length > 1 )) { return true }})
  let message = 'свободен для бронирования';
  filteredTimes.forEach( (element, index) => {
    let nextValue = filteredTimes[index+1]
    if (index %2 === 0 && nextValue - element >= 0.5) {
      element = element >= 24 ? element-24 : element
      nextValue = nextValue >= 24 ? nextValue-24 : nextValue
      message = (isDecimal(element) ? `${message} с ${Math.floor(element)+':30'}` : `${message} с ${element+':00'}`) + 
        (isDecimal(nextValue) ?  ` до ${Math.floor(nextValue)+':30'};` : ` до ${nextValue+':00'};`)
    } 
  })
  return message.slice(0,message.length-1)
}

async function getTablesInfo(sheetName) {
  const spreadsheetId = USER_SHEET_ID;
  const secondColumn = isWeekend(dateFromString(sheetName)) ? `P` : `N`;
  const range = `C4:${secondColumn}7`;

  // Получаем структуру листа с данными о слияниях
  const sheetInfo = await sheetsClient.spreadsheets.get({
    spreadsheetId,
    ranges: [`${sheetName}!${range}`],
    includeGridData: true,
  });

  const sheet = sheetInfo.data.sheets[0];
  const grid = sheet.data[0].rowData || [];
  let timeSlots = generateTimeSlots(dateFromString(sheetName))
  let butArray = []
  let messageArray = []

  grid.forEach( (row, index) => {
    let tableIndex = index+3
    let tableName = `table${tableIndex}`
    let arrSorted = row.values.map( (object, index) => {
      if (object.effectiveValue || !object.userEnteredFormat) {
        return {time: timeSlots[index], [tableName]:'occupied'} 
      } else {
        return {time: timeSlots[index], [tableName]:null} 
      }
    })

    let tablesTime = setTableTimeArr(arrSorted)
    let hoursAvailability = checkHoursAvailability(tablesTime)
    if (hoursAvailability[`${tableName}moietyHour`]) {
      butArray.push([{text: `стол №${tableIndex}`, callback_data: `tableChosen_${tableIndex}__${sheetName}`}]) 
    }
    
    let tableMsg = hoursAvailability[`${tableName}moietyHour`] > 0 ? `🟢 Стол №${tableIndex} ` + generateMessageForTable(tablesTime[`table${tableIndex}`]) : `🔴 Стол №${tableIndex} занят на весь день` 
    messageArray.push(tableMsg)
  })
  butArray.push([{text: '<< назад', callback_data: 'back_to_stol_bron'},])
  let responseButtons = { "inline_keyboard": butArray }
  let returnObj = {
      "message":messageArray.join('\n'),
      "buttons":responseButtons
  }
  return returnObj
}

async function getUserBookingsArray(sheetName) {
  const spreadsheetId = USER_SHEET_ID;
  const secondColumn = isWeekend(dateFromString(sheetName)) ? `P` : `N`;
  const range = `C4:${secondColumn}7`;

  // Получаем структуру листа с данными о слияниях
  const sheetInfo = await sheetsClient.spreadsheets.get({
    spreadsheetId,
    ranges: [`${sheetName}!${range}`],
    includeGridData: true,
  });

  const sheet = sheetInfo.data.sheets[0];
  const grid = sheet.data[0].rowData || [];
  return grid;
}

const sendText = async(chatId, text, replyMarkup = null) => {
  if (replyMarkup) {
    bot.sendMessage(chatId, text, {reply_markup: replyMarkup});
  } else {
    bot.sendMessage(chatId, text);
  }
}

const editMessage = async(chatId, messageId, text, replyMarkup = null) => {
  bot.editMessageText(text, {chat_id: chatId, message_id: messageId, reply_markup: replyMarkup, parse_mode: 'HTML', disable_web_page_preview: true, link_preview_options: {is_disabled: true},} )
}

const sendDocument = async(chatId, caption, docUrl) => {
  bot.sendAnimation(chatId, docUrl, {caption: caption});
}

const deleteMessage = async(chatId, messageId) => {
  bot.deleteMessage(chatId, messageId);
}

async function findUserLastMessage(chatId) {
  try {
    // 1. Получаем все данные из листа
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: SERVICE_SHEET_ID,
      range: 'Messages!A:C', // Получаем все колонки для поиска
    });

    const unsortedLogArray = response.data.values || [];
    let filteredLogByUser = unsortedLogArray.filter( element => element[0]==chatId)

    let logLastRowObj = {}
    if (filteredLogByUser.length > 0) {
      let logLastRowArr = filteredLogByUser[filteredLogByUser.length-1]
      logLastRowObj = {
        chatId: logLastRowArr[0],
        userName: logLastRowArr[1],
        lastMessage: logLastRowArr[2],
        date: logLastRowArr[3],
      }
    }

    return logLastRowObj;
  } catch (err) {
    console.error('Ошибка в findUserLastMessage:', err);
    throw err;
  }
}

async function functionCheck() {
  console.time('Execution Time');
  let arrSorted = await getUniqueTimeButtonsForTableNew('31.05.2025', 5, 0.5)
  let arrSorted2 = await getUniqueTimeButtonsForTable('31.05.2025', 5, 0.5)
  console.timeEnd('Execution Time');
}

bot.on('message', async (msg) => {
  let user = msg.chat.first_name;
  let userNickName = msg.chat.username;
  let messageDate = new Date()
  let chat_id = msg.chat.id;
  let messageText = msg.text;

  if (messageText.startsWith('/')) {
    if (messageText === '/start') {
      let {userName } = await checkUserPhoneAndName(chat_id)
      if (userName) {
        let link = await getSpreadsheetLink()
        let messageToGreet = `Салют, ${userName}!\nИди по ссылке в <a href="${link}">гугл-таблицу</a>, чтобы прикинуть кий к носу!\n\nЕсть подходящий слот — возвращайся сюда и тыкай в кнопку, иначе можешь попытать удачу в живой очереди на месте.\n\nТакже ознакомься с правилами нашего клуба: /rules`
        await bot.sendMessage(chat_id, messageToGreet, {parse_mode: 'HTML', no_webpage:true, disable_web_page_preview:true, link_preview_options: {is_disabled: true}, reply_markup: BUTTONS_BEGIN_BOOKING});
      } else {
        let picurl = 'https://i.imgur.com/Q12DNEr.mp4'
        await sendDocument(chat_id, 'Как к тебе обращаться?', picurl)
      }
    }

    if (messageText === '/rules') {
      let rulesMessage1 = `- стоимость в дневное время 600 р/час (по будням до 18:00, в выходные до 16:00), вечернее - 1200 р/час\n` 
      let rulesMessage2 =`- к нам можно с животными! 🐶\n`
      let rulesMessage3 =`- макс. время игры - 2 ч, при бронировании большего кол-ва часов Кикс вправе отказать во второй брони, даже если они сделаны на разные имена\n`
      let rulesMessage4 =`- одна компания может одновременно забронировать макс. 2 стола\n`
      let rulesMessage5 =`- к нам нельзя приносить свою еду и напитки`
      let summedRulesMEssage = `${rulesMessage1}${rulesMessage2}${rulesMessage3}${rulesMessage4}${rulesMessage5}`
      await bot.sendMessage(chat_id, summedRulesMEssage);
    }

    if (messageText === '/about') {
      let tgChannelLink = `<a href="https://t.me/kiks_bi">tg-канал</a>`
      let igLink = `<a href="https://www.instagram.com/kiks_bi/">ig</a>`
      let aboutMessage = `Kiks — это бильярдный клуб в кластере Дом Бита. У нас 5 девятифутовых столов для игры в американский пул и бар с пивом и сидрами. Cтоимость игры: \n- дневное время по будням до 18:00, в выходные до 16:00 - 600 р/час\n- вечернее время - 1200 р/час \n\nВремя работы 12:00 - 02:00\n\nАдрес: Марата 56-58/29б\n\n${tgChannelLink}\n${igLink}\n\nЕсли остался важный вопрос: @kiks_book`
      await bot.sendMessage(chat_id, aboutMessage, {parse_mode: 'HTML', no_webpage:true,disable_web_page_preview:true, link_preview_options: {is_disabled: true}});
    }

    if (messageText === '/check') {
      await functionCheck()
    }
  } else  {
    let {lastMessage} = await findUserLastMessage(chat_id)
    if (lastMessage.includes('/start')) {
      if (messageText) {
        let {userName } = await checkUserPhoneAndName(chat_id)
        if (!userName) {
          const values = [[chat_id, user, messageText, null, null, userNickName]]; 
          appendRow(SERVICE_SHEET_ID, 'uniqueUsers', values);
          userName = messageText;
        }
        
        let link = await getSpreadsheetLink()
        let messageToGreet = `Салют, ${userName}!\nИди по ссылке в <a href="${link}">гугл-таблицу</a>, чтобы прикинуть кий к носу!\n\nЕсть подходящий слот — возвращайся сюда и тыкай в кнопку, иначе можешь попытать удачу в живой очереди на месте. \n\nТакже ознакомься с правилами нашего клуба: /rules`
        await bot.sendMessage(chat_id, messageToGreet, {parse_mode: 'HTML', disable_web_page_preview:true, link_preview_options: {is_disabled: true}, reply_markup: BUTTONS_BEGIN_BOOKING});
      } else {
        sendText(chat_id, 'Извини, такое имя не подходит. Попробуй другое') 
      }
    } else {
      sendText(chat_id, `Если есть вопрос, пиши сюда: @kiks_book`)
    }
  }

  if (messageText) {
    const values = [[chat_id, user, messageText, formatDate(messageDate), userNickName]]; 
    appendRow(SERVICE_SHEET_ID, 'Messages', values);
  }
});

bot.on('callback_query', async (callbackQuery) => {
  try {
    let chat_id = callbackQuery.message.chat.id
    let user = callbackQuery.message.chat.first_name
    let messageText = callbackQuery.data
    let userNickName = callbackQuery.message.chat.username
    let messageDate = new Date()

    const values = [[chat_id, user, messageText, formatDate(messageDate), userNickName]]; 
    appendRow(SERVICE_SHEET_ID, 'Messages', values);

    const BUTTONS_BRON = {
      "inline_keyboard": generateDateButtons()
    }

    if (messageText === 'stol_bron') {
      await sendText(chat_id, `Выбери дату, на которую хочешь забронировать стол`, BUTTONS_BRON)
    }

    if (messageText === 'back_to_stol_bron') {
      editMessage(chat_id, callbackQuery.message.message_id, `Выбери дату, на которую хочешь забронировать стол` , BUTTONS_BRON)
    }

    if (messageText === 'back_to_stol_bron_from_delete') {
      deleteMessage(chat_id, callbackQuery.message.message_id )
      sendText(chat_id, `Выбери дату, на которую хочешь забронировать стол`, BUTTONS_BRON)
    }

    if (messageText.includes('dayChosen')) {
      editMessage(chat_id, callbackQuery.message.message_id, `Загружаю актуальную информацию`)
      console.time('Execution Time');
      dateChoosen = messageText.replace('dayChosen_','')
      let isNotHidden = await checkSheetHidden(dateChoosen)
      if (isNotHidden) {
        const bookingsByDate = await getBookingsByDate(dateChoosen)
        const userBookings =  bookingsByDate.filter((el) => { return el.chat_id === chat_id; });
        if (userBookings.length === 0) {
          let tableInfo = await getTablesInfo(dateChoosen)
          editMessage(chat_id, callbackQuery.message.message_id, `Актуальная информация по столам за дату ${dateChoosen}:\n${tableInfo.message}` , tableInfo.buttons)
        } else if (userBookings.length === 1) {
          let tables = ['3','4','5','6']
          const booking_id = userBookings[0].booking_id + '';
          let table = booking_id[booking_id.length - 1]
          let remainingTables = tables.filter((elem) => elem !== table);
          let availableTables = remainingTables.map( table => { return checkOtherTable(dateChoosen, table, userBookings[0].booking_time, bookingsByDate)}).filter( tableObj => tableObj.isAvailable == true)
          if(availableTables.length > 0) {
            const BUTTONS_BOOK_ANOTHER_TABLE_FOR_TWO_HOURS = {
              "inline_keyboard": []
            }
            availableTables.forEach(tableObj => {
              BUTTONS_BOOK_ANOTHER_TABLE_FOR_TWO_HOURS.inline_keyboard.push(
                [{text: `стол ${tableObj.table}`, callback_data: `secondTableChosen_${tableObj.table}__${dateChoosen}__${userBookings[0].booking_time}`}]
              )
            })
            BUTTONS_BOOK_ANOTHER_TABLE_FOR_TWO_HOURS.inline_keyboard.push([ {text: '<< Назад', callback_data: 'back_to_stol_bron'} ] )
            editMessage(chat_id, callbackQuery.message.message_id, `На ${dateChoosen} ты можешь забронировать ещё один стол. Выбери, где хочешь играть` , BUTTONS_BOOK_ANOTHER_TABLE_FOR_TWO_HOURS);
          } else {
            editMessage(chat_id, callbackQuery.message.message_id, `У тебя уже есть одна бронь на ${dateChoosen}, а на соседних столах нет свободных слотов` , BUTTONS_BACK_ONE_STEP)
          }
        } else {
          editMessage(chat_id, callbackQuery.message.message_id, `Извини, на ${dateChoosen} у тебя уже есть две брони, выбери другую дату` , BUTTONS_BACK_ONE_STEP)
        } 
      } else {
        editMessage(chat_id, callbackQuery.message.message_id, `На эту дату забронировать нельзя(` , BUTTONS_BACK_ONE_STEP)
      }
      console.timeEnd('Execution Time');
    }

    if (messageText.includes('tableChosen')) {
      let tableNumAndDate = messageText.replace('tableChosen_','')
      let tableNum = tableNumAndDate.split('__')[0]
      let bookDate = tableNumAndDate.split('__')[1]
      let hours = 0.5;

      let timeButtons = await getUniqueTimeButtonsForTableNew(bookDate, parseInt(tableNum), hours )
      timeButtons.inline_keyboard.push([ {text: '<< назад', callback_data: `dayChosen_${bookDate}`}, ],)
      editMessage(chat_id, callbackQuery.message.message_id, `Отлично! Стол №${tableNum} на дату ${bookDate}.\nВо сколько хочешь начать играть?`, timeButtons)
    }

    if (messageText.includes('secondTableChosen')) {
      let tableNumDateTime = messageText.replace('secondTableChosen_','')
      let tableNum = tableNumDateTime.split('__')[0]
      let bookDate = tableNumDateTime.split('__')[1]
      let bookTime = tableNumDateTime.split('__')[2]
      let hours = 0.5;

      let timeButtons = await getUniqueTimeButtonsForTableNew(bookDate, parseInt(tableNum), hours, bookTime )
      timeButtons.inline_keyboard.push([ {text: '<< назад', callback_data: `dayChosen_${bookDate}`}, ],)
      editMessage(chat_id, callbackQuery.message.message_id, `Отлично! Стол №${tableNum} на дату ${bookDate}.\nВо сколько хочешь начать играть?`, timeButtons)
    }

    if (messageText.includes('timeChosen')) {
      let tableNumDateTime = messageText.replace('timeChosen_','')
      let tableNum = tableNumDateTime.split('__')[0]
      let bookDate = tableNumDateTime.split('__')[1]
      let bookTime = tableNumDateTime.split('__')[2]

      let hoursButtons = await getHoursButtonsNew(bookDate, parseInt(tableNum), bookTime)
      
      hoursButtons.inline_keyboard.push([ {text: '<< назад', callback_data: `tableChosen_${tableNum}__${bookDate}`}, ],)
      editMessage(chat_id, callbackQuery.message.message_id, `Теперь выбери продолжительность игры`, hoursButtons)
    }

    if (messageText.includes('timeSecondBookChosen')) {
      let tableNumDateTime = messageText.replace('timeSecondBookChosen_','')
      let tableNum = tableNumDateTime.split('__')[0]
      let bookDate = tableNumDateTime.split('__')[1]
      let bookTime = tableNumDateTime.split('__')[2]
      let firstBookTime = tableNumDateTime.split('__')[3]

      let hoursButtons = await getHoursButtonsNew(bookDate, parseInt(tableNum), bookTime, firstBookTime)
      hoursButtons.inline_keyboard.push([ {text: '<< назад', callback_data: `dayChosen_${bookDate}`}, ],)
      editMessage(chat_id, callbackQuery.message.message_id, `Теперь выбери продолжительность игры`, hoursButtons)
    }

    if (messageText.includes('hoursChosen')) {
      let tableNumDateTime = messageText.replace('hoursChosen_','')
      let tableNum = tableNumDateTime.split('__')[0]
      let bookDate = tableNumDateTime.split('__')[1]
      let bookTime = tableNumDateTime.split('__')[2]
      let hours = tableNumDateTime.split('__')[3]

      editMessage(chat_id, callbackQuery.message.message_id, `Подожди чуть-чуть, выполняется бронирование`)
      if(checkFirstBooking(chat_id, bookDate, tableNum, bookTime, hours)) {
        let {userName} = await checkUserPhoneAndName(chat_id)
        if (userName) {
          let bookFinished = await bookTable(bookDate, bookTime, tableNum, hours, userName, chat_id)
          if (bookFinished) {
            let bookingId = generateBookingId(chat_id, bookDate, bookTime, tableNum)
            let bookingValues = [[chat_id, user, userName, bookDate, hours, bookingId, bookTime,null, null, callbackQuery.message.message_id]];
            appendRow(SERVICE_SHEET_ID, 'userBooking', bookingValues);
            let sheetLink = await getSheetLink(bookDate)

            const BUTTONS_BOOK_READY = {
              "inline_keyboard": [
                [
                  {text: 'проверить бронь', url:sheetLink},
                ],
                [
                  {text: 'забронировать еще!', callback_data: 'stol_bron'},
                ],
                [
                  {text: 'отменить бронь', callback_data: `deleteBron_${tableNum}__${bookDate}__${bookTime}__${hours}`},
                ],
              ]
            }

            let prefix = parseFloat(hours) > 1 ? 'часа' : 'час';
            infoMessage = `\nОбщая информация:\n• ${bookDate}\n• ${bookTime}\n• стол №${tableNum}\n• ${hours} ${prefix}`
            let infoMessage1 = `У нас есть кухня (до 23:00) и пивной крафтовый бар. Просим не приносить свою еду и напитки.`
            let infoMessage2 = `P.S. Если ты опаздываешь, напиши <a href="https://t.me/kiks_book">Киксу</a>, он держит бронь только 15 минут.`
          
            editMessage(chat_id, callbackQuery.message.message_id, `${userName}, это успех! Можешь проверить бронь, кликнув по кнопке.${infoMessage}\n\n${infoMessage1}\n\n${infoMessage2}`, BUTTONS_BOOK_READY)
          } else {
            editMessage(chat_id, callbackQuery.message.message_id, `${userName}, кажется, кто-то опередил тебя и забронировал стол на это время первым. Попробуй обновить актуальную информацию по столам и выбрать другое время`, BUTTONS_RETURN_BACK)
          }
        } 
      } else {
        editMessage(chat_id, callbackQuery.message.message_id, `Хорошая попытка, но мы это продумали!\nВернись и забронируй стол по-честному!`, BUTTONS_RETURN_BACK)
      }
    }

    if (messageText.includes('deleteBron')) {
      let tableNumDateTime = messageText.replace('deleteBron_','')
      let tableNum = tableNumDateTime.split('__')[0]
      let bookDate = tableNumDateTime.split('__')[1]
      let bookTime = tableNumDateTime.split('__')[2]
      let bookHours = tableNumDateTime.split('__')[3]
      let bookingId = generateBookingId(chat_id, bookDate, bookTime, tableNum)

      deleteBooking(bookDate, bookTime, tableNum, parseFloat(bookHours), chat_id)
      deleteUserBookingRow(bookingId)
      editMessage(chat_id, callbackQuery.message.message_id, `Ты отменил бронь на ${bookDate} с ${bookTime}`, BUTTONS_RETURN_BACK_FROM_DELETION)
    }
  } catch (error) {
    console.error('Callback error:', error);
    try {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'Произошла ошибка, попробуйте позже',
        show_alert: true
      });
    } catch (e) {
      console.error('Failed to send error to user:', e);
    }
  } finally {
    // Принудительно освобождаем ресурсы
    if (callbackQuery.message) {
      callbackQuery.message = null;
    }
  }
});