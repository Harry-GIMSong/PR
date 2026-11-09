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
    other:   ['우편번호', '개인통관', '통관부호', '주민', '계좌', '이메일', 'email', '메일'],
  },
  // 이름 열로 잘못 인식되지 않게 할 단어 (예: "상품이름")
  NAME_EXCLUDE: ['상품', '품목', '제품', '옵션', '택배', '택배사'],

  // 개인정보 열(위 PII_KEYWORDS)과 함께 암호화해서 저장할 열.
  // 암호화는 시트 메뉴 "🔒 개인정보 암호화 켜기" 로 켭니다.
  ENC_EXTRA_KEYWORDS: ['배송메모'],

  // 이 단어가 머리글에 있으면 웹앱에서 고치지 못하게 함
  READONLY_KEYWORDS: ['순번', '주문번호'],

  // 관리자(나)에게만 보이는 열. 부모님 화면에서는 아예 안 보이고 서버에서도 안 보냄.
  // 예: 수익·수수료를 부모님께 안 보이게 하려면 ['수익금', '순수익']
  ADMIN_ONLY_KEYWORDS: [],

  // 주문 카드 맨 위 제목으로 쓸 열
  TITLE_KEYWORDS: ['주문일', '구분', '용량'],
  // 카드에서 "자세히 ▾" 안에 접어 둘 열 (자주 안 보는 것)
  DETAIL_KEYWORDS: ['순번', '주문번호', '구매자명', '우편번호', '수익금', '인삼대금', '순수익'],

  // 발송 처리 버튼이 채울 열. 송장번호나 발송일이 들어 있으면 "발송 완료" 로 봄
  SHIP: { courier: ['택배사'], invoice: ['송장번호'], date: ['발송일'] },
  // 정산 열과, 정산이 끝났다고 볼 값 (체크박스 열이면 체크 = 완료)
  SETTLE_KEYWORDS: ['정산'],
  SETTLED_VALUES: ['완료', '정산완료', '정산', 'o', 'y', 'v', '✔', '✓', 'true', '예', 'ㅇ', '입금완료'],
  SETTLE_MARK: 'O',        // "정산 완료" 버튼을 누르면 넣을 글자 (체크박스 열이 아닐 때)
  // 월별 합계를 낼 금액 열
  SUM_KEYWORDS: ['수익금', '인삼대금', '순수익', '금액', '대금', '매출'],
  // 월별 합계를 묶을 날짜 열 (첫 번째로 찾은 열)
  MONTH_KEYWORDS: ['주문일'],
  // 월별 합계에서 건수를 나눠 볼 열 (예: 구분별 몇 건)
  GROUP_KEYWORDS: ['구분'],
  // 새 주문을 넣을 때 자동으로 다음 번호를 매길 열
  SERIAL_KEYWORDS: ['순번'],

  DATE_KEYWORDS: ['주문일', '결제일', '날짜', '일자', '발송일', '주문 날짜', 'date'],

  SESSION_HOURS: 12,       // "이 기기 기억" 안 할 때 로그인 유지 시간
  REMEMBER_DAYS: 30,       // "이 기기 기억" 할 때 로그인 유지 일수

  // 새 기기 승인제: 처음 보는 휴대폰은 PIN 이 맞아도 관리자가 승인해야 들어옴
  DEVICE_APPROVAL: true,
  DEVICE_PENDING_HOURS: 24, // 승인 대기 요청이 이 시간 지나면 버림

  // 날짜 열에 "11/5" 처럼 넣으면 진짜 날짜로 바꿔서 이 형식으로 보이게 함.
  // 비워 두면 그 열에 이미 있는 날짜들의 형식을 그대로 따름(없으면 yyyy-mm-dd).
  DATE_FORMAT: '',
  DATE_FALLBACK_FORMAT: 'yyyy-mm-dd',
  MAX_FAILS: 5,            // PIN 이 이만큼 연속으로 틀리면
  LOCK_MINUTES: 15,        // 이 시간 동안 로그인 잠금

  LOG_SHEET: '_접속기록',
  LOG_KEEP_ROWS: 5000,

  // ── 개인정보 비식별 처리 ──
  // 정산여부가 O(정산 완료)이고, 발송일(없으면 주문일)로부터 이 일수가 지난 주문의
  // 성명·휴대폰·주소·우편번호를 시트에서 비식별 처리합니다. 0 이면 끔.
  // 메뉴 "🔐 주문관리 → 비식별 자동 처리 켜기" 를 해야 매일 새벽에 실행됩니다.
  ANON_AFTER_DAYS: 90,
  ANON_REQUIRE_SETTLED: true,          // true = 정산 완료된 주문만
  ANON_BASE_KEYWORDS: ['발송일', '주문일'], // 기간을 셀 날짜 열 (앞의 것이 비어 있으면 다음 것)
  ANON_CLEAR_KEYWORDS: ['배송메모'],   // 내용을 통째로 지울 열 (위치·연락처가 섞여 있을 수 있어서)
  ANON_SHEET: '_비식별기록',            // 처리 기록 + 일방향 암호화한 고객키 (숨김 시트)
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

/** 웹앱: PIN 으로 로그인. 성공하면 토큰, 새 기기면 승인 대기 티켓을 돌려줌. */
function login(pin, remember, deviceId, deviceLabel) {
  pin = String(pin || '').trim();
  deviceId = String(deviceId || '').slice(0, 80);
  deviceLabel = String(deviceLabel || '알 수 없는 기기').slice(0, 80);
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
        log_('-', '로그인 잠김', CONFIG.MAX_FAILS + '회 연속 실패 · ' + deviceLabel);
        notify_('lock', 'PIN 이 ' + CONFIG.MAX_FAILS + '회 연속 틀려서 로그인이 ' + CONFIG.LOCK_MINUTES + '분 잠겼습니다.\n기기: ' + deviceLabel);
      }
      props().setProperty('FAILS', JSON.stringify(fails));
      log_('-', '로그인 실패', deviceLabel);
      const left = CONFIG.MAX_FAILS - fails.n;
      throw new Error('PIN: PIN 이 맞지 않아요.' + (fails.until > now ? ' ' + CONFIG.LOCK_MINUTES + '분 동안 잠겼어요.' : ' (남은 기회 ' + left + '번)'));
    }
    props().setProperty('FAILS', '{"n":0,"until":0}');
    checkHours_(user);
    cleanTokens_();

    // 새 기기 승인제
    let dkey = '';
    if (CONFIG.DEVICE_APPROVAL) {
      if (!/^[a-zA-Z0-9]{16,80}$/.test(deviceId)) throw new Error('이 브라우저에서는 기기 확인이 안 돼요. 다른 브라우저(크롬·사파리)로 열어 주세요.');
      dkey = deviceKey_(user.id, deviceId);
      const devices = getDevices_();
      const dev = devices[dkey];
      if (dev && dev.status === 'blocked') {
        log_(user.name, '차단된 기기 접속 시도', deviceLabel);
        throw new Error('BLOCKED: 이 휴대폰은 접속이 막혀 있어요. 관리자에게 문의해 주세요.');
      }
      if (!dev || dev.status !== 'approved') {
        const ticket = randomToken_();
        devices[dkey] = { u: user.id, name: user.name, label: deviceLabel, status: 'pending', at: now, ticket: sha_(ticket), remember: !!remember };
        saveDevices_(devices);
        if (!dev) {
          log_(user.name, '새 기기 승인 요청', deviceLabel);
          notify_('device', user.name + ' 님이 새 기기에서 로그인을 시도했어요. 승인해야 들어올 수 있습니다.\n\n기기: ' + deviceLabel +
            '\n\n승인: 웹앱(관리자) → ⚙️ 설정 → 기기 관리, 또는 시트 메뉴 🔐 주문관리 → 기기 승인·관리\n모르는 기기면 "차단" 하고 그 분의 PIN 을 바꾸세요.');
        }
        return { pending: true, ticket: ticket, name: user.name };
      }
      dev.last = now; dev.label = deviceLabel;
      saveDevices_(devices);
    }
    return issueToken_(user, remember, dkey, deviceLabel);
  } finally {
    lock.releaseLock();
  }
}

function issueToken_(user, remember, dkey, label) {
  const token = randomToken_();
  const exp = Date.now() + (remember ? CONFIG.REMEMBER_DAYS * 86400000 : CONFIG.SESSION_HOURS * 3600000);
  props().setProperty('T_' + sha_(token), JSON.stringify({ u: user.id, exp: exp, d: dkey }));
  log_(user.name, '로그인', (remember ? '기기 기억 ' + CONFIG.REMEMBER_DAYS + '일' : CONFIG.SESSION_HOURS + '시간') + ' · ' + (label || ''));
  return { token: token, name: user.name, role: user.role, roleName: ROLES[user.role], exp: exp };
}

