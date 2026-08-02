/*************************************************************
 * sey콩콩 가계부 - 서버 로직 (Code.gs)
 * 구글시트 = 숨은 장부 / 이 웹앱 = 예쁜 가계부 앱
 *
 * [처음 1번만 할 세팅]
 *  1) 이 가계부 시트에서 확장 프로그램 > Apps Script
 *  2) Code.gs 내용을 이걸로 통째로 교체
 *  3) 파일 추가(+) > HTML > 이름 "Index" 로 만들고 Index.html 내용 붙여넣기
 *  4) 저장 후 상단 함수 목록에서 installFastInputUpgrade 를 선택해 1회 실행
 *  5) 프로젝트 설정(톱니) > 시간대가 "(GMT+09:00) 서울" 인지 확인
 *  6) 프로젝트 설정 > 스크립트 속성 추가:
 *       APP_PIN     = 너희 부부 PIN (예: 1234)        ← 필수
 *       GROQ_API_KEY= gsk_로 시작하는 키 (있으면)    ← AI분석 쓸 때만
 *       GROQ_MODEL  = llama-3.3-70b-versatile (선택) ← 모델 바꾸고 싶을 때
 *  7) 배포 > 새 배포 > 유형 "웹 앱"
 *       - 실행: 나(본인)
 *       - 액세스: Google 계정이 있는 모든 사용자
 *       (실행을 '나'로 해야 하콩이가 시트 공유 없이도 너 권한으로 입력됨.
 *        + PIN 으로 한 번 더 막으니 URL 새어도 안전)
 *  8) 나온 웹앱 URL 을 너랑 하콩이 폰 홈화면에 추가하면 끝
 *************************************************************/

// ===== 시트 이름 (네 시트 그대로) =====
const SHEET_TX         = '💸거래내역';
const SHEET_CONFIG     = '⚙️설정';
const SHEET_ASSET      = '🏦자산현황';
const SHEET_AI         = '🤖AI분석';
const SHEET_EDIT_LOG   = '수정로그';
const SHEET_DELETE_LOG = '삭제로그';
const SHEET_BUDGET     = '🎯예산';
const SHEET_BUDGET_LOG = '예산로그';
const SHEET_TEMPLATE   = '⚡템플릿';
const SHEET_ASSET_SNAP = '📈자산스냅샷';
const SHEET_ACTION_LOG = '작업로그';
const SHEET_RECURRING  = '🔁정기거래';
const SHEET_CLOSE_MONTH = '📌월마감';
const TZ = 'Asia/Seoul';

const TX_META_HEADERS = ['입력자', '거래ID', '생성일시', '수정일시', '수정자', '삭제여부', '소비성격'];
const SPENDING_MEANINGS = ['필수', '생활', '즐거움', '가족', '투자', '아쉬움', '미지정'];
const DEFAULT_SPENDING_MEANING = '미지정';
const BUDGET_HEADERS = ['월', '대분류', '예산', '메모', '생성일시', '수정일시', '수정자', '추천기준'];
const TEMPLATE_HEADERS = ['템플릿명', '구분', '대분류', '내역', '기본금액', '고정/변동', '메모', '사용여부'];
const ASSET_SNAPSHOT_HEADERS = ['기록일시', '대상월', '계좌잔액', '보물창고', '주식투자', '부동산보증금', '저축', '대출잔액', '총자산', '메모'];
const ACTION_LOG_HEADERS = ['일시', '작업', '사용자', '내용'];
const BUDGET_LOG_HEADERS = ['일시', '사용자', '작업', '대상월', '대분류', '이전예산', '새예산', '메모'];
const RECURRING_HEADERS = ['정기ID', '정기명', '구분', '대분류', '내역', '금액', '고정/변동', '메모', '입력자', '결제일', '사용여부', '마지막실행월'];
const CLOSE_MONTH_HEADERS = ['마감월', '마감일시', '마감자', '총수입', '총지출', '저축투자', '대출상환', '남은돈', '저축률', '고정비', '변동비', '총자산', '이상지출수', 'AI요약', '메모', '백업URL', '좋았던소비', '아쉬웠던소비', '다음달약속', '지수의견', '하콩의견', '같이확인할것'];
const AI_HEADERS = ['분석일시', '대상월', 'AI분석', '분석스냅샷'];
const FAST_INPUT_INSTALL_VERSION = '2026-07-04-v1';
const EDIT_LOG_HEADERS = [
  '수정일시', '수정행', '수정자',
  '기존 날짜', '기존 구분', '기존 대분류', '기존 내역', '기존 금액', '기존 고정/변동', '기존 메모', '기존 입력자',
  '새 날짜', '새 구분', '새 대분류', '새 내역', '새 금액', '새 고정/변동', '새 메모', '새 입력자'
];
const DELETE_LOG_HEADERS = [
  '삭제일시', '삭제행', '삭제자',
  '날짜', '구분', '대분류', '내역', '금액', '고정/변동', '메모', '입력자'
];
const DEFAULT_TEMPLATES = [
  ['카페', '지출', '식비', '카페', 0, '변동', '웹앱', true],
  ['마트', '지출', '식비', '더드림마트', 0, '변동', '웹앱', true],
  ['관리비', '지출', '주거/통신', '관리비', 0, '고정', '웹앱', true],
  ['전기차 충전', '지출', '교통/차량', '전기차 충전', 0, '변동', '웹앱', true],
  ['용돈', '지출', '용돈', '월 용돈', 600000, '고정', '웹앱', true]
];
const BACKUP_SHEET_NAMES = [
  SHEET_TX, SHEET_CONFIG, SHEET_ASSET, SHEET_AI, SHEET_BUDGET,
  SHEET_TEMPLATE, SHEET_ASSET_SNAP, SHEET_EDIT_LOG, SHEET_DELETE_LOG, SHEET_RECURRING, SHEET_CLOSE_MONTH, SHEET_BUDGET_LOG
];

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function props_() { return PropertiesService.getScriptProperties(); }

