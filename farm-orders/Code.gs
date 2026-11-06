/**
 * 주문 관리 웹앱 (구글 로그인 없이 PIN 으로 들어오는 보안 버전)
 *
 * - 이 파일은 "구글 시트 → 확장 프로그램 → Apps Script" 에 붙여 넣어 씁니다.
 * - 데이터는 구글 시트에만 있고, 이 웹앱은 시트 주인(나)의 권한으로 시트를 읽고 씁니다.
 * - 부모님은 웹앱 주소 + PIN 만 있으면 되고, 구글 로그인은 필요 없습니다.
 * - PIN 은 이 코드에 적지 않습니다. 시트 메뉴 "🔐 주문관리 → 사용자 추가" 로 넣으면
 *   해시(암호화된 값)로만 저장됩니다. 그래서 이 코드를 공개 저장소에 올려도 안전합니다.
 */

const CONFIG = {
  APP_TITLE: '주문 관리',

  // 보여줄 시트 이름. 비워 두면 숨기지 않은 모든 시트(접속기록 시트 제외)를 보여줍니다.
  SHEETS: [],

  HEADER_ROW: 1,          // 머리글(열 이름)이 있는 행
  MAX_ROWS: 400,          // 한 번에 불러올 최근 행 수
  NEWEST_FIRST: true,     // 최근 행(아래쪽)을 먼저 보여줌

  // 개인정보 열 자동 인식 (머리글에 이 단어가 들어가면 가려서 보여줌)
  MASK_PII: true,
  PII_KEYWORDS: {
    phone:   ['전화', '연락처', '휴대폰', '핸드폰', '폰번호', 'phone', 'tel', 'mobile'],
    address: ['주소', '배송지', 'address'],
    name:    ['수취인', '받는', '주문자', '구매자', '고객', '성함', '이름', '성명', 'name'],
    other:   ['개인통관', '통관부호', '주민', '계좌', '이메일', 'email', '메일'],
  },
  // 이름 열로 잘못 인식되지 않게 할 단어 (예: "상품이름")
  NAME_EXCLUDE: ['상품', '품목', '제품', '옵션', '택배', '택배사'],

  // 이 단어가 머리글에 있으면 웹앱에서 고치지 못하게 함 (예: ['주문번호'])
  READONLY_KEYWORDS: [],

  DATE_KEYWORDS: ['주문일', '결제일', '날짜', '일자', '발송일', '주문 날짜', 'date'],

  SESSION_HOURS: 12,       // "이 기기 기억" 안 할 때 로그인 유지 시간
  REMEMBER_DAYS: 30,       // "이 기기 기억" 할 때 로그인 유지 일수
  MAX_FAILS: 5,            // PIN 이 이만큼 연속으로 틀리면
  LOCK_MINUTES: 15,        // 이 시간 동안 로그인 잠금

  LOG_SHEET: '_접속기록',
  LOG_KEEP_ROWS: 5000,

  // 주문일로부터 이 일수가 지난 행의 개인정보를 시트에서 영구히 가립니다(파기). 0 이면 끔.
  // 메뉴에서 "자동 파기 켜기" 를 해야 매일 새벽에 실행됩니다.
  ANONYMIZE_AFTER_DAYS: 180,
};

const ROLES = { admin: '관리자', editor: '편집', viewer: '보기만' };
const props = () => PropertiesService.getScriptProperties();

/* ------------------------------------------------------------------ */
/* 웹앱 진입점                                                          */
/* ------------------------------------------------------------------ */

function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.appTitle = CONFIG.APP_TITLE;
  return t.evaluate()
    .setTitle(CONFIG.APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT); // 다른 사이트에 끼워 넣기 금지
}

/* ------------------------------------------------------------------ */
/* 인증                                                                 */
/* ------------------------------------------------------------------ */