/** 웹앱: 승인 대기 중인 기기가 승인됐는지 확인. 승인됐으면 토큰을 돌려줌 */
function checkDevice(ticket, deviceId) {
  if (!ticket || !deviceId) throw new Error('AUTH: PIN 을 다시 넣어 주세요.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const devices = getDevices_();
    const th = sha_(String(ticket));
    const dkey = Object.keys(devices).find(k => devices[k].ticket === th);
    if (!dkey) throw new Error('AUTH: 승인 요청이 끝났어요. PIN 을 다시 넣어 주세요.');
    const dev = devices[dkey];
    if (dkey !== deviceKey_(dev.u, String(deviceId))) throw new Error('AUTH: PIN 을 다시 넣어 주세요.');
    if (dev.status === 'blocked') { delete dev.ticket; saveDevices_(devices); throw new Error('BLOCKED: 이 휴대폰은 승인되지 않았어요.'); }
    if (dev.status !== 'approved') {
      if (Date.now() - dev.at > CONFIG.DEVICE_PENDING_HOURS * 3600000) throw new Error('AUTH: 승인 요청 시간이 지났어요. PIN 을 다시 넣어 주세요.');
      return { pending: true };
    }
    const user = getUsers_().find(u => u.id === dev.u);
    if (!user) throw new Error('AUTH: PIN 을 다시 넣어 주세요.');
    checkHours_(user);
    const remember = dev.remember;
    delete dev.ticket; delete dev.remember; dev.last = Date.now();
    saveDevices_(devices);
    return issueToken_(user, remember, dkey, dev.label);
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
  if (CONFIG.DEVICE_APPROVAL) {
    const dev = t.d && getDevices_()[t.d];
    if (!dev || dev.status !== 'approved') {
      props().deleteProperty('T_' + sha_(String(token)));
      throw new Error('AUTH: 이 휴대폰의 승인이 취소됐어요.');
    }
  }
  checkHours_(user);
  if (needEdit && user.role === 'viewer') throw new Error('보기만 가능한 사용자예요.');
  return user;
}

/* ------------------------------------------------------------------ */
/* 기기 승인 · 접속 시간 · 알림 설정                                    */
/* ------------------------------------------------------------------ */

function deviceKey_(userId, deviceId) { return sha_(userId + ':' + deviceId).slice(0, 24); }
function getDevices_() {
  const d = JSON.parse(props().getProperty('DEVICES') || '{}');
  const now = Date.now();
  Object.keys(d).forEach(k => { // 오래된 승인 대기 요청 정리
    if (d[k].status === 'pending' && now - d[k].at > CONFIG.DEVICE_PENDING_HOURS * 3600000) delete d[k];
  });
  return d;
}
function saveDevices_(d) { props().setProperty('DEVICES', JSON.stringify(d)); }

const DEFAULT_SETTINGS = {
  hours: { on: false, start: '07:00', end: '22:00', days: [0, 1, 2, 3, 4, 5, 6], admin: false },
  notify: { email: '', device: true, lock: true, revealNow: false, daily: true, dailyHour: 21 },
};
function getSettings_() {
  const s = JSON.parse(props().getProperty('SETTINGS') || '{}');
  return {
    hours: Object.assign({}, DEFAULT_SETTINGS.hours, s.hours || {}),
    notify: Object.assign({}, DEFAULT_SETTINGS.notify, s.notify || {}),
  };
}

function hhmm_(s) { const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }

/** 접속 가능 시간이 아니면 막음 (관리자는 설정에 따라 예외) */
function checkHours_(user) {
  const h = getSettings_().hours;
  if (!h.on) return;
  if (user.role === 'admin' && !h.admin) return;
  const tz = ss_().getSpreadsheetTimeZone();
  const now = new Date();
  const day = Number(Utilities.formatDate(now, tz, 'u')) % 7; // 0=일 … 6=토
  const min = Number(Utilities.formatDate(now, tz, 'H')) * 60 + Number(Utilities.formatDate(now, tz, 'm'));
  const st = hhmm_(h.start), en = hhmm_(h.end);
  let ok = h.days.indexOf(day) >= 0;
  if (ok && st != null && en != null && st !== en) ok = st < en ? (min >= st && min < en) : (min >= st || min < en);
  if (!ok) {
    const names = ['일', '월', '화', '수', '목', '금', '토'];
    const days = h.days.length === 7 ? '매일' : h.days.slice().sort().map(d => names[d]).join('·');
    throw new Error('HOURS: 지금은 접속할 수 없는 시간이에요. (접속 가능: ' + days + ' ' + h.start + '~' + h.end + ')');
  }
}

function requireAdmin_(token) {
  const user = auth_(token);
  if (user.role !== 'admin') throw new Error('관리자만 할 수 있어요.');
  return user;
}

/** 웹앱(관리자): 설정 + 기기 목록 */
function getAdmin(token) {
  requireAdmin_(token);
  const devices = getDevices_();
  const list = Object.keys(devices).map(k => {
    const d = devices[k];
    return { key: k, name: d.name, label: d.label, status: d.status, at: d.at, last: d.last || 0 };
  }).sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || (b.last || b.at) - (a.last || a.at));
  const st = getSettings_();
  return {
    settings: st,
    ownerEmail: Session.getEffectiveUser().getEmail(),
    devices: list,
    deviceApproval: CONFIG.DEVICE_APPROVAL,
    url: ScriptApp.getService().getUrl(),
    tz: ss_().getSpreadsheetTimeZone(),
  };
}

/** 웹앱(관리자): 기기 승인 / 차단 / 삭제 */
function setDevice(token, key, action) {
  const admin = requireAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const devices = getDevices_();
    const d = devices[key];
    if (!d) throw new Error('이미 없는 기기예요.');
    if (action === 'approve') d.status = 'approved';
    else if (action === 'block') { d.status = 'blocked'; revokeDeviceTokens_(key); }
    else if (action === 'delete') { delete devices[key]; revokeDeviceTokens_(key); }
    else throw new Error('잘못된 요청이에요.');
    saveDevices_(devices);
    log_(admin.name, { approve: '기기 승인', block: '기기 차단', delete: '기기 삭제' }[action], d.name + ' · ' + d.label);
    return getAdmin(token);
  } finally {
    lock.releaseLock();
  }
}
function revokeDeviceTokens_(dkey) {
  const all = props().getProperties();
  Object.keys(all).forEach(k => {
    if (k.indexOf('T_') === 0) { try { if (JSON.parse(all[k]).d === dkey) props().deleteProperty(k); } catch (e) { /* 무시 */ } }
  });
}

/** 웹앱(관리자): 접속 시간 · 알림 설정 저장 */
function saveSettings(token, s) {
  const admin = requireAdmin_(token);
  const h = s && s.hours || {}, n = s && s.notify || {};
  const clean = {
    hours: {
      on: !!h.on,
      start: hhmm_(h.start) != null ? h.start : '07:00',
      end: hhmm_(h.end) != null ? h.end : '22:00',
      days: (Array.isArray(h.days) ? h.days : []).map(Number).filter(d => d >= 0 && d <= 6),
      admin: !!h.admin,
    },
    notify: {
      email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(n.email || '').trim()) ? String(n.email).trim() : '',
      device: !!n.device, lock: !!n.lock, revealNow: !!n.revealNow, daily: !!n.daily,
      dailyHour: Math.min(23, Math.max(0, Number(n.dailyHour) || 21)),
    },
  };
  if (clean.hours.on && !clean.hours.days.length) throw new Error('접속 가능한 요일을 하나 이상 골라 주세요.');
  props().setProperty('SETTINGS', JSON.stringify(clean));
  setupDailyTrigger_(clean.notify);
  log_(admin.name, '설정 변경', '접속시간 ' + (clean.hours.on ? clean.hours.start + '~' + clean.hours.end : '제한 없음') + ' · 하루요약 ' + (clean.notify.daily ? clean.notify.dailyHour + '시' : '끔'));
  return getAdmin(token);
}

function setupDailyTrigger_(n) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyReport').forEach(t => ScriptApp.deleteTrigger(t));
  if (n.daily) ScriptApp.newTrigger('dailyReport').timeBased().everyDays(1).atHour(n.dailyHour).create();
}

/** 알림 메일. kind: device | lock | reveal */
function notify_(kind, msg) {
  try {
    const n = getSettings_().notify;
    if ((kind === 'device' && !n.device) || (kind === 'lock' && !n.lock) || (kind === 'reveal' && !n.revealNow)) return;
    const to = n.email || Session.getEffectiveUser().getEmail();
    const title = { device: '새 기기 승인 요청', lock: '로그인 잠김', reveal: '개인정보 보기' }[kind] || '알림';
    if (to) MailApp.sendEmail(to, '[' + CONFIG.APP_TITLE + '] ' + title, msg + '\n\n시트: ' + ss_().getUrl());
  } catch (e) { /* 메일 실패는 무시 */ }
}
function notifyOwner_(msg) { notify_('lock', msg); }