// ===== 진입점: 웹앱 화면 서빙 =====
function doGet(e) {
  if (e && e.parameter && (e.parameter.fn || e.parameter.callback)) {
    try {
      const callback = e.parameter.callback;
      const fn = e.parameter.fn;
      let args = [];
      if (e.parameter.args) {
        try { args = JSON.parse(e.parameter.args); } catch(err) { args = []; }
      }
      if (typeof this[fn] !== 'function') throw new Error('존재하지 않는 함수야: ' + fn);
      const result = this[fn].apply(this, args);
      const payload = JSON.stringify({ ok: true, data: result });
      if (callback) {
        return ContentService.createTextOutput(callback + '(' + payload + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return ContentService.createTextOutput(payload)
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      const errPayload = JSON.stringify({ ok: false, error: err.message || '처리 실패' });
      if (e.parameter.callback) {
        return ContentService.createTextOutput(e.parameter.callback + '(' + errPayload + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return ContentService.createTextOutput(errPayload)
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('sey콩콩 가계부')
    .addMetaTag('viewport',
      'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
}

function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const fn = contents.fn;
    const args = contents.args || [];
    if (typeof this[fn] !== 'function') throw new Error('존재하지 않는 함수야: ' + fn);
    const result = this[fn].apply(this, args);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message || '처리 실패' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}


/**
 * Code.gs와 Index.html을 새 버전으로 붙여넣은 뒤 이 함수만 1회 실행하면 돼.
 * 재실행해도 이미 정리된 값은 건드리지 않는 방식으로 작성되어 있어.
 */
function installFastInputUpgrade() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const book = ss();
    if (!book.getSheetByName(SHEET_TX)) throw new Error('"' + SHEET_TX + '" 시트를 찾지 못했어. 기존 가계부 스프레드시트에서 실행해줘.');
    if (!book.getSheetByName(SHEET_CONFIG)) throw new Error('"' + SHEET_CONFIG + '" 시트를 찾지 못했어.');
    if (!book.getSheetByName(SHEET_ASSET)) throw new Error('"' + SHEET_ASSET + '" 시트를 찾지 못했어.');

    const txInfo = txMap_(true);
    const sh = txInfo.sh;
    const map = txInfo.map;
    const lastCol = txInfo.lastCol;
    assertTxCore_(map);

    const stats = {
      version: FAST_INPUT_INSTALL_VERSION,
      checked: Math.max(0, sh.getLastRow() - 1),
      txIdsCreated: 0,
      createdAtFilled: 0,
      deletedFilled: 0,
      spendingMoodFilled: 0,
      recurringAutomationKept: false
    };

    const lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
      let changed = false;
      const now = new Date();
      values.forEach(row => {
        if (map.txId != null && !String(row[map.txId] || '').trim()) {
          row[map.txId] = makeTxId_();
          stats.txIdsCreated++;
          changed = true;
        }
        if (map.createdAt != null && !row[map.createdAt]) {
          row[map.createdAt] = now;
          stats.createdAtFilled++;
          changed = true;
        }
        if (map.deleted != null && String(row[map.deleted]).trim() === '') {
          row[map.deleted] = false;
          stats.deletedFilled++;
          changed = true;
        }
        if (map.spendingMood != null && !String(row[map.spendingMood] || '').trim()) {
          row[map.spendingMood] = DEFAULT_SPENDING_MEANING;
          stats.spendingMoodFilled++;
          changed = true;
        }
      });
      if (changed) sh.getRange(2, 1, values.length, lastCol).setValues(values);
    }

    getOrCreateSheet_(SHEET_AI, AI_HEADERS, []);
    getOrCreateSheet_(SHEET_BUDGET, BUDGET_HEADERS, []);
    getOrCreateSheet_(SHEET_TEMPLATE, TEMPLATE_HEADERS, DEFAULT_TEMPLATES);
    getOrCreateSheet_(SHEET_ASSET_SNAP, ASSET_SNAPSHOT_HEADERS, []);
    getOrCreateSheet_(SHEET_ACTION_LOG, ACTION_LOG_HEADERS, []);
    getOrCreateSheet_(SHEET_RECURRING, RECURRING_HEADERS, []);
    getOrCreateSheet_(SHEET_CLOSE_MONTH, CLOSE_MONTH_HEADERS, []);
    getOrCreateSheet_(SHEET_BUDGET_LOG, BUDGET_LOG_HEADERS, []);
    getOrCreateLogSheet_(SHEET_EDIT_LOG, EDIT_LOG_HEADERS);
    getOrCreateLogSheet_(SHEET_DELETE_LOG, DELETE_LOG_HEADERS);

    const recurringStatus = getRecurringStatusCore_();
    stats.recurringAutomationKept = !!recurringStatus.installed;
    props_().setProperty('FAST_INPUT_INSTALL_VERSION', FAST_INPUT_INSTALL_VERSION);
    props_().setProperty('FAST_INPUT_INSTALLED_AT', Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'));
    appendActionLog_('빠른입력 업그레이드', '설치함수', JSON.stringify(stats));

    const message = [
      '✅ 빠른 입력 업그레이드 완료',
      '',
      '기존 거래 확인: ' + stats.checked + '건',
      '거래ID 생성: ' + stats.txIdsCreated + '건',
      '생성일시 보정: ' + stats.createdAtFilled + '건',
      '삭제여부 보정: ' + stats.deletedFilled + '건',
      '소비성격 보정: ' + stats.spendingMoodFilled + '건',
      '정기거래 자동입력: ' + (stats.recurringAutomationKept ? '기존 설정 유지' : '현재 꺼짐'),
      '',
      '이제 웹앱을 새 버전으로 배포하면 돼.'
    ].join('\n');
    try { SpreadsheetApp.getUi().alert(message); } catch (e) {}
    return { ok: true, message: message, stats: stats };
  } finally {
    lock.releaseLock();
  }
}

// ===== PIN 보안 =====
function checkPin_(pin) {
  const real = props_().getProperty('APP_PIN');
  if (!real || String(real).trim() === '' || String(real) === '0000') return false;
  return String(pin) === String(real);
}
function guard_(pin) {
  const real = props_().getProperty('APP_PIN');
  if (!real || String(real).trim() === '' || String(real) === '0000') {
    throw new Error('APP_PIN이 설정되지 않았거나 기본값이야. Apps Script 스크립트 속성에서 안전한 PIN을 먼저 설정해줘.');
  }
  const cache = CacheService.getScriptCache();
  if (cache.get('PIN_BLOCKED')) {
    throw new Error('PIN을 여러 번 틀렸어. 30초 뒤에 다시 시도해줘.');
  }
  if (String(pin) === String(real)) {
    cache.remove('PIN_FAIL_COUNT');
    return;
  }
  const count = Number(cache.get('PIN_FAIL_COUNT') || 0) + 1;
  if (count >= 5) {
    cache.put('PIN_BLOCKED', '1', 30);
    cache.remove('PIN_FAIL_COUNT');
    throw new Error('PIN을 5회 틀렸어. 30초 뒤에 다시 시도해줘.');
  }
  cache.put('PIN_FAIL_COUNT', String(count), 300);
  throw new Error('PIN이 안 맞아. 다시 확인해줘. (' + count + '/5)');
}

// ===== 작은 유틸 =====
function currentYm_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM'); }

function numParse_(v) {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseDateStrict_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  const s = String(v == null ? '' : v).trim();
  if (!s) throw new Error('날짜를 입력해줘.');

  let m = s.match(/^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*\.?$/);
  if (!m) m = s.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const out = new Date(y, mo - 1, d);
    if (out.getFullYear() === y && out.getMonth() === mo - 1 && out.getDate() === d) return out;
  }

  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  }
  throw new Error('날짜 형식을 확인해줘. 예: 2026-06-16');
}

function parseDate_(v) {
  try {
    return parseDateStrict_(v);
  } catch (e) {
    return null;
  }
}

function ymOf_(dateVal) {
  const d = parseDate_(dateVal);
  return d ? Utilities.formatDate(d, TZ, 'yyyy-MM') : '';
}

function dateText_(dateVal) {
  const d = parseDate_(dateVal);
  return d ? Utilities.formatDate(d, TZ, 'yyyy-MM-dd') : String(dateVal || '');
}

function dateTimeText_(dateVal) {
  if (!dateVal) return '';
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  return isNaN(d.getTime()) ? String(dateVal || '') : Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm');
}

function won_(n) {
  n = Math.round(Number(n) || 0);
  const neg = n < 0;
  const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-₩' : '₩') + s;
}

function ymToDate_(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

function daysInMonth_(ym) {
  const d = ymToDate_(ym);
  if (!d) return 0;
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function daysLeftInMonth_(ym) {
  const first = ymToDate_(ym);
  if (!first) return 0;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const monthStart = new Date(first.getFullYear(), first.getMonth(), 1);
  const monthEnd = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  if (todayStart < monthStart) return daysInMonth_(ym);
  if (todayStart > monthEnd) return 0;
  // 오늘 포함 기준: 오늘 하루에 쓸 수 있는 돈도 남은 날짜에 포함한다.
  return monthEnd.getDate() - todayStart.getDate() + 1;
}

function shiftYm_(ym, delta) {
  const d = ymToDate_(ym);
  if (!d) return currentYm_();
  const moved = new Date(d.getFullYear(), d.getMonth() + Number(delta || 0), 1);
  return Utilities.formatDate(moved, TZ, 'yyyy-MM');
}

function getOrCreateSheet_(name, headers, defaultRows) {
  let sh = ss().getSheetByName(name);
  if (!sh) sh = ss().insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (defaultRows && defaultRows.length) {
      sh.getRange(2, 1, defaultRows.length, headers.length).setValues(defaultRows);
    }
  } else {
    const lastCol = Math.max(1, sh.getLastColumn());
    const cur = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
    headers.forEach((h, i) => {
      if (cur[i] !== h) sh.getRange(1, i + 1).setValue(h);
    });
  }
  return sh;
}

function safeRowNumber_(row) {
  const r = Number(row);
  if (!isFinite(r) || Math.floor(r) !== r) throw new Error('행 번호가 올바르지 않아.');
  if (r <= 1) throw new Error('헤더 행은 수정/삭제할 수 없어.');
  return r;
}

function normalizeUser_(user) {
  const u = String(user == null ? '' : user).trim();
  if (u !== '' && u !== '지수' && u !== '하콩') {
    throw new Error('입력자는 지수, 하콩, 빈칸만 사용할 수 있어.');
  }
  return u;
}

function normalizeSpendingMeaning_(value) {
  const v = String(value == null ? '' : value).trim();
  return SPENDING_MEANINGS.indexOf(v) > -1 ? v : DEFAULT_SPENDING_MEANING;
}

function normalizeTxData_(data) {
  data = data || {};
  const date = parseDateStrict_(data.date);
  const type = String(data.type || '').trim();
  const cat = String(data.cat || '').trim();
  const amount = numParse_(data.amount);
  const fixed = String(data.fixed || '변동').trim() || '변동';
  const user = normalizeUser_(data.user);
  if (!type) throw new Error('구분을 입력해줘.');
  if (!cat) throw new Error('대분류를 입력해줘.');
  if (!(amount > 0)) throw new Error('금액은 0보다 큰 숫자로 입력해줘.');
  return {
    date: date,
    type: type,
    cat: cat,
    desc: String(data.desc || '').trim() || cat,
    amount: amount,
    fixed: fixed,
    memo: String(data.memo || '').trim() || '웹앱',
    user: user,
    spendingMood: normalizeSpendingMeaning_(data.spendingMood || data.meaning || data.spendingMeaning)
  };
}

// ===== 거래내역 헤더 자동 매핑 =====
// A:G는 기존 순서를 유지하고, 새 컬럼은 H열 이후에만 덧붙임
function ensureTxMetaColumns_(sh, headers) {
  TX_META_HEADERS.forEach(name => {
    if (headers.indexOf(name) === -1) {
      headers.push(name);
      sh.getRange(1, headers.length).setValue(name);
    }
  });
  return headers;
}

function txMap_(ensureMeta) {
  const sh = ss().getSheetByName(SHEET_TX);
  if (!sh) throw new Error('"' + SHEET_TX + '" 시트를 못 찾겠어.');
  const lastCol = Math.max(1, sh.getLastColumn());
  let headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  if (ensureMeta) headers = ensureTxMetaColumns_(sh, headers);

  const map = {};
  headers.forEach((h, i) => {
    if (h === '입력자') map.user = i;
    else if (h === '거래ID') map.txId = i;
    else if (h === '생성일시') map.createdAt = i;
    else if (h === '수정일시') map.updatedAt = i;
    else if (h === '수정자') map.updatedBy = i;
    else if (h === '삭제여부') map.deleted = i;
    else if (h === '소비성격') map.spendingMood = i;
    else if (h.indexOf('날짜') > -1) map.date = i;
    else if (h.indexOf('구분') > -1) map.type = i;
    else if (h.indexOf('대분류') > -1) map.cat = i;
    else if (h.indexOf('내역') > -1) map.desc = i;
    else if (h.indexOf('금액') > -1) map.amount = i;
    else if (h.indexOf('고정') > -1 || h.indexOf('변동') > -1) map.fixed = i;
    else if (h.indexOf('메모') > -1 || h.indexOf('출처') > -1) map.memo = i;
  });
  return { sh: sh, headers: headers, map: map, lastCol: headers.length };
}

function assertTxCore_(map) {
  const needed = [
    { key: 'date', label: '날짜' },
    { key: 'type', label: '구분' },
    { key: 'cat', label: '대분류' },
    { key: 'desc', label: '내역' },
    { key: 'amount', label: '금액' },
    { key: 'fixed', label: '고정/변동' },
    { key: 'memo', label: '메모/분류출처' }
  ];
  needed.forEach(n => {
    if (map[n.key] == null) throw new Error('거래내역 시트의 "' + n.label + '" 컬럼을 찾지 못했어.');
  });
}

function isDeleted_(rowValues, map) {
  if (map.deleted == null) return false;
  const v = rowValues[map.deleted];
  return v === true || String(v).trim().toUpperCase() === 'TRUE';
}

function makeTxId_() {
  return 'TX-' + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHHmmssSSS') + '-' + Utilities.getUuid().slice(0, 8);
}

function makeRecurringId_() {
  return 'RC-' + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHHmmssSSS') + '-' + Utilities.getUuid().slice(0, 8);
}

function boolText_(v, defaultValue) {
  if (v === true || String(v).trim().toUpperCase() === 'TRUE') return true;
  if (v === false || String(v).trim().toUpperCase() === 'FALSE') return false;
  return defaultValue;
}

function validYm_(ym) {
  ym = String(ym || currentYm_()).trim();
  if (!ymToDate_(ym)) throw new Error('월 형식을 확인해줘. 예: 2026-06');
  return ym;
}

function adjustedDay_(ym, day) {
  day = Number(day);
  if (!isFinite(day) || Math.floor(day) !== day || day < 1 || day > 31) {
    throw new Error('결제일은 1~31 사이 정수로 입력해줘.');
  }
  return Math.min(day, daysInMonth_(ym));
}

function dateOfRecurring_(ym, day) {
  const d = ymToDate_(ym);
  return new Date(d.getFullYear(), d.getMonth(), adjustedDay_(ym, day));
}

function txObject_(rowValues, rowNo, map) {
  const spendingMood = map.spendingMood != null ? normalizeSpendingMeaning_(rowValues[map.spendingMood]) : DEFAULT_SPENDING_MEANING;
  return {
    row: rowNo,
    date: map.date != null ? dateText_(rowValues[map.date]) : '',
    type: map.type != null ? String(rowValues[map.type] || '') : '',
    cat: map.cat != null ? String(rowValues[map.cat] || '') : '',
    desc: map.desc != null ? String(rowValues[map.desc] || '') : '',
    amount: map.amount != null ? numParse_(rowValues[map.amount]) : 0,
    fixed: map.fixed != null ? String(rowValues[map.fixed] || '') : '',
    memo: map.memo != null ? String(rowValues[map.memo] || '') : '',
    user: map.user != null ? String(rowValues[map.user] || '') : '',
    txId: map.txId != null ? String(rowValues[map.txId] || '') : '',
    createdAt: map.createdAt != null ? dateTimeText_(rowValues[map.createdAt]) : '',
    updatedAt: map.updatedAt != null ? dateTimeText_(rowValues[map.updatedAt]) : '',
    updatedBy: map.updatedBy != null ? String(rowValues[map.updatedBy] || '') : '',
    spendingMood: spendingMood,
    meaning: spendingMood
  };
}

function getOrCreateLogSheet_(name, headers) {
  let sh = ss().getSheetByName(name);
  if (!sh) sh = ss().insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const lastCol = Math.max(1, sh.getLastColumn());
    const cur = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
    if (cur.join('|') !== headers.join('|')) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }
  return sh;
}

function appendActionLog_(action, user, content) {
  try {
    const sh = getOrCreateSheet_(SHEET_ACTION_LOG, ACTION_LOG_HEADERS);
    sh.appendRow([new Date(), String(action || ''), String(user || '웹앱'), String(content || '')]);
  } catch (e) {
    // 작업로그 문제가 본 기능을 막지 않도록 조용히 넘김
  }
}

function appendEditLog_(rowNo, oldTx, newTx) {
  const sh = getOrCreateLogSheet_(SHEET_EDIT_LOG, EDIT_LOG_HEADERS);
  sh.appendRow([
    new Date(), rowNo, newTx.user,
    oldTx.date, oldTx.type, oldTx.cat, oldTx.desc, oldTx.amount, oldTx.fixed, oldTx.memo, oldTx.user,
    newTx.date, newTx.type, newTx.cat, newTx.desc, newTx.amount, newTx.fixed, newTx.memo, newTx.user
  ]);
}

function appendDeleteLog_(rowNo, oldTx) {
  const sh = getOrCreateLogSheet_(SHEET_DELETE_LOG, DELETE_LOG_HEADERS);
  sh.appendRow([
    new Date(), rowNo, oldTx.user,
    oldTx.date, oldTx.type, oldTx.cat, oldTx.desc, oldTx.amount, oldTx.fixed, oldTx.memo, oldTx.user
  ]);
}

function median_(nums) {
  const arr = nums.filter(n => isFinite(n)).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
}

function pushAnomaly_(out, item) {
  if (out.length >= 30) return;
  out.push(item);
}

function detectAnomalies_(ym) {
  const { sh, map } = txMap_();
  const last = sh.getLastRow();
  if (last < 2) return { anomalies: [], invalidCount: 0 };
  const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  return detectAnomaliesFromValues_(ym, vals, map);
}

function detectAnomaliesFromValues_(ym, vals, map) {
  const anomalies = [];
  const validMonth = [];
  let invalidCount = 0;

  vals.forEach((r, i) => {
    if (isDeleted_(r, map)) return;
    const rowNo = i + 2;
    const rawDate = map.date != null ? r[map.date] : '';
    const parsedDate = parseDate_(rawDate);
    const rowYm = parsedDate ? Utilities.formatDate(parsedDate, TZ, 'yyyy-MM') : '';
    const type = map.type != null ? String(r[map.type] || '').trim() : '';
    const cat = map.cat != null ? String(r[map.cat] || '').trim() : '';
    const desc = map.desc != null ? String(r[map.desc] || '').trim() : '';
    const amount = map.amount != null ? numParse_(r[map.amount]) : 0;
    const inMonth = rowYm === ym;

    if (!parsedDate) {
      invalidCount++;
      pushAnomaly_(anomalies, {
        type: 'invalid_date',
        message: '날짜를 읽을 수 없는 거래가 있어. 월 집계에서 빠졌을 수 있어.',
        row: rowNo, amount: amount, category: cat, desc: desc
      });
    }
    if ((inMonth || !parsedDate) && (!type || !cat)) {
      invalidCount++;
      pushAnomaly_(anomalies, {
        type: 'missing_required',
        message: '구분 또는 대분류가 비어 있는 거래야. 분류를 확인해줘.',
        row: rowNo, amount: amount, category: cat, desc: desc
      });
    }
    if ((inMonth || !parsedDate) && !(amount > 0)) {
      invalidCount++;
      pushAnomaly_(anomalies, {
        type: 'invalid_amount',
        message: '금액이 0이거나 비정상인 거래야. 오입력인지 확인해줘.',
        row: rowNo, amount: amount, category: cat, desc: desc
      });
    }
    if (!inMonth || type !== '지출' || !(amount > 0)) return;

    const tx = txObject_(r, rowNo, map);
    validMonth.push(tx);
    if (amount >= 300000) {
      pushAnomaly_(anomalies, {
        type: 'large_transaction',
        message: cat + ' 단일 거래가 ' + won_(amount) + '이야. 오입력 또는 일회성 지출인지 확인해줘.',
        row: rowNo, amount: amount, category: cat, desc: desc
      });
    }
    if (cat === '식비' && amount >= 100000) {
      pushAnomaly_(anomalies, {
        type: 'large_food',
        message: '식비 단일 거래가 ' + won_(amount) + '이야. 회식/장보기인지 오입력인지 확인해줘.',
        row: rowNo, amount: amount, category: cat, desc: desc
      });
    }
  });

  const byCat = {};
  validMonth.forEach(t => {
    const cat = t.cat || '미분류';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(t);
  });
  Object.keys(byCat).forEach(cat => {
    const rows = byCat[cat];
    if (rows.length < 4) return;
    const med = median_(rows.map(t => t.amount));
    if (!(med > 0)) return;
    rows.forEach(t => {
      if (t.amount >= 50000 && t.amount >= med * 4) {
        pushAnomaly_(anomalies, {
          type: 'category_outlier',
          message: cat + ' 평균적인 거래보다 많이 큰 금액이야. 내역을 한 번 확인해줘.',
          row: t.row, amount: t.amount, category: cat, desc: t.desc
        });
      }
    });
  });

  return { anomalies: anomalies, invalidCount: invalidCount };
}

function buildSummaryFromRows_(ym, rows) {
  let income = 0, expense = 0, save = 0, repay = 0;
  let fixedExpense = 0, variableExpense = 0;
  const byCat = {};
  const byVariableCat = {};
  const byMeaning = {};
  rows.forEach(t => {
    const type = String(t.type || '').trim();
    const cat = String(t.cat || '').trim();
    const amt = numParse_(t.amount);
    if (type === '수입') income += amt;
    else if (type === '저축') save += amt;
    else if (type === '대출상환') repay += amt;
    else {
      expense += amt;
      if (cat) byCat[cat] = (byCat[cat] || 0) + amt;
      if (type === '지출' && String(t.fixed || '').trim() === '고정') {
        fixedExpense += amt;
      } else if (type === '지출') {
        variableExpense += amt;
        if (cat) byVariableCat[cat] = (byVariableCat[cat] || 0) + amt;
      }
      if (type === '지출') {
        const meaning = normalizeSpendingMeaning_(t.spendingMood || t.meaning);
        byMeaning[meaning] = (byMeaning[meaning] || 0) + amt;
      }
    }
  });
  const cats = Object.keys(byCat)
    .map(k => ({ cat: k, amt: byCat[k] }))
    .sort((a, b) => b.amt - a.amt);
  const variableTopCategories = Object.keys(byVariableCat)
    .map(k => ({ cat: k, amt: byVariableCat[k] }))
    .sort((a, b) => b.amt - a.amt);
  const meaningStats = SPENDING_MEANINGS
    .map(k => ({ meaning: k, amount: byMeaning[k] || 0 }))
    .filter(it => it.amount > 0);
  return {
    ym: ym || '',
    income: income,
    expense: expense,
    save: save,
    repay: repay,
    left: income - expense - save - repay,
    cats: cats,
    savingRate: income > 0 ? Math.round((save / income) * 100) : 0,
    fixedExpense: fixedExpense,
    variableExpense: variableExpense,
    fixedRatio: expense > 0 ? Math.round((fixedExpense / expense) * 100) : 0,
    variableRatio: expense > 0 ? Math.round((variableExpense / expense) * 100) : 0,
    variableTopCategories: variableTopCategories,
    meaningStats: meaningStats,
    anomalies: [],
    invalidCount: 0,
    count: rows.length
  };
}

function recentYmList_(monthsCount) {
  const count = Math.max(1, Math.min(24, Number(monthsCount) || 6));
  const out = [];
  const now = ymToDate_(currentYm_());
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(Utilities.formatDate(d, TZ, 'yyyy-MM'));
  }
  return out;
}

function getAssetTrend_(ymList) {
  try {
    const sh = ss().getSheetByName(SHEET_ASSET_SNAP);
    if (!sh || sh.getLastRow() < 2) return [];
    const vals = sh.getRange(2, 1, sh.getLastRow() - 1, ASSET_SNAPSHOT_HEADERS.length).getValues();
    const wanted = {};
    ymList.forEach(ym => { wanted[ym] = true; });
    const byYm = {};
    vals.forEach(r => {
      const ym = String(r[1] || '').trim();
      if (!wanted[ym]) return;
      if (r[8] == null || String(r[8]).trim() === '') return;
      const totalAsset = numParse_(r[8]);
      byYm[ym] = { ym: ym, totalAsset: totalAsset };
    });
    return ymList.map(ym => byYm[ym]).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function getTrendData(pin, monthsCount) {
  guard_(pin);
  const ymList = recentYmList_(monthsCount || 6);
  const buckets = {};
  ymList.forEach(ym => { buckets[ym] = []; });

  const { sh, map } = txMap_();
  const last = sh.getLastRow();
  if (last >= 2 && map.date != null) {
    const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    vals.forEach((r, i) => {
      if (isDeleted_(r, map)) return;
      const ym = ymOf_(r[map.date]);
      if (!buckets[ym]) return;
      buckets[ym].push(txObject_(r, i + 2, map));
    });
  }

  const months = ymList.map(ym => {
    const s = buildSummaryFromRows_(ym, buckets[ym] || []);
    return {
      ym: ym,
      income: s.income,
      expense: s.expense,
      save: s.save,
      loan: s.repay,
      left: s.left,
      fixedExpense: s.fixedExpense,
      variableExpense: s.variableExpense,
      savingRate: s.savingRate,
      topCats: (s.cats || []).slice(0, 5)
    };
  });
  return { months: months, assetSnapshots: getAssetTrend_(ymList) };
}

// ===== 정기거래 =====
function recurringSheet_() {
  return getOrCreateSheet_(SHEET_RECURRING, RECURRING_HEADERS);
}

function recurringMap_() {
  const sh = recurringSheet_();
  const headers = sh.getRange(1, 1, 1, RECURRING_HEADERS.length).getValues()[0].map(h => String(h).trim());
  const map = {};
  headers.forEach((h, i) => {
    if (h === '정기ID') map.id = i;
    else if (h === '정기명') map.name = i;
    else if (h === '구분') map.type = i;
    else if (h === '대분류') map.cat = i;
    else if (h === '내역') map.desc = i;
    else if (h === '금액') map.amount = i;
    else if (h === '고정/변동') map.fixed = i;
    else if (h === '메모') map.memo = i;
    else if (h === '입력자') map.user = i;
    else if (h === '결제일') map.day = i;
    else if (h === '사용여부') map.enabled = i;
    else if (h === '마지막실행월') map.lastRunYm = i;
  });
  return { sh: sh, map: map };
}

function recurringObject_(rowValues, rowNo, map) {
  return {
    row: rowNo,
    id: String(rowValues[map.id] || ''),
    name: String(rowValues[map.name] || ''),
    type: String(rowValues[map.type] || ''),
    cat: String(rowValues[map.cat] || ''),
    desc: String(rowValues[map.desc] || ''),
    amount: numParse_(rowValues[map.amount]),
    fixed: String(rowValues[map.fixed] || '고정') || '고정',
    memo: String(rowValues[map.memo] || ''),
    user: String(rowValues[map.user] || ''),
    day: Number(rowValues[map.day] || 1),
    enabled: boolText_(rowValues[map.enabled], true),
    lastRunYm: String(rowValues[map.lastRunYm] || '')
  };
}

function getRecurringsCore_() {
  const { sh, map } = recurringMap_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, RECURRING_HEADERS.length).getValues()
    .map((r, i) => recurringObject_(r, i + 2, map))
    .filter(r => r.id)
    .sort((a, b) => (b.enabled - a.enabled) || (a.day - b.day) || a.name.localeCompare(b.name));
}

function normalizeRecurring_(recurring) {
  recurring = recurring || {};
  const id = String(recurring.id || recurring.recurringId || '').trim();
  const name = String(recurring.name || recurring.recurringName || '').trim();
  const type = String(recurring.type || '').trim();
  const cat = String(recurring.cat || recurring.category || '').trim();
  const amount = numParse_(recurring.amount);
  const day = Number(recurring.day || recurring.paymentDay);
  const fixed = String(recurring.fixed || '고정').trim() || '고정';
  const user = normalizeUser_(recurring.user);
  const enabled = boolText_(recurring.enabled != null ? recurring.enabled : recurring.use, true);
  const lastRunYm = String(recurring.lastRunYm || recurring.lastRun || '').trim();
  if (id && id.indexOf('RC-') !== 0) throw new Error('정기ID 형식을 확인해줘.');
  if (!name) throw new Error('정기명을 입력해줘.');
  if (!type) throw new Error('구분을 입력해줘.');
  if (!cat) throw new Error('대분류를 입력해줘.');
  if (!(amount > 0)) throw new Error('금액은 0보다 큰 숫자로 입력해줘.');
  if (!isFinite(day) || Math.floor(day) !== day || day < 1 || day > 31) throw new Error('결제일은 1~31 사이 정수로 입력해줘.');
  if (lastRunYm && !ymToDate_(lastRunYm)) throw new Error('마지막실행월 형식을 확인해줘. 예: 2026-06');
  return {
    id: id,
    name: name,
    type: type,
    cat: cat,
    desc: String(recurring.desc || '').trim() || name,
    amount: amount,
    fixed: fixed,
    memo: String(recurring.memo || '').trim(),
    user: user,
    day: day,
    enabled: enabled,
    lastRunYm: lastRunYm
  };
}

function recurringRow_(recurring) {
  return [
    recurring.id,
    recurring.name,
    recurring.type,
    recurring.cat,
    recurring.desc,
    recurring.amount,
    recurring.fixed,
    recurring.memo,
    recurring.user,
    recurring.day,
    recurring.enabled,
    recurring.lastRunYm || ''
  ];
}

function recurringMemo_(recurring) {
  const source = '🔁 정기거래: ' + recurring.name;
  return recurring.memo ? recurring.memo + ' / ' + source : source;
}

function getRecurringStatusCore_() {
  try {
    const installed = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'recurringDailyCheck_');
    return { installed: installed };
  } catch (e) {
    return { installed: false, error: e.message || String(e) };
  }
}

function removeRecurringTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'recurringDailyCheck_') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  return removed;
}