function getUsers_() {
  return JSON.parse(props().getProperty('USERS') || '[]');
}
function saveUsers_(users) {
  props().setProperty('USERS', JSON.stringify(users));
}
function pepper_() {
  let p = props().getProperty('PEPPER');
  if (!p) {
    p = randomToken_();
    props().setProperty('PEPPER', p);
  }
  return p;
}
function randomToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}
function hex_(bytes) {
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function hashPin_(pin, salt) {
  // HMAC-SHA256(pepper, salt + pin) 를 여러 번 반복 → 저장소가 새어도 PIN 을 알아내기 어렵게
  let h = salt + ':' + pin;
  const key = pepper_();
  for (let i = 0; i < 200; i++) h = hex_(Utilities.computeHmacSha256Signature(h, key));
  return h;
}
function sha_(s) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s));
}
function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** 웹앱: PIN 으로 로그인. 성공하면 토큰을 돌려줌. */
function login(pin, remember) {
  pin = String(pin || '').trim();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const now = Date.now();
    const fails = JSON.parse(props().getProperty('FAILS') || '{"n":0,"until":0}');
    if (fails.until > now) {
      const min = Math.ceil((fails.until - now) / 60000);
      throw new Error('LOCKED: PIN 을 여러 번 틀려서 잠겼어요. ' + min + '분 뒤에 다시 해 주세요.');
    }
    const users = getUsers_();
    if (!users.length) throw new Error('SETUP: 아직 사용자가 없어요. 시트 메뉴 "🔐 주문관리 → 사용자 추가" 를 먼저 해 주세요.');

    const user = /^\d{4,12}$/.test(pin) ? users.find(u => safeEqual_(hashPin_(pin, u.salt), u.hash)) : null;
    if (!user) {
      fails.n += 1;
      if (fails.n >= CONFIG.MAX_FAILS) {
        fails.until = now + CONFIG.LOCK_MINUTES * 60000;
        fails.n = 0;
        log_('-', '로그인 잠김', CONFIG.MAX_FAILS + '회 연속 실패');
        notifyOwner_('PIN 이 ' + CONFIG.MAX_FAILS + '회 연속 틀려서 주문 관리 웹앱 로그인이 ' + CONFIG.LOCK_MINUTES + '분 잠겼습니다.');
      }
      props().setProperty('FAILS', JSON.stringify(fails));
      log_('-', '로그인 실패', '');
      const left = CONFIG.MAX_FAILS - fails.n;
      throw new Error('PIN: PIN 이 맞지 않아요.' + (fails.until > now ? ' ' + CONFIG.LOCK_MINUTES + '분 동안 잠겼어요.' : ' (남은 기회 ' + left + '번)'));
    }
    props().setProperty('FAILS', '{"n":0,"until":0}');
    cleanTokens_();

    const token = randomToken_();
    const exp = now + (remember ? CONFIG.REMEMBER_DAYS * 86400000 : CONFIG.SESSION_HOURS * 3600000);
    props().setProperty('T_' + sha_(token), JSON.stringify({ u: user.id, exp: exp }));
    log_(user.name, '로그인', remember ? '기기 기억 ' + CONFIG.REMEMBER_DAYS + '일' : CONFIG.SESSION_HOURS + '시간');
    return { token: token, name: user.name, role: user.role, roleName: ROLES[user.role], exp: exp };
  } finally {
    lock.releaseLock();
  }
}

/** 웹앱: 로그아웃 (이 기기의 토큰 폐기) */
function logout(token) {
  const key = 'T_' + sha_(String(token || ''));
  const s = props().getProperty(key);
  if (s) {
    const u = getUsers_().find(x => x.id === JSON.parse(s).u);
    log_(u ? u.name : '?', '로그아웃', '');
    props().deleteProperty(key);
  }
  return true;
}

function auth_(token, needEdit) {
  if (!token) throw new Error('AUTH: 다시 로그인해 주세요.');
  const s = props().getProperty('T_' + sha_(String(token)));
  if (!s) throw new Error('AUTH: 로그인이 끝났어요. PIN 을 다시 넣어 주세요.');
  const t = JSON.parse(s);
  if (t.exp < Date.now()) {
    props().deleteProperty('T_' + sha_(String(token)));
    throw new Error('AUTH: 로그인 시간이 지났어요. PIN 을 다시 넣어 주세요.');
  }
  const user = getUsers_().find(u => u.id === t.u);
  if (!user) throw new Error('AUTH: 사용자 정보가 바뀌었어요. PIN 을 다시 넣어 주세요.');
  if (needEdit && user.role === 'viewer') throw new Error('보기만 가능한 사용자예요.');
  return user;
}