/** 매일: 지난 24시간 접속 요약 메일 */
function dailyReport() {
  const n = getSettings_().notify;
  if (!n.daily) return;
  const sh = ss_().getSheetByName(CONFIG.LOG_SHEET);
  if (!sh || sh.getLastRow() < 2) return;
  const since = Date.now() - 86400000;
  const start = Math.max(2, sh.getLastRow() - 1500);
  const rows = sh.getRange(start, 1, sh.getLastRow() - start + 1, 4).getValues()
    .filter(r => r[0] instanceof Date && r[0].getTime() >= since);
  if (!rows.length) return;
  const count = {};
  rows.forEach(r => { const k = r[2]; count[k] = (count[k] || 0) + 1; });
  const tz = ss_().getSpreadsheetTimeZone();
  const important = rows.filter(r => /실패|잠김|새 기기|차단|비식별|기기|설정|사용자/.test(r[2]));
  const reveals = rows.filter(r => r[2] === '개인정보 보기');
  const byWho = {};
  reveals.forEach(r => { byWho[r[1]] = (byWho[r[1]] || 0) + 1; });
  let body = '지난 24시간 접속 요약\n\n' + Object.keys(count).map(k => '· ' + k + ': ' + count[k] + '건').join('\n');
  if (reveals.length) body += '\n\n개인정보 보기: ' + Object.keys(byWho).map(k => k + ' ' + byWho[k] + '건').join(', ');
  if (important.length) body += '\n\n눈여겨볼 기록\n' + important.slice(-30).map(r => Utilities.formatDate(r[0], tz, 'MM-dd HH:mm') + ' ' + r[1] + ' ' + r[2] + ' ' + r[3]).join('\n');
  const to = n.email || Session.getEffectiveUser().getEmail();
  if (to) MailApp.sendEmail(to, '[' + CONFIG.APP_TITLE + '] 하루 접속 요약 (' + rows.length + '건)', body + '\n\n시트: ' + ss_().getUrl());
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
    .filter(s => s.getName() !== CONFIG.LOG_SHEET && s.getName() !== CONFIG.ANON_SHEET && !s.isSheetHidden())
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
      adminOnly: CONFIG.ADMIN_ONLY_KEYWORDS.length > 0 && has_(h, CONFIG.ADMIN_ONLY_KEYWORDS),
      title: has_(h, CONFIG.TITLE_KEYWORDS),
      detail: has_(h, CONFIG.DETAIL_KEYWORDS),
      ship: has_(h, CONFIG.SHIP.invoice) ? 'invoice' : has_(h, CONFIG.SHIP.courier) ? 'courier' : has_(h, CONFIG.SHIP.date) ? 'date' : '',
      settle: has_(h, CONFIG.SETTLE_KEYWORDS),
      serial: has_(h, CONFIG.SERIAL_KEYWORDS),
      enc: !!piiType_(h) || has_(h, CONFIG.ENC_EXTRA_KEYWORDS),
    };
  });
}

const PHONE_RE = /(01[016789]|0\d{1,2})[-\s.]?(\d{3,4})[-\s.]?(\d{4})/g;

function mask_(value, type) {
  const v = String(value);
  if (!v) return v;
  if (type && v.indexOf('*') >= 0) return v; // 이미 가려진(파기된) 값
  if (/^\((손상된 암호문|열쇠 없음)\)$/.test(v)) return v; // 복호화 실패 안내는 그대로
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
  const hide = cols.map(c => c.adminOnly && user.role !== 'admin');
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
        if (hide[c]) { v.push(''); continue; }
        if (col.check) { v.push(raw[r][c] === true); continue; }
        const d = col.enc ? decrypt_(disp[r][c]) : disp[r][c];
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
    cols: cols.filter((c, i) => !hide[i]),
    rows: rows,
    couriers: recentValues_(cols, rows, 'courier'),
    settleMark: CONFIG.SETTLE_MARK,
    settledValues: CONFIG.SETTLED_VALUES,
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
  if (user.role !== 'admin' && CONFIG.ADMIN_ONLY_KEYWORDS.length && has_(header, CONFIG.ADMIN_ONLY_KEYWORDS)) throw new Error('볼 수 없는 칸이에요.');
  const value = decrypt_(sh.getRange(row, colIdx + 1).getDisplayValue());
  log_(user.name, '개인정보 보기', sheetName + ' ' + row + '행 [' + header + ']');
  if (user.role !== 'admin') notify_('reveal', user.name + ' 님이 개인정보를 봤어요: ' + sheetName + ' ' + row + '행 [' + header + ']');
  return value;
}

/* ------------------------------------------------------------------ */
/* 개인정보 암호화 저장 (AES-256-CTR + HMAC-SHA256, encrypt-then-MAC)   */
/*  시트에는 "ENC1:…" 암호문만 저장되고, 웹앱·관리자 메뉴에서만 풀림.     */
/*  열쇠는 스크립트 속성(시트 주인만 접근)에만 있고 시트를 복사해도 안 따라감. */
/* ------------------------------------------------------------------ */

const ENC_PREFIX = 'ENC1:';

function u8_(signed) { return Uint8Array.from(signed, b => b & 255); }
function s8_(u8) { return Array.from(u8, b => (b > 127 ? b - 256 : b)); }

function utf8Enc_(str) {
  const out = [];
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}
function utf8Dec_(b) {
  let s = '', i = 0;
  while (i < b.length) {
    const c = b[i++];
    let cp;
    if (c < 0x80) cp = c;
    else if (c < 0xe0) cp = ((c & 31) << 6) | (b[i++] & 63);
    else if (c < 0xf0) cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    s += String.fromCodePoint(cp);
  }
  return s;
}

/** AES-256 블록 암호 (암호화 방향만: CTR 모드는 암호화·복호화 모두 이것만 씀) */
const AES_ = (function () {
  const S = new Uint8Array(256);
  const rotl = (x, n) => ((x << n) | (x >> (8 - n))) & 255;
  let p = 1, q = 1;
  do {
    p = (p ^ ((p << 1) & 255) ^ (p & 0x80 ? 0x1b : 0)) & 255;
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 255;
    if (q & 0x80) q ^= 0x09;
    S[p] = (q ^ rotl(q, 1) ^ rotl(q, 2) ^ rotl(q, 3) ^ rotl(q, 4) ^ 0x63) & 255;
  } while (p !== 1);
  S[0] = 0x63;
  const xt = a => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 255;

  function expand(key) { // 32바이트 열쇠 → 15개 라운드 키(240바이트)
    const w = new Uint8Array(240);
    w.set(key);
    let rcon = 1;
    for (let i = 32; i < 240; i += 4) {
      let t0 = w[i - 4], t1 = w[i - 3], t2 = w[i - 2], t3 = w[i - 1];
      if (i % 32 === 0) {
        const tmp = t0;
        t0 = S[t1] ^ rcon; t1 = S[t2]; t2 = S[t3]; t3 = S[tmp];
        rcon = xt(rcon);
      } else if (i % 32 === 16) {
        t0 = S[t0]; t1 = S[t1]; t2 = S[t2]; t3 = S[t3];
      }
      w[i] = w[i - 32] ^ t0; w[i + 1] = w[i - 31] ^ t1; w[i + 2] = w[i - 30] ^ t2; w[i + 3] = w[i - 29] ^ t3;
    }
    return w;
  }

  function encryptBlock(w, input) {
    const s = new Uint8Array(16);
    for (let i = 0; i < 16; i++) s[i] = input[i] ^ w[i];
    const t = new Uint8Array(16);
    for (let round = 1; round <= 14; round++) {
      // SubBytes + ShiftRows
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) t[c * 4 + r] = S[s[((c + r) % 4) * 4 + r]];
      if (round < 14) { // MixColumns
        for (let c = 0; c < 4; c++) {
          const a0 = t[c * 4], a1 = t[c * 4 + 1], a2 = t[c * 4 + 2], a3 = t[c * 4 + 3];
          const all = a0 ^ a1 ^ a2 ^ a3;
          s[c * 4] = a0 ^ all ^ xt(a0 ^ a1);
          s[c * 4 + 1] = a1 ^ all ^ xt(a1 ^ a2);
          s[c * 4 + 2] = a2 ^ all ^ xt(a2 ^ a3);
          s[c * 4 + 3] = a3 ^ all ^ xt(a3 ^ a0);
        }
      } else s.set(t);
      for (let i = 0; i < 16; i++) s[i] ^= w[round * 16 + i];
    }
    return s;
  }

  function ctr(w, iv, data) {
    const out = new Uint8Array(data.length);
    const counter = Uint8Array.from(iv);
    for (let off = 0; off < data.length; off += 16) {
      const ks = encryptBlock(w, counter);
      for (let i = 0; i < 16 && off + i < data.length; i++) out[off + i] = data[off + i] ^ ks[i];
      for (let i = 15; i >= 0; i--) { counter[i] = (counter[i] + 1) & 255; if (counter[i]) break; }
    }
    return out;
  }
  return { expand: expand, encryptBlock: encryptBlock, ctr: ctr };
})();