function getRecurrings(pin) {
  guard_(pin);
  return { rows: getRecurringsCore_(), status: getRecurringStatusCore_() };
}

function saveRecurring(pin, recurring) {
  guard_(pin);
  const clean = normalizeRecurring_(recurring);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const { sh, map } = recurringMap_();
    if (!clean.id) {
      clean.id = makeRecurringId_();
      sh.appendRow(recurringRow_(clean));
    } else {
      const last = sh.getLastRow();
      let targetRow = 0;
      let oldLastRunYm = '';
      if (last >= 2) {
        const vals = sh.getRange(2, 1, last - 1, RECURRING_HEADERS.length).getValues();
        for (let i = 0; i < vals.length; i++) {
          if (String(vals[i][map.id] || '') === clean.id) {
            targetRow = i + 2;
            oldLastRunYm = String(vals[i][map.lastRunYm] || '');
            break;
          }
        }
      }
      if (!targetRow) throw new Error('수정할 정기거래를 찾지 못했어.');
      clean.lastRunYm = clean.lastRunYm || oldLastRunYm;
      sh.getRange(targetRow, 1, 1, RECURRING_HEADERS.length).setValues([recurringRow_(clean)]);
    }
    appendActionLog_('정기거래 저장', clean.user || '웹앱', clean.name);
    return { ok: true, rows: getRecurringsCore_(), status: getRecurringStatusCore_() };
  } finally {
    lock.releaseLock();
  }
}

function deleteRecurring(pin, recurringId) {
  guard_(pin);
  const id = String(recurringId || '').trim();
  if (!id) throw new Error('정기ID가 없어.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const { sh, map } = recurringMap_();
    const last = sh.getLastRow();
    if (last < 2) throw new Error('비활성화할 정기거래가 없어.');
    const vals = sh.getRange(2, 1, last - 1, RECURRING_HEADERS.length).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][map.id] || '') === id) {
        sh.getRange(i + 2, map.enabled + 1).setValue(false);
        appendActionLog_('정기거래 비활성화', '웹앱', id);
        return { ok: true, rows: getRecurringsCore_(), status: getRecurringStatusCore_() };
      }
    }
    throw new Error('비활성화할 정기거래를 찾지 못했어.');
  } finally {
    lock.releaseLock();
  }
}

function runRecurringForMonth_(ym, options) {
  ym = validYm_(ym);
  options = options || {};
  const onlyDay = options.onlyDay == null ? null : Number(options.onlyDay);
  const source = options.source || '웹앱';
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const { sh, map } = recurringMap_();
    const last = sh.getLastRow();
    const result = { ok: true, ym: ym, inserted: 0, skipped: 0, notDue: 0, errors: [] };
    if (last < 2) return result;
    const vals = sh.getRange(2, 1, last - 1, RECURRING_HEADERS.length).getValues();
    vals.forEach((r, i) => {
      const rowNo = i + 2;
      const recurring = recurringObject_(r, rowNo, map);
      if (!recurring.id || !recurring.enabled) return;
      const dueDay = adjustedDay_(ym, recurring.day);
      if (onlyDay != null && dueDay !== onlyDay) {
        result.notDue++;
        return;
      }
      if (recurring.lastRunYm === ym) {
        result.skipped++;
        return;
      }
      try {
        const clean = normalizeTxData_({
          date: dateOfRecurring_(ym, recurring.day),
          type: recurring.type,
          cat: recurring.cat,
          desc: recurring.desc || recurring.name,
          amount: recurring.amount,
          fixed: recurring.fixed || '고정',
          memo: recurringMemo_(recurring),
          user: recurring.user
        });
        addTxCore_(clean);
        sh.getRange(rowNo, map.lastRunYm + 1).setValue(ym);
        result.inserted++;
      } catch (e) {
        result.errors.push(recurring.name + ': ' + (e.message || String(e)));
      }
    });
    appendActionLog_('정기거래 실행', source, ym + ' 입력 ' + result.inserted + '건 / 건너뜀 ' + result.skipped + '건');
    return result;
  } finally {
    lock.releaseLock();
  }
}

function runRecurringNow(pin, ym) {
  guard_(pin);
  ym = validYm_(ym || currentYm_());
  const result = runRecurringForMonth_(ym, { source: '웹앱' });
  const tx = buildTxResponse_(ym);
  tx.inserted = result.inserted;
  tx.skipped = result.skipped;
  tx.notDue = result.notDue;
  tx.errors = result.errors;
  tx.recurrings = getRecurringsCore_();
  tx.recurringStatus = getRecurringStatusCore_();
  return tx;
}

function recurringDailyCheck_() {
  const now = new Date();
  const ym = Utilities.formatDate(now, TZ, 'yyyy-MM');
  const today = Number(Utilities.formatDate(now, TZ, 'd'));
  return runRecurringForMonth_(ym, { onlyDay: today, source: '자동화' });
}

function getRecurringStatus(pin) {
  guard_(pin);
  return getRecurringStatusCore_();
}

function installRecurringTrigger(pin) {
  guard_(pin);
  removeRecurringTriggers_();
  ScriptApp.newTrigger('recurringDailyCheck_').timeBased().everyDays(1).atHour(6).create();
  appendActionLog_('정기거래 자동입력 켜기', '웹앱', '매일 06시');
  return getRecurringStatusCore_();
}

function removeRecurringTrigger(pin) {
  guard_(pin);
  const removed = removeRecurringTriggers_();
  appendActionLog_('정기거래 자동입력 끄기', '웹앱', '제거 ' + removed + '개');
  return { installed: false, removed: removed };
}

// ===== 월별 예산 =====
function getBudget(pin, ym) {
  guard_(pin);
  ym = ym || currentYm_();
  return getBudgetProgress_(ym, getMonthSummary_(ym));
}

function normalizeBudgetItems_(items) {
  if (!Array.isArray(items)) throw new Error('예산 항목 형식이 올바르지 않아.');
  return items.map(it => ({
    category: String((it && it.category) || '').trim(),
    budget: numParse_(it && it.budget),
    memo: String((it && it.memo) || '').trim(),
    source: String((it && (it.source || it.recommendSource)) || '').trim()
  })).filter(it => it.category && it.budget > 0);
}

function budgetRow_(ym, item, oldRow, user, source) {
  const now = new Date();
  return [
    ym,
    item.category,
    numParse_(item.budget),
    String(item.memo || ''),
    oldRow && oldRow[4] ? oldRow[4] : now,
    now,
    String(user || '웹앱'),
    String(item.source || source || '')
  ];
}

function budgetMapFromRows_(rows) {
  const map = {};
  (rows || []).forEach(r => {
    const cat = String(r[1] || '').trim();
    if (cat) map[cat] = r;
  });
  return map;
}

function rewriteBudgetRows_(rows) {
  const sh = getOrCreateSheet_(SHEET_BUDGET, BUDGET_HEADERS);
  sh.clearContents();
  sh.getRange(1, 1, 1, BUDGET_HEADERS.length).setValues([BUDGET_HEADERS]);
  if (rows && rows.length) sh.getRange(2, 1, rows.length, BUDGET_HEADERS.length).setValues(rows);
}

function appendBudgetLog_(user, action, ym, category, oldBudget, newBudget, memo) {
  try {
    const sh = getOrCreateSheet_(SHEET_BUDGET_LOG, BUDGET_LOG_HEADERS);
    sh.appendRow([
      new Date(),
      String(user || '웹앱'),
      String(action || ''),
      String(ym || ''),
      String(category || ''),
      numParse_(oldBudget),
      numParse_(newBudget),
      String(memo || '')
    ]);
  } catch (e) {
    // 예산 로그 문제가 저장 자체를 막지 않도록 둔다.
  }
}