function cleanTokens_() {
  const all = props().getProperties();
  const now = Date.now();
  Object.keys(all).forEach(k => {
    if (k.indexOf('T_') === 0) {
      try { if (JSON.parse(all[k]).exp < now) props().deleteProperty(k); } catch (e) { props().deleteProperty(k); }
    }
  });
}
function revokeTokens_(userId) {
  const all = props().getProperties();
  Object.keys(all).forEach(k => {
    if (k.indexOf('T_') === 0) {
      try { if (!userId || JSON.parse(all[k]).u === userId) props().deleteProperty(k); } catch (e) { props().deleteProperty(k); }
    }
  });
}

/* ------------------------------------------------------------------ */
/* 시트 읽기                                                            */
/* ------------------------------------------------------------------ */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function allowedSheets_() {
  return ss_().getSheets()
    .filter(s => s.getName() !== CONFIG.LOG_SHEET && !s.isSheetHidden())
    .filter(s => !CONFIG.SHEETS.length || CONFIG.SHEETS.indexOf(s.getName()) >= 0)
    .map(s => s.getName());
}
function sheet_(name) {
  const names = allowedSheets_();
  if (names.indexOf(name) < 0) throw new Error('볼 수 없는 시트예요.');
  return ss_().getSheetByName(name);
}

function has_(header, words) {
  const h = String(header).toLowerCase().replace(/\s/g, '');
  return words.some(w => h.indexOf(String(w).toLowerCase().replace(/\s/g, '')) >= 0);
}
function piiType_(header) {
  if (!CONFIG.MASK_PII) return '';
  const K = CONFIG.PII_KEYWORDS;
  if (has_(header, K.phone)) return 'phone';
  if (has_(header, K.address)) return 'address';
  if (has_(header, K.other)) return 'other';
  if (has_(header, K.name) && !has_(header, CONFIG.NAME_EXCLUDE)) return 'name';
  return '';
}

function columns_(sh) {
  const lastCol = sh.getLastColumn();
  if (!lastCol) return [];
  const headers = sh.getRange(CONFIG.HEADER_ROW, 1, 1, lastCol).getDisplayValues()[0];
  // 체크박스 열: 데이터 확인 규칙이 체크박스인 열
  const firstData = CONFIG.HEADER_ROW + 1;
  const probeRows = Math.max(1, Math.min(50, sh.getLastRow() - CONFIG.HEADER_ROW));
  const rules = sh.getRange(firstData, 1, probeRows, lastCol).getDataValidations();
  const raws = sh.getRange(firstData, 1, probeRows, lastCol).getValues();
  return headers.map((h, i) => {
    let check = false, date = false;
    for (let r = 0; r < probeRows; r++) {
      const rule = rules[r][i];
      if (rule && rule.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.CHECKBOX) check = true;
      if (typeof raws[r][i] === 'boolean') check = true;
      if (raws[r][i] instanceof Date) date = true;
    }
    return {
      i: i,
      name: h || ('열 ' + (i + 1)),
      empty: !h,
      pii: piiType_(h),
      check: check,
      date: date || has_(h, CONFIG.DATE_KEYWORDS),
      readonly: CONFIG.READONLY_KEYWORDS.length > 0 && has_(h, CONFIG.READONLY_KEYWORDS),
    };
  });
}

const PHONE_RE = /(01[016789]|0\d{1,2})[-\s.]?(\d{3,4})[-\s.]?(\d{4})/g;