let ENC_KEYS_ = null;
/** 마스터 열쇠(32바이트)를 스크립트 속성에서 꺼냄. 없으면 create=true 일 때만 새로 만듦 */
function encKeys_(create) {
  if (ENC_KEYS_) return ENC_KEYS_;
  let k = props().getProperty('ENC_KEY');
  if (!k) {
    if (!create) return null;
    const seed = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random();
    k = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed));
    props().setProperty('ENC_KEY', k);
  }
  const master = Utilities.base64Decode(k);
  const sub = label => u8_(Utilities.computeHmacSha256Signature(s8_(utf8Enc_(label)), master));
  ENC_KEYS_ = { aes: AES_.expand(sub('aes-256-ctr')), mac: s8_(sub('hmac-sha256')) };
  return ENC_KEYS_;
}
function encOn_() { return props().getProperty('ENC_ON') === '1'; }

function randomIv_() {
  const seed = Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random();
  return u8_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed)).slice(0, 16);
}
function macOf_(keys, iv, ct) {
  const msg = new Uint8Array(ENC_PREFIX.length + iv.length + ct.length);
  msg.set(utf8Enc_(ENC_PREFIX)); msg.set(iv, ENC_PREFIX.length); msg.set(ct, ENC_PREFIX.length + iv.length);
  return u8_(Utilities.computeHmacSha256Signature(s8_(msg), keys.mac)).slice(0, 16);
}

function isEnc_(v) { return typeof v === 'string' && v.indexOf(ENC_PREFIX) === 0; }

/** 글자 → "ENC1:…" (빈칸·이미 암호문·비식별 처리된 값은 그대로) */
function encrypt_(plain) {
  const v = String(plain == null ? '' : plain);
  if (!v || isEnc_(v) || /\(비식별\)|\*/.test(v)) return v;
  const keys = encKeys_(true);
  const iv = randomIv_();
  const ct = AES_.ctr(keys.aes, iv, utf8Enc_(v));
  const tag = macOf_(keys, iv, ct);
  const all = new Uint8Array(32 + ct.length);
  all.set(iv); all.set(ct, 16); all.set(tag, 16 + ct.length);
  return ENC_PREFIX + Utilities.base64EncodeWebSafe(s8_(all)).replace(/=+$/, '');
}

/** "ENC1:…" → 원래 글자. 암호문이 아니면 그대로. 위조·손상이면 표시용 문구 */
function decrypt_(v) {
  if (!isEnc_(v)) return v;
  const keys = encKeys_(false);
  if (!keys) return '(열쇠 없음)';
  try {
    let b64 = v.slice(ENC_PREFIX.length);
    while (b64.length % 4) b64 += '=';
    const all = u8_(Utilities.base64DecodeWebSafe(b64));
    if (all.length < 33) return '(손상된 암호문)';
    const iv = all.slice(0, 16), ct = all.slice(16, all.length - 16), tag = all.slice(all.length - 16);
    const want = macOf_(keys, iv, ct);
    let diff = 0;
    for (let i = 0; i < 16; i++) diff |= want[i] ^ tag[i];
    if (diff) return '(손상된 암호문)';
    return utf8Dec_(AES_.ctr(keys.aes, iv, ct));
  } catch (e) {
    return '(손상된 암호문)';
  }
}

/** 전화번호가 숫자로 바뀌며 앞자리 0 이 빠진 경우 되살림 (예: 1012345678 → 01012345678) */
function fixPhone_(v, col) {
  if (col && col.pii === 'phone' && /^1\d{8,9}$/.test(String(v))) return '0' + v;
  return v;
}

/** r0~r1 행의 암호화 대상 칸 중 아직 평문인 것을 암호화. 바꾼 칸 수 */
function encryptRange_(sh, col, r0, r1) {
  const rng = sh.getRange(r0, col.i + 1, r1 - r0 + 1, 1);
  const disp = rng.getDisplayValues(), forms = rng.getFormulas();
  const hit = [];
  const out = disp.map((r, i) => {
    const v = String(r[0]);
    if (forms[i][0] || !v.trim() || isEnc_(v)) return [v];
    const e = encrypt_(fixPhone_(v.trim(), col));
    if (e !== v) hit.push(i);
    return [e];
  });
  if (!hit.length) return 0;
  if (forms.some(f => f[0]) || hit.length <= 3) {
    hit.forEach(i => sh.getRange(r0 + i, col.i + 1).setNumberFormat('@').setValue(out[i][0]));
  } else {
    rng.setNumberFormat('@'); // 암호문이 숫자·날짜로 바뀌지 않게
    rng.setValues(out);
  }
  return hit.length;
}

/** 모든 시트의 암호화 대상 열 전체를 (평문만) 암호화. 매시간 자동 점검에도 씀 */
function encryptPending() {
  if (!encOn_()) return 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    let n = 0;
    allowedSheets_().forEach(name => {
      const sh = ss_().getSheetByName(name);
      const last = sh.getLastRow();
      if (last <= CONFIG.HEADER_ROW) return;
      columns_(sh).filter(c => c.enc).forEach(c => { n += encryptRange_(sh, c, CONFIG.HEADER_ROW + 1, last); });
    });
    if (n) log_('자동', '개인정보 암호화', n + '칸');
    return n;
  } finally {
    lock.releaseLock();
  }
}

function menuEncryptOn() {
  const ui = SpreadsheetApp.getUi();
  const first = !props().getProperty('ENC_KEY');
  const ok = ui.alert('🔒 개인정보 암호화 켜기',
    '성명·연락처·주소·우편번호·배송메모 열을 AES-256 으로 암호화해서 "ENC1:…" 로 저장합니다.\n\n' +
    ' · 시트에서는 이 열들이 암호문으로 보이고, 웹앱(PIN)과 이 메뉴의 "선택한 행 개인정보 보기" 에서만 풀려요.\n' +
    ' · 앞으로 시트에 붙여 넣는 값도 바로 암호화되고, 매시간 한 번 더 점검해요.\n' +
    ' · 열쇠는 이 스크립트에만 있어요. 시트를 복사·내려받아도 개인정보는 못 읽어요.\n' +
    (first ? '\n⚠️ 열쇠를 새로 만듭니다. 켠 뒤 "암호화 열쇠 백업" 으로 열쇠를 꼭 따로 보관하세요.\n' : '') +
    '\n지금 켜고 전체를 암호화할까요?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  encKeys_(true);
  props().setProperty('ENC_ON', '1');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'encryptPending').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('encryptPending').timeBased().everyHours(1).create();
  const n = encryptPending();
  log_('시트 주인', '암호화 켜기', n + '칸 암호화');
  ui.alert(n + '칸을 암호화했어요.' + (first ? '\n\n이제 메뉴 "암호화 열쇠 백업" 으로 열쇠를 비밀번호 관리 앱 등에 보관해 주세요.' : ''));
}

function menuEncryptOff() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert('암호화 끄기', '암호화를 끄고, 시트의 암호문을 모두 원래 글자로 되돌립니다. 계속할까요?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  props().setProperty('ENC_ON', '0');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'encryptPending').forEach(t => ScriptApp.deleteTrigger(t));
  let n = 0;
  allowedSheets_().forEach(name => {
    const sh = ss_().getSheetByName(name);
    const last = sh.getLastRow();
    if (last <= CONFIG.HEADER_ROW) return;
    columns_(sh).filter(c => c.enc).forEach(c => {
      const rng = sh.getRange(CONFIG.HEADER_ROW + 1, c.i + 1, last - CONFIG.HEADER_ROW, 1);
      const vals = rng.getDisplayValues();
      let ch = false;
      const out = vals.map(r => { if (isEnc_(r[0])) { ch = true; n++; return [decrypt_(r[0])]; } return [r[0]]; });
      if (ch) { rng.setNumberFormat('@'); rng.setValues(out); }
    });
  });
  log_('시트 주인', '암호화 끄기', n + '칸 복호화');
  ui.alert(n + '칸을 원래 글자로 되돌렸어요. (열쇠는 지우지 않았어요)');
}

/** 시트에서 고른 행의 개인정보를 풀어서 보여 줌 (시트 주인만, 기록 남음) */
function menuShowSelected() {
  const ui = SpreadsheetApp.getUi();
  const sh = ss_().getActiveSheet();
  if (allowedSheets_().indexOf(sh.getName()) < 0) { ui.alert('주문 시트에서 행을 골라 주세요.'); return; }
  const sel = sh.getActiveRange();
  const r0 = Math.max(sel.getRow(), CONFIG.HEADER_ROW + 1), r1 = Math.min(sel.getLastRow(), r0 + 29);
  if (r1 < r0) { ui.alert('볼 행(머리글 아래)을 골라 주세요.'); return; }
  const cols = columns_(sh);
  const vals = sh.getRange(r0, 1, r1 - r0 + 1, cols.length).getDisplayValues();
  const esc = x => String(x).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const title = cols.filter(c => c.title || has_(c.name, ['주문번호']));
  let html = '<style>body{font-family:sans-serif;font-size:14px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}th{background:#f3f5f2;white-space:nowrap}</style><table><tr><th>행</th>' +
    title.map(c => '<th>' + esc(c.name) + '</th>').join('') + cols.filter(c => c.enc).map(c => '<th>' + esc(c.name) + '</th>').join('') + '</tr>';
  vals.forEach((r, i) => {
    html += '<tr><td>' + (r0 + i) + '</td>' + title.map(c => '<td>' + esc(r[c.i]) + '</td>').join('') +
      cols.filter(c => c.enc).map(c => '<td>' + esc(decrypt_(r[c.i])) + '</td>').join('') + '</tr>';
  });
  html += '</table>';
  log_('시트 주인', '개인정보 보기(시트)', sh.getName() + ' ' + r0 + '~' + r1 + '행');
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(900).setHeight(500), '개인정보 보기 (' + r0 + '~' + r1 + '행)');
}