function updateBudget(pin, ym, items, options) {
  guard_(pin);
  ym = String(ym || currentYm_()).trim();
  if (!ymToDate_(ym)) throw new Error('예산 월 형식을 확인해줘. 예: 2026-06');
  options = options || {};
  const user = String(options.user || '웹앱').trim() || '웹앱';
  const action = String(options.action || '수동 예산 수정').trim() || '수동 예산 수정';
  const source = String(options.source || '').trim();
  const clean = normalizeBudgetItems_(items);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getOrCreateSheet_(SHEET_BUDGET, BUDGET_HEADERS);
    const vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, BUDGET_HEADERS.length).getValues() : [];
    const oldRows = vals.filter(r => String(r[0] || '').trim() === ym);
    const oldMap = budgetMapFromRows_(oldRows);
    const kept = vals.filter(r => String(r[0] || '').trim() !== ym);
    const newRows = clean.map(it => budgetRow_(ym, it, oldMap[it.category], user, source));
    const next = kept.concat(newRows);
    rewriteBudgetRows_(next);

    const newMap = budgetMapFromRows_(newRows);
    clean.forEach(it => {
      const oldBudget = oldMap[it.category] ? numParse_(oldMap[it.category][2]) : 0;
      if (oldBudget !== numParse_(it.budget) || String(oldMap[it.category] ? oldMap[it.category][3] || '' : '') !== String(it.memo || '')) {
        appendBudgetLog_(user, action, ym, it.category, oldBudget, it.budget, it.memo || source);
      }
    });
    Object.keys(oldMap).forEach(cat => {
      if (!newMap[cat]) appendBudgetLog_(user, action, ym, cat, numParse_(oldMap[cat][2]), 0, '삭제');
    });
    appendActionLog_(action, user, ym + ' 예산 ' + clean.length + '개 저장');
    return getBudgetProgress_(ym, getMonthSummary_(ym));
  } finally {
    lock.releaseLock();
  }
}

function getBudgetProgress_(ym, summary) {
  ym = ym || currentYm_();
  summary = summary || getMonthSummary_(ym);
  const sh = getOrCreateSheet_(SHEET_BUDGET, BUDGET_HEADERS);
  const spentMap = {};
  (summary.cats || []).forEach(c => { spentMap[c.cat] = numParse_(c.amt); });

  const vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, BUDGET_HEADERS.length).getValues() : [];
  const items = vals
    .filter(r => String(r[0] || '').trim() === ym)
    .map(r => {
      const category = String(r[1] || '').trim();
      const budget = numParse_(r[2]);
      const spent = spentMap[category] || 0;
      return {
        category: category,
        budget: budget,
        spent: spent,
        left: budget - spent,
        percent: budget > 0 ? Math.round((spent / budget) * 100) : 0,
        memo: String(r[3] || '')
      };
    })
    .filter(it => it.category && it.budget > 0)
    .sort((a, b) => b.percent - a.percent);

  const hasBudget = items.length > 0;
  const totalBudget = items.reduce((sum, it) => sum + it.budget, 0);
  const totalSpent = hasBudget ? items.reduce((sum, it) => sum + it.spent, 0) : numParse_(summary.expense);
  const totalLeft = hasBudget ? totalBudget - totalSpent : numParse_(summary.left);
  const daysLeft = daysLeftInMonth_(ym);
  const dayDivisor = Math.max(1, daysLeft);
  return {
    ym: ym,
    items: items,
    totalBudget: totalBudget,
    totalSpent: totalSpent,
    totalLeft: totalLeft,
    daysLeft: daysLeft,
    dailyAvailable: Math.floor(totalLeft / dayDivisor),
    hasBudget: hasBudget
  };
}

function budgetRowsForYm_(ym) {
  const sh = getOrCreateSheet_(SHEET_BUDGET, BUDGET_HEADERS);
  const vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, BUDGET_HEADERS.length).getValues() : [];
  return vals.filter(r => String(r[0] || '').trim() === ym && String(r[1] || '').trim() && numParse_(r[2]) > 0);
}

function copyBudgetCore_(fromYm, toYm, options) {
  fromYm = validYm_(fromYm);
  toYm = validYm_(toYm);
  options = options || {};
  const overwrite = options.overwrite === true;
  const user = String(options.user || '웹앱').trim() || '웹앱';
  const source = String(options.source || ('copy:' + fromYm)).trim();
  const sh = getOrCreateSheet_(SHEET_BUDGET, BUDGET_HEADERS);
  const vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, BUDGET_HEADERS.length).getValues() : [];
  const fromRows = vals.filter(r => String(r[0] || '').trim() === fromYm && String(r[1] || '').trim() && numParse_(r[2]) > 0);
  const toRows = vals.filter(r => String(r[0] || '').trim() === toYm && String(r[1] || '').trim() && numParse_(r[2]) > 0);
  const oldMap = budgetMapFromRows_(toRows);

  if (!fromRows.length) {
    return { ok: true, skipped: true, fromYm: fromYm, toYm: toYm, copied: 0, message: fromYm + ' 예산이 없어 복사하지 않았어.' };
  }
  if (toRows.length && !overwrite) {
    return {
      ok: false,
      needsOverwrite: true,
      needsOverwriteNextBudget: true,
      fromYm: fromYm,
      toYm: toYm,
      existingCount: toRows.length,
      message: '기존 예산을 덮어쓸까요?'
    };
  }

  const kept = vals.filter(r => String(r[0] || '').trim() !== toYm);
  const copied = fromRows.map(r => budgetRow_(toYm, {
    category: String(r[1] || '').trim(),
    budget: numParse_(r[2]),
    memo: String(r[3] || ''),
    source: source
  }, oldMap[String(r[1] || '').trim()], user, source));
  const next = kept.concat(copied);
  rewriteBudgetRows_(next);
  copied.forEach(r => {
    const cat = String(r[1] || '').trim();
    appendBudgetLog_(user, '예산 복사', toYm, cat, oldMap[cat] ? numParse_(oldMap[cat][2]) : 0, numParse_(r[2]), fromYm + '에서 복사');
  });
  const copiedMap = budgetMapFromRows_(copied);
  Object.keys(oldMap).forEach(cat => {
    if (!copiedMap[cat]) appendBudgetLog_(user, '예산 복사', toYm, cat, numParse_(oldMap[cat][2]), 0, '덮어쓰기 삭제');
  });
  appendActionLog_('예산 복사', user, fromYm + ' → ' + toYm + ' / ' + copied.length + '개');
  const summary = getMonthSummary_(toYm);
  const budget = getBudgetProgress_(toYm, summary);
  return {
    ok: true,
    skipped: false,
    fromYm: fromYm,
    toYm: toYm,
    copied: copied.length,
    overwritten: toRows.length > 0,
    budget: budget,
    insight: buildHomeInsight_(toYm, { summary: summary, budget: budget })
  };
}

function copyBudgetToNextMonthCore_(fromYm, overwriteNextBudget, user) {
  return copyBudgetCore_(fromYm, shiftYm_(fromYm, 1), {
    overwrite: overwriteNextBudget === true,
    user: user || '웹앱',
    source: '월마감 예산 복사'
  });
}

function copyBudget(pin, fromYm, toYm, options) {
  guard_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return copyBudgetCore_(fromYm, toYm, options || {});
  } finally {
    lock.releaseLock();
  }
}

function expenseCategoriesFromConfig_() {
  const cfg = getConfig_();
  const cats = (cfg.byType && cfg.byType['지출']) ? cfg.byType['지출'].slice() : [];
  const seen = {};
  return cats.filter(c => {
    if (!c || seen[c]) return false;
    seen[c] = true;
    return true;
  });
}

function expenseByCategoryForMonths_(ymList) {
  const wanted = {};
  ymList.forEach(ym => { wanted[ym] = true; });
  const out = {};
  ymList.forEach(ym => { out[ym] = {}; });
  const { sh, map } = txMap_();
  const last = sh.getLastRow();
  if (last < 2 || map.date == null) return out;
  const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  vals.forEach(r => {
    if (isDeleted_(r, map)) return;
    const ym = ymOf_(r[map.date]);
    if (!wanted[ym]) return;
    const type = map.type != null ? String(r[map.type] || '').trim() : '';
    if (type !== '지출') return;
    const cat = map.cat != null ? String(r[map.cat] || '').trim() : '';
    if (!cat) return;
    out[ym][cat] = (out[ym][cat] || 0) + numParse_(r[map.amount]);
  });
  return out;
}

function roundBudgetValue_(value, unit, mode) {
  value = Number(value) || 0;
  unit = Math.max(1, Number(unit) || 10000);
  if (value <= 0) return 0;
  if (mode === 'ceil') return Math.ceil(value / unit) * unit;
  return Math.round(value / unit) * unit;
}

function recommendBudget(pin, ym, options) {
  guard_(pin);
  ym = validYm_(ym || currentYm_());
  options = options || {};
  const months = Math.max(1, Math.min(12, Math.floor(Number(options.months) || 3)));
  const roundUnit = Math.max(1, Number(options.roundUnit) || 10000);
  const roundMode = String(options.roundMode || 'round').trim();
  const includeEmpty = options.includeCategoriesWithoutHistory !== false;
  const baseMonths = [];
  for (let i = months; i >= 1; i--) baseMonths.push(shiftYm_(ym, -i));

  const spentByMonth = expenseByCategoryForMonths_(baseMonths.concat([ym]));
  const lastYm = shiftYm_(ym, -1);
  const lastBudgetMap = budgetMapFromRows_(budgetRowsForYm_(lastYm));
  const currentBudgetMap = budgetMapFromRows_(budgetRowsForYm_(ym));
  const categories = {};

  baseMonths.forEach(m => {
    Object.keys(spentByMonth[m] || {}).forEach(cat => { categories[cat] = true; });
  });
  if (includeEmpty) {
    expenseCategoriesFromConfig_().forEach(cat => { categories[cat] = true; });
  }

  const items = Object.keys(categories).sort().map(cat => {
    const total = baseMonths.reduce((sum, m) => sum + numParse_((spentByMonth[m] || {})[cat]), 0);
    const avg = Math.round(total / months);
    const recommended = roundBudgetValue_(avg, roundUnit, roundMode);
    return {
      category: cat,
      avgSpent: avg,
      recommended: recommended,
      lastMonthSpent: numParse_((spentByMonth[lastYm] || {})[cat]),
      lastBudget: lastBudgetMap[cat] ? numParse_(lastBudgetMap[cat][2]) : 0,
      currentSpent: numParse_((spentByMonth[ym] || {})[cat]),
      currentBudget: currentBudgetMap[cat] ? numParse_(currentBudgetMap[cat][2]) : 0
    };
  }).filter(it => includeEmpty || it.avgSpent > 0 || it.currentSpent > 0 || it.lastBudget > 0);

  items.sort((a, b) => (b.recommended - a.recommended) || a.category.localeCompare(b.category));
  return {
    ok: true,
    ym: ym,
    baseMonths: baseMonths,
    months: months,
    roundUnit: roundUnit,
    roundMode: roundMode,
    items: items
  };
}

function getCloseMonthSheet_() {
  return getOrCreateSheet_(SHEET_CLOSE_MONTH, CLOSE_MONTH_HEADERS);
}

function closeMonthRecordFromRow_(r, rowNo) {
  return {
    row: rowNo,
    ym: String(r[0] || ''),
    closedAt: r[1] instanceof Date ? Utilities.formatDate(r[1], TZ, 'yyyy-MM-dd HH:mm') : String(r[1] || ''),
    user: String(r[2] || ''),
    income: numParse_(r[3]),
    expense: numParse_(r[4]),
    save: numParse_(r[5]),
    repay: numParse_(r[6]),
    left: numParse_(r[7]),
    savingRate: numParse_(r[8]),
    fixedExpense: numParse_(r[9]),
    variableExpense: numParse_(r[10]),
    totalAsset: numParse_(r[11]),
    anomalyCount: numParse_(r[12]),
    aiSummary: String(r[13] || ''),
    memo: String(r[14] || ''),
    backupUrl: String(r[15] || ''),
    goodSpending: String(r[16] || ''),
    regretSpending: String(r[17] || ''),
    nextPromise: String(r[18] || ''),
    jisuComment: String(r[19] || ''),
    hakongComment: String(r[20] || ''),
    checkTogether: String(r[21] || '')
  };
}

function getCloseMonthHistoryCore_(limit, ym) {
  const sh = getCloseMonthSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  limit = Math.max(1, Math.min(50, Number(limit) || 6));
  const vals = sh.getRange(2, 1, last - 1, CLOSE_MONTH_HEADERS.length).getValues();
  const rows = [];
  vals.forEach((r, i) => {
    if (ym && String(r[0] || '').trim() !== ym) return;
    rows.push(closeMonthRecordFromRow_(r, i + 2));
  });
  return rows.reverse().slice(0, limit);
}

function getCloseMonthHistory(pin, limit) {
  guard_(pin);
  return { ok: true, history: getCloseMonthHistoryCore_(limit || 6) };
}

function monthlyReviewRow_(ym, user, summary, assets, data) {
  data = data || {};
  return [
    ym,
    new Date(),
    String(user || '웹앱'),
    numParse_(summary.income),
    numParse_(summary.expense),
    numParse_(summary.save),
    numParse_(summary.repay),
    numParse_(summary.left),
    numParse_(summary.savingRate),
    numParse_(summary.fixedExpense),
    numParse_(summary.variableExpense),
    numParse_(assets && assets.total),
    (summary.anomalies || []).length,
    String(data.aiSummary || ''),
    String(data.memo || ''),
    String(data.backupUrl || ''),
    String(data.goodSpending || ''),
    String(data.regretSpending || ''),
    String(data.nextPromise || ''),
    String(data.jisuComment || ''),
    String(data.hakongComment || ''),
    String(data.checkTogether || '')
  ];
}

function monthlyReviewObject_(row, rowNo) {
  return closeMonthRecordFromRow_(row, rowNo);
}

function hasMonthlyReviewContent_(r) {
  return !![
    r.goodSpending,
    r.regretSpending,
    r.nextPromise,
    r.jisuComment,
    r.hakongComment,
    r.checkTogether,
    r.memo
  ].map(v => String(v || '').trim()).filter(Boolean).length;
}

function getMonthlyReviewHistoryCore_(limit, ym) {
  const rows = getCloseMonthHistoryCore_(Math.max(50, Number(limit || 6) * 4), ym);
  return rows.filter(hasMonthlyReviewContent_).slice(0, Math.max(1, Math.min(50, Number(limit) || 6)));
}