function mask_(value, type) {
  const v = String(value);
  if (!v) return v;
  if (type && v.indexOf('*') >= 0) return v; // 이미 가려진(파기된) 값
  if (type === 'phone') {
    const d = v.replace(/\D/g, '');
    if (d.length >= 8) return d.slice(0, 3) + '-****-' + d.slice(-4);
    return d.length > 2 ? '***' + d.slice(-2) : '***';
  }
  if (type === 'name') {
    const s = v.trim();
    if (s.length <= 1) return '*';
    if (s.length === 2) return s[0] + '*';
    return s[0] + '*'.repeat(s.length - 2) + s[s.length - 1];
  }
  if (type === 'address') {
    const parts = v.trim().split(/\s+/);
    return parts.slice(0, 2).join(' ') + (parts.length > 2 ? ' ***' : '');
  }
  if (type === 'other') return v.length <= 2 ? '**' : v.slice(0, 1) + '***';
  // 다른 열(메모 등)에 섞여 있는 전화번호
  return v.replace(PHONE_RE, (m, a, b, c) => a + '-****-' + c);
}

/** 웹앱: 시트 목록 + 데이터 */
function getData(token, sheetName) {
  const user = auth_(token);
  const names = allowedSheets_();
  const name = names.indexOf(sheetName) >= 0 ? sheetName : names[0];
  const sh = ss_().getSheetByName(name);
  const cols = columns_(sh);
  const lastRow = sh.getLastRow();
  const first = CONFIG.HEADER_ROW + 1;
  let rows = [];
  if (cols.length && lastRow >= first) {
    const start = Math.max(first, lastRow - CONFIG.MAX_ROWS + 1);
    const n = lastRow - start + 1;
    const disp = sh.getRange(start, 1, n, cols.length).getDisplayValues();
    const raw = sh.getRange(start, 1, n, cols.length).getValues();
    for (let r = 0; r < n; r++) {
      if (disp[r].every(x => x === '')) continue;
      const v = [], m = [];
      for (let c = 0; c < cols.length; c++) {
        const col = cols[c];
        if (col.check) { v.push(raw[r][c] === true); continue; }
        const d = disp[r][c];
        const masked = CONFIG.MASK_PII ? mask_(d, col.pii) : d;
        if (masked !== d) m.push(c);
        v.push(masked);
      }
      rows.push({ r: start + r, v: v, m: m });
    }
    if (CONFIG.NEWEST_FIRST) rows.reverse();
  }
  return {
    user: { name: user.name, role: user.role, roleName: ROLES[user.role] },
    sheets: names,
    sheet: name,
    cols: cols,
    rows: rows,
    truncated: lastRow - CONFIG.HEADER_ROW > CONFIG.MAX_ROWS,
    at: Date.now(),
  };
}

/** 웹앱: 가려진 칸 하나를 잠깐 보기 (기록이 남음) */
function reveal(token, sheetName, row, colIdx) {
  const user = auth_(token);
  const sh = sheet_(sheetName);
  row = Number(row); colIdx = Number(colIdx);
  if (!(row > CONFIG.HEADER_ROW && row <= sh.getLastRow()) || !(colIdx >= 0 && colIdx < sh.getLastColumn())) throw new Error('잘못된 위치예요.');
  const header = sh.getRange(CONFIG.HEADER_ROW, colIdx + 1).getDisplayValue();
  const value = sh.getRange(row, colIdx + 1).getDisplayValue();
  log_(user.name, '개인정보 보기', sheetName + ' ' + row + '행 [' + header + ']');
  return value;
}

/* ------------------------------------------------------------------ */
/* 시트 쓰기                                                            */
/* ------------------------------------------------------------------ */

function cleanInput_(v) {
  v = String(v == null ? '' : v).slice(0, 2000);
  // 수식 넣기 방지 (=IMPORTXML 등으로 데이터가 밖으로 새는 것 차단)
  if (/^[=@]/.test(v)) v = "'" + v;
  if (/^[+\-]/.test(v) && !/^[+\-]?\d[\d\s\-]*$/.test(v)) v = "'" + v;
  if (/^0\d/.test(v) && /^[\d\-\s]+$/.test(v)) v = "'" + v; // 010... 앞자리 0 지키기
  return v;
}