function menuKeyBackup() {
  const ui = SpreadsheetApp.getUi();
  const k = props().getProperty('ENC_KEY');
  if (!k) { ui.alert('아직 열쇠가 없어요. "개인정보 암호화 켜기" 를 먼저 하세요.'); return; }
  const ok = ui.alert('암호화 열쇠 백업', '열쇠를 화면에 보여 줍니다. 이 열쇠가 있으면 누구든 암호문을 풀 수 있어요.\n주변에 사람이 없는지 확인하고, 비밀번호 관리 앱이나 종이에만 적어 두세요(카톡·메일·사진 금지).\n\n보여 줄까요?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  log_('시트 주인', '암호화 열쇠 백업 보기', '');
  ui.alert('암호화 열쇠', k + '\n\n(스크립트를 지우거나 새로 만들었을 때 "암호화 열쇠 복원" 에 넣으면 됩니다)', ui.ButtonSet.OK);
}

function menuKeyRestore() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('암호화 열쇠 복원', '백업해 둔 열쇠를 붙여 넣으세요.\n지금 열쇠와 다르면 지금 열쇠로 만든 암호문은 못 풀게 됩니다.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const k = r.getResponseText().trim();
  let bytes;
  try { bytes = Utilities.base64Decode(k); } catch (e) { bytes = []; }
  if (bytes.length !== 32) { ui.alert('열쇠 모양이 아니에요 (base64, 32바이트).'); return; }
  props().setProperty('ENC_KEY', k);
  ENC_KEYS_ = null;
  log_('시트 주인', '암호화 열쇠 복원', '');
  ui.alert('열쇠를 복원했어요.');
}

/* ------------------------------------------------------------------ */
/* 날짜 자동 변환 ("11/5" → 2026-11-05)                                  */
/* ------------------------------------------------------------------ */

/** 여러 모양의 날짜 글자를 Date 로. 연도가 없으면 올해(미래로 2달 넘게 가면 작년). 못 알아보면 null */
function parseLooseDate_(v, today) {
  if (v instanceof Date && !isNaN(v)) return v;
  let s = String(v == null ? '' : v).trim();
  if (!s) return null;
  today = today || new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (s === '오늘') return base;
  if (s === '어제') return new Date(base.getTime() - 86400000);
  if (s === '그제' || s === '그저께') return new Date(base.getTime() - 2 * 86400000);
  s = s.replace(/\s*\(.\)\s*/g, ' ').replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, ''); // 요일 "(수)"·시각 떼기
  let y = null, m, d, g;
  if ((g = s.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\.?$/))) { y = +g[1]; m = +g[2]; d = +g[3]; }
  else if ((g = s.match(/^(\d{4})(\d{2})(\d{2})$/))) { y = +g[1]; m = +g[2]; d = +g[3]; }
  else if ((g = s.match(/^(\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?$/))) { y = 2000 + +g[1]; m = +g[2]; d = +g[3]; }
  else if ((g = s.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\.?$/))) { m = +g[1]; d = +g[2]; }
  else if ((g = s.match(/^(\d{2})(\d{2})$/))) { m = +g[1]; d = +g[2]; }
  else return null;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  let out = new Date(y || base.getFullYear(), m - 1, d);
  if (out.getMonth() !== m - 1) return null; // 2/31 같은 날짜
  if (!y && out.getTime() - base.getTime() > 60 * 86400000) out = new Date(base.getFullYear() - 1, m - 1, d);
  return out;
}

/** 그 열의 날짜 형식: CONFIG.DATE_FORMAT → 열에 이미 있는 날짜들의 가장 흔한 형식 → 기본값 */
function dateFormatFor_(sh, colIdx) {
  if (CONFIG.DATE_FORMAT) return CONFIG.DATE_FORMAT;
  const last = sh.getLastRow();
  const first = Math.max(CONFIG.HEADER_ROW + 1, last - 80);
  if (last >= first) {
    const rng = sh.getRange(first, colIdx + 1, last - first + 1, 1);
    const vals = rng.getValues(), fmts = rng.getNumberFormats();
    const count = {};
    vals.forEach((r, i) => {
      const f = fmts[i][0];
      if (r[0] instanceof Date && f && !/^(General|@|0|#)/i.test(f)) count[f] = (count[f] || 0) + 1;
    });
    const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    if (best) return best;
  }
  return CONFIG.DATE_FALLBACK_FORMAT;
}

function isDateCol_(c) { return c && c.date && !c.pii && !c.check; }

/** 시트에서 직접 입력할 때도 날짜 열이면 자동 변환 (붙여넣기 포함) */
function onEdit(e) {
  try {
    const rng = e && e.range;
    if (!rng) return;
    const sh = rng.getSheet();
    if (allowedSheets_().indexOf(sh.getName()) < 0) return;
    const r0 = Math.max(rng.getRow(), CONFIG.HEADER_ROW + 1);
    const r1 = rng.getLastRow();
    if (r1 < r0 || r1 - r0 > 2000) return;
    const cols = columns_(sh);
    const on = encOn_();
    for (let c = rng.getColumn(); c <= rng.getLastColumn(); c++) {
      const col = cols[c - 1];
      if (isDateCol_(col)) normalizeDateRange_(sh, col, r0, r1);
      else if (on && col && col.enc) encryptRange_(sh, col, r0, r1);
    }
  } catch (err) { /* 입력을 막지 않도록 무시 */ }
}

/** r0~r1 행의 날짜 칸을 진짜 날짜 + 같은 형식으로 맞춤. 바꾼 칸 수를 돌려줌 */
function normalizeDateRange_(sh, col, r0, r1) {
  const rng = sh.getRange(r0, col.i + 1, r1 - r0 + 1, 1);
  const vals = rng.getValues(), forms = rng.getFormulas(), fmts = rng.getNumberFormats();
  const fmt = dateFormatFor_(sh, col.i);
  const outV = vals.map(r => [r[0]]), outF = fmts.map(r => [r[0]]);
  const hit = [];
  vals.forEach((r, i) => {
    if (forms[i][0] || r[0] === '' || r[0] == null) return;
    const d = parseLooseDate_(r[0]);
    if (!d) return;
    if (!(r[0] instanceof Date) || fmts[i][0] !== fmt) { outV[i][0] = d; outF[i][0] = fmt; hit.push(i); }
  });
  if (!hit.length) return 0;
  if (forms.some(f => f[0]) || hit.length <= 3) {
    hit.forEach(i => { const c = sh.getRange(r0 + i, col.i + 1); c.setNumberFormat(fmt); c.setValue(outV[i][0]); });
  } else {
    rng.setNumberFormats(outF);
    rng.setValues(outV);
  }
  const changed = hit.length;
  return changed;
}

/** 시트 메뉴: 날짜 열 전체를 한 번에 정리 */
function menuNormalizeDates() {
  const ui = SpreadsheetApp.getUi();
  let total = 0;
  allowedSheets_().forEach(name => {
    const sh = ss_().getSheetByName(name);
    const last = sh.getLastRow();
    if (last <= CONFIG.HEADER_ROW) return;
    columns_(sh).filter(isDateCol_).forEach(col => { total += normalizeDateRange_(sh, col, CONFIG.HEADER_ROW + 1, last); });
  });
  log_('시트 주인', '날짜 형식 정리', total + '칸');
  ui.alert('날짜 ' + total + '칸을 정리했어요.\n(알아볼 수 없는 글자는 그대로 두었어요)');
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
    if (col.adminOnly && user.role !== 'admin') throw new Error('고칠 수 없는 칸이에요.');
    const cell = sh.getRange(row, colIdx + 1);
    if (cell.getFormula()) throw new Error('수식이 들어 있는 칸은 시트에서 직접 고쳐 주세요.');

    if (col.check) {
      const cur = cell.getValue() === true;
      if (cur !== (oldValue === true)) throw new Error('CONFLICT: 그사이 다른 분이 바꿨어요. 새로 불러올게요.');
      cell.setValue(newValue === true);
      log_(user.name, '체크 변경', sheetName + ' ' + row + '행 [' + col.name + '] → ' + (newValue === true ? '✔' : '해제'));
      return newValue === true;
    }
    const curDisp = col.enc ? decrypt_(cell.getDisplayValue()) : cell.getDisplayValue();
    const curShown = CONFIG.MASK_PII ? mask_(curDisp, col.pii) : curDisp;
    if (curShown !== String(oldValue)) throw new Error('CONFLICT: 그사이 다른 분이 바꿨어요. 새로 불러올게요.');
    if (isDateCol_(col) && String(newValue).trim()) {
      const d = parseLooseDate_(String(newValue).trim());
      if (!d) throw new Error('날짜를 알아볼 수 없어요. 11/5 또는 2026-11-05 처럼 넣어 주세요.');
      cell.setNumberFormat(dateFormatFor_(sh, col.i));
      cell.setValue(d);
    } else if (col.enc && encOn_() && String(newValue).trim()) {
      cell.setValue(encrypt_(String(newValue).trim().slice(0, 2000)));
    } else {
      cell.setValue(cleanInput_(newValue));
    }
    SpreadsheetApp.flush();
    log_(user.name, '수정', sheetName + ' ' + row + '행 [' + col.name + ']' + (col.pii ? '' : ' "' + String(curDisp).slice(0, 40) + '" → "' + String(newValue).slice(0, 40) + '"'));
    const d = col.enc ? decrypt_(cell.getDisplayValue()) : cell.getDisplayValue();
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
      if (c.serial) {
        const nums = last > CONFIG.HEADER_ROW ? sh.getRange(CONFIG.HEADER_ROW + 1, c.i + 1, last - CONFIG.HEADER_ROW, 1).getValues().map(x => Number(x[0])).filter(n => isFinite(n)) : [];
        return nums.length ? Math.max.apply(null, nums) + 1 : 1;
      }
      if (c.readonly || (c.adminOnly && user.role !== 'admin')) return '';
      const v = values ? values[c.i] : '';
      if (c.check) return v === true;
      if (isDateCol_(c) && String(v || '').trim()) {
        const d = parseLooseDate_(String(v).trim());
        if (!d) throw new Error('[' + c.name + '] 날짜를 알아볼 수 없어요. 11/5 처럼 넣어 주세요.');
        return d;
      }
      if (c.enc && encOn_() && String(v || '').trim()) return encrypt_(String(v).trim().slice(0, 2000));
      return cleanInput_(v);
    });
    cols.forEach(c => { if (isDateCol_(c) && out[c.i] instanceof Date) sh.getRange(row, c.i + 1).setNumberFormat(dateFormatFor_(sh, c.i)); });
    sh.getRange(row, 1, 1, cols.length).setValues([out]);
    log_(user.name, '새 행 추가', sheetName + ' ' + row + '행');
    return row;
  } finally {
    lock.releaseLock();
  }
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  const s = String(v || '').replace(/[,\s원₩]/g, '');
  const n = Number(s);
  return s && isFinite(n) ? n : 0;
}
function toMonth_(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'yyyy-MM');
  const m = String(v || '').match(/(20\d{2})\s*[-./년]\s*(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) : '';
}