function getMonthlyReviewLatest_(ym) {
  const rows = getMonthlyReviewHistoryCore_(1, ym);
  return rows.length ? rows[0] : null;
}

function getMonthlyReview(pin, ym) {
  guard_(pin);
  ym = validYm_(ym || currentYm_());
  const summary = getMonthSummary_(ym);
  const budget = getBudgetProgress_(ym, summary);
  const assets = getAssets_();
  const review = getMonthlyReviewLatest_(ym);
  const overBudget = (budget.items || []).filter(it => it.left < 0).slice(0, 5);
  const recurring = recurringInsight_(ym, getRecurringsCore_());
  const checkItems = [];
  (summary.anomalies || []).slice(0, 3).forEach(a => {
    checkItems.push({
      type: 'anomaly',
      title: '확인해볼 지출',
      desc: (a.category || '-') + ' · ' + (a.desc || '-') + ' · ' + won_(a.amount),
      row: a.row
    });
  });
  overBudget.slice(0, 3).forEach(it => {
    checkItems.push({
      type: 'budget_over',
      title: it.category + ' 예산 초과',
      desc: won_(Math.abs(it.left)) + '만큼 예산을 넘겼어요.'
    });
  });
  if (recurring.notRun.length) {
    checkItems.push({
      type: 'recurring',
      title: '정기거래 반영 확인',
      desc: '이번 달 미실행 정기거래 ' + recurring.notRun.length + '건'
    });
  }
  return {
    ok: true,
    ym: ym,
    summary: summary,
    budget: budget,
    assets: assets,
    topCategories: (summary.cats || []).slice(0, 3),
    fixedVariable: {
      fixedExpense: numParse_(summary.fixedExpense),
      variableExpense: numParse_(summary.variableExpense),
      fixedRatio: numParse_(summary.fixedRatio),
      variableRatio: numParse_(summary.variableRatio)
    },
    checkItems: checkItems.slice(0, 5),
    latest: review,
    history: getMonthlyReviewHistoryCore_(6)
  };
}

function saveMonthlyReview(pin, data) {
  guard_(pin);
  data = data || {};
  const ym = validYm_(data.ym || currentYm_());
  const user = String(data.user || '웹앱').trim() || '웹앱';
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const summary = getMonthSummary_(ym);
    const assets = getAssets_();
    const sh = getCloseMonthSheet_();
    const row = monthlyReviewRow_(ym, user, summary, assets, data);
    sh.appendRow(row);
    appendActionLog_('월정리 저장', user, ym + ' 회고 기록 저장');
    return getMonthlyReview(pin, ym);
  } finally {
    lock.releaseLock();
  }
}

function getMonthlyReviewHistory(pin, limit) {
  guard_(pin);
  return { ok: true, history: getMonthlyReviewHistoryCore_(limit || 6) };
}

function aiSummaryText_(coaching) {
  const text = String(coaching || '').trim();
  if (!text) return '';
  const firstLine = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || text;
  return firstLine.slice(0, 500);
}

function getCloseMonthPreview(pin, ym) {
  guard_(pin);
  ym = validYm_(ym);
  const summary = getMonthSummary_(ym);
  const budget = getBudgetProgress_(ym, summary);
  const assets = getAssets_();
  const sameMonthHistory = getCloseMonthHistoryCore_(20, ym);
  const nextYm = shiftYm_(ym, 1);
  const currentBudgetRows = budgetRowsForYm_(ym);
  const nextBudgetRows = budgetRowsForYm_(nextYm);
  return {
    ok: true,
    ym: ym,
    nextYm: nextYm,
    summary: summary,
    budget: budget,
    anomalies: (summary.anomalies || []).slice(0, 12),
    assets: assets,
    hasCloseRecord: sameMonthHistory.length > 0,
    closeRecords: sameMonthHistory.slice(0, 6),
    aiReady: !!props_().getProperty('GROQ_API_KEY'),
    backupAvailable: true,
    copyBudget: {
      fromYm: ym,
      toYm: nextYm,
      currentCount: currentBudgetRows.length,
      nextCount: nextBudgetRows.length,
      hasCurrentBudget: currentBudgetRows.length > 0,
      nextBudgetExists: nextBudgetRows.length > 0
    }
  };
}

function elapsedDaysInMonth_(ym) {
  const first = ymToDate_(ym);
  if (!first) return 1;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const monthStart = new Date(first.getFullYear(), first.getMonth(), 1);
  const monthEnd = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  if (todayStart < monthStart) return 0;
  if (todayStart > monthEnd) return monthEnd.getDate();
  return todayStart.getDate();
}

function isCurrentMonth_(ym) {
  return String(ym || '') === currentYm_();
}

function compareYm_(a, b) {
  const da = ymToDate_(a);
  const db = ymToDate_(b);
  if (!da || !db) return 0;
  const av = da.getFullYear() * 12 + da.getMonth();
  const bv = db.getFullYear() * 12 + db.getMonth();
  return av === bv ? 0 : (av < bv ? -1 : 1);
}

function currentDayForYm_(ym) {
  const d = ymToDate_(ym);
  if (!d) return 1;
  if (isCurrentMonth_(ym)) {
    const today = new Date();
    return today.getDate();
  }
  return daysInMonth_(ym);
}

function addTask_(tasks, type, level, title, desc, action) {
  tasks.push({
    type: type,
    level: level || 'info',
    title: String(title || ''),
    desc: String(desc || ''),
    action: action || ''
  });
}

function getLatestAssetSnapshot_() {
  const sh = ss().getSheetByName(SHEET_ASSET_SNAP);
  if (!sh || sh.getLastRow() < 2) return null;
  const row = sh.getRange(sh.getLastRow(), 1, 1, ASSET_SNAPSHOT_HEADERS.length).getValues()[0];
  return {
    when: row[0] instanceof Date ? row[0] : null,
    ym: String(row[1] || ''),
    total: numParse_(row[8])
  };
}

function getLastBackupDate_() {
  const sh = ss().getSheetByName(SHEET_ACTION_LOG);
  if (!sh || sh.getLastRow() < 2) return null;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(4, sh.getLastColumn())).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    const action = String(vals[i][1] || '');
    if (action.indexOf('백업') > -1) {
      return vals[i][0] instanceof Date ? vals[i][0] : null;
    }
  }
  return null;
}

function daysSince_(dateVal) {
  if (!(dateVal instanceof Date) || isNaN(dateVal.getTime())) return null;
  const today = new Date();
  const a = new Date(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate()).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.floor((b - a) / 86400000);
}

function countUnassignedTransactions_(ym) {
  try {
    const { sh, map } = txMap_();
    const last = sh.getLastRow();
    if (last < 2 || map.date == null || map.user == null) return 0;
    const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    let count = 0;
    vals.forEach(r => {
      if (isDeleted_(r, map)) return;
      if (ymOf_(r[map.date]) !== ym) return;
      if (!String(r[map.user] || '').trim()) count++;
    });
    return count;
  } catch (e) {
    return 0;
  }
}

function recurringInsight_(ym, recurrings) {
  recurrings = recurrings || getRecurringsCore_();
  const todayDay = currentDayForYm_(ym);
  const monthPos = compareYm_(ym, currentYm_());
  const upcoming = [];
  const dueToday = [];
  const notRun = [];
  let remainingAmount = 0;

  recurrings.forEach(r => {
    if (!r.enabled) return;
    let dueDay = 1;
    try {
      dueDay = adjustedDay_(ym, r.day);
    } catch (e) {
      return;
    }
    const ran = String(r.lastRunYm || '') === ym;
    if (!ran) {
      notRun.push(r);
      if (monthPos === 0 && dueDay === todayDay) dueToday.push(r);
      if (monthPos > 0 || (monthPos === 0 && dueDay >= todayDay)) {
        upcoming.push(r);
        if (r.type !== '수입') remainingAmount += numParse_(r.amount);
      }
    }
  });

  return {
    upcoming: upcoming,
    dueToday: dueToday,
    notRun: notRun,
    remainingAmount: remainingAmount
  };
}

function getCashflowForecast_(ym, summary, budget, recurrings) {
  ym = validYm_(ym);
  summary = summary || getMonthSummary_(ym);
  budget = budget || getBudgetProgress_(ym, summary);
  const rec = recurringInsight_(ym, recurrings || getRecurringsCore_());
  const elapsedDays = Math.max(1, elapsedDaysInMonth_(ym));
  const daysLeft = Math.max(0, daysLeftInMonth_(ym));
  const variableExpense = numParse_(summary.variableExpense);
  const dailyVariableAvg = elapsedDays > 0 ? Math.round(variableExpense / elapsedDays) : 0;
  const expectedVariableRest = Math.round(dailyVariableAvg * daysLeft);

  // summary.left는 현재까지 입력된 거래 기준 남은 돈이고,
  // 아래 forecast는 남은 정기지출과 남은 기간 변동지출 추정치를 추가 반영한 월말 운영용 예측이다.
  const expectedMonthEndLeft =
    numParse_(summary.income)
    - numParse_(summary.expense)
    - numParse_(rec.remainingAmount)
    - expectedVariableRest
    - numParse_(summary.save)
    - numParse_(summary.repay);

  return {
    ym: ym,
    income: numParse_(summary.income),
    currentExpense: numParse_(summary.expense),
    currentSave: numParse_(summary.save),
    currentRepay: numParse_(summary.repay),
    remainingRecurring: numParse_(rec.remainingAmount),
    dailyVariableAvg: dailyVariableAvg,
    expectedVariableRest: expectedVariableRest,
    expectedMonthEndLeft: Math.round(expectedMonthEndLeft),
    daysLeft: daysLeft,
    elapsedDays: elapsedDays,
    confidence: summary.count > 0 ? 'rough' : 'low',
    hasData: summary.count > 0,
    upcomingRecurring: rec.upcoming.slice(0, 8)
  };
}

function getTodayTasks_(ym, context) {
  ym = validYm_(ym);
  context = context || {};
  const summary = context.summary || getMonthSummary_(ym);
  const budget = context.budget || getBudgetProgress_(ym, summary);
  const recurrings = context.recurrings || getRecurringsCore_();
  const tasks = [];
  const anomalies = summary.anomalies || [];
  const invalidCount = numParse_(summary.invalidCount);

  if (!budget.hasBudget) {
    addTask_(tasks, 'budget_missing', 'warning', ym + ' 예산이 아직 없어요', '지난달 예산 복사나 최근 3개월 추천으로 빠르게 만들 수 있어요.', 'budget');
  }
  if (isCurrentMonth_(ym) && daysLeftInMonth_(ym) <= 7 && budgetRowsForYm_(shiftYm_(ym, 1)).length === 0) {
    addTask_(tasks, 'next_budget_missing', 'info', '다음 달 예산 준비', '월말이 가까워요. 다음 달 예산을 미리 만들어두면 좋아요.', 'budget');
  }

  if (invalidCount > 0) {
    addTask_(tasks, 'invalid_transaction', 'danger', '거래 오류 후보 ' + invalidCount + '건', '날짜, 금액, 대분류가 비어 있거나 이상한 행을 확인해줘.', 'list');
  }
  if (anomalies.length > 0) {
    addTask_(tasks, 'anomaly', 'warning', '확인 필요한 이상지출 ' + anomalies.length + '건', '큰 지출이나 오입력 가능성이 있는 내역부터 확인해줘.', 'list');
  }

  (budget.items || []).forEach(it => {
    if (it.left < 0) {
      addTask_(tasks, 'budget_over', 'danger', it.category + ' 예산 초과', '예산보다 ' + won_(Math.abs(it.left)) + ' 더 썼어요.', 'budget');
    } else if (it.percent >= 80) {
      addTask_(tasks, 'budget_warning', 'warning', it.category + ' 예산 ' + it.percent + '% 사용', '남은 예산은 ' + won_(it.left) + '예요.', 'budget');
    }
  });
  if (budget.hasBudget) {
    const budgetCats = {};
    (budget.items || []).forEach(it => { budgetCats[it.category] = true; });
    (summary.cats || []).forEach(c => {
      if (!budgetCats[c.cat] && numParse_(c.amt) > 0) {
        addTask_(tasks, 'budget_zero_spent', 'warning', c.cat + ' 예산 없이 지출 발생', won_(c.amt) + ' 지출이 있어요. 예산 항목에 넣을지 확인해줘.', 'budget');
      }
    });
  }

  const rec = recurringInsight_(ym, recurrings);
  if (rec.dueToday.length) {
    addTask_(tasks, 'recurring_today', 'warning', '오늘 결제 예정 정기거래 ' + rec.dueToday.length + '건', rec.dueToday.slice(0, 3).map(r => r.name).join(', ') + ' 확인이 필요해요.', 'recurring');
  }
  if (rec.notRun.length) {
    addTask_(tasks, 'recurring_not_run', 'info', '이번 달 미실행 정기거래 ' + rec.notRun.length + '건', '정기거래 자동/수동 입력 여부를 확인해줘.', 'recurring');
  }

  const latestSnap = getLatestAssetSnapshot_();
  const snapDays = latestSnap ? daysSince_(latestSnap.when) : null;
  if (snapDays == null || snapDays >= 25) {
    addTask_(tasks, 'asset_snapshot_old', 'info', '자산 스냅샷 확인', snapDays == null ? '아직 저장된 자산 스냅샷이 없어요.' : '마지막 스냅샷 후 ' + snapDays + '일 지났어요.', 'asset');
  }

  const hasClose = getCloseMonthHistoryCore_(1, ym).length > 0;
  if (!hasClose) {
    addTask_(tasks, 'month_close_missing', 'info', ym + ' 월정리 기록 없음', '월말에는 월정리 화면에서 이번 달 기록을 남겨두면 좋아요.', 'review');
  }

  const unassigned = context.unassigned != null ? Number(context.unassigned) : countUnassignedTransactions_(ym);
  if (unassigned > 0) {
    addTask_(tasks, 'unassigned_user', 'info', '입력자 미지정 거래 ' + unassigned + '건', '지수/하콩 입력자를 채우면 분담 흐름을 더 정확히 볼 수 있어요.', 'list');
  }

  const lastBackup = getLastBackupDate_();
  const backupDays = lastBackup ? daysSince_(lastBackup) : null;
  if (backupDays == null || backupDays >= 30) {
    addTask_(tasks, 'backup_old', 'info', '백업 확인', backupDays == null ? '아직 백업 기록을 찾지 못했어요.' : '마지막 백업 후 ' + backupDays + '일 지났어요.', 'review');
  }

  const order = { danger: 0, warning: 1, info: 2 };
  tasks.sort((a, b) => (order[a.level] - order[b.level]) || a.title.localeCompare(b.title));
  return { tasks: tasks.slice(0, 12) };
}