/** 웹앱: 칸 하나 고치기. oldValue 가 지금 값과 다르면(다른 사람이 먼저 고침) 거절 */
function updateCell(token, sheetName, row, colIdx, oldValue, newValue) {
  const user = auth_(token, true);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_(sheetName);
    const cols = columns_(sh);
    row = Number(row); colIdx = Number(colIdx);
    const col = cols[colIdx];
    if (!col || !(row > CONFIG.HEADER_ROW && row <= sh.getLastRow())) throw new Error('잘못된 위치예요.');
    if (col.readonly) throw new Error('이 칸은 웹앱에서 고칠 수 없어요.');
    const cell = sh.getRange(row, colIdx + 1);
    if (cell.getFormula()) throw new Error('수식이 들어 있는 칸은 시트에서 직접 고쳐 주세요.');

    if (col.check) {
      const cur = cell.getValue() === true;
      if (cur !== (oldValue === true)) throw new Error('CONFLICT: 그사이 다른 분이 바꿨어요. 새로 불러올게요.');
      cell.setValue(newValue === true);
      log_(user.name, '체크 변경', sheetName + ' ' + row + '행 [' + col.name + '] → ' + (newValue === true ? '✔' : '해제'));
      return newValue === true;
    }
    const curDisp = cell.getDisplayValue();
    const curShown = CONFIG.MASK_PII ? mask_(curDisp, col.pii) : curDisp;
    if (curShown !== String(oldValue)) throw new Error('CONFLICT: 그사이 다른 분이 바꿨어요. 새로 불러올게요.');
    cell.setValue(cleanInput_(newValue));
    SpreadsheetApp.flush();
    log_(user.name, '수정', sheetName + ' ' + row + '행 [' + col.name + ']' + (col.pii ? '' : ' "' + String(curDisp).slice(0, 40) + '" → "' + String(newValue).slice(0, 40) + '"'));
    const d = cell.getDisplayValue();
    return CONFIG.MASK_PII ? mask_(d, col.pii) : d;
  } finally {
    lock.releaseLock();
  }
}