/** 웹앱: 주문일 기준 월별 합계 (시트 전체 행) */
function getSummary(token, sheetName) {
  const user = auth_(token);
  const sh = sheet_(sheetName);
  const cols = columns_(sh);
  const visible = c => !(c.adminOnly && user.role !== 'admin');
  const monthCol = cols.find(c => has_(c.name, CONFIG.MONTH_KEYWORDS)) || cols.find(c => c.date && !c.pii);
  if (!monthCol) throw new Error('주문일 열을 찾지 못했어요.');
  const sumCols = cols.filter(c => visible(c) && !c.check && has_(c.name, CONFIG.SUM_KEYWORDS));
  const groupCol = cols.find(c => visible(c) && has_(c.name, CONFIG.GROUP_KEYWORDS));
  const settleCol = cols.find(c => c.settle);
  const inv = cols.find(c => c.ship === 'invoice'), dat = cols.find(c => c.ship === 'date');
  const settled = v => {
    if (v === true) return true;
    v = String(v).trim().toLowerCase();
    return !!v && (CONFIG.SETTLED_VALUES.some(x => v === String(x).toLowerCase()) || v.indexOf('완료') >= 0);
  };
  const first = CONFIG.HEADER_ROW + 1, last = sh.getLastRow();
  const months = {};
  if (last >= first) {
    const raw = sh.getRange(first, 1, last - first + 1, cols.length).getValues();
    raw.forEach(r => {
      const mo = toMonth_(r[monthCol.i]);
      if (!mo) return;
      const m = months[mo] || (months[mo] = { month: mo, count: 0, unshipped: 0, unsettled: 0, sums: sumCols.map(() => 0), unsettledSums: sumCols.map(() => 0), groups: {} });
      m.count++;
      const shipped = (inv && String(r[inv.i]).trim()) || (dat && String(r[dat.i]).trim());
      if ((inv || dat) && !shipped) m.unshipped++;
      const isSet = settleCol ? settled(r[settleCol.i]) : true;
      if (!isSet) m.unsettled++;
      sumCols.forEach((c, k) => {
        const n = toNumber_(r[c.i]);
        m.sums[k] += n;
        if (!isSet) m.unsettledSums[k] += n;
      });
      if (groupCol) {
        const g = String(r[groupCol.i] || '').trim() || '(빈칸)';
        m.groups[g] = (m.groups[g] || 0) + 1;
      }
    });
  }
  const list = Object.keys(months).sort().reverse().map(k => months[k]);
  return {
    sumNames: sumCols.map(c => c.name),
    monthName: monthCol.name,
    groupName: groupCol ? groupCol.name : '',
    hasSettle: !!settleCol,
    hasShip: !!(inv || dat),
    months: list,
  };
}

function recentValues_(cols, rows, shipKind) {
  const c = cols.find(x => x.ship === shipKind);
  if (!c) return [];
  const seen = [];
  rows.forEach(r => { const v = String(r.v[c.i] || '').trim(); if (v && seen.indexOf(v) < 0 && seen.length < 6) seen.push(v); });
  return seen;
}

/** 웹앱: 발송 처리 — 택배사·송장번호·발송일을 한 번에 채움 */
function markShipped(token, sheetName, row, courier, invoice, dateStr) {
  const user = auth_(token, true);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_(sheetName);
    const cols = columns_(sh);
    row = Number(row);
    if (!(row > CONFIG.HEADER_ROW && row <= sh.getLastRow())) throw new Error('잘못된 위치예요.');
    const inv = cols.find(c => c.ship === 'invoice');
    const cou = cols.find(c => c.ship === 'courier');
    const dat = cols.find(c => c.ship === 'date');
    invoice = String(invoice || '').trim();
    if (inv && !invoice) throw new Error('송장번호를 넣어 주세요.');
    if (inv) {
      const cur = sh.getRange(row, inv.i + 1).getDisplayValue().trim();
      if (cur && cur !== invoice) throw new Error('CONFLICT: 이미 다른 송장번호(' + cur + ')가 들어 있어요. 새로 불러올게요.');
      sh.getRange(row, inv.i + 1).setValue(/^\d+$/.test(invoice) ? "'" + invoice : cleanInput_(invoice)); // 긴 숫자가 1.23E+11 로 바뀌지 않게
    }
    if (cou && String(courier || '').trim()) sh.getRange(row, cou.i + 1).setValue(cleanInput_(String(courier).trim()));
    if (dat) {
      const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
      const cell = sh.getRange(row, dat.i + 1);
      cell.setNumberFormat(dateFormatFor_(sh, dat.i)); // 그 열의 날짜 형식을 따름
      cell.setValue(d);
    }
    log_(user.name, '발송 처리', sheetName + ' ' + row + '행 ' + (courier || '') + ' ' + invoice);
    return true;
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

/* ------------------------------------------------------------------ */
/* 시트 메뉴 (시트 주인만 사용)                                         */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🔐 주문관리')
    .addItem('📋 주문 시트 양식 만들기', 'menuSetupTemplate')
    .addSeparator()
    .addItem('사용자 추가 / PIN 바꾸기', 'menuAddUser')
    .addItem('사용자 목록 · 삭제', 'menuUsers')
    .addItem('모든 기기 로그아웃', 'menuRevokeAll')
    .addSeparator()
    .addItem('기기 승인 · 관리', 'menuDevices')
    .addItem('접속기록 보기', 'menuShowLog')
    .addItem('로그인 잠금 풀기', 'menuUnlock')
    .addItem('웹앱 주소 바꾸기 (주소가 샜을 때)', 'menuRotateUrl')
    .addItem('날짜 칸 형식 한 번에 정리', 'menuNormalizeDates')
    .addSeparator()
    .addItem('🔒 개인정보 암호화 켜기 (지금 전체 암호화)', 'menuEncryptOn')
    .addItem('선택한 행 개인정보 보기', 'menuShowSelected')
    .addItem('암호화 열쇠 백업', 'menuKeyBackup')
    .addItem('암호화 열쇠 복원', 'menuKeyRestore')
    .addItem('암호화 끄기 (원래 글자로 되돌리기)', 'menuEncryptOff')
    .addSeparator()
    .addItem('비식별: 정산 O + ' + CONFIG.ANON_AFTER_DAYS + '일 지난 주문 (지금)', 'menuAnonymizeNow')
    .addItem('비식별: 정산 O 주문 전체 (기간 무시)', 'menuAnonymizeSettledAll')
    .addItem('비식별: 모든 주문 전체 ⚠️', 'menuAnonymizeAll')
    .addItem('비식별 자동 처리 켜기 (매일 새벽)', 'menuAutoOn')
    .addItem('비식별 자동 처리 끄기', 'menuAutoOff')
    .addToUi();
}