function getMonthlyStatusLine_(ym, summary, budget, forecast, tasksObj) {
  summary = summary || getMonthSummary_(ym);
  budget = budget || getBudgetProgress_(ym, summary);
  forecast = forecast || getCashflowForecast_(ym, summary, budget);
  const tasks = (tasksObj && tasksObj.tasks) || [];
  const over = (budget.items || []).filter(it => it.left < 0).sort((a, b) => a.left - b.left);
  const anomalyCount = (summary.anomalies || []).length;
  const expectedLeft = numParse_(forecast.expectedMonthEndLeft);
  const savingGood = numParse_(summary.savingRate) >= 20;

  if (over.length) {
    return over[0].category + ' 예산을 ' + won_(Math.abs(over[0].left)) + ' 넘겼어요. 오늘은 초과 항목부터 확인하는 게 좋아요.';
  }
  if (anomalyCount > 0) {
    return '확인 필요한 큰 지출이 ' + anomalyCount + '건 있어요. 먼저 내역 확인부터 해보는 게 좋아요.';
  }
  if (forecast.hasData && expectedLeft < 0) {
    return '현재 속도면 월말에 약 ' + won_(Math.abs(expectedLeft)) + ' 부족할 수 있어요. 남은 변동비를 조금 조이면 좋아요.';
  }
  if (savingGood && forecast.hasData) {
    return '저축률은 괜찮아요. 현재 속도면 월말에 약 ' + won_(expectedLeft) + ' 남을 가능성이 있어요.';
  }
  if (budget.hasBudget && budget.totalLeft >= 0 && forecast.hasData) {
    return '이번 달은 예산 안에서 움직이고 있어요. 현재 속도면 월말에 약 ' + won_(expectedLeft) + ' 남을 가능성이 있어요.';
  }
  if (tasks.length) {
    return '오늘은 ' + tasks[0].title + '부터 확인하면 좋아요.';
  }
  return '오늘은 확인할 일이 없어요. 흐름 좋아요.';
}

function buildHomeInsight_(ym, context) {
  context = context || {};
  const summary = context.summary || getMonthSummary_(ym);
  const budget = context.budget || getBudgetProgress_(ym, summary);
  const recurrings = context.recurrings || getRecurringsCore_();
  const forecast = getCashflowForecast_(ym, summary, budget, recurrings);
  const tasksObj = getTodayTasks_(ym, { summary: summary, budget: budget, recurrings: recurrings, unassigned: context.unassigned });
  const statusLine = getMonthlyStatusLine_(ym, summary, budget, forecast, tasksObj);
  return {
    tasks: tasksObj.tasks,
    forecast: forecast,
    statusLine: statusLine
  };
}

function getTodayTasks(pin, ym) {
  guard_(pin);
  return getTodayTasks_(ym || currentYm_());
}

function getCashflowForecast(pin, ym) {
  guard_(pin);
  ym = validYm_(ym || currentYm_());
  const summary = getMonthSummary_(ym);
  const budget = getBudgetProgress_(ym, summary);
  return getCashflowForecast_(ym, summary, budget, getRecurringsCore_());
}

function getHomeInsight(pin, ym) {
  guard_(pin);
  ym = validYm_(ym || currentYm_());
  return buildHomeInsight_(ym);
}

function closeMonth(pin, options) {
  guard_(pin);
  const opt = options || {};
  const ym = validYm_(opt.ym);
  const user = String(opt.user || '').trim() || '웹앱';
  const memo = String(opt.memo || '').trim();
  const saveAsset = opt.saveAssetSnapshot === true;
  const runAi = opt.runAi === true;
  const copyBudget = opt.copyBudgetToNextMonth === true;
  const createBackupFlag = opt.createBackup === true;
  const overwriteNextBudget = opt.overwriteNextBudget === true;

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (copyBudget) {
      const nextYm = shiftYm_(ym, 1);
      const currentBudget = budgetRowsForYm_(ym);
      const existingNextBudget = budgetRowsForYm_(nextYm);
      if (currentBudget.length && existingNextBudget.length && !overwriteNextBudget) {
        return {
          ok: false,
          needsOverwriteNextBudget: true,
          ym: ym,
          message: '다음 달 예산이 이미 있어요. 덮어쓸까요?',
          copyBudget: {
            ok: false,
            needsOverwriteNextBudget: true,
            fromYm: ym,
            toYm: nextYm,
            existingCount: existingNextBudget.length,
            message: '다음 달 예산이 이미 있어요. 덮어쓸까요?'
          },
          preview: getCloseMonthPreview(pin, ym)
        };
      }
    }

    const summary = getMonthSummary_(ym);
    const budget = getBudgetProgress_(ym, summary);
    const assets = getAssets_();
    const result = {
      ok: true,
      ym: ym,
      actions: [],
      warnings: [],
      errors: [],
      summary: summary,
      budget: budget,
      assets: assets,
      anomalyCount: (summary.anomalies || []).length
    };

    if (saveAsset) {
      try {
        const snap = saveAssetSnapshotCore_(ym, '월마감' + (memo ? ' - ' + memo : ''), user);
        result.assetSnapshot = snap;
        result.assetSnapshots = snap.snapshots || [];
        result.actions.push('자산 스냅샷 저장');
      } catch (e) {
        result.warnings.push('자산 스냅샷을 저장하지 못했어: ' + e.message);
      }
    }

    if (runAi) {
      if (!props_().getProperty('GROQ_API_KEY')) {
        result.aiSkipped = true;
        result.warnings.push('AI 키가 없어 AI 분석은 건너뛸게요.');
      } else {
        try {
          const ai = runAiAnalysisCore_(ym);
          result.ai = ai;
          result.aiHistory = getAiHistory_(8);
          result.actions.push('AI 분석 실행');
        } catch (e) {
          result.warnings.push('AI 분석을 완료하지 못했어: ' + e.message);
        }
      }
    }

    if (copyBudget) {
      try {
        const copied = copyBudgetToNextMonthCore_(ym, overwriteNextBudget, user);
        if (copied.needsOverwriteNextBudget) {
          return {
            ok: false,
            needsOverwriteNextBudget: true,
            ym: ym,
            message: copied.message,
            copyBudget: copied,
            preview: getCloseMonthPreview(pin, ym)
          };
        }
        result.copyBudget = copied;
        result.actions.push(copied.skipped ? '다음 달 예산 복사 건너뜀' : '다음 달 예산 복사');
      } catch (e) {
        result.warnings.push('다음 달 예산 복사를 완료하지 못했어: ' + e.message);
      }
    }

    if (createBackupFlag) {
      try {
        const backup = createBackupCore_();
        result.backup = backup;
        result.actions.push('백업 생성');
      } catch (e) {
        result.backupError = e.message;
        result.warnings.push('백업을 만들지 못했어: ' + e.message);
      }
    }

    const sh = getCloseMonthSheet_();
    const backupUrl = result.backup && result.backup.url ? result.backup.url : '';
    const aiSummary = result.ai ? aiSummaryText_(result.ai.coaching) : (result.aiSkipped ? 'AI 키 없음' : '');
    const totalAsset = result.assetSnapshot ? numParse_(result.assetSnapshot.totalAsset) : numParse_(assets.total);
    sh.appendRow([
      ym,
      new Date(),
      user,
      numParse_(summary.income),
      numParse_(summary.expense),
      numParse_(summary.save),
      numParse_(summary.repay),
      numParse_(summary.left),
      numParse_(summary.savingRate),
      numParse_(summary.fixedExpense),
      numParse_(summary.variableExpense),
      totalAsset,
      (summary.anomalies || []).length,
      aiSummary,
      memo,
      backupUrl
    ]);

    result.closeRecord = closeMonthRecordFromRow_(
      [ym, new Date(), user, summary.income, summary.expense, summary.save, summary.repay, summary.left, summary.savingRate, summary.fixedExpense, summary.variableExpense, totalAsset, (summary.anomalies || []).length, aiSummary, memo, backupUrl],
      sh.getLastRow()
    );
    result.history = getCloseMonthHistoryCore_(6);
    result.insight = buildHomeInsight_(ym, { summary: summary, budget: budget, recurrings: getRecurringsCore_() });
    appendActionLog_('월마감 실행', user, ym + ' 월마감 완료: ' + (result.actions.join(', ') || '기록 저장'));
    return result;
  } finally {
    lock.releaseLock();
  }
}

// ===== 자주 쓰는 거래 템플릿 =====
function getTemplates(pin) {
  guard_(pin);
  return { ok: true, templates: getTemplatesCore_() };
}

function getTemplatesCore_() {
  const sh = getOrCreateSheet_(SHEET_TEMPLATE, TEMPLATE_HEADERS, DEFAULT_TEMPLATES);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, TEMPLATE_HEADERS.length).getValues();
  return vals.map((r, i) => ({
    row: i + 2,
    name: String(r[0] || '').trim(),
    type: String(r[1] || '').trim(),
    cat: String(r[2] || '').trim(),
    desc: String(r[3] || '').trim(),
    amount: numParse_(r[4]),
    fixed: String(r[5] || '변동').trim() || '변동',
    memo: String(r[6] || '').trim(),
    active: r[7] === true || String(r[7]).trim().toUpperCase() === 'TRUE'
  })).filter(t => t.name && t.active);
}

function normalizeTemplate_(template) {
  const t = template || {};
  const name = String(t.name || t.templateName || '').trim();
  const type = String(t.type || '지출').trim();
  const cat = String(t.cat || t.category || '').trim();
  const desc = String(t.desc || name || cat).trim();
  const amount = numParse_(t.amount != null ? t.amount : t.defaultAmount);
  const fixed = String(t.fixed || '변동').trim() || '변동';
  const memo = String(t.memo || '웹앱').trim() || '웹앱';
  if (!name) throw new Error('템플릿명을 입력해줘.');
  if (!type) throw new Error('템플릿 구분을 입력해줘.');
  if (!cat) throw new Error('템플릿 대분류를 입력해줘.');
  if (amount < 0) throw new Error('템플릿 금액은 0 이상으로 입력해줘.');
  return { name: name, type: type, cat: cat, desc: desc, amount: amount, fixed: fixed, memo: memo, active: true };
}

function saveTemplate(pin, template) {
  guard_(pin);
  const clean = normalizeTemplate_(template);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getOrCreateSheet_(SHEET_TEMPLATE, TEMPLATE_HEADERS, DEFAULT_TEMPLATES);
    const last = sh.getLastRow();
    let targetRow = 0;
    if (last >= 2) {
      const names = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < names.length; i++) {
        if (String(names[i][0] || '').trim() === clean.name) {
          targetRow = i + 2;
          break;
        }
      }
    }
    const row = [clean.name, clean.type, clean.cat, clean.desc, clean.amount, clean.fixed, clean.memo, true];
    if (targetRow) sh.getRange(targetRow, 1, 1, TEMPLATE_HEADERS.length).setValues([row]);
    else sh.appendRow(row);
    return { ok: true, templates: getTemplatesCore_() };
  } finally {
    lock.releaseLock();
  }
}

function deleteTemplate(pin, templateName) {
  guard_(pin);
  const name = String(templateName || '').trim();
  if (!name) throw new Error('삭제할 템플릿명을 확인해줘.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getOrCreateSheet_(SHEET_TEMPLATE, TEMPLATE_HEADERS, DEFAULT_TEMPLATES);
    const last = sh.getLastRow();
    if (last >= 2) {
      const names = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < names.length; i++) {
        if (String(names[i][0] || '').trim() === name) {
          sh.getRange(i + 2, 8).setValue(false);
          break;
        }
      }
    }
    return { ok: true, templates: getTemplatesCore_() };
  } finally {
    lock.releaseLock();
  }
}


function readTxSnapshot_() {
  const info = txMap_(true);
  assertTxCore_(info.map);
  const last = info.sh.getLastRow();
  const values = last >= 2
    ? info.sh.getRange(2, 1, last - 1, info.lastCol).getValues()
    : [];
  return { sh: info.sh, map: info.map, lastCol: info.lastCol, values: values };
}

function monthSummaryFromSnapshot_(ym, snapshot) {
  const rows = [];
  const map = snapshot.map;
  snapshot.values.forEach((r, i) => {
    if (isDeleted_(r, map)) return;
    if (ymOf_(r[map.date]) !== ym) return;
    rows.push(txObject_(r, i + 2, map));
  });
  const summary = buildSummaryFromRows_(ym, rows);
  const detected = detectAnomaliesFromValues_(ym, snapshot.values, map);
  summary.anomalies = detected.anomalies;
  summary.invalidCount = detected.invalidCount;
  return summary;
}

function recentFromSnapshot_(snapshot, n) {
  const out = [];
  const map = snapshot.map;
  for (let i = snapshot.values.length - 1; i >= 0; i--) {
    const r = snapshot.values[i];
    if (isDeleted_(r, map)) continue;
    out.push(txObject_(r, i + 2, map));
    if (out.length >= n) break;
  }
  return out;
}

function countUnassignedFromSnapshot_(ym, snapshot) {
  const map = snapshot.map;
  if (map.user == null) return 0;
  let count = 0;
  snapshot.values.forEach(r => {
    if (isDeleted_(r, map)) return;
    if (ymOf_(r[map.date]) !== ym) return;
    if (!String(r[map.user] || '').trim()) count++;
  });
  return count;
}

function getFastMonthData(pin, ym) {
  guard_(pin);
  ym = validYm_(ym || currentYm_());
  const snapshot = readTxSnapshot_();
  const summary = monthSummaryFromSnapshot_(ym, snapshot);
  const budget = getBudgetProgress_(ym, summary);
  const recurrings = getRecurringsCore_();
  const unassigned = countUnassignedFromSnapshot_(ym, snapshot);
  return {
    ok: true,
    ym: ym,
    summary: summary,
    budget: budget,
    recent: recentFromSnapshot_(snapshot, 20),
    insight: buildHomeInsight_(ym, {
      summary: summary,
      budget: budget,
      recurrings: recurrings,
      unassigned: unassigned
    })
  };
}

function buildTxResponse_(ym) {
  const summary = getMonthSummary_(ym);
  const budget = getBudgetProgress_(ym, summary);
  const monthTx = getTransactionsCore_({ ym: ym, mode: 'month', limit: 1000 });
  return {
    ok: true,
    ym: ym,
    summary: summary,
    budget: budget,
    recent: getRecent_(20),
    transactions: monthTx.rows,
    count: monthTx.count,
    insight: buildHomeInsight_(ym, { summary: summary, budget: budget })
  };
}