/** 웹앱: 새 행 추가 (values: {열번호: 값}) */
function addRow(token, sheetName, values) {
  const user = auth_(token, true);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_(sheetName);
    const cols = columns_(sh);
    const last = Math.max(sh.getLastRow(), CONFIG.HEADER_ROW);
    const row = last + 1;
    if (last > CONFIG.HEADER_ROW) {
      // 바로 위 행의 서식·체크박스를 그대로 가져옴
      sh.getRange(last, 1, 1, cols.length).copyTo(sh.getRange(row, 1, 1, cols.length), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      sh.getRange(last, 1, 1, cols.length).copyTo(sh.getRange(row, 1, 1, cols.length), SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    }
    const out = cols.map(c => {
      const v = values ? values[c.i] : '';
      if (c.check) return v === true;
      return cleanInput_(v);
    });
    sh.getRange(row, 1, 1, cols.length).setValues([out]);
    log_(user.name, '새 행 추가', sheetName + ' ' + row + '행');
    return row;
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* 접속 기록                                                            */
/* ------------------------------------------------------------------ */

function log_(who, action, detail) {
  try {
    let sh = ss_().getSheetByName(CONFIG.LOG_SHEET);
    if (!sh) {
      sh = ss_().insertSheet(CONFIG.LOG_SHEET);
      sh.appendRow(['시각', '누가', '무엇을', '내용']);
      sh.setFrozenRows(1);
      sh.hideSheet();
    }
    sh.appendRow([new Date(), who, action, detail]);
    const extra = sh.getLastRow() - 1 - CONFIG.LOG_KEEP_ROWS;
    if (extra > 100) sh.deleteRows(2, extra);
  } catch (e) { /* 기록 실패는 무시 */ }
}

function notifyOwner_(msg) {
  try {
    const owner = Session.getEffectiveUser().getEmail();
    if (owner) MailApp.sendEmail(owner, '[' + CONFIG.APP_TITLE + '] 보안 알림', msg + '\n\n시트: ' + ss_().getUrl());
  } catch (e) { /* 메일 실패는 무시 */ }
}

/* ------------------------------------------------------------------ */
/* 시트 메뉴 (시트 주인만 사용)                                         */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔐 주문관리')
    .addItem('사용자 추가 / PIN 바꾸기', 'menuAddUser')
    .addItem('사용자 목록 · 삭제', 'menuUsers')
    .addItem('모든 기기 로그아웃', 'menuRevokeAll')
    .addSeparator()
    .addItem('접속기록 보기', 'menuShowLog')
    .addItem('로그인 잠금 풀기', 'menuUnlock')
    .addSeparator()
    .addItem('오래된 주문 개인정보 지금 파기', 'menuAnonymizeNow')
    .addItem('개인정보 자동 파기 켜기 (매일 새벽)', 'menuAutoOn')
    .addItem('개인정보 자동 파기 끄기', 'menuAutoOff')
    .addToUi();
}

function menuAddUser() {
  const ui = SpreadsheetApp.getUi();
  const n = ui.prompt('사용자 추가 / PIN 바꾸기', '이름 (예: 아버지, 어머니, 나)\n같은 이름이 있으면 PIN 과 권한을 바꿉니다.', ui.ButtonSet.OK_CANCEL);
  if (n.getSelectedButton() !== ui.Button.OK) return;
  const name = n.getResponseText().trim().slice(0, 20);
  if (!name) return;
  const p = ui.prompt('PIN 정하기', name + ' 님의 PIN (숫자 6~12자리)\n생일·전화번호 끝자리·111111 처럼 쉬운 번호는 피해 주세요.', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  const pin = p.getResponseText().trim();
  if (!/^\d{6,12}$/.test(pin)) { ui.alert('PIN 은 숫자 6~12자리로 해 주세요.'); return; }
  if (/^(\d)\1+$/.test(pin) || '0123456789012'.indexOf(pin) >= 0 || '9876543210987'.indexOf(pin) >= 0) { ui.alert('너무 쉬운 PIN 이에요. 다른 번호로 해 주세요.'); return; }
  const r = ui.prompt('권한', '1 = 관리자(나)\n2 = 편집 (보기 + 체크·수정·추가)\n3 = 보기만', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const role = { '1': 'admin', '2': 'editor', '3': 'viewer' }[r.getResponseText().trim()] || 'editor';

  const users = getUsers_();
  const dup = users.find(u => u.name !== name && safeEqual_(hashPin_(pin, u.salt), u.hash));
  if (dup) { ui.alert('다른 사용자(' + dup.name + ')와 같은 PIN 이에요. 다른 번호로 해 주세요.'); return; }
  const salt = randomToken_().slice(0, 16);
  let u = users.find(x => x.name === name);
  if (u) {
    revokeTokens_(u.id);
    u.salt = salt; u.hash = hashPin_(pin, salt); u.role = role;
  } else {
    u = { id: Utilities.getUuid(), name: name, role: role, salt: salt, hash: hashPin_(pin, salt) };
    users.push(u);
  }
  saveUsers_(users);
  log_('시트 주인', '사용자 설정', name + ' (' + ROLES[role] + ')');
  ui.alert('완료', name + ' 님을 ' + ROLES[role] + ' 권한으로 저장했어요.\nPIN 은 직접 말로 알려 주세요(문자·카톡에 남기지 않기).', ui.ButtonSet.OK);
}

function menuUsers() {
  const ui = SpreadsheetApp.getUi();
  const users = getUsers_();
  if (!users.length) { ui.alert('사용자가 없어요. "사용자 추가" 를 먼저 해 주세요.'); return; }
  const list = users.map((u, i) => (i + 1) + '. ' + u.name + ' (' + ROLES[u.role] + ')').join('\n');
  const r = ui.prompt('사용자 목록', list + '\n\n지울 사용자 번호를 넣으면 삭제하고, 그 사람의 모든 기기를 로그아웃시킵니다.\n그냥 닫으려면 취소.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const idx = Number(r.getResponseText().trim()) - 1;
  if (!(idx >= 0 && idx < users.length)) return;
  const gone = users.splice(idx, 1)[0];
  revokeTokens_(gone.id);
  saveUsers_(users);
  log_('시트 주인', '사용자 삭제', gone.name);
  ui.alert(gone.name + ' 님을 지웠어요.');
}

function menuRevokeAll() {
  revokeTokens_(null);
  log_('시트 주인', '모든 기기 로그아웃', '');
  SpreadsheetApp.getUi().alert('모든 기기에서 로그아웃시켰어요. 다음에 열 때 PIN 을 다시 넣어야 합니다.\n(휴대폰을 잃어버렸을 때 쓰세요)');
}

function menuShowLog() {
  let sh = ss_().getSheetByName(CONFIG.LOG_SHEET);
  if (!sh) { log_('시트 주인', '기록 시작', ''); sh = ss_().getSheetByName(CONFIG.LOG_SHEET); }
  sh.showSheet();
  ss_().setActiveSheet(sh);
  SpreadsheetApp.getUi().alert('다 본 뒤에는 시트 탭을 오른쪽 클릭 → "시트 숨기기" 해 두세요.');
}

function menuUnlock() {
  props().setProperty('FAILS', '{"n":0,"until":0}');
  SpreadsheetApp.getUi().alert('로그인 잠금을 풀었어요.');
}

function menuAnonymizeNow() {
  const ui = SpreadsheetApp.getUi();
  if (!CONFIG.ANONYMIZE_AFTER_DAYS) { ui.alert('Code.gs 의 ANONYMIZE_AFTER_DAYS 가 0 이라 꺼져 있어요.'); return; }
  const ok = ui.alert('개인정보 파기', '주문일이 ' + CONFIG.ANONYMIZE_AFTER_DAYS + '일 넘게 지난 행의 이름·전화·주소를 "김*수 / 010-****-1234" 처럼 영구히 바꿉니다.\n되돌릴 수 없어요(시트 "버전 기록" 으로만 복구). 계속할까요?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  const n = anonymizeOld();
  ui.alert(n + '칸을 파기했어요.');
}

/** 매일 실행: 오래된 주문의 개인정보 열을 가린 값으로 덮어씀 */
function anonymizeOld() {
  if (!CONFIG.ANONYMIZE_AFTER_DAYS) return 0;
  const cutoff = Date.now() - CONFIG.ANONYMIZE_AFTER_DAYS * 86400000;
  let count = 0;
  allowedSheets_().forEach(name => {
    const sh = ss_().getSheetByName(name);
    const cols = columns_(sh);
    const dateCol = cols.find(c => c.date && !c.pii);
    const piiCols = cols.filter(c => c.pii);
    const first = CONFIG.HEADER_ROW + 1, last = sh.getLastRow();
    if (!dateCol || !piiCols.length || last < first) return;
    const n = last - first + 1;
    const dates = sh.getRange(first, dateCol.i + 1, n, 1).getValues();
    piiCols.forEach(c => {
      const rng = sh.getRange(first, c.i + 1, n, 1);
      const vals = rng.getDisplayValues();
      const forms = rng.getFormulas();
      let changed = false;
      for (let r = 0; r < n; r++) {
        const d = dates[r][0] instanceof Date ? dates[r][0] : new Date(dates[r][0]);
        if (isNaN(d) || d.getTime() > cutoff || !vals[r][0] || forms[r][0]) continue;
        const m = mask_(vals[r][0], c.pii);
        if (m !== vals[r][0]) { vals[r][0] = m; changed = true; count++; }
      }
      if (changed) rng.setValues(vals);
    });
  });
  if (count) log_('자동', '개인정보 파기', count + '칸');
  return count;
}

function menuAutoOn() {
  menuAutoOff(true);
  ScriptApp.newTrigger('anonymizeOld').timeBased().everyDays(1).atHour(4).create();
  SpreadsheetApp.getUi().alert('매일 새벽 4시쯤 ' + CONFIG.ANONYMIZE_AFTER_DAYS + '일 지난 주문의 개인정보를 파기합니다.');
}
function menuAutoOff(silent) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'anonymizeOld').forEach(t => ScriptApp.deleteTrigger(t));
  if (silent !== true) SpreadsheetApp.getUi().alert('자동 파기를 껐어요.');
}