/* ------------------------------------------------------------------ */
/* 주문 시트 양식 만들기                                                */
/* ------------------------------------------------------------------ */

const TEMPLATE = {
  headers: ['순번', '주문번호', '구분', '용량', '비고', '구매자명', '수취인명', '주문일', '택배사', '송장번호', '발송일',
    '수취인연락처1', '통합배송지', '배송메모', '우편번호', '수익금(-수수료)', '인삼대금', '순수익', '정산여부'],
  text: ['주문번호', '송장번호', '수취인연락처1', '우편번호', '구매자명', '수취인명', '통합배송지', '배송메모'], // 글자 그대로 (0 빠짐·지수표기 방지)
  date: ['주문일', '발송일'],
  money: ['수익금(-수수료)', '인삼대금', '순수익'],
  widths: { '순번': 50, '주문번호': 150, '구분': 100, '용량': 70, '비고': 120, '구매자명': 80, '수취인명': 80, '주문일': 95,
    '택배사': 95, '송장번호': 120, '발송일': 95, '수취인연락처1': 120, '통합배송지': 260, '배송메모': 160, '우편번호': 70,
    '수익금(-수수료)': 105, '인삼대금': 90, '순수익': 90, '정산여부': 70 },
  couriers: ['CJ대한통운', '우체국택배', '한진택배', '롯데택배', '로젠택배', '경동택배', '직접전달'],
};

function menuSetupTemplate() {
  const ui = SpreadsheetApp.getUi();
  let sh = ss_().getActiveSheet();
  const hasData = sh.getLastRow() > 0 || sh.getLastColumn() > 0;
  if (hasData) {
    const r = ui.alert('주문 시트 양식 만들기', '지금 시트("' + sh.getName() + '")에 이미 내용이 있어요.\n새 시트 "주문" 을 만들어서 양식을 넣을까요?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
    let name = '주문', k = 2;
    while (ss_().getSheetByName(name)) name = '주문' + (k++);
    sh = ss_().insertSheet(name);
  }
  const sample = ui.alert('예시 주문', '어떻게 쓰는지 볼 수 있게 예시 주문 3건(가짜 정보)을 넣을까요?\n(확인한 뒤 지우면 됩니다)', ui.ButtonSet.YES_NO) === ui.Button.YES;
  buildTemplate_(sh, sample);
  ss_().setActiveSheet(sh);
  log_('시트 주인', '주문 시트 양식 만들기', sh.getName() + (sample ? ' (예시 포함)' : ''));
  ui.alert('양식을 만들었어요 ✅',
    '· 1행 머리글 고정, 칸 형식(글자/날짜/금액), 택배사·정산여부 고르기 목록을 넣었어요.\n' +
    '· 예전 주문을 옮길 때는 원래 시트에서 2행부터 복사 → 이 시트 A2 칸을 누르고 Ctrl+Shift+V (값만 붙여넣기) 하세요.\n' +
    '  그래야 칸 형식이 유지돼요.\n' +
    '· 다음: 🔐 주문관리 → 사용자 추가 / PIN 바꾸기', ui.ButtonSet.OK);
}

function buildTemplate_(sh, sample) {
  const H = TEMPLATE.headers, n = H.length, rows = 1000;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  const head = sh.getRange(CONFIG.HEADER_ROW, 1, 1, n);
  head.setValues([H]).setFontWeight('bold').setBackground('#e8f3e8').setHorizontalAlignment('center').setWrap(true);
  sh.setFrozenRows(CONFIG.HEADER_ROW);
  const col = name => H.indexOf(name) + 1;
  const body = name => sh.getRange(CONFIG.HEADER_ROW + 1, col(name), rows - CONFIG.HEADER_ROW, 1);
  TEMPLATE.text.forEach(h => body(h).setNumberFormat('@'));
  TEMPLATE.date.forEach(h => body(h).setNumberFormat(CONFIG.DATE_FORMAT || CONFIG.DATE_FALLBACK_FORMAT));
  TEMPLATE.money.forEach(h => body(h).setNumberFormat('#,##0'));
  body('순번').setNumberFormat('0');
  body('택배사').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(TEMPLATE.couriers, true).setAllowInvalid(true).build());
  body('정산여부').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['O'], true).setAllowInvalid(true)
    .setHelpText('정산이 끝나면 O').build());
  body('정산여부').setHorizontalAlignment('center');
  Object.keys(TEMPLATE.widths).forEach(h => sh.setColumnWidth(col(h), TEMPLATE.widths[h]));

  if (sample) {
    const today = new Date();
    const day = d => new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
    const data = [
      [1, '2026000000000001', '6년근 수삼', '750g', '예시 - 지워도 됨', '홍길동', '홍길동', day(120), 'CJ대한통운', '600000000001', day(119),
        '010-0000-0001', '경기도 이천시 부발읍 예시로 1', '부재시 문앞', '17322', 52000, 40000, 12000, 'O'],
      [2, '2026000000000002', '홍삼정', '240g', '예시 - 지워도 됨', '김예시', '이예시', day(10), 'CJ대한통운', '600000000002', day(9),
        '010-0000-0002', '서울특별시 강남구 예시로 2', '', '06236', 35000, 28000, 7000, ''],
      [3, '2026000000000003', '6년근 수삼', '1.5kg', '예시 - 지워도 됨 (선물포장)', '박예시', '박예시', day(0), '', '', '',
        '010-0000-0003', '부산광역시 해운대구 예시로 3', '경비실에 맡겨 주세요', '48094', 98000, 80000, 18000, ''],
    ];
    const target = sh.getRange(CONFIG.HEADER_ROW + 1, 1, data.length, n);
    target.setValues(data);
    if (encOn_()) encryptPending();
  }
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