// ===== 최초 부팅: 화면 그릴 데이터 한 방에 =====
function getBoot(pin) {
  guard_(pin);
  txMap_(true);
  const ym = currentYm_();
  const summary = getMonthSummary_(ym);
  const budget = getBudgetProgress_(ym, summary);
  const recurrings = getRecurringsCore_();
  return {
    ym: ym,
    config: getConfig_(),
    summary: summary,
    budget: budget,
    recent: getRecent_(20),
    transactions: getTransactionsCore_({ mode: 'recent', limit: 20 }).rows,
    assets: getAssets_(),
    templates: getTemplatesCore_(),
    recurrings: recurrings,
    recurringStatus: getRecurringStatusCore_(),
    assetSnapshots: getAssetSnapshotsCore_(6),
    aiReady: !!props_().getProperty('GROQ_API_KEY'),
    aiHistory: getAiHistory_(8),
    closeHistory: getCloseMonthHistoryCore_(6),
    insight: buildHomeInsight_(ym, { summary: summary, budget: budget, recurrings: recurrings })
  };
}

// ===== 월 이동 시 데이터 갱신 =====
function getMonthData(pin, ym) {
  guard_(pin);
  ym = ym || currentYm_();
  const summary = getMonthSummary_(ym);
  const budget = getBudgetProgress_(ym, summary);
  const recurrings = getRecurringsCore_();
  const monthTx = getTransactionsCore_({ ym: ym, mode: 'month', limit: 1000 });
  return {
    ym: ym,
    summary: summary,
    budget: budget,
    recent: getRecent_(20),
    transactions: monthTx.rows,
    count: monthTx.count,
    closeHistory: getCloseMonthHistoryCore_(6),
    insight: buildHomeInsight_(ym, { summary: summary, budget: budget, recurrings: recurrings })
  };
}

// ===== 설정탭 -> 드롭다운 데이터 =====
function getConfig_() {
  const sh = ss().getSheetByName(SHEET_CONFIG);
  if (!sh) return { types: ['지출', '수입', '저축', '대출상환'], byType: {} };
  const vals = sh.getDataRange().getValues();
  const byType = {};
  const order = [];
  for (let i = 1; i < vals.length; i++) {
    const type = String(vals[i][0]).trim();
    const cat = String(vals[i][1]).trim();
    if (!type || !cat) continue;
    if (!byType[type]) { byType[type] = []; order.push(type); }
    if (byType[type].indexOf(cat) === -1) byType[type].push(cat);
  }
  // 입력 편의를 위해 지출을 맨 앞으로
  order.sort((a, b) => (a === '지출' ? -1 : b === '지출' ? 1 : 0));
  return { types: order, byType: byType };
}

// ===== 월별 집계 (삭제여부 TRUE 제외) =====
function getMonthSummary_(ym) {
  const empty = buildSummaryFromRows_(ym, []);
  const { sh, map } = txMap_(true);
  const last = sh.getLastRow();
  if (last < 2 || map.date == null) return empty;

  const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const rows = [];
  vals.forEach((r, i) => {
    if (isDeleted_(r, map)) return;
    if (ymOf_(r[map.date]) !== ym) return;
    rows.push(txObject_(r, i + 2, map));
  });
  const summary = buildSummaryFromRows_(ym, rows);
  const detected = detectAnomaliesFromValues_(ym, vals, map);
  summary.anomalies = detected.anomalies;
  summary.invalidCount = detected.invalidCount;
  return summary;
}

// ===== 최근 거래 n건 (최신 먼저, 삭제 제외) =====
function getRecent_(n) {
  const { sh, map } = txMap_(true);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const out = [];
  for (let i = vals.length - 1; i >= 0; i--) {
    const r = vals[i];
    if (isDeleted_(r, map)) continue;
    out.push(txObject_(r, i + 2, map));
    if (out.length >= n) break;
  }
  return out;
}

// ===== 거래 검색/필터/월 전체 =====
function getTransactions(pin, options) {
  guard_(pin);
  return getTransactionsCore_(options || {});
}

function getTransactionsCore_(options) {
  const opt = options || {};
  const mode = String(opt.mode || 'recent').trim() || 'recent';
  const ym = String(opt.ym || currentYm_()).trim();
  const rawLimit = Number(opt.limit || 300);
  const limit = Math.max(1, Math.min(1000, isFinite(rawLimit) ? Math.floor(rawLimit) : 300));
  const query = String(opt.query || '').trim().toLowerCase();
  const writer = String(opt.writer || '').trim();
  const typeFilter = String(opt.type || '').trim();
  const catFilter = String(opt.category || '').trim();
  const rawMeaningFilter = String(opt.spendingMood || opt.meaning || '').trim();
  const meaningFilter = rawMeaningFilter && rawMeaningFilter !== '전체' ? normalizeSpendingMeaning_(rawMeaningFilter) : '';
  const hasMin = opt.minAmount != null && String(opt.minAmount).trim() !== '';
  const hasMax = opt.maxAmount != null && String(opt.maxAmount).trim() !== '';
  const minAmount = hasMin ? numParse_(opt.minAmount) : null;
  const maxAmount = hasMax ? numParse_(opt.maxAmount) : null;

  const { sh, map } = txMap_(true);
  const last = sh.getLastRow();
  if (last < 2) return { rows: [], count: 0, summary: buildSummaryFromRows_(ym, []) };

  const vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const rows = [];
  vals.forEach((r, i) => {
    if (isDeleted_(r, map)) return;
    const tx = txObject_(r, i + 2, map);
    const rowYm = map.date != null ? ymOf_(r[map.date]) : '';

    if (mode === 'month' || mode === 'search') {
      if (ym && rowYm !== ym) return;
    }
    if (mode === 'search') {
      if (query) {
        const hay = [tx.date, tx.type, tx.cat, tx.desc, tx.memo, tx.user, tx.spendingMood, tx.amount].join(' ').toLowerCase();
        if (hay.indexOf(query) === -1) return;
      }
      if (writer && writer !== '전체') {
        if (writer === '미지정') {
          if (tx.user) return;
        } else if (tx.user !== writer) return;
      }
      if (typeFilter && typeFilter !== '전체' && tx.type !== typeFilter) return;
      if (catFilter && catFilter !== '전체' && tx.cat !== catFilter) return;
      if (meaningFilter && tx.spendingMood !== meaningFilter) return;
      if (hasMin && tx.amount < minAmount) return;
      if (hasMax && tx.amount > maxAmount) return;
    }
    rows.push(tx);
  });

  rows.sort((a, b) => b.row - a.row);
  const limited = rows.slice(0, limit);
  return {
    rows: limited,
    count: mode === 'recent' ? limited.length : rows.length,
    summary: buildSummaryFromRows_(ym, rows)
  };
}

function normalizeClientTxId_(value) {
  const id = String(value || '').trim();
  if (!id) return makeTxId_();
  if (!/^[A-Za-z0-9._:-]{8,140}$/.test(id)) throw new Error('거래 요청 ID 형식이 올바르지 않아.');
  return id;
}

function buildTxRow_(clean, map, lastCol, txId, createdAt) {
  const row = new Array(lastCol).fill('');
  row[map.date] = clean.date;
  row[map.type] = clean.type;
  row[map.cat] = clean.cat;
  row[map.desc] = clean.desc;
  row[map.amount] = clean.amount;
  row[map.fixed] = clean.fixed;
  row[map.memo] = clean.memo;
  if (map.user != null) row[map.user] = clean.user;
  if (map.txId != null) row[map.txId] = txId || makeTxId_();
  if (map.createdAt != null) row[map.createdAt] = createdAt || new Date();
  if (map.deleted != null) row[map.deleted] = false;
  if (map.spendingMood != null) row[map.spendingMood] = clean.spendingMood;
  return row;
}

function txResultFromClean_(clean, rowNo, txId, createdAt) {
  return {
    row: rowNo,
    date: dateText_(clean.date),
    type: clean.type,
    cat: clean.cat,
    desc: clean.desc,
    amount: clean.amount,
    fixed: clean.fixed,
    memo: clean.memo,
    user: clean.user,
    txId: txId,
    createdAt: dateTimeText_(createdAt),
    updatedAt: '',
    updatedBy: '',
    spendingMood: clean.spendingMood,
    meaning: clean.spendingMood
  };
}

function addTxCore_(clean, externalTxId) {
  const info = txMap_(true);
  assertTxCore_(info.map);
  const txId = normalizeClientTxId_(externalTxId || makeTxId_());
  const createdAt = new Date();
  const row = buildTxRow_(clean, info.map, info.lastCol, txId, createdAt);
  info.sh.appendRow(row);
  const rowNo = info.sh.getLastRow();
  return {
    row: rowNo,
    ym: ymOf_(clean.date),
    txId: txId,
    transaction: txResultFromClean_(clean, rowNo, txId, createdAt)
  };
}

// ===== 빠른 일괄 거래 추가: 저장만 끝내고 월 집계는 별도 호출 =====
function addTransactionsFast(pin, items) {
  guard_(pin);
  if (!Array.isArray(items) || items.length === 0) throw new Error('저장할 거래가 없어.');
  if (items.length > 50) throw new Error('한 번에 최대 50건까지 저장할 수 있어.');

  const prepared = items.map((item, index) => {
    const raw = item || {};
    let clientId = '';
    try {
      clientId = normalizeClientTxId_(raw.clientId || raw.txId || makeTxId_());
      return { index: index, clientId: clientId, clean: normalizeTxData_(raw.data || raw), error: '' };
    } catch (e) {
      return { index: index, clientId: clientId || String(raw.clientId || ''), clean: null, error: e.message || '입력값을 확인해줘.' };
    }
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let response;
  try {
    const info = txMap_(true);
    assertTxCore_(info.map);
    const lastRow = info.sh.getLastRow();
    const existingValues = lastRow >= 2
      ? info.sh.getRange(2, 1, lastRow - 1, info.lastCol).getValues()
      : [];
    const existingById = {};
    if (info.map.txId != null) {
      existingValues.forEach((row, i) => {
        const id = String(row[info.map.txId] || '').trim();
        if (id && !existingById[id]) existingById[id] = { row: i + 2, values: row };
      });
    }

    const newRows = [];
    const planned = {};
    const results = new Array(prepared.length);
    const createdAt = new Date();
    let duplicates = 0;
    let failed = 0;

    prepared.forEach(entry => {
      if (entry.error || !entry.clean) {
        failed++;
        results[entry.index] = { ok: false, clientId: entry.clientId, error: entry.error || '입력값 오류' };
        return;
      }
      const existing = existingById[entry.clientId];
      if (existing) {
        duplicates++;
        results[entry.index] = {
          ok: true,
          duplicate: true,
          clientId: entry.clientId,
          row: existing.row,
          txId: entry.clientId,
          ym: ymOf_(existing.values[info.map.date]),
          transaction: txObject_(existing.values, existing.row, info.map)
        };
        return;
      }
      if (planned[entry.clientId]) {
        duplicates++;
        results[entry.index] = planned[entry.clientId];
        return;
      }

      const rowNo = lastRow + newRows.length + 1;
      const row = buildTxRow_(entry.clean, info.map, info.lastCol, entry.clientId, createdAt);
      const result = {
        ok: true,
        duplicate: false,
        clientId: entry.clientId,
        row: rowNo,
        txId: entry.clientId,
        ym: ymOf_(entry.clean.date),
        transaction: txResultFromClean_(entry.clean, rowNo, entry.clientId, createdAt)
      };
      newRows.push(row);
      planned[entry.clientId] = result;
      results[entry.index] = result;
    });

    if (newRows.length) {
      info.sh.getRange(lastRow + 1, 1, newRows.length, info.lastCol).setValues(newRows);
    }
    response = {
      ok: failed === 0,
      inserted: newRows.length,
      duplicates: duplicates,
      failed: failed,
      results: results
    };
  } finally {
    lock.releaseLock();
  }

  if (response.inserted > 0) {
    appendActionLog_('빠른 거래 입력', '웹앱', response.inserted + '건 저장 / 중복 ' + response.duplicates + '건');
  }
  return response;
}

// ===== 기존 단건 거래 추가 API도 호환 유지 =====
function addTransaction(pin, data) {
  guard_(pin);
  const clean = normalizeTxData_(data);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let added;
  try {
    added = addTxCore_(clean);
  } finally {
    lock.releaseLock();
  }
  return buildTxResponse_(added.ym);
}

// ===== 거래 수정 =====
function updateTransaction(pin, row, data, ym) {
  guard_(pin);
  const r = safeRowNumber_(row);
  const clean = normalizeTxData_(data);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let targetYm = ym || ymOf_(clean.date) || currentYm_();
  try {
    const { sh, map, lastCol } = txMap_(true);
    assertTxCore_(map);
    const lastRow = sh.getLastRow();
    if (r > lastRow) throw new Error('수정할 행이 실제 데이터 범위 밖이야.');

    const oldValues = sh.getRange(r, 1, 1, lastCol).getValues()[0];
    if (isDeleted_(oldValues, map)) throw new Error('삭제된 거래는 복구 후 수정할 수 있어.');
    const oldTx = txObject_(oldValues, r, map);
    appendEditLog_(r, oldTx, clean);

    const newValues = oldValues.slice();
    newValues[map.date] = clean.date;
    newValues[map.type] = clean.type;
    newValues[map.cat] = clean.cat;
    newValues[map.desc] = clean.desc;
    newValues[map.amount] = clean.amount;
    newValues[map.fixed] = clean.fixed;
    newValues[map.memo] = clean.memo;
    if (map.user != null) newValues[map.user] = clean.user;
    if (map.spendingMood != null) newValues[map.spendingMood] = clean.spendingMood;
    if (map.updatedAt != null) newValues[map.updatedAt] = new Date();
    if (map.updatedBy != null) newValues[map.updatedBy] = clean.user;
    sh.getRange(r, 1, 1, lastCol).setValues([newValues]);
  } finally {
    lock.releaseLock();
  }
  return buildTxResponse_(targetYm);
}

// ===== 거래 삭제: 실제 행 삭제 대신 휴지통 처리 =====
function deleteTransaction(pin, row, ym) {
  guard_(pin);
  const r = safeRowNumber_(row);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let targetYm = ym || currentYm_();
  try {
    const { sh, map, lastCol } = txMap_(true);
    assertTxCore_(map);
    const lastRow = sh.getLastRow();
    if (r > lastRow) throw new Error('삭제할 행이 실제 데이터 범위 밖이야.');

    const values = sh.getRange(r, 1, 1, lastCol).getValues()[0];
    if (isDeleted_(values, map)) throw new Error('이미 삭제된 거래야.');
    const oldTx = txObject_(values, r, map);
    appendDeleteLog_(r, oldTx);

    if (map.deleted == null) throw new Error('삭제여부 컬럼을 만들지 못했어.');
    values[map.deleted] = true;
    if (map.updatedAt != null) values[map.updatedAt] = new Date();
    if (map.updatedBy != null) values[map.updatedBy] = oldTx.user;
    sh.getRange(r, 1, 1, lastCol).setValues([values]);
    targetYm = ym || ymOf_(oldTx.date) || currentYm_();
  } finally {
    lock.releaseLock();
  }
  return buildTxResponse_(targetYm);
}

// ===== 삭제 거래 복구 =====
function restoreTransaction(pin, row, ym) {
  guard_(pin);
  const r = safeRowNumber_(row);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const { sh, map, lastCol } = txMap_(true);
    assertTxCore_(map);
    const lastRow = sh.getLastRow();
    if (r > lastRow) throw new Error('복구할 행이 실제 데이터 범위 밖이야.');

    const values = sh.getRange(r, 1, 1, lastCol).getValues()[0];
    if (map.deleted == null) throw new Error('삭제여부 컬럼을 찾지 못했어.');
    values[map.deleted] = false;
    const tx = txObject_(values, r, map);
    if (map.updatedAt != null) values[map.updatedAt] = new Date();
    if (map.updatedBy != null) values[map.updatedBy] = tx.user;
    sh.getRange(r, 1, 1, lastCol).setValues([values]);

    const targetYm = ym || ymOf_(tx.date) || currentYm_();
    return buildTxResponse_(targetYm);
  } finally {
    lock.releaseLock();
  }
}

// ===== 자산현황 읽기 (A열 라벨로 행 찾음) =====
function getAssets_() {
  const sh = ss().getSheetByName(SHEET_ASSET);
  if (!sh) return { items: {}, total: 0 };
  const vals = sh.getDataRange().getValues();
  const defs = [
    { key: 'cash',   label: '계좌 잔액',     match: '계좌' },
    { key: 'safe',   label: '보물창고',       match: '보물' },
    { key: 'stock',  label: '주식/투자',      match: '주식' },
    { key: 'estate', label: '부동산/보증금',  match: '부동산' },
    { key: 'debt',   label: '대출 잔액',      match: '대출' },
    { key: 'saving', label: '저축',          match: '저축' }
  ];
  const items = {};
  defs.forEach(d => {
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).indexOf(d.match) > -1) {
        items[d.key] = { row: i + 1, label: d.label, value: numParse_(vals[i][1]) };
        break;
      }
    }
    if (!items[d.key]) items[d.key] = { row: 0, label: d.label, value: 0 };
  });
  const total = items.cash.value + items.safe.value + items.stock.value
    + items.estate.value + items.saving.value - items.debt.value;
  return { items: items, total: total };
}