function menuDevices() {
  const ui = SpreadsheetApp.getUi();
  const devices = getDevices_();
  const keys = Object.keys(devices).sort((a, b) => (devices[a].status === 'pending' ? -1 : 1) - (devices[b].status === 'pending' ? -1 : 1));
  if (!keys.length) { ui.alert('등록된 기기가 없어요.'); return; }
  const label = { pending: '⏳ 승인 대기', approved: '✅ 승인됨', blocked: '⛔ 차단' };
  const list = keys.map((k, i) => (i + 1) + '. ' + devices[k].name + ' · ' + devices[k].label + ' — ' + label[devices[k].status]).join('\n');
  const r = ui.prompt('기기 승인 · 관리', list + '\n\n"번호 동작" 으로 입력하세요. 동작: 승인 / 차단 / 삭제\n예) 1 승인', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const m = r.getResponseText().trim().match(/^(\d+)\s*(승인|차단|삭제)$/);
  if (!m || !keys[Number(m[1]) - 1]) { ui.alert('예) 1 승인  처럼 입력해 주세요.'); return; }
  const key = keys[Number(m[1]) - 1], d = devices[key];
  const act = { 승인: 'approve', 차단: 'block', 삭제: 'delete' }[m[2]];
  if (act === 'approve') d.status = 'approved';
  else if (act === 'block') { d.status = 'blocked'; revokeDeviceTokens_(key); }
  else { delete devices[key]; revokeDeviceTokens_(key); }
  saveDevices_(devices);
  log_('시트 주인', '기기 ' + m[2], d.name + ' · ' + d.label);
  ui.alert(d.name + ' 님의 기기를 ' + m[2] + '했어요.');
}

function menuRotateUrl() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert('웹앱 주소 바꾸기',
    '웹앱 주소가 다른 사람에게 퍼진 것 같을 때 씁니다. 구글 정책상 주소 자체는 Apps Script 화면에서 직접 바꿔야 해요.\n\n' +
    '지금 "예" 를 누르면:\n · 모든 기기 로그아웃\n · 승인된 기기 목록 초기화 (새 주소로 들어올 때 다시 승인)\n\n' +
    '그다음 직접 할 일:\n 1) 확장 프로그램 → Apps Script → 배포 → 새 배포 (웹 앱 · 실행: 나 · 액세스: 모든 사용자) → 새 주소 복사\n' +
    ' 2) 배포 → 배포 관리 → 예전 배포 선택 → 보관(🗄) → 예전 주소는 더 이상 안 열림\n' +
    ' 3) 부모님 휴대폰에서 새 주소 열고 홈 화면에 다시 추가\n\n진행할까요?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  revokeTokens_(null);
  saveDevices_({});
  log_('시트 주인', '웹앱 주소 교체 시작', '모든 로그인·기기 초기화');
  ui.alert('로그아웃·기기 초기화를 했어요. 이제 Apps Script 에서 1)~3) 을 해 주세요.');
}

function menuUnlock() {
  props().setProperty('FAILS', '{"n":0,"until":0}');
  SpreadsheetApp.getUi().alert('로그인 잠금을 풀었어요.');
}

function menuAnonymizeNow() { anonymizeMenu_('rule'); }
function menuAnonymizeSettledAll() { anonymizeMenu_('settled'); }
function menuAnonymizeAll() { anonymizeMenu_('all'); }

function anonymizeMenu_(mode) {
  const ui = SpreadsheetApp.getUi();
  const desc = {
    rule: '정산여부 O + 발송일(없으면 주문일)로부터 ' + CONFIG.ANON_AFTER_DAYS + '일 지난 주문',
    settled: '정산여부 O 인 주문 전체 (' + CONFIG.ANON_AFTER_DAYS + '일 전이라도)',
    all: '시트의 모든 주문 (정산·발송 여부 상관없이)',
  }[mode];
  const preview = anonymizeOld(true, mode);
  if (!preview) { ui.alert('비식별 처리할 주문이 없어요.\n(' + desc + ')'); return; }
  const ok = ui.alert('개인정보 비식별 처리',
    desc + ' ' + preview + '건의\n성명 → 홍**, 휴대폰 → 010-****-****, 주소 → 시·군까지만, 우편번호·배송메모 → 삭제\n' +
    '로 바꿉니다. 시트에서는 되돌릴 수 없어요(구글 "버전 기록" 으로만 복구). 계속할까요?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  if (mode === 'all') {
    const r = ui.prompt('한 번 더 확인', '아직 발송 안 한 주문의 주소·연락처도 지워집니다.\n정말 하려면 "전체" 라고 입력하세요.', ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK || r.getResponseText().trim() !== '전체') { ui.alert('취소했어요.'); return; }
  }
  ui.alert(anonymizeOld(false, mode) + '건을 비식별 처리했어요.');
}

/** 웹앱(관리자만): 고른 행을 기간과 상관없이 바로 비식별 처리 */
function anonymizeRows(token, sheetName, rows) {
  const user = auth_(token);
  if (user.role !== 'admin') throw new Error('관리자만 할 수 있어요.');
  sheet_(sheetName);
  const set = {};
  (rows || []).forEach(r => { set[Number(r)] = true; });
  const n = anonymizeOld(false, 'rows', { sheet: sheetName, rows: set }, user.name);
  return n;
}

function parseDate_(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  if (!/20\d{2}/.test(String(v))) return null; // 연도 없는 글자는 기간 계산에서 건너뜀 (메뉴 "날짜 칸 정리" 로 고치세요)
  const m = String(v || '').match(/(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}
function isSettledValue_(v) {
  if (v === true) return true;
  v = String(v == null ? '' : v).trim().toLowerCase();
  return !!v && (CONFIG.SETTLED_VALUES.some(x => v === String(x).toLowerCase()) || v.indexOf('완료') >= 0);
}
/** 비식별용 강한 가림 (화면용 가림보다 더 많이 지움) */
function deidentify_(value, type) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return v;
  if (type === 'phone') { const d = v.replace(/\D/g, ''); return (d.length >= 8 ? d.slice(0, 3) : '***') + '-****-****'; }
  if (type === 'name') return v[0] + '**';
  if (type === 'address') { const p = v.split(/\s+/); return p.slice(0, 2).join(' ') + ' (비식별)'; }
  return '(비식별)';
}
/** 일방향 암호화(HMAC-SHA256, 비밀키) — 원래 값은 복원할 수 없고, 같은 고객인지만 맞춰 볼 수 있음 */
function customerKey_(phone, name) {
  let key = props().getProperty('ANON_KEY');
  if (!key) { key = randomToken_(); props().setProperty('ANON_KEY', key); }
  const src = String(phone || '').replace(/\D/g, '') || String(name || '').replace(/\s/g, '');
  if (!src) return '';
  return hex_(Utilities.computeHmacSha256Signature(src, key)).slice(0, 20);
}

/** 매일 실행: 정산 완료 + N일 지난 주문의 개인정보를 비식별 처리. dryRun 이면 건수만 셈 */
function anonymizeOld(dryRun, mode, pick, who) {
  mode = typeof mode === 'string' ? mode : 'rule'; // 'rule' | 'settled' | 'all' | 'rows'
  if (dryRun !== true) dryRun = false;               // 트리거가 이벤트 객체를 넘겨도 실제 실행
  if (mode === 'rule' && !CONFIG.ANON_AFTER_DAYS) return 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const now = new Date();
    let total = 0;
    const records = [];
    allowedSheets_().forEach(name => {
      if (mode === 'rows' && name !== pick.sheet) return;
      const sh = ss_().getSheetByName(name);
      const cols = columns_(sh);
      const piiCols = cols.filter(c => c.pii);
      const clearCols = cols.filter(c => !c.pii && has_(c.name, CONFIG.ANON_CLEAR_KEYWORDS));
      const baseCols = CONFIG.ANON_BASE_KEYWORDS.map(k => cols.find(c => has_(c.name, [k]))).filter(Boolean);
      const settleCol = cols.find(c => c.settle);
      const orderNoCol = cols.find(c => has_(c.name, ['주문번호']));
      const phoneCol = cols.find(c => c.pii === 'phone');
      const nameCol = cols.find(c => c.pii === 'name');
      const first = CONFIG.HEADER_ROW + 1, last = sh.getLastRow();
      if (!piiCols.length || last < first) return;
      if (mode === 'rule' && !baseCols.length) return;
      if ((mode === 'rule' || mode === 'settled') && CONFIG.ANON_REQUIRE_SETTLED && !settleCol) return;
      const n = last - first + 1;
      const rng = sh.getRange(first, 1, n, cols.length);
      const raw = rng.getValues();
      const disp = rng.getDisplayValues();
      disp.forEach(row => cols.forEach(c => { if (c.enc) row[c.i] = decrypt_(row[c.i]); })); // 암호문은 풀어서 판단
      const forms = rng.getFormulas();
      const targets = [];
      for (let r = 0; r < n; r++) {
        if (mode === 'rows' && !pick.rows[first + r]) continue;
        if ((mode === 'rule' || mode === 'settled') && CONFIG.ANON_REQUIRE_SETTLED && !isSettledValue_(raw[r][settleCol.i])) continue;
        if (mode === 'rule') {
          let base = null;
          for (const bc of baseCols) { base = parseDate_(raw[r][bc.i]); if (base) break; }
          if (!base) continue;
          const due = new Date(base.getFullYear(), base.getMonth(), base.getDate() + CONFIG.ANON_AFTER_DAYS);
          if (due > now) continue;
        }
        const work = piiCols.concat(clearCols).filter(c => !forms[r][c.i] && String(disp[r][c.i]).trim() && !/\(비식별\)|\*\*\*\*-\*\*\*\*|^.\*\*$/.test(String(disp[r][c.i])));
        if (work.length) targets.push({ r: r, work: work });
      }
      total += targets.length;
      if (dryRun || !targets.length) return;
      targets.forEach(t => {
        const r = t.r;
        records.push([now, name, orderNoCol ? disp[r][orderNoCol.i] : '', first + r,
          customerKey_(phoneCol ? disp[r][phoneCol.i] : '', nameCol ? disp[r][nameCol.i] : ''),
          t.work.map(c => c.name).join(', '),
          { rule: CONFIG.ANON_AFTER_DAYS + '일 자동', settled: '정산 완료 전체', all: '전체', rows: '웹앱에서 선택 (' + (who || '') + ')' }[mode]]);
        t.work.forEach(c => {
          const v = clearCols.indexOf(c) >= 0 ? '' : deidentify_(disp[r][c.i], c.pii);
          sh.getRange(first + r, c.i + 1).setValue(v);
        });
      });
    });
    if (!dryRun && records.length) {
      let ash = ss_().getSheetByName(CONFIG.ANON_SHEET);
      if (!ash) {
        ash = ss_().insertSheet(CONFIG.ANON_SHEET);
        ash.appendRow(['처리 시각', '시트', '주문번호', '행', '고객키(일방향 암호화)', '처리한 열', '방식']);
        ash.setFrozenRows(1);
        ash.hideSheet();
      }
      ash.getRange(ash.getLastRow() + 1, 1, records.length, records[0].length).setValues(records);
      log_(who || '시트 주인/자동', '개인정보 비식별 처리', records.length + '건 (' + mode + ')');
    }
    return total;
  } finally {
    lock.releaseLock();
  }
}

function menuAutoOn() {
  menuAutoOff(true);
  ScriptApp.newTrigger('anonymizeOld').timeBased().everyDays(1).atHour(4).create();
  SpreadsheetApp.getUi().alert('매일 새벽 4시쯤, 정산여부 O + ' + CONFIG.ANON_AFTER_DAYS + '일 지난 주문의 개인정보를 비식별 처리합니다.');
}
function menuAutoOff(silent) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'anonymizeOld').forEach(t => ScriptApp.deleteTrigger(t));
  if (silent !== true) SpreadsheetApp.getUi().alert('비식별 자동 처리를 껐어요.');
}