// ===== 자산 노란칸 업데이트 =====
function updateAssets(pin, data) {
  guard_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = ss().getSheetByName(SHEET_ASSET);
    const cur = getAssets_();
    ['cash', 'safe', 'stock', 'estate', 'debt', 'saving'].forEach(k => {
      if (data[k] == null || data[k] === '') return;
      const info = cur.items[k];
      if (info && info.row > 0) sh.getRange(info.row, 2).setValue(numParse_(data[k]));
    });
    return { ok: true, assets: getAssets_() };
  } finally {
    lock.releaseLock();
  }
}

// ===== 자산 스냅샷 =====
function saveAssetSnapshot(pin, ym, memo) {
  guard_(pin);
  ym = ym || currentYm_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return saveAssetSnapshotCore_(ym, memo, '웹앱');
  } finally {
    lock.releaseLock();
  }
}

function saveAssetSnapshotCore_(ym, memo, user) {
  const sh = getOrCreateSheet_(SHEET_ASSET_SNAP, ASSET_SNAPSHOT_HEADERS);
  const a = getAssets_();
  const item = a.items || {};
  sh.appendRow([
    new Date(),
    ym,
    item.cash ? numParse_(item.cash.value) : 0,
    item.safe ? numParse_(item.safe.value) : 0,
    item.stock ? numParse_(item.stock.value) : 0,
    item.estate ? numParse_(item.estate.value) : 0,
    item.saving ? numParse_(item.saving.value) : 0,
    item.debt ? numParse_(item.debt.value) : 0,
    numParse_(a.total),
    String(memo || '').trim()
  ]);
  appendActionLog_('자산 스냅샷 저장', user || '웹앱', ym + ' 총자산 ' + won_(a.total));
  return { ok: true, totalAsset: numParse_(a.total), snapshots: getAssetSnapshotsCore_(6) };
}

function getAssetSnapshots(pin, limit) {
  guard_(pin);
  return { ok: true, snapshots: getAssetSnapshotsCore_(limit || 6) };
}

function getAssetSnapshotsCore_(limit) {
  const sh = getOrCreateSheet_(SHEET_ASSET_SNAP, ASSET_SNAPSHOT_HEADERS);
  const last = sh.getLastRow();
  if (last < 2) return [];
  limit = Math.max(1, Math.min(50, Number(limit) || 6));
  const start = Math.max(2, last - limit + 1);
  const vals = sh.getRange(start, 1, last - start + 1, ASSET_SNAPSHOT_HEADERS.length).getValues();
  const rows = vals.map((r, i) => ({
    row: start + i,
    when: r[0] instanceof Date ? Utilities.formatDate(r[0], TZ, 'yyyy-MM-dd HH:mm') : String(r[0] || ''),
    ym: String(r[1] || ''),
    cash: numParse_(r[2]),
    safe: numParse_(r[3]),
    stock: numParse_(r[4]),
    estate: numParse_(r[5]),
    saving: numParse_(r[6]),
    debt: numParse_(r[7]),
    total: numParse_(r[8]),
    memo: String(r[9] || '')
  })).reverse();
  rows.forEach((snap, i) => {
    const prev = rows[i + 1];
    snap.diff = prev ? snap.total - prev.total : 0;
  });
  return rows;
}

// ===== 입력자별 소비/백업 =====
function getWriterStats_(ym) {
  const data = getTransactionsCore_({ ym: ym, mode: 'month', limit: 1000 }).rows;
  const stats = {};
  data.forEach(t => {
    const user = t.user || '미지정';
    if (!stats[user]) stats[user] = { user: user, income: 0, expense: 0, save: 0, repay: 0, count: 0 };
    stats[user].count++;
    if (t.type === '수입') stats[user].income += t.amount;
    else if (t.type === '저축') stats[user].save += t.amount;
    else if (t.type === '대출상환') stats[user].repay += t.amount;
    else stats[user].expense += t.amount;
  });
  return Object.keys(stats).map(k => stats[k]).sort((a, b) => b.expense - a.expense);
}

function uniqueSheetName_(name) {
  const book = ss();
  let base = String(name).slice(0, 90);
  let out = base;
  let i = 1;
  while (book.getSheetByName(out)) {
    const suffix = '_' + i;
    out = base.slice(0, 99 - suffix.length) + suffix;
    i++;
  }
  return out;
}

function createBackup(pin) {
  guard_(pin);
  return createBackupCore_();
}

function createBackupCore_() {
  const stamp = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmm');
  const name = 'Sey콩콩가계부_백업_' + stamp;
  const book = ss();
  try {
    const copied = book.copy(name);
    const url = copied.getUrl();
    appendActionLog_('백업 생성', '웹앱', '스프레드시트 전체 복사: ' + name);
    return { ok: true, method: 'file_copy', name: name, url: url, tabs: [] };
  } catch (e) {
    const tabs = [];
    BACKUP_SHEET_NAMES.forEach(srcName => {
      const src = book.getSheetByName(srcName);
      if (!src) return;
      const newSheet = src.copyTo(book);
      const backupName = uniqueSheetName_('백업_' + stamp + '_' + srcName);
      newSheet.setName(backupName);
      tabs.push(backupName);
    });
    if (!tabs.length) throw new Error('백업할 시트를 찾지 못했어.');
    appendActionLog_('백업 생성', '웹앱', '백업 탭 생성: ' + tabs.join(', '));
    return { ok: true, method: 'sheet_copy', name: name, url: book.getUrl(), tabs: tabs };
  }
}

// ===== AI 분석 기록 읽기 =====
function getAiHistory_(limit) {
  const sh = ss().getSheetByName(SHEET_AI);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - limit + 1);
  const vals = sh.getRange(start, 1, last - start + 1, 4).getValues();
  return vals.map(r => ({
    when: r[0] instanceof Date ? Utilities.formatDate(r[0], TZ, 'yyyy-MM-dd HH:mm') : String(r[0]),
    ym: String(r[1] || ''),
    coaching: String(r[2] || ''),
    snapshot: String(r[3] || '')
  })).reverse();
}

// ===== Groq AI 분석 돌리기 (BYOK) =====
function runAiAnalysis(pin, ym) {
  guard_(pin);
  return runAiAnalysisCore_(ym);
}

function runAiAnalysisCore_(ym) {
  const key = props_().getProperty('GROQ_API_KEY');
  if (!key) throw new Error('Groq API 키가 없어. 스크립트 속성에 GROQ_API_KEY 넣어줘.');
  ym = ym || currentYm_();

  const s = getMonthSummary_(ym);
  if (s.count === 0) throw new Error(ym + ' 에 입력된 거래가 없어. 분석할 게 없네.');

  const budget = getBudgetProgress_(ym, s);
  const prevYm = shiftYm_(ym, -1);
  const prev = getMonthSummary_(prevYm);
  const writers = getWriterStats_(ym);
  const snapshot = buildSnapshot_(s, budget, prev, writers, s.anomalies || []);
  const model = props_().getProperty('GROQ_MODEL') || 'llama-3.3-70b-versatile';

  const userMsg =
    '아래는 우리 부부 ' + ym + ' 가계부 집계야. 숫자를 기준으로 코칭해줘.\n\n' + snapshot +
    '\n[응답 형식]\n' +
    '1. 이번 달 한 줄 총평\n' +
    '2. 가장 눈에 띄는 변화\n' +
    '3. 예산 초과/위험 항목\n' +
    '4. 고정비와 변동비 분리 분석\n' +
    '5. 지수/하콩 입력자별 특징\n' +
    '6. 다음 달 바로 할 행동 3개\n' +
    '7. 줄이면 안 되는 지출 또는 건드리지 말아야 할 영역';

  const res = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      model: model,
      temperature: 0.6,
      messages: [
        { role: 'system', content: '너는 한국 부부의 가계부를 봐주는 차분하고 친근한 돈 관리 코치야. 말투는 친근하지만 과장하지 마. 숫자는 원화 기준으로 구체적으로 말해. 고정비와 필수비는 함부로 줄이라고 하지 마. 병원비, 경조사, 일회성 이벤트를 반복 문제처럼 단정하지 마. 저축률이 높은 달에는 무조건 지출을 줄이라고만 하지 말고 삶의 만족도와 현금흐름 균형을 함께 봐. 이상지출 후보는 오입력 가능성 확인으로 표현하고 단정하지 마.' },
        { role: 'user', content: userMsg }
      ]
    })
  });

  const code = res.getResponseCode();
  const body = JSON.parse(res.getContentText());
  if (code !== 200) {
    const msg = (body && body.error && body.error.message) ? body.error.message : ('HTTP ' + code);
    throw new Error('Groq 오류: ' + msg);
  }
  const coaching = body.choices[0].message.content;
  saveAi_(ym, coaching, snapshot);
  appendActionLog_('AI 분석 실행', '웹앱', ym + ' 분석 저장');
  return { ok: true, ym: ym, coaching: coaching, snapshot: snapshot, when: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') };
}

function buildSnapshot_(s, budget, prev, writers, anomalies) {
  let t = '[' + s.ym + ' 집계]\n';
  t += '총수입: ' + won_(s.income) + '\n';
  t += '총지출: ' + won_(s.expense) + '\n';
  t += '저축/투자: ' + won_(s.save) + ' (수입의 ' + s.savingRate + '%)\n';
  t += '대출상환: ' + won_(s.repay) + '\n';
  t += '남은 돈: ' + won_(s.left) + '\n';
  if (prev) {
    t += '지난달 대비 수입: ' + won_(s.income - prev.income) + '\n';
    t += '지난달 대비 지출: ' + won_(s.expense - prev.expense) + '\n';
    t += '지난달 대비 저축/투자: ' + won_(s.save - prev.save) + '\n';
  }
  t += '\n[예산]\n';
  if (budget && budget.hasBudget) {
    t += '총예산: ' + won_(budget.totalBudget) + '\n';
    t += '예산 사용액: ' + won_(budget.totalSpent) + '\n';
    t += '남은 예산: ' + won_(budget.totalLeft) + '\n';
    t += '하루 사용 가능액: ' + won_(budget.dailyAvailable) + ' (' + budget.daysLeft + '일 남음)\n';
    (budget.items || []).forEach(it => {
      t += '  - ' + it.category + ': 예산 ' + won_(it.budget) + ', 사용 ' + won_(it.spent) + ', 사용률 ' + it.percent + '%, 남음 ' + won_(it.left) + '\n';
    });
  } else {
    t += '설정된 예산 없음. 남은 돈 기준 하루 사용 가능액: ' + won_(budget ? budget.dailyAvailable : 0) + '\n';
  }

  t += '\n[고정비/변동비]\n';
  t += '고정비: ' + won_(s.fixedExpense) + ' (' + s.fixedRatio + '%)\n';
  t += '변동비: ' + won_(s.variableExpense) + ' (' + s.variableRatio + '%)\n';
  t += '변동비 TOP 3:\n';
  (s.variableTopCategories || []).slice(0, 3).forEach(c => {
    t += '  - ' + c.cat + ': ' + won_(c.amt) + '\n';
  });

  t += '\n[입력자별 소비]\n';
  if (writers && writers.length) {
    writers.forEach(w => {
      t += '  - ' + w.user + ': 지출 ' + won_(w.expense) + ', 수입 ' + won_(w.income) + ', 저축/투자 ' + won_(w.save) + ', 거래 ' + w.count + '건\n';
    });
  } else {
    t += '  - 입력자 데이터 없음\n';
  }

  t += '\n[이상지출 후보]\n';
  if (anomalies && anomalies.length) {
    anomalies.slice(0, 8).forEach(a => {
      t += '  - 행 ' + a.row + ': ' + a.message + ' (' + (a.category || '-') + ' / ' + (a.desc || '-') + ' / ' + won_(a.amount) + ')\n';
    });
  } else {
    t += '  - 특별히 확인할 후보 없음\n';
  }

  t += '\n[분류별 지출 (큰 순)]\n';
  s.cats.forEach(c => {
    const p = s.expense > 0 ? Math.round(c.amt / s.expense * 100) : 0;
    t += '  - ' + c.cat + ': ' + won_(c.amt) + ' (지출의 ' + p + '%)\n';
  });
  return t;
}

function saveAi_(ym, coaching, snapshot) {
  const sh = getOrCreateSheet_(SHEET_AI, AI_HEADERS, []);
  sh.appendRow([new Date(), ym, coaching, snapshot]);
}
