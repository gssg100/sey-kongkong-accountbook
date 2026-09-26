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
 *       BRIDGE_ALLOWED_ORIGINS = https://내-가계부.vercel.app
 *                                 ← Vercel/GitHub 등 정적 주소로 쓸 때 필수.
 *                                   쉼표로 여러 개 가능. 비워두면 정적 사이트에서 로그인 불가.
 *                                   여기 없는 사이트는 iframe으로 띄워도 API를 못 부른다.
 *  7) 배포 > 새 배포 > 유형 "웹 앱"
 *       - 실행: 나(본인)
 *       - 액세스: 모든 사용자(익명 포함)   ← appsscript.json 의 ANYONE_ANONYMOUS 와 같은 값
 *       (실행을 '나'로 해야 하콩이가 시트 공유 없이도 너 권한으로 입력됨.
 *        익명 접근이라 URL 이 새면 PIN 만이 방어선이다. 그래서:
 *          · PIN 실패는 3회마다 1분→5분→15분→1시간으로 잠긴다
 *          · 브리지는 BRIDGE_ALLOWED_ORIGINS 에 적은 주소에서만 동작한다)
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
const SHEET_SETTLEMENT = '📋월정산상태';
const SHEET_RECONCILIATION = '🧾대사';
const SHEET_INVESTMENT_MONTHLY = '📈투자월말';
const SHEET_SETTLEMENT_DRAFT = '🗂정산공유초안';
const SHEET_INVESTMENT_HOLDING = '📈투자종목월말';
const SHEET_NOTIF = '🔔알림';
const TZ = 'Asia/Seoul';

// 기존 장부 열은 그대로 두고, 정산에 필요한 메타 열만 뒤에 안전하게 추가한다.
const TX_META_HEADERS = ['입력자', '거래ID', '생성일시', '수정일시', '수정자', '삭제여부', '소비성격', '출처/계좌', '정산배치ID'];
const SPENDING_MEANINGS = [
  '필수', '생활', '즐거움', '가족', '투자', '아쉬움',
  '필수소비', '계획소비', '충동소비', '감성소비', '투자성', '미지정'
];
const DEFAULT_SPENDING_MEANING = '미지정';
const SESSION_VERSION = 2;
const SESSION_SHORT_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_LONG_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const BRIDGE_CHANNEL = 'sey-budget-bridge-v1';
const BRIDGE_API_ALLOWLIST = [
  'createSession', 'createSessionAndGetBoot', 'getBoot', 'getMonthData', 'getFastMonthData', 'getTransactions',
  'addTransactionsFast', 'addTransaction', 'updateTransaction', 'deleteTransaction', 'restoreTransaction',
  'getTrendData', 'getRecurrings', 'saveRecurring', 'deleteRecurring', 'runRecurringNow',
  'getRecurringStatus', 'installRecurringTrigger', 'removeRecurringTrigger',
  'getBudget', 'updateBudget', 'copyBudget', 'recommendBudget',
  'getCloseMonthHistory', 'getMonthlyReview', 'saveMonthlyReview', 'getMonthlyReviewHistory',
  'getCloseMonthPreview', 'getTodayTasks', 'getCashflowForecast', 'getHomeInsight', 'closeMonth',
  'getTemplates', 'saveTemplate', 'deleteTemplate', 'updateAssetCategory', 'saveAssetSnapshot',
  'getAssetSnapshots', 'createBackup', 'runAiAnalysis', 'bulkUpdateCategory',
  'getSettlementData', 'saveReconciliations', 'saveInvestmentMonthly', 'syncInvestmentToAssets',
  'getSettlementDraft', 'saveSettlementDraft', 'clearSettlementDraft', 'getSettlementBatches', 'revertSettlementBatch',
  'saveInvestmentHoldings', 'finalizeSettlementMonth', 'reopenSettlementMonth',
  'savePushSubscription', 'getNotifications', 'sendNotificationTest', 'checkDueNotifications'
];
const NOTIF_HEADERS = ['일시', '유형', '사용자', '제목', '내용', '상태', '메타'];
const BUDGET_HEADERS = ['월', '대분류', '예산', '메모', '생성일시', '수정일시', '수정자', '추천기준'];
const TEMPLATE_HEADERS = ['템플릿명', '구분', '대분류', '내역', '기본금액', '고정/변동', '메모', '사용여부'];
const ASSET_SNAPSHOT_HEADERS = ['기록일시', '대상월', '계좌잔액', '보물창고', '주식투자', '부동산보증금', '저축', '대출잔액', '총자산', '메모'];
const ACTION_LOG_HEADERS = ['일시', '작업', '사용자', '내용'];
const BUDGET_LOG_HEADERS = ['일시', '사용자', '작업', '대상월', '대분류', '이전예산', '새예산', '메모'];
const RECURRING_HEADERS = ['정기ID', '정기명', '구분', '대분류', '내역', '금액', '고정/변동', '메모', '입력자', '결제일', '사용여부', '마지막실행월', '종료월'];
const CLOSE_MONTH_HEADERS = ['마감월', '마감일시', '마감자', '총수입', '총지출', '저축투자', '대출상환', '남은돈', '저축률', '고정비', '변동비', '총자산', '이상지출수', 'AI요약', '메모', '백업URL', '좋았던소비', '아쉬웠던소비', '다음달약속', '지수의견', '하콩의견', '같이확인할것'];
const SETTLEMENT_HEADERS = ['대상월', '상태', '시작일시', '시작자', '마감일시', '마감자', '거래입력완료', '대사확인', '투자확인', '메모', '재개일시', '재개자'];
const RECONCILIATION_HEADERS = ['대상월', '출처/계좌', '명세서합계', '입력합계', '차이', '상태', '수정일시', '수정자', '대사유형', '차이사유', '명세서입력됨'];
const INVESTMENT_MONTHLY_HEADERS = ['대상월', '투자계좌', '전월말평가액', '순입금', '월말평가액', '평가증감', '메모', '수정일시', '수정자'];
const SETTLEMENT_DRAFT_HEADERS = ['대상월', '초안JSON', '수정일시', '수정자', '비움여부'];
const INVESTMENT_HOLDING_HEADERS = ['대상월', '투자계좌', '종목코드', '종목명', '수량', '평균매수가', '월말가격', '월말평가액', '평가손익', '통화', '메모', '수정일시', '수정자'];
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
  SHEET_TEMPLATE, SHEET_ASSET_SNAP, SHEET_EDIT_LOG, SHEET_DELETE_LOG, SHEET_RECURRING, SHEET_CLOSE_MONTH, SHEET_BUDGET_LOG,
  SHEET_SETTLEMENT, SHEET_RECONCILIATION, SHEET_INVESTMENT_MONTHLY, SHEET_SETTLEMENT_DRAFT, SHEET_INVESTMENT_HOLDING,
  SHEET_NOTIF
];

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function props_() { return PropertiesService.getScriptProperties(); }

// ===== 진입점: 웹앱 화면 및 정적 PWA용 제한 브리지 서빙 =====
function doGet(e) {
  if (e && e.parameter && e.parameter.bridge === '1') {
    return bridgeHtmlOutput_();
  }
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('sey콩콩 가계부')
    .addMetaTag('viewport',
      'width=device-width, initial-scale=1, viewport-fit=cover');
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 브리지를 띄워도 되는 정적 사이트 주소 목록.
 * 스크립트 속성 BRIDGE_ALLOWED_ORIGINS 에 쉼표로 구분해 넣는다.
 *   예) https://sey-kongkong-accountbook.vercel.app,https://내커스텀도메인.com
 * 비워두면 브리지는 어떤 요청도 처리하지 않는다(fail-closed).
 */
function bridgeAllowedOrigins_() {
  return String(props_().getProperty('BRIDGE_ALLOWED_ORIGINS') || '')
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    // 실제 서비스 주소는 https 만 허용한다.
    // 로컬 개발용 루프백(http://localhost, http://127.0.0.1)은 명시적으로 적어둔 경우에만 통과시킨다.
    .filter(s => s.indexOf('https://') === 0 || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(s));
}

function bridgeHtmlOutput_() {
  const allowlist = JSON.stringify(BRIDGE_API_ALLOWLIST);
  const channel = JSON.stringify(BRIDGE_CHANNEL);
  const origins = JSON.stringify(bridgeAllowedOrigins_());
  // GAS는 웹앱을 iframe 한 겹으로 더 감싸기 때문에, 이 스크립트는 "손자 프레임"에서 돈다.
  // 따라서 window.parent(=구글 래퍼)가 아니라 window.top(=우리 앱)에 신호를 보내야 한다.
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>' +
    '(function(){' +
      'var CHANNEL=' + channel + ';var ALLOWED=' + allowlist + ';var ORIGINS=' + origins + ';' +
      'var top=window.top;' +
      'function reply(target,origin,payload){try{target.postMessage(payload,origin);}catch(e){}}' +
      'if(!ORIGINS.length){' +
        // 설정이 안 끝났을 때 조용히 타임아웃되지 않도록, 원인을 그대로 알려준다.
        'try{top.postMessage({channel:CHANNEL,type:"setup-error",' +
          'error:"브리지 허용 주소가 비어 있어. Apps Script 스크립트 속성에 BRIDGE_ALLOWED_ORIGINS 를 추가해줘."},"*");}catch(e){}' +
        'return;' +
      '}' +
      'window.addEventListener("message",function(event){' +
        'var m=event.data||{};if(m.channel!==CHANNEL||m.type!=="request"||!m.id)return;' +
        // 허용 목록에 없는 사이트가 iframe으로 띄워 호출하는 것을 여기서 끊는다.
        'if(ORIGINS.indexOf(event.origin)<0)return;' +
        'if(ALLOWED.indexOf(m.fn)<0){reply(event.source,event.origin,{channel:CHANNEL,type:"result",id:m.id,ok:false,error:"허용되지 않은 API야."});return;}' +
        'var args=Array.isArray(m.args)?m.args:[];' +
        'var runner=google.script.run.withSuccessHandler(function(data){reply(event.source,event.origin,{channel:CHANNEL,type:"result",id:m.id,ok:true,data:data});})' +
          '.withFailureHandler(function(err){reply(event.source,event.origin,{channel:CHANNEL,type:"result",id:m.id,ok:false,error:(err&&err.message)||String(err||"처리 실패")});});' +
        'runner[m.fn].apply(runner,args);' +
      '});' +
      // targetOrigin을 지정해 보내므로, 허용 주소가 아닌 곳에서는 이 신호조차 받지 못한다.
      'ORIGINS.forEach(function(o){try{top.postMessage({channel:CHANNEL,type:"ready"},o);}catch(e){}});' +
    '})();<\/script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('sey콩콩 데이터 브리지')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  return ContentService.createTextOutput(JSON.stringify({
    ok: false,
    error: '직접 POST 호출은 지원하지 않아. 앱 브리지를 사용해줘.'
  })).setMimeType(ContentService.MimeType.JSON);
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
    getOrCreateSheet_(SHEET_SETTLEMENT, SETTLEMENT_HEADERS, []);
    getOrCreateSheet_(SHEET_RECONCILIATION, RECONCILIATION_HEADERS, []);
    getOrCreateSheet_(SHEET_INVESTMENT_MONTHLY, INVESTMENT_MONTHLY_HEADERS, []);
    getOrCreateSheet_(SHEET_SETTLEMENT_DRAFT, SETTLEMENT_DRAFT_HEADERS, []);
    getOrCreateSheet_(SHEET_INVESTMENT_HOLDING, INVESTMENT_HOLDING_HEADERS, []);
    getOrCreateSheet_(SHEET_NOTIF, NOTIF_HEADERS, []);
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
// 자릿수가 짧은 PIN을 전제로, 실패가 누적될수록 잠금이 길어지게 한다.
// 4자리(1만 가지)라도 아래 속도면 전부 시도하는 데 수십 년이 걸린다.
const PIN_FAIL_LIMIT = 3;
const PIN_LOCK_STEPS_SEC = [60, 300, 900, 3600]; // 1분 → 5분 → 15분 → 1시간

/**
 * 실패 카운터를 호출자별로 나눈다.
 * 예전에는 스크립트 전역 카운터 하나만 써서, 누가 어디서든 5번 틀리면
 * 지수·하콩까지 같이 잠겼다(= 손쉬운 서비스 거부).
 */
function pinRateScope_() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (email) return 'u:' + Utilities.base64EncodeWebSafe(email).slice(0, 24);
  } catch (e) {}
  return 'anon';
}

function verifyPinWithRateLimit_(pin) {
  const real = props_().getProperty('APP_PIN');
  if (!real || String(real).trim() === '' || String(real) === '0000') {
    throw new Error('APP_PIN이 설정되지 않았거나 기본값이야. Apps Script 스크립트 속성에서 안전한 PIN을 먼저 설정해줘.');
  }
  const cache = CacheService.getScriptCache();
  const scope = pinRateScope_();
  const blockKey = 'PIN_BLOCK_' + scope;
  const countKey = 'PIN_FAIL_' + scope;
  const strikeKey = 'PIN_STRIKE_' + scope;

  const blockedUntil = Number(cache.get(blockKey) || 0);
  if (blockedUntil > Date.now()) {
    const waitSec = Math.ceil((blockedUntil - Date.now()) / 1000);
    throw new Error('PIN을 여러 번 틀렸어. ' + waitSec + '초 뒤에 다시 시도해줘.');
  }

  if (String(pin) === String(real)) {
    cache.removeAll([countKey, blockKey, strikeKey]);
    return true;
  }

  const count = Number(cache.get(countKey) || 0) + 1;
  if (count >= PIN_FAIL_LIMIT) {
    // 잠길 때마다 다음 잠금이 길어진다. strike는 1시간 유지되므로 연속 시도를 계속 벌준다.
    const strike = Math.min(Number(cache.get(strikeKey) || 0), PIN_LOCK_STEPS_SEC.length - 1);
    const lockSec = PIN_LOCK_STEPS_SEC[strike];
    cache.put(blockKey, String(Date.now() + lockSec * 1000), lockSec + 60);
    cache.put(strikeKey, String(strike + 1), 3600);
    cache.remove(countKey);
    throw new Error('PIN을 ' + PIN_FAIL_LIMIT + '회 틀렸어. ' + Math.round(lockSec / 60) + '분 뒤에 다시 시도해줘.');
  }
  cache.put(countKey, String(count), 600);
  throw new Error('PIN이 안 맞아. 다시 확인해줘. (' + count + '/' + PIN_FAIL_LIMIT + ')');
}

function sessionSecret_() {
  let secret = props_().getProperty('SESSION_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props_().setProperty('SESSION_SECRET', secret);
  }
  return secret;
}

function base64WebSafeText_(text) {
  return Utilities.base64EncodeWebSafe(String(text), Utilities.Charset.UTF_8).replace(/=+$/g, '');
}

function signSessionPayload_(payloadPart) {
  const bytes = Utilities.computeHmacSha256Signature(payloadPart, sessionSecret_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function parseSession_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || signSessionPayload_(parts[0]) !== parts[1]) {
    throw new Error('로그인 세션이 올바르지 않아. 다시 로그인해줘.');
  }
  let payload;
  try {
    payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  } catch (e) {
    throw new Error('로그인 세션을 읽지 못했어. 다시 로그인해줘.');
  }
  if (!payload || payload.v !== SESSION_VERSION || Number(payload.exp || 0) <= Date.now()) {
    throw new Error('로그인 세션이 만료됐어. 다시 로그인해줘.');
  }
  return payload;
}

function createSession(pin, user, remember) {
  verifyPinWithRateLimit_(pin);
  const normalizedUser = normalizeUser_(user || '하콩') || '하콩';
  const now = Date.now();
  const expiresAt = now + (remember === false ? SESSION_SHORT_TTL_MS : SESSION_LONG_TTL_MS);
  const payload = {
    v: SESSION_VERSION,
    user: normalizedUser,
    iat: now,
    exp: expiresAt,
    nonce: Utilities.getUuid()
  };
  const payloadPart = base64WebSafeText_(JSON.stringify(payload));
  return {
    ok: true,
    token: payloadPart + '.' + signSessionPayload_(payloadPart),
    user: normalizedUser,
    expiresAt: expiresAt,
    ym: currentYm_()
  };
}

// 새 기기 첫 로그인에서 세션 생성과 초기 장부 로딩을 한 번의 호출로 처리한다.
function createSessionAndGetBoot(pin, user, remember) {
  const session = createSession(pin, user, remember);
  return {
    session: session,
    boot: buildBootData_(parseSession_(session.token))
  };
}

function guard_(credential) {
  const value = String(credential || '');
  if (value.indexOf('.') > 0) return parseSession_(value);
  verifyPinWithRateLimit_(value);
  return { v: 0, user: '', exp: Date.now() + SESSION_SHORT_TTL_MS };
}

function getDataRevision_() {
  return Number(props_().getProperty('DATA_REVISION') || 1);
}

function bumpDataRevision_() {
  const next = Math.max(Date.now(), getDataRevision_() + 1);
  props_().setProperty('DATA_REVISION', String(next));
  return next;
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

function resolveTxRow_(ref, info) {
  info = info || txMap_(true);
  const raw = String(ref == null ? '' : ref).trim();
  if (!raw) throw new Error('거래 식별자가 없어.');
  if (/^\d+$/.test(raw)) return safeRowNumber_(Number(raw));
  if (info.map.txId == null) throw new Error('거래ID 컬럼을 찾지 못했어.');
  const last = info.sh.getLastRow();
  if (last < 2) throw new Error('거래내역이 비어 있어.');
  const ids = info.sh.getRange(2, info.map.txId + 1, last - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() === raw) return i + 2;
  }
  throw new Error('해당 거래를 찾지 못했어. 다른 기기에서 변경됐다면 동기화 후 다시 시도해줘.');
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
    spendingMood: normalizeSpendingMeaning_(data.spendingMood || data.meaning || data.spendingMeaning),
    source: String(data.source || data.account || '').trim().slice(0, 80),
    settlementBatch: String(data.settlementBatch || data.batchId || '').trim().slice(0, 120)
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
    else if (h === '출처/계좌') map.source = i;
    else if (h === '정산배치ID') map.settlementBatch = i;
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
    source: map.source != null ? String(rowValues[map.source] || '') : '',
    settlementBatch: map.settlementBatch != null ? String(rowValues[map.settlementBatch] || '') : '',
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
    bumpDataRevision_();
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
  // 구분이 비었거나 오타인 행을 지출에 섞으면 총지출과 카테고리 합계가 어긋나
  // 홈의 "지출" 금액과 "지출 TOP3"·예산 게이지가 서로 다른 숫자를 보여준다.
  // 그런 행은 미분류로 따로 모아 눈에 보이게 한다.
  let unclassified = 0;
  let unclassifiedCount = 0;
  rows.forEach(t => {
    const type = String(t.type || '').trim();
    const cat = String(t.cat || '').trim();
    const amt = numParse_(t.amount);
    if (type === '수입') income += amt;
    else if (type === '저축') save += amt;
    else if (type === '대출상환') repay += amt;
    else if (type === '지출') {
      expense += amt;
      const catKey = cat || '미분류';
      byCat[catKey] = (byCat[catKey] || 0) + amt;
      if (String(t.fixed || '').trim() === '고정') {
        fixedExpense += amt;
      } else {
        variableExpense += amt;
        byVariableCat[catKey] = (byVariableCat[catKey] || 0) + amt;
      }
      const meaning = normalizeSpendingMeaning_(t.spendingMood || t.meaning);
      byMeaning[meaning] = (byMeaning[meaning] || 0) + amt;
    } else {
      unclassified += amt;
      unclassifiedCount++;
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
    // 미분류 금액도 잔액 계산에는 포함한다(돈은 실제로 나갔으므로).
    left: income - expense - save - repay - unclassified,
    unclassified: unclassified,
    unclassifiedCount: unclassifiedCount,
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
    else if (h === '종료월') map.endYm = i;
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
    lastRunYm: String(rowValues[map.lastRunYm] || ''),
    endYm: String(rowValues[map.endYm] || '')
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
  const endYm = String(recurring.endYm || '').trim();
  if (id && id.indexOf('RC-') !== 0) throw new Error('정기ID 형식을 확인해줘.');
  if (!name) throw new Error('정기명을 입력해줘.');
  if (!type) throw new Error('구분을 입력해줘.');
  if (!cat) throw new Error('대분류를 입력해줘.');
  if (!(amount > 0)) throw new Error('금액은 0보다 큰 숫자로 입력해줘.');
  if (!isFinite(day) || Math.floor(day) !== day || day < 1 || day > 31) throw new Error('결제일은 1~31 사이 정수로 입력해줘.');
  if (lastRunYm && !ymToDate_(lastRunYm)) throw new Error('마지막실행월 형식을 확인해줘. 예: 2026-06');
  if (endYm && !ymToDate_(endYm)) throw new Error('종료월 형식을 확인해줘. 예: 2026-12');
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
    lastRunYm: lastRunYm,
    endYm: endYm
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
    recurring.lastRunYm,
    recurring.endYm
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

      try {
        if (recurring.endYm && compareYm_(ym, recurring.endYm) > 0) {
          // 이미 종료월이 지났다면 비활성화
          sh.getRange(rowNo, map.enabled + 1).setValue(false);
          return;
        }
        // adjustedDay_는 결제일이 망가진 행(0, 공백, 45 등)에서 throw한다.
        // 예전에는 이게 try 밖이라 한 행 때문에 그 달 전체가 중단됐다.
        const dueDay = adjustedDay_(ym, recurring.day);
        // onlyDay(자동 트리거)일 때도 지난 날짜를 따라잡는다.
        // 트리거가 하루 실패하면 그 달 고정비가 영영 누락되던 문제를 막는다.
        if (onlyDay != null && dueDay > onlyDay) {
          result.notDue++;
          return;
        }
        if (recurring.lastRunYm === ym) {
          result.skipped++;
          return;
        }
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
    if (result.inserted > 0) bumpDataRevision_();
    appendActionLog_('정기거래 실행', source,
      ym + ' 입력 ' + result.inserted + '건 / 건너뜀 ' + result.skipped + '건' +
      (result.errors.length ? ' / 실패 ' + result.errors.length + '건: ' + result.errors.join(' · ') : ''));
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
  // 기본은 병합(merge)이다. 화면이 모르는 카테고리의 예산을 저장 한 번으로 날리지 않기 위해서다.
  // 삭제는 반드시 removeCategories로 명시해야 한다.
  const replaceAll = String(options.mode || 'merge').trim() === 'replace';
  const removeSet = {};
  (Array.isArray(options.removeCategories) ? options.removeCategories : [])
    .forEach(c => { const key = String(c || '').trim(); if (key) removeSet[key] = true; });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getOrCreateSheet_(SHEET_BUDGET, BUDGET_HEADERS);
    const vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, BUDGET_HEADERS.length).getValues() : [];
    const oldRows = vals.filter(r => String(r[0] || '').trim() === ym);
    const oldMap = budgetMapFromRows_(oldRows);
    const kept = vals.filter(r => String(r[0] || '').trim() !== ym);

    const submitted = {};
    clean.forEach(it => { submitted[it.category] = it; });

    // 이번에 넘어온 카테고리는 갱신하고, 손대지 않은 기존 행은 그대로 살린다.
    const newRows = [];
    if (!replaceAll) {
      oldRows.forEach(r => {
        const cat = String(r[1] || '').trim();
        if (!cat || submitted[cat] || removeSet[cat]) return;
        newRows.push(r);
      });
    }
    clean.forEach(it => {
      if (removeSet[it.category]) return;
      newRows.push(budgetRow_(ym, it, oldMap[it.category], user, source));
    });
    rewriteBudgetRows_(kept.concat(newRows));

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
    const removedCount = Object.keys(oldMap).filter(cat => !newMap[cat]).length;
    appendActionLog_(action, user,
      ym + ' 예산 ' + clean.length + '개 저장' + (removedCount ? ' / ' + removedCount + '개 삭제' : '') +
      ' (보존 ' + (newRows.length - clean.length) + '개)');
    bumpDataRevision_();
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

// 이미 마감한 달인지 확인한다(중복 마감 방지). 없으면 null.
function closeMonthRowForYm_(ym) {
  const sh = getCloseMonthSheet_();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const vals = sh.getRange(2, 1, last - 1, CLOSE_MONTH_HEADERS.length).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0] || '').trim() === ym) return closeMonthRecordFromRow_(vals[i], i + 2);
  }
  return null;
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
    promiseNext: String(r[18] || ''),
    jisuComment: String(r[19] || ''),
    jisooComment: String(r[19] || ''),
    hakongComment: String(r[20] || ''),
    hayoungComment: String(r[20] || ''),
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
    String(data.nextPromise || data.promiseNext || ''),
    String(data.jisuComment || data.jisooComment || ''),
    String(data.hakongComment || data.hayoungComment || ''),
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
    const last = sh.getLastRow();
    const values = last >= 2 ? sh.getRange(2, 1, last - 1, CLOSE_MONTH_HEADERS.length).getValues() : [];
    let existingRowNo = 0;
    let row = monthlyReviewRow_(ym, user, summary, assets, data);
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0] || '').trim() === ym) {
        existingRowNo = i + 2;
        // 월마감에서 이미 저장한 AI 요약·백업 URL은 회고 저장 때문에 지우지 않는다.
        row[13] = values[i][13];
        row[14] = values[i][14];
        row[15] = values[i][15];
        break;
      }
    }
    if (existingRowNo) sh.getRange(existingRowNo, 1, 1, CLOSE_MONTH_HEADERS.length).setValues([row]);
    else sh.appendRow(row);
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
    // 같은 달을 두 번 마감하면 📌월마감 행과 백업 사본이 중복 생성된다.
    // 정산 마감은 여러 단계로 나뉘어 있어 중간 실패 후 재시도가 실제로 일어난다.
    if (opt.force !== true) {
      const already = closeMonthRowForYm_(ym);
      if (already) {
        return {
          ok: true,
          alreadyClosed: true,
          ym: ym,
          closeRecord: already,
          history: getCloseMonthHistoryCore_(6),
          message: ym + '은 이미 ' + (already.closedAt || '') + '에 마감했어. 다시 마감하려면 정산을 먼저 다시 열어줘.'
        };
      }
    }

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

// ===== 월초 일괄정산: 상태 · 대사 · 투자 월말값 =====
function settlementSheet_() {
  return getOrCreateSheet_(SHEET_SETTLEMENT, SETTLEMENT_HEADERS);
}

function reconciliationSheet_() {
  return getOrCreateSheet_(SHEET_RECONCILIATION, RECONCILIATION_HEADERS);
}

function investmentMonthlySheet_() {
  return getOrCreateSheet_(SHEET_INVESTMENT_MONTHLY, INVESTMENT_MONTHLY_HEADERS);
}

function settlementDraftSheet_() {
  return getOrCreateSheet_(SHEET_SETTLEMENT_DRAFT, SETTLEMENT_DRAFT_HEADERS);
}

function investmentHoldingSheet_() {
  return getOrCreateSheet_(SHEET_INVESTMENT_HOLDING, INVESTMENT_HOLDING_HEADERS);
}

function normalizeDraftList_(list, max, mapper) {
  return (Array.isArray(list) ? list : []).slice(0, max).map(mapper).filter(Boolean);
}

function normalizeSettlementDraft_(ym, raw) {
  let input = raw || {};
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch (e) { input = {}; }
  }
  const draft = {
    ym: ym,
    rows: normalizeDraftList_(input.rows, 300, row => {
      if (!row || typeof row !== 'object') return null;
      return {
        clientId: String(row.clientId || makeTxId_()).slice(0, 140),
        date: String(row.date || '').slice(0, 20),
        source: String(row.source || '').trim().slice(0, 80),
        type: String(row.type || '지출').trim().slice(0, 40),
        cat: String(row.cat || '기타').trim().slice(0, 80),
        desc: String(row.desc || '').trim().slice(0, 180),
        amount: numParse_(row.amount),
        fixed: String(row.fixed || '변동').trim().slice(0, 30),
        user: String(row.user || '').trim().slice(0, 20),
        memo: String(row.memo || '').trim().slice(0, 300),
        spendingMood: String(row.spendingMood || '').trim().slice(0, 30),
        imported: row.imported === true,
        forceDuplicate: row.forceDuplicate === true
      };
    }),
    reconciliations: normalizeDraftList_(input.reconciliations, 80, row => row && row.source ? {
      source: String(row.source).trim().slice(0, 80),
      kind: normalizeReconciliationKind_(row.kind),
      statementTotal: numParse_(row.statementTotal),
      statementProvided: row.statementProvided === true,
      reason: String(row.reason || '').trim().slice(0, 300)
    } : null),
    investments: normalizeDraftList_(input.investments, 80, row => row && row.account ? {
      account: String(row.account).trim().slice(0, 80),
      previousValue: numParse_(row.previousValue),
      netContribution: numParse_(row.netContribution),
      endValue: numParse_(row.endValue),
      memo: String(row.memo || '').trim().slice(0, 300)
    } : null),
    holdings: normalizeDraftList_(input.holdings, 300, row => row && row.account && (row.ticker || row.name) ? {
      account: String(row.account).trim().slice(0, 80),
      ticker: String(row.ticker || '').trim().toUpperCase().slice(0, 24),
      name: String(row.name || '').trim().slice(0, 100),
      quantity: numParse_(row.quantity), averagePrice: numParse_(row.averagePrice), endPrice: numParse_(row.endPrice),
      endValue: row.endValue == null || String(row.endValue).trim() === '' ? '' : numParse_(row.endValue), endValueManual: row.endValueManual === true,
      currency: String(row.currency || 'KRW').trim().slice(0, 8), memo: String(row.memo || '').trim().slice(0, 300)
    } : null),
    updatedAt: Math.max(0, Number(input.updatedAt || 0)),
    updatedBy: String(input.updatedBy || '').trim().slice(0, 20),
    cleared: input.cleared === true
  };
  return draft;
}

function getSettlementDraftCore_(ym) {
  ym = validYm_(ym);
  const sh = settlementDraftSheet_();
  const last = sh.getLastRow();
  if (last < 2) return normalizeSettlementDraft_(ym, {});
  const values = sh.getRange(2, 1, last - 1, SETTLEMENT_DRAFT_HEADERS.length).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    if (String(row[0] || '').trim() !== ym) continue;
    const draft = normalizeSettlementDraft_(ym, row[1]);
    draft.updatedAt = row[2] instanceof Date ? row[2].getTime() : Number(row[2] || draft.updatedAt || 0);
    draft.updatedBy = String(row[3] || draft.updatedBy || '');
    draft.cleared = boolText_(row[4], draft.cleared);
    return draft;
  }
  return normalizeSettlementDraft_(ym, {});
}

function getSettlementDraft(pin, ym) {
  guard_(pin);
  return { ok: true, draft: getSettlementDraftCore_(ym || defaultWorkMonthContext_().workYm) };
}

function saveSettlementDraft(pin, ym, rawDraft, user) {
  guard_(pin);
  ym = validYm_(ym);
  const incoming = normalizeSettlementDraft_(ym, rawDraft);
  const author = String(user || incoming.updatedBy || '웹앱').trim() || '웹앱';
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = settlementDraftSheet_();
    const last = sh.getLastRow();
    const values = last >= 2 ? sh.getRange(2, 1, last - 1, SETTLEMENT_DRAFT_HEADERS.length).getValues() : [];
    let rowNo = 0;
    let current = normalizeSettlementDraft_(ym, {});
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0] || '').trim() !== ym) continue;
      rowNo = i + 2;
      current = normalizeSettlementDraft_(ym, values[i][1]);
      current.updatedAt = values[i][2] instanceof Date ? values[i][2].getTime() : Number(values[i][2] || 0);
      break;
    }
    if (current.updatedAt && incoming.updatedAt && incoming.updatedAt < current.updatedAt) {
      current.updatedBy = rowNo ? String(values[rowNo - 2][3] || '') : '';
      current.cleared = rowNo ? boolText_(values[rowNo - 2][4], false) : false;
      return { ok: true, conflict: true, draft: current };
    }
    incoming.updatedAt = Date.now();
    incoming.updatedBy = author;
    const text = JSON.stringify(incoming);
    if (text.length > 45000) throw new Error('공유 초안이 너무 커서 저장할 수 없어. 거래를 나눠서 확정 저장해줘.');
    const row = [ym, text, new Date(incoming.updatedAt), author, incoming.cleared === true];
    if (rowNo) sh.getRange(rowNo, 1, 1, SETTLEMENT_DRAFT_HEADERS.length).setValues([row]);
    else sh.appendRow(row);
    return { ok: true, conflict: false, draft: incoming };
  } finally {
    lock.releaseLock();
  }
}

function clearSettlementDraft(pin, ym, user) {
  guard_(pin);
  ym = validYm_(ym);
  return saveSettlementDraft(pin, ym, { ym: ym, rows: [], reconciliations: [], investments: [], cleared: true, updatedAt: Date.now() }, user || '웹앱');
}

function settlementStatusFromRow_(row, rowNo) {
  return {
    row: rowNo || 0,
    ym: String(row[0] || ''),
    status: String(row[1] || '정산전') || '정산전',
    startedAt: dateTimeText_(row[2]),
    startedBy: String(row[3] || ''),
    closedAt: dateTimeText_(row[4]),
    closedBy: String(row[5] || ''),
    transactionsConfirmed: boolText_(row[6], false),
    reconciliationsConfirmed: boolText_(row[7], false),
    investmentsConfirmed: boolText_(row[8], false),
    memo: String(row[9] || ''),
    reopenedAt: dateTimeText_(row[10]),
    reopenedBy: String(row[11] || ''),
    isClosed: String(row[1] || '') === '마감'
  };
}

function getSettlementStatusCore_(ym) {
  ym = validYm_(ym);
  const sh = settlementSheet_();
  const last = sh.getLastRow();
  if (last < 2) return settlementStatusFromRow_([ym, '정산전'], 0);
  const values = sh.getRange(2, 1, last - 1, SETTLEMENT_HEADERS.length).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || '').trim() === ym) return settlementStatusFromRow_(values[i], i + 2);
  }
  return settlementStatusFromRow_([ym, '정산전'], 0);
}

function upsertSettlementStatusCore_(ym, patch) {
  ym = validYm_(ym);
  patch = patch || {};
  const sh = settlementSheet_();
  const last = sh.getLastRow();
  let rowNo = 0;
  let row = new Array(SETTLEMENT_HEADERS.length).fill('');
  if (last >= 2) {
    const values = sh.getRange(2, 1, last - 1, SETTLEMENT_HEADERS.length).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0] || '').trim() === ym) {
        rowNo = i + 2;
        row = values[i].slice();
        break;
      }
    }
  }
  const now = new Date();
  row[0] = ym;
  if (patch.status != null) row[1] = String(patch.status);
  if (!row[1]) row[1] = '정산중';
  if (!row[2]) row[2] = now;
  if (patch.startedBy != null) row[3] = String(patch.startedBy || '');
  if (patch.closed === true) {
    row[1] = '마감';
    row[4] = now;
    row[5] = String(patch.closedBy || patch.user || '웹앱');
  }
  if (patch.reopened === true) {
    row[1] = '정산중';
    row[10] = now;
    row[11] = String(patch.reopenedBy || patch.user || '웹앱');
  }
  if (patch.transactionsConfirmed != null) row[6] = patch.transactionsConfirmed === true;
  if (patch.reconciliationsConfirmed != null) row[7] = patch.reconciliationsConfirmed === true;
  if (patch.investmentsConfirmed != null) row[8] = patch.investmentsConfirmed === true;
  if (patch.memo != null) row[9] = String(patch.memo || '');
  if (rowNo) sh.getRange(rowNo, 1, 1, SETTLEMENT_HEADERS.length).setValues([row]);
  else {
    sh.appendRow(row);
    rowNo = sh.getLastRow();
  }
  return settlementStatusFromRow_(row, rowNo);
}

function defaultWorkMonthContext_() {
  const currentYm = currentYm_();
  const previousYm = shiftYm_(currentYm, -1);
  const previousStatus = getSettlementStatusCore_(previousYm);
  if (!previousStatus.isClosed) {
    return { currentYm: currentYm, workYm: previousYm, needsSettlement: true, previousStatus: previousStatus };
  }
  return { currentYm: currentYm, workYm: currentYm, needsSettlement: false, previousStatus: previousStatus };
}

function normalizeReconciliationKind_(kind) {
  const value = String(kind || 'card').trim().toLowerCase();
  return ['card', 'account', 'cash', 'investment'].indexOf(value) > -1 ? value : 'card';
}

function reconciliationFormula_(kind) {
  const map = {
    card: '지출 합계',
    account: '수입 − 지출 − 저축 − 대출상환',
    cash: '현금 지출 합계',
    investment: '저축·투자 입금 합계'
  };
  return map[normalizeReconciliationKind_(kind)];
}

function sourceTotalsFromRows_(rows, kindBySource) {
  const map = {};
  (rows || []).forEach(tx => {
    const source = String(tx.source || '').trim();
    if (!source) return;
    const kind = normalizeReconciliationKind_((kindBySource || {})[source]);
    if (!map[source]) map[source] = { source: source, kind: kind, expense: 0, net: 0, investment: 0, count: 0 };
    const amount = numParse_(tx.amount);
    if (tx.type === '지출') map[source].expense += amount;
    if (tx.type === '저축') map[source].investment += amount;
    map[source].net += tx.type === '수입' ? amount : -amount;
    map[source].count++;
  });
  return Object.keys(map).sort().map(k => {
    const item = map[k];
    const total = item.kind === 'account' ? item.net : item.kind === 'investment' ? item.investment : item.expense;
    return {
      source: item.source,
      kind: item.kind,
      total: Math.round(total),
      count: item.count,
      formula: reconciliationFormula_(item.kind)
    };
  });
}

function reconciliationSettingsCore_(ym) {
  ym = validYm_(ym);
  const sh = reconciliationSheet_();
  const values = sh.getLastRow() >= 2
    ? sh.getRange(2, 1, sh.getLastRow() - 1, RECONCILIATION_HEADERS.length).getValues()
    : [];
  const settings = {};
  values.forEach((r, i) => {
    if (String(r[0] || '').trim() !== ym) return;
    const source = String(r[1] || '').trim();
    if (!source) return;
    settings[source] = {
      row: i + 2,
      source: source,
      kind: normalizeReconciliationKind_(r[8]),
      statementTotal: numParse_(r[2]),
      statementProvided: boolText_(r[10], r[2] !== '' && r[2] != null),
      reason: String(r[9] || ''),
      updatedAt: dateTimeText_(r[6]),
      updatedBy: String(r[7] || '')
    };
  });
  return settings;
}

function reconciliationRowsCore_(ym, sourceTotals, settings) {
  ym = validYm_(ym);
  settings = settings || reconciliationSettingsCore_(ym);
  const totalMap = {};
  (sourceTotals || []).forEach(item => { totalMap[item.source] = item; });
  const rows = [];
  Object.keys(settings).forEach(source => {
    const setting = settings[source];
    const entered = totalMap[source] ? numParse_(totalMap[source].total) : 0;
    const statement = numParse_(setting.statementTotal);
    const hasStatement = setting.statementProvided === true;
    const diff = hasStatement ? statement - entered : null;
    rows.push({
      row: setting.row,
      source: source,
      kind: setting.kind,
      formula: reconciliationFormula_(setting.kind),
      statementTotal: statement,
      statementProvided: hasStatement,
      enteredTotal: entered,
      difference: diff,
      status: !hasStatement ? '명세서 입력 필요' : Math.abs(diff) < 1 ? '일치' : '차이',
      reason: setting.reason,
      updatedAt: setting.updatedAt,
      updatedBy: setting.updatedBy
    });
    delete totalMap[source];
  });
  Object.keys(totalMap).sort().forEach(source => {
    const item = totalMap[source];
    rows.push({
      row: 0,
      source: source,
      kind: item.kind,
      formula: item.formula,
      statementTotal: 0,
      statementProvided: false,
      enteredTotal: numParse_(item.total),
      difference: null,
      status: '명세서 입력 필요',
      reason: '',
      updatedAt: '',
      updatedBy: ''
    });
  });
  return rows.sort((a, b) => a.source.localeCompare(b.source));
}

function investmentRowsCore_(ym) {
  ym = validYm_(ym);
  const previousYm = shiftYm_(ym, -1);
  const sh = investmentMonthlySheet_();
  const values = sh.getLastRow() >= 2
    ? sh.getRange(2, 1, sh.getLastRow() - 1, INVESTMENT_MONTHLY_HEADERS.length).getValues()
    : [];
  const previous = {};
  values.forEach(r => {
    if (String(r[0] || '').trim() !== previousYm) return;
    const account = String(r[1] || '').trim();
    if (account) previous[account] = numParse_(r[4]);
  });
  const rows = [];
  values.forEach((r, i) => {
    if (String(r[0] || '').trim() !== ym) return;
    const account = String(r[1] || '').trim();
    if (!account) return;
    const previousValue = numParse_(r[2]) || numParse_(previous[account]);
    const netContribution = numParse_(r[3]);
    const endValue = numParse_(r[4]);
    rows.push({
      row: i + 2,
      account: account,
      previousValue: previousValue,
      netContribution: netContribution,
      endValue: endValue,
      valuationChange: endValue - previousValue - netContribution,
      memo: String(r[6] || ''),
      updatedAt: dateTimeText_(r[7]),
      updatedBy: String(r[8] || '')
    });
  });
  return rows.sort((a, b) => a.account.localeCompare(b.account));
}

function investmentHoldingsCore_(ym) {
  ym = validYm_(ym);
  const sh = investmentHoldingSheet_();
  const values = sh.getLastRow() >= 2
    ? sh.getRange(2, 1, sh.getLastRow() - 1, INVESTMENT_HOLDING_HEADERS.length).getValues()
    : [];
  const totals = {};
  const rows = values.filter(row => String(row[0] || '').trim() === ym).map((row, i) => {
    const quantity = numParse_(row[4]);
    const averagePrice = numParse_(row[5]);
    const endPrice = numParse_(row[6]);
    const endValue = numParse_(row[7]) || quantity * endPrice;
    const profit = numParse_(row[8]) || (endValue - quantity * averagePrice);
    const account = String(row[1] || '').trim();
    totals[account] = (totals[account] || 0) + endValue;
    return {
      row: i + 2,
      account: account,
      ticker: String(row[2] || ''),
      name: String(row[3] || ''),
      quantity: quantity,
      averagePrice: averagePrice,
      endPrice: endPrice,
      endValue: endValue,
      profit: profit,
      currency: String(row[9] || 'KRW'),
      memo: String(row[10] || ''),
      updatedAt: dateTimeText_(row[11]),
      updatedBy: String(row[12] || '')
    };
  });
  return { rows: rows.sort((a, b) => (a.account + a.name).localeCompare(b.account + b.name)), totals: totals };
}

function saveInvestmentHoldings(pin, ym, items, user) {
  guard_(pin);
  ym = validYm_(ym);
  if (!Array.isArray(items)) throw new Error('투자 종목 목록 형식을 확인해줘.');
  const clean = items.map(item => {
    const account = String((item && item.account) || '').trim().slice(0, 80);
    const ticker = String((item && item.ticker) || '').trim().toUpperCase().slice(0, 24);
    const name = String((item && item.name) || '').trim().slice(0, 100);
    const quantity = numParse_(item && item.quantity);
    const averagePrice = numParse_(item && item.averagePrice);
    const endPrice = numParse_(item && item.endPrice);
    const explicitEndValue = item && item.endValueManual !== false && item.endValue != null && String(item.endValue).trim() !== '';
    const endValue = explicitEndValue ? numParse_(item.endValue) : quantity * endPrice;
    if (!account || (!ticker && !name)) return null;
    return {
      account: account, ticker: ticker, name: name || ticker, quantity: quantity,
      averagePrice: averagePrice, endPrice: endPrice, endValue: endValue,
      profit: endValue - quantity * averagePrice,
      currency: String((item && item.currency) || 'KRW').trim().toUpperCase().slice(0, 8) || 'KRW',
      memo: String((item && item.memo) || '').trim().slice(0, 300)
    };
  }).filter(Boolean).slice(0, 300);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = investmentHoldingSheet_();
    const values = sh.getLastRow() >= 2
      ? sh.getRange(2, 1, sh.getLastRow() - 1, INVESTMENT_HOLDING_HEADERS.length).getValues()
      : [];
    const kept = values.filter(row => String(row[0] || '').trim() !== ym);
    const now = new Date();
    const next = kept.concat(clean.map(item => [ym, item.account, item.ticker, item.name, item.quantity, item.averagePrice, item.endPrice, item.endValue, item.profit, item.currency, item.memo, now, String(user || '웹앱')]));
    sh.clearContents();
    sh.getRange(1, 1, 1, INVESTMENT_HOLDING_HEADERS.length).setValues([INVESTMENT_HOLDING_HEADERS]);
    if (next.length) sh.getRange(2, 1, next.length, INVESTMENT_HOLDING_HEADERS.length).setValues(next);
    upsertSettlementStatusCore_(ym, { status: '정산중', startedBy: user || '웹앱' });
    appendActionLog_('투자 종목 월말 저장', user || '웹앱', ym + ' 종목 ' + clean.length + '개 저장');
  } finally {
    lock.releaseLock();
  }
  return getSettlementData(pin, ym);
}

function settlementBatchesCore_(ym, transactions) {
  ym = validYm_(ym);
  const groups = {};
  (transactions || []).forEach(tx => {
    const id = String(tx.settlementBatch || '').trim();
    if (!id) return;
    if (!groups[id]) groups[id] = { id: id, count: 0, amount: 0, expense: 0, income: 0, save: 0, sources: {}, latestAt: tx.createdAt || '' };
    const group = groups[id];
    const amount = numParse_(tx.amount);
    group.count++;
    group.amount += amount;
    if (tx.type === '지출') group.expense += amount;
    else if (tx.type === '수입') group.income += amount;
    else if (tx.type === '저축') group.save += amount;
    if (tx.source) group.sources[tx.source] = (group.sources[tx.source] || 0) + 1;
    if (String(tx.createdAt || '') > String(group.latestAt || '')) group.latestAt = tx.createdAt;
  });
  return Object.keys(groups).map(id => {
    const group = groups[id];
    return {
      id: id, count: group.count, amount: Math.round(group.amount), expense: Math.round(group.expense), income: Math.round(group.income), save: Math.round(group.save),
      sources: Object.keys(group.sources).sort(), createdAt: group.latestAt
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.count - a.count);
}

function getSettlementBatches(pin, ym) {
  guard_(pin);
  ym = validYm_(ym || defaultWorkMonthContext_().workYm);
  const snapshot = readTxSnapshot_();
  return { ok: true, ym: ym, batches: settlementBatchesCore_(ym, monthTransactionsFromSnapshot_(ym, snapshot, 1000)) };
}

function revertSettlementBatch(pin, batchId, user) {
  guard_(pin);
  const id = String(batchId || '').trim();
  if (!id) throw new Error('되돌릴 정산 묶음이 없어.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let ym = '';
  let reverted = 0;
  try {
    const info = txMap_(true);
    if (info.map.settlementBatch == null || info.map.deleted == null) throw new Error('정산 묶음 정보를 찾지 못했어.');
    const last = info.sh.getLastRow();
    if (last < 2) throw new Error('되돌릴 거래가 없어.');
    const values = info.sh.getRange(2, 1, last - 1, info.lastCol).getValues();
    values.forEach(row => {
      if (String(row[info.map.settlementBatch] || '').trim() !== id || isDeleted_(row, info.map)) return;
      const rowYm = ymOf_(row[info.map.date]);
      if (!ym) ym = rowYm;
      if (ym !== rowYm) return;
      row[info.map.deleted] = true;
      if (info.map.updatedAt != null) row[info.map.updatedAt] = new Date();
      if (info.map.updatedBy != null) row[info.map.updatedBy] = String(user || '웹앱');
      reverted++;
    });
    if (!ym || !reverted) throw new Error('이미 되돌렸거나 해당 정산 묶음을 찾지 못했어.');
    if (getSettlementStatusCore_(ym).isClosed) throw new Error('마감된 달은 먼저 정산을 다시 연 뒤 되돌릴 수 있어.');
    info.sh.getRange(2, 1, values.length, info.lastCol).setValues(values);
    bumpDataRevision_();
    appendActionLog_('정산 묶음 되돌리기', user || '웹앱', ym + ' / ' + id + ' / ' + reverted + '건');
  } finally {
    lock.releaseLock();
  }
  return { ok: true, ym: ym, reverted: reverted, settlement: getSettlementData(pin, ym) };
}

function recurringCandidatesForSettlement_(ym, recurrings) {
  return (recurrings || []).filter(r => {
    if (!r.enabled || String(r.lastRunYm || '') === ym) return false;
    return !(r.endYm && compareYm_(ym, r.endYm) > 0);
  }).map(r => ({
    id: r.id,
    date: dateText_(dateOfRecurring_(ym, r.day)),
    type: r.type,
    cat: r.cat,
    desc: r.desc || r.name,
    amount: numParse_(r.amount),
    fixed: r.fixed || '고정',
    memo: recurringMemo_(r),
    user: r.user || '',
    source: '',
    day: r.day,
    name: r.name
  }));
}

function buildSettlementDataFromSnapshot_(ym, snapshot, context) {
  ym = validYm_(ym);
  context = context || {};
  const transactions = context.transactions || monthTransactionsFromSnapshot_(ym, snapshot, 1000);
  const summary = context.summary || monthSummaryFromSnapshot_(ym, snapshot);
  const reconciliationSettings = reconciliationSettingsCore_(ym);
  const kindBySource = {};
  Object.keys(reconciliationSettings).forEach(source => { kindBySource[source] = reconciliationSettings[source].kind; });
  const sourceTotals = sourceTotalsFromRows_(transactions, kindBySource);
  const reconciliations = reconciliationRowsCore_(ym, sourceTotals, reconciliationSettings);
  const investments = investmentRowsCore_(ym);
  const holdings = investmentHoldingsCore_(ym);
  const status = getSettlementStatusCore_(ym);
  const recurrings = context.recurrings || getRecurringsCore_();
  const reconciliationIssues = reconciliations.filter(r => r.status !== '일치').length;
  return {
    ym: ym,
    currentYm: currentYm_(),
    status: status,
    isClosed: status.isClosed,
    needsSettlement: !status.isClosed,
    summary: summary,
    transactionCount: transactions.length,
    sourceTotals: sourceTotals,
    reconciliations: reconciliations,
    reconciliationIssues: reconciliationIssues,
    investments: investments,
    investmentTotal: investments.reduce((sum, r) => sum + numParse_(r.endValue), 0),
    investmentValuationChange: investments.reduce((sum, r) => sum + numParse_(r.valuationChange), 0),
    investmentHoldings: holdings.rows,
    investmentHoldingTotals: holdings.totals,
    recurringCandidates: recurringCandidatesForSettlement_(ym, recurrings),
    uncategorizedCount: transactions.filter(t => !String(t.cat || '').trim() || String(t.cat || '') === '기타').length,
    sharedDraft: getSettlementDraftCore_(ym),
    batches: settlementBatchesCore_(ym, transactions)
  };
}

function getSettlementData(pin, ym) {
  guard_(pin);
  ym = validYm_(ym || defaultWorkMonthContext_().workYm);
  const snapshot = readTxSnapshot_();
  return buildSettlementDataFromSnapshot_(ym, snapshot);
}

function saveReconciliations(pin, ym, items, user) {
  guard_(pin);
  ym = validYm_(ym);
  if (!Array.isArray(items)) throw new Error('대사 항목 형식을 확인해줘.');
  const clean = items.map(item => ({
    source: String((item && (item.source || item.account)) || '').trim().slice(0, 80),
    kind: normalizeReconciliationKind_(item && item.kind),
    statementTotal: numParse_(item && (item.statementTotal != null ? item.statementTotal : item.total)),
    statementProvided: !!(item && (item.statementProvided === true || (item.statementProvided == null && item.statementTotal != null && String(item.statementTotal).trim() !== ''))),
    reason: String((item && item.reason) || '').trim().slice(0, 300)
  })).filter(item => item.source);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const snapshot = readTxSnapshot_();
    const kinds = {};
    clean.forEach(item => { kinds[item.source] = item.kind; });
    const totals = sourceTotalsFromRows_(monthTransactionsFromSnapshot_(ym, snapshot, 1000), kinds);
    const totalMap = {};
    totals.forEach(item => { totalMap[item.source] = numParse_(item.total); });
    const sh = reconciliationSheet_();
    const last = sh.getLastRow();
    const existing = last >= 2 ? sh.getRange(2, 1, last - 1, RECONCILIATION_HEADERS.length).getValues() : [];
    clean.forEach(item => {
      let rowNo = 0;
      for (let i = existing.length - 1; i >= 0; i--) {
        if (String(existing[i][0] || '').trim() === ym && String(existing[i][1] || '').trim() === item.source) {
          rowNo = i + 2;
          break;
        }
      }
      const entered = totalMap[item.source] || 0;
      const diff = item.statementProvided ? item.statementTotal - entered : '';
      const row = [ym, item.source, item.statementTotal, entered, diff, !item.statementProvided ? '명세서 입력 필요' : Math.abs(diff) < 1 ? '일치' : '차이', new Date(), String(user || '웹앱'), item.kind, item.reason, item.statementProvided];
      if (rowNo) sh.getRange(rowNo, 1, 1, RECONCILIATION_HEADERS.length).setValues([row]);
      else sh.appendRow(row);
    });
    upsertSettlementStatusCore_(ym, { status: '정산중', startedBy: user || '웹앱' });
    appendActionLog_('월정산 대사 저장', user || '웹앱', ym + ' 대사 ' + clean.length + '개 저장');
  } finally {
    lock.releaseLock();
  }
  return getSettlementData(pin, ym);
}

function saveInvestmentMonthly(pin, ym, items, user) {
  guard_(pin);
  ym = validYm_(ym);
  if (!Array.isArray(items)) throw new Error('투자 월말 항목 형식을 확인해줘.');
  const clean = items.map(item => ({
    account: String((item && item.account) || '').trim().slice(0, 80),
    previousValue: numParse_(item && item.previousValue),
    netContribution: numParse_(item && item.netContribution),
    endValue: numParse_(item && item.endValue),
    memo: String((item && item.memo) || '').trim().slice(0, 300)
  })).filter(item => item.account);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const previousYm = shiftYm_(ym, -1);
    const oldRows = investmentRowsCore_(previousYm);
    const previousMap = {};
    oldRows.forEach(row => { previousMap[row.account] = numParse_(row.endValue); });
    const sh = investmentMonthlySheet_();
    const last = sh.getLastRow();
    const existing = last >= 2 ? sh.getRange(2, 1, last - 1, INVESTMENT_MONTHLY_HEADERS.length).getValues() : [];
    clean.forEach(item => {
      let rowNo = 0;
      for (let i = existing.length - 1; i >= 0; i--) {
        if (String(existing[i][0] || '').trim() === ym && String(existing[i][1] || '').trim() === item.account) {
          rowNo = i + 2;
          break;
        }
      }
      const previousValue = item.previousValue || numParse_(previousMap[item.account]);
      const valuationChange = item.endValue - previousValue - item.netContribution;
      const row = [ym, item.account, previousValue, item.netContribution, item.endValue, valuationChange, item.memo, new Date(), String(user || '웹앱')];
      if (rowNo) sh.getRange(rowNo, 1, 1, INVESTMENT_MONTHLY_HEADERS.length).setValues([row]);
      else sh.appendRow(row);
    });
    upsertSettlementStatusCore_(ym, { status: '정산중', startedBy: user || '웹앱', investmentsConfirmed: clean.length > 0 });
    appendActionLog_('투자 월말 저장', user || '웹앱', ym + ' 투자계좌 ' + clean.length + '개 저장');
  } finally {
    lock.releaseLock();
  }
  return getSettlementData(pin, ym);
}

function syncInvestmentToAssets(pin, ym, user) {
  guard_(pin);
  ym = validYm_(ym);
  const investments = investmentRowsCore_(ym);
  if (!investments.length) throw new Error('먼저 투자 월말값을 한 건 이상 저장해줘.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = ss().getSheetByName(SHEET_ASSET);
    if (!sh) throw new Error('자산현황 시트를 찾지 못했어.');
    const cur = getAssets_();
    cur.items.stock.subItems = investments.map(row => ({ name: row.account, amount: numParse_(row.endValue) }));
    sh.clearContents();
    const newData = [];
    ['cash', 'safe', 'stock', 'estate', 'debt', 'saving'].forEach(key => {
      const item = cur.items[key];
      if (item && item.subItems && item.subItems.length) item.subItems.forEach(sub => newData.push([key, sub.name, numParse_(sub.amount)]));
      else if (item && numParse_(item.value) > 0) newData.push([key, item.label, numParse_(item.value)]);
    });
    if (newData.length) sh.getRange(1, 1, newData.length, 3).setValues(newData);
    bumpDataRevision_();
    appendActionLog_('투자값 자산 반영', user || '웹앱', ym + ' 투자계좌 ' + investments.length + '개 반영');
    return { ok: true, assets: getAssets_(), investments: investments };
  } finally {
    lock.releaseLock();
  }
}

function finalizeSettlementMonth(pin, options) {
  guard_(pin);
  const opt = options || {};
  const ym = validYm_(opt.ym || defaultWorkMonthContext_().workYm);
  const user = String(opt.user || '웹앱').trim() || '웹앱';
  const before = getSettlementData(pin, ym);
  if (before.isClosed) return { ok: true, alreadyClosed: true, settlement: before };
  const checklist = opt.checklist || {};
  if (checklist.transactions !== true) throw new Error('거래 입력 확인을 체크한 뒤 마감해줘.');
  if (before.reconciliationIssues > 0 && checklist.reconciliations !== true) throw new Error('대사 차이를 확인했는지 체크하거나, 대사 금액을 맞춘 뒤 마감해줘.');
  if (before.reconciliationIssues > 0 && String(checklist.reconciliationReason || '').trim().length < 2) throw new Error('대사 차이가 남았다면 마감 사유를 짧게 적어줘.');
  if (checklist.investments !== true) throw new Error('투자 월말값 입력 또는 해당 없음 확인을 체크한 뒤 마감해줘.');
  // 월말값을 저장했다면 마감 스냅샷 직전에 자산현황에도 반영한다.
  // 별도 버튼을 누르는 것을 놓쳐도 월말 자산 스냅샷이 오래된 값을 담지 않게 한다.
  const investmentSync = before.investments.length ? syncInvestmentToAssets(pin, ym, user) : null;
  const closeResult = closeMonth(pin, {
    ym: ym,
    user: user,
    memo: String(opt.memo || '').trim(),
    saveAssetSnapshot: opt.saveAssetSnapshot !== false,
    copyBudgetToNextMonth: opt.copyBudgetToNextMonth !== false,
    overwriteNextBudget: opt.overwriteNextBudget === true,
    createBackup: opt.createBackup === true,
    runAi: false
  });
  if (!closeResult || closeResult.ok === false) return closeResult;
  upsertSettlementStatusCore_(ym, {
    closed: true,
    user: user,
    transactionsConfirmed: true,
    reconciliationsConfirmed: before.reconciliationIssues === 0 || checklist.reconciliations === true,
    investmentsConfirmed: before.investments.length > 0 || checklist.investments === true,
    memo: String(opt.memo || '').trim() + (checklist.reconciliationReason ? ' / 대사확인: ' + String(checklist.reconciliationReason).trim() : '')
  });
  appendActionLog_('월정산 마감', user, ym + ' 정산 마감');
  return { ok: true, closeResult: closeResult, investmentSync: investmentSync, settlement: getSettlementData(pin, ym) };
}

function reopenSettlementMonth(pin, ym, user) {
  guard_(pin);
  ym = validYm_(ym);
  // 다시 열었으면 기존 마감 기록을 걷어낸다. 그래야 다시 마감할 때
  // 중복 방지 검사에 걸리지 않고, 📌월마감에 행이 두 개 쌓이지도 않는다.
  // (감사 기록은 작업로그에 남는다.)
  let removed = 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = getCloseMonthSheet_();
    const last = sh.getLastRow();
    if (last >= 2) {
      const vals = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = vals.length - 1; i >= 0; i--) {
        if (String(vals[i][0] || '').trim() === ym) { sh.deleteRow(i + 2); removed++; }
      }
    }
  } finally {
    lock.releaseLock();
  }
  const updated = upsertSettlementStatusCore_(ym, { reopened: true, user: user || '웹앱' });
  appendActionLog_('월정산 재개', user || '웹앱', ym + ' 정산 다시 열기' + (removed ? ' / 마감기록 ' + removed + '건 회수' : ''));
  return { ok: true, status: updated, removedCloseRecords: removed, settlement: getSettlementData(pin, ym) };
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

function monthTransactionsFromSnapshot_(ym, snapshot, limit) {
  const rows = [];
  const map = snapshot.map;
  snapshot.values.forEach((r, i) => {
    if (isDeleted_(r, map)) return;
    if (ymOf_(r[map.date]) !== ym) return;
    rows.push(txObject_(r, i + 2, map));
  });
  rows.sort((a, b) => b.row - a.row);
  return rows.slice(0, Math.max(1, Number(limit || 1000)));
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
    transactions: monthTransactionsFromSnapshot_(ym, snapshot, 1000),
    revision: getDataRevision_(),
    serverTime: Date.now(),
    insight: buildHomeInsight_(ym, {
      summary: summary,
      budget: budget,
      recurrings: recurrings,
      unassigned: unassigned
    })
  };
}

function buildTxResponse_(ym) {
  const snapshot = readTxSnapshot_();
  const summary = monthSummaryFromSnapshot_(ym, snapshot);
  const budget = getBudgetProgress_(ym, summary);
  const transactions = monthTransactionsFromSnapshot_(ym, snapshot, 1000);
  return {
    ok: true,
    ym: ym,
    summary: summary,
    budget: budget,
    recent: recentFromSnapshot_(snapshot, 20),
    transactions: transactions,
    count: transactions.length,
    revision: getDataRevision_(),
    serverTime: Date.now()
  };
}

function buildBootData_(session) {
  const work = defaultWorkMonthContext_();
  const ym = work.workYm;
  const snapshot = readTxSnapshot_();
  const summary = monthSummaryFromSnapshot_(ym, snapshot);
  const budget = getBudgetProgress_(ym, summary);
  const recurrings = getRecurringsCore_();
  const transactions = monthTransactionsFromSnapshot_(ym, snapshot, 1000);
  const settlement = buildSettlementDataFromSnapshot_(ym, snapshot, {
    summary: summary,
    transactions: transactions,
    recurrings: recurrings
  });
  settlement.showWorkspace = work.needsSettlement;
  return {
    ym: ym,
    currentYm: work.currentYm,
    workYm: work.workYm,
    sessionUser: session.user || '',
    revision: getDataRevision_(),
    cacheVersion: 2,
    serverTime: Date.now(),
    config: getConfig_(),
    summary: summary,
    budget: budget,
    recent: recentFromSnapshot_(snapshot, 20),
    transactions: transactions,
    assets: getAssets_(),
    templates: getTemplatesCore_(),
    recurrings: recurrings,
    recurringStatus: getRecurringStatusCore_(),
    assetSnapshots: getAssetSnapshotsCore_(6),
    aiReady: !!props_().getProperty('GROQ_API_KEY'),
    aiHistory: getAiHistory_(8),
    closeHistory: getCloseMonthHistoryCore_(6),
    descDict: getDescDictFromSnapshot_(snapshot),
    settlement: settlement
  };
}

// ===== 최초 부팅: 화면 그릴 데이터 한 방에 =====
function getBoot(pin) {
  return buildBootData_(guard_(pin));
}

// ===== 월 이동 시 데이터 갱신 =====
function getMonthData(pin, ym) {
  guard_(pin);
  ym = validYm_(ym || currentYm_());
  const snapshot = readTxSnapshot_();
  const summary = monthSummaryFromSnapshot_(ym, snapshot);
  const budget = getBudgetProgress_(ym, summary);
  const transactions = monthTransactionsFromSnapshot_(ym, snapshot, 1000);
  const settlement = buildSettlementDataFromSnapshot_(ym, snapshot, { summary: summary, transactions: transactions });
  settlement.showWorkspace = !settlement.isClosed && ym !== currentYm_();
  return {
    ym: ym,
    summary: summary,
    budget: budget,
    recent: recentFromSnapshot_(snapshot, 20),
    transactions: transactions,
    count: transactions.length,
    closeHistory: getCloseMonthHistoryCore_(6),
    settlement: settlement,
    revision: getDataRevision_(),
    serverTime: Date.now()
  };
}

// ===== 과거 입력 내역 기반 자동 분류 사전 생성 =====
function getDescDictFromSnapshot_(snapshot) {
  if (!snapshot || !snapshot.map || snapshot.map.desc == null) return {};
  const map = snapshot.map;
  const vals = (snapshot.values || []).slice(-2000);
  const dict = {};
  // 과거 -> 최신 순으로 덮어씌워 가장 최신의 분류를 학습하도록 함
  vals.forEach(r => {
    if (isDeleted_(r, map)) return;
    const desc = String(r[map.desc] || '').trim();
    if (!desc) return;
    const type = String(r[map.type] || '').trim();
    const cat = String(r[map.cat] || '').trim();
    const fixed = String(r[map.fixed] || '변동').trim();
    if (type && cat) {
      dict[desc] = { type: type, cat: cat, fixed: fixed };
    }
  });
  return dict;
}

function getDescDict_() {
  return getDescDictFromSnapshot_(readTxSnapshot_());
}

// ===== 설정탭 -> 드롭다운 데이터 =====
function getConfig_() {
  const defaultByType = {
    '지출': ['식비', '교통/차량', '주거/통신', '쇼핑/문화', '경조/이벤트', '건강/의료', '용돈', '기타'],
    '수입': ['월급', '부수입', '상여', '금융수입', '기타수입'],
    '저축': ['적금/예금', '청약', '투자', '비상금'],
    '대출상환': ['원금상환', '이자납입', '학자금', '기타대출']
  };
  const standardTypes = ['지출', '수입', '저축', '대출상환'];
  const sh = ss().getSheetByName(SHEET_CONFIG);
  if (!sh) return { types: standardTypes, byType: defaultByType };

  const vals = sh.getDataRange().getValues();
  const byType = {};
  for (let i = 1; i < vals.length; i++) {
    const type = String(vals[i][0]).trim();
    const cat = String(vals[i][1]).trim();
    if (!type || !cat) continue;
    if (type === '수입' && cat === '수입') continue;
    if (!byType[type]) byType[type] = [];
    if (byType[type].indexOf(cat) === -1) byType[type].push(cat);
  }

  // 지출 카테고리에 '기타'가 없으면 자동 추가 및 시트 행 반영
  if (!byType['지출']) byType['지출'] = [];
  if (byType['지출'].indexOf('기타') === -1) {
    byType['지출'].push('기타');
    try {
      sh.appendRow(['지출', '기타', '기타 잡비, 미분류 지출']);
    } catch (e) {}
  }

  // 각 타입별로 등록된 카테고리가 전혀 없으면 기본 카테고리 제공
  standardTypes.forEach(t => {
    if (!byType[t] || !byType[t].length) {
      byType[t] = (defaultByType[t] || []).slice();
    }
  });

  const order = Object.keys(byType);
  const typeRank = { '지출': 1, '수입': 2, '저축': 3, '대출상환': 4 };
  order.sort((a, b) => (typeRank[a] || 99) - (typeRank[b] || 99));

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
  if (map.source != null) row[map.source] = clean.source || '';
  if (map.settlementBatch != null) row[map.settlementBatch] = clean.settlementBatch || '';
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
    source: clean.source || '',
    settlementBatch: clean.settlementBatch || '',
    spendingMood: clean.spendingMood,
    meaning: clean.spendingMood
  };
}

function settlementDedupeKey_(tx) {
  const compact = value => String(value == null ? '' : value).trim().toLowerCase().replace(/\s+/g, ' ');
  return [
    dateText_(tx.date), compact(tx.type), compact(tx.cat), compact(tx.desc),
    Math.round(numParse_(tx.amount)), compact(tx.source)
  ].join('\u001f');
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
      return { index: index, clientId: clientId, clean: normalizeTxData_(raw.data || raw), dedupe: raw.dedupe === true, error: '' };
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
    const existingByDedupe = {};
    if (info.map.txId != null) {
      existingValues.forEach((row, i) => {
        const id = String(row[info.map.txId] || '').trim();
        if (id && !existingById[id]) existingById[id] = { row: i + 2, values: row };
        if (!isDeleted_(row, info.map)) {
          const fingerprint = settlementDedupeKey_(txObject_(row, i + 2, info.map));
          if (fingerprint && !existingByDedupe[fingerprint]) existingByDedupe[fingerprint] = { row: i + 2, values: row };
        }
      });
    }

    const newRows = [];
    const planned = {};
    const plannedByDedupe = {};
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
      const fingerprint = entry.dedupe ? settlementDedupeKey_(entry.clean) : '';
      const naturalDuplicate = fingerprint ? existingByDedupe[fingerprint] : null;
      if (naturalDuplicate) {
        duplicates++;
        results[entry.index] = {
          ok: true,
          duplicate: true,
          duplicateReason: 'matchingTransaction',
          clientId: entry.clientId,
          row: naturalDuplicate.row,
          txId: info.map.txId != null ? String(naturalDuplicate.values[info.map.txId] || '') : '',
          ym: ymOf_(naturalDuplicate.values[info.map.date]),
          transaction: txObject_(naturalDuplicate.values, naturalDuplicate.row, info.map)
        };
        return;
      }
      if (fingerprint && plannedByDedupe[fingerprint]) {
        duplicates++;
        const same = plannedByDedupe[fingerprint];
        results[entry.index] = Object.assign({}, same, { clientId: entry.clientId, duplicate: true, duplicateReason: 'sameImport' });
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
      if (fingerprint) plannedByDedupe[fingerprint] = result;
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
    bumpDataRevision_();
    appendActionLog_('빠른 거래 입력', '웹앱', response.inserted + '건 저장 / 중복 ' + response.duplicates + '건');
  }
  response.revision = getDataRevision_();
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
  bumpDataRevision_();
  return buildTxResponse_(added.ym);
}

// ===== 거래 수정 =====
function updateTransaction(pin, row, data, ym) {
  guard_(pin);
  const clean = normalizeTxData_(data);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let targetYm = ym || ymOf_(clean.date) || currentYm_();
  try {
    const info = txMap_(true);
    const { sh, map, lastCol } = info;
    const r = resolveTxRow_(row, info);
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
    if (map.source != null && data && (data.source != null || data.account != null)) newValues[map.source] = clean.source;
    if (map.settlementBatch != null && data && (data.settlementBatch != null || data.batchId != null)) newValues[map.settlementBatch] = clean.settlementBatch;
    if (map.updatedAt != null) newValues[map.updatedAt] = new Date();
    if (map.updatedBy != null) newValues[map.updatedBy] = clean.user;
    sh.getRange(r, 1, 1, lastCol).setValues([newValues]);
  } finally {
    lock.releaseLock();
  }
  bumpDataRevision_();
  return buildTxResponse_(targetYm);
}

// ===== 거래 삭제: 실제 행 삭제 대신 휴지통 처리 =====
function deleteTransaction(pin, row, ym) {
  guard_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let targetYm = ym || currentYm_();
  try {
    const info = txMap_(true);
    const { sh, map, lastCol } = info;
    const r = resolveTxRow_(row, info);
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
  bumpDataRevision_();
  return buildTxResponse_(targetYm);
}

// ===== 삭제 거래 복구 =====
function restoreTransaction(pin, row, ym) {
  guard_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const info = txMap_(true);
    const { sh, map, lastCol } = info;
    const r = resolveTxRow_(row, info);
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
    bumpDataRevision_();
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
  defs.forEach(d => { items[d.key] = { label: d.label, value: 0, subItems: [] }; });
  // 앱이 모르는 대분류 행(시트에서 직접 추가한 것 등)은 버리지 않고 그대로 들고 있다가
  // 저장할 때 다시 써준다. 예전에는 여기서 무시되고 clearContents로 지워져 영구 소실됐다.
  const unknownRows = [];

  for (let i = 0; i < vals.length; i++) {
    const colA = String(vals[i][0] || '').trim();
    const colB = String(vals[i][1] || '').trim();
    const colC = String(vals[i][2] || '').trim();
    if (!colA && !colB && !colC) continue;

    const foundDef = defs.find(d => d.key === colA || colA.indexOf(d.match) > -1 || colA.indexOf(d.label) > -1);
    const catKey = foundDef ? foundDef.key : colA;
    let itemName = '';
    let amt = 0;

    const numC = numParse_(colC);
    const numB = numParse_(colB);

    // 패턴 판별:
    // A) 신규 3열 구조: [key, 항목명, 금액] (C열이 유효한 숫자)
    if (colC !== '' && numC > 0) {
      itemName = colB || (foundDef ? foundDef.label : '항목');
      amt = numC;
    }
    // B) 기존 2열+메모 구조: [라벨, 금액, 종목명/메모] (B열이 숫자)
    else if (numB > 0) {
      amt = numB;
      // C열에 텍스트가 있으면 종목명으로 우선 사용, 없으면 A열 라벨 활용
      if (colC && numParse_(colC) === 0) {
        itemName = colC;
      } else {
        itemName = foundDef ? foundDef.label : colA;
      }
    }
    // C) 기타
    else {
      itemName = colB || colC || (foundDef ? foundDef.label : colA);
      amt = numC || numB || 0;
    }

    if (items[catKey]) {
      if (amt !== 0 || itemName) {
        items[catKey].subItems.push({ name: itemName, amount: amt });
        items[catKey].value += amt;
      }
    } else if (colA || colB || colC) {
      unknownRows.push([colA, colB, colC]);
    }
  }

  // 원본 기록 상세 내역 정의 (사용자 원본 엑셀 및 거래내역 기반)
  const defaultSubItems = {
    cash: [
      { name: 'sey콩콩 통장', amount: 5171432 }
    ],
    safe: [
      { name: '비상금', amount: 0 }
    ],
    stock: [
      { name: '지수 QQQ', amount: 3699860 },
      { name: '하콩 QQQ', amount: 3699860 },
      { name: '삼성전자(지수)', amount: 1550000 }
    ],
    estate: [
      { name: '전세보증금', amount: 48800000 }
    ],
    saving: [
      { name: '하콩보험적금(연금형태)', amount: 24987040 },
      { name: '하콩주택청약', amount: 4950000 },
      { name: '지수주택청약', amount: 4791920 },
      { name: '하콩여행적금', amount: 3000000 }
    ],
    debt: [
      { name: '학자금대출', amount: 8249000 },
      { name: '교직원공제회', amount: 5847330 }
    ]
  };

  let wasMigrated = false;
  ['stock', 'saving', 'debt', 'cash', 'estate', 'safe'].forEach(k => {
    const list = items[k].subItems || [];
    let isLumped = false;
    if (list.length === 0) {
      isLumped = true;
    } else if (list.length === 1) {
      const n = String(list[0].name || '').trim();
      const lbl = items[k].label;
      if (!n || n === '기본 항목' || n === '항목' || n === lbl ||
          n.indexOf('증권사') > -1 || n.indexOf('이미 들어간') > -1 ||
          n.indexOf('갚을 돈') > -1 || n.indexOf('은행 앱') > -1 ||
          n.indexOf('전세금/집값') > -1 || n === '비상금') {
        isLumped = true;
      }
    }
    if (isLumped) {
      const defs = defaultSubItems[k] || [];
      const curVal = items[k].value;
      const defTotal = defs.reduce((acc, cur) => acc + cur.amount, 0);
      if (curVal > 0 && defTotal > 0 && curVal !== defTotal) {
        let running = 0;
        items[k].subItems = defs.map((d, idx) => {
          if (idx === defs.length - 1) {
            return { name: d.name, amount: curVal - running };
          }
          const part = Math.round((curVal * d.amount) / defTotal);
          running += part;
          return { name: d.name, amount: part };
        });
      } else {
        items[k].subItems = JSON.parse(JSON.stringify(defs));
        items[k].value = defTotal;
      }
      wasMigrated = true;
    }
  });

  if (wasMigrated) {
    try {
      const lock = LockService.getScriptLock();
      if (lock.tryLock(5000)) {
        try {
          const newData = [];
          ['cash', 'safe', 'stock', 'estate', 'debt', 'saving'].forEach(k => {
            const info = items[k];
            if (info && info.subItems && info.subItems.length > 0) {
              info.subItems.forEach(sub => {
                newData.push([k, String((sub && sub.name) || ''), numParse_(sub && sub.amount)]);
              });
            }
          });
          (unknownRows || []).forEach(row => newData.push(row));
          sh.clearContents();
          if (newData.length > 0) {
            sh.getRange(1, 1, newData.length, 3).setValues(newData);
          }
          bumpDataRevision_();
        } finally {
          lock.releaseLock();
        }
      }
    } catch (e) {}
  }

  let total = items.cash.value + items.safe.value + items.stock.value
    + items.estate.value + items.saving.value - items.debt.value;

  return { items: items, total: total, unknownRows: unknownRows };
}

// ===== 자산 노란칸 업데이트 =====
function updateAssetCategory(pin, key, subItems) {
  guard_(pin);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = ss().getSheetByName(SHEET_ASSET);
    if (!sh) throw new Error('"' + SHEET_ASSET + '" 시트를 찾지 못했어.');
    const cur = getAssets_();

    if (!cur.items[key]) throw new Error('알 수 없는 자산 대분류야: ' + key);
    cur.items[key].subItems = subItems || [];

    const newData = [];
    ['cash', 'safe', 'stock', 'estate', 'debt', 'saving'].forEach(k => {
      const info = cur.items[k];
      if (info && info.subItems && info.subItems.length > 0) {
        info.subItems.forEach(sub => {
          newData.push([k, String((sub && sub.name) || ''), numParse_(sub && sub.amount)]);
        });
      } else if (info && info.value > 0) { // Fallback for old unmigrated data without subItems
        newData.push([k, info.label, info.value]);
      }
    });
    // 앱이 인식하지 못한 행도 반드시 되돌려 쓴다. 이게 빠지면 저장 한 번에 영구 소실된다.
    (cur.unknownRows || []).forEach(row => newData.push(row));

    // clearContents는 전부 지우므로, 반드시 되쓸 데이터를 모두 모은 뒤에 실행한다.
    sh.clearContents();
    if (newData.length > 0) {
      sh.getRange(1, 1, newData.length, 3).setValues(newData);
    }

    bumpDataRevision_();
    return { ok: true, assets: getAssets_(), revision: getDataRevision_() };
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

function bulkUpdateCategory(pin, payload) {
  const session = guard_(pin);
  payload = payload || {};
  const ids = payload.ids || [];
  const newCat = String(payload.newCat || '').trim();
  const ym = payload.ym;
  // 입력자는 지수·하콩만 유효하다. 예전에는 존재하지 않는 사람 이름이 하드코딩돼 있어
  // 수정자 열과 작업로그가 오염됐다.
  const user = normalizeUser_(payload.user || session.user || '') || '웹앱';

  if (!ids.length || !newCat) throw new Error('잘못된 요청입니다.');

  let changed = 0;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const { sh, map, lastCol } = txMap_(true);
    const last = sh.getLastRow();
    if (last < 2) throw new Error('데이터가 없습니다.');

    const rows = sh.getRange(2, 1, last - 1, lastCol).getValues();

    // 거래ID -> 행번호 맵을 한 번만 만든다.
    // 예전에는 선택 건마다 resolveTxRow_가 ID 열 전체를 다시 읽어서
    // 50건 선택 시 전체 열 조회가 50번 일어났다.
    const rowByTxId = {};
    if (map.txId != null) {
      rows.forEach((r, i) => {
        const id = String(r[map.txId] || '').trim();
        if (id && !rowByTxId[id]) rowByTxId[id] = i + 2;
      });
    }

    const now = new Date();
    const touched = [];
    ids.forEach(idStr => {
      const raw = String(idStr == null ? '' : idStr).trim();
      if (!raw) return;
      const rowNo = /^\d+$/.test(raw) ? safeRowNumber_(Number(raw)) : rowByTxId[raw];
      if (!rowNo) return;
      const rIdx = rowNo - 2;
      if (rIdx < 0 || rIdx >= rows.length) return;

      const row = rows[rIdx];
      if (isDeleted_(row, map)) return;
      row[map.cat] = newCat;
      if (map.updatedAt != null) row[map.updatedAt] = now;
      if (map.updatedBy != null) row[map.updatedBy] = user;
      touched.push(rowNo);
      changed++;
    });

    // 연속된 행은 한 번의 setValues로 묶어 쓴다.
    touched.sort((a, b) => a - b);
    let i = 0;
    while (i < touched.length) {
      let j = i;
      while (j + 1 < touched.length && touched[j + 1] === touched[j] + 1) j++;
      const startRow = touched[i];
      const block = rows.slice(startRow - 2, touched[j] - 1);
      sh.getRange(startRow, 1, block.length, lastCol).setValues(block);
      i = j + 1;
    }

    appendActionLog_('일괄변경', user, changed + '건을 ' + newCat + '로 변경 완료');
  } finally {
    lock.releaseLock();
  }
  if (changed > 0) bumpDataRevision_();
  return getMonthData(pin, ym || currentYm_());
}

// ===== 🔔 웹 푸시 및 스마트 알림 (Web Push & Smart Notifications) =====
function notifSheet_() {
  return getOrCreateSheet_(SHEET_NOTIF, NOTIF_HEADERS, []);
}

function savePushSubscription(pin, sub, user) {
  guard_(pin);
  if (!sub || !sub.endpoint) throw new Error('구독 정보가 올바르지 않아.');
  const sh = notifSheet_();
  const userName = normalizeUser_(user || '하콩') || '하콩';
  const now = new Date();
  
  const lastRow = sh.getLastRow();
  let updated = false;
  if (lastRow >= 2) {
    const vals = sh.getRange(2, 1, lastRow - 1, 7).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (vals[i][1] === 'WebPush구독' && vals[i][4] === sub.endpoint) {
        sh.getRange(i + 2, 1, 1, 7).setValues([[
          now, 'WebPush구독', userName, 'WebPush구독', sub.endpoint, '활성', JSON.stringify(sub)
        ]]);
        updated = true;
        break;
      }
    }
  }
  if (!updated) {
    sh.appendRow([now, 'WebPush구독', userName, 'WebPush구독', sub.endpoint, '활성', JSON.stringify(sub)]);
  }
  appendActionLog_('푸시구독 등록', userName, String(sub.endpoint || '').slice(0, 45) + '...');
  return { ok: true, savedAt: Date.now() };
}

function checkDueNotificationsCore_(ym) {
  ym = ym || currentYm_();
  const now = new Date();
  const currentDay = Number(Utilities.formatDate(now, TZ, 'd'));
  const recurrings = getRecurringsCore_();
  const notifs = [];
  
  // 1. 고정비 결제 D-Day 및 D-1 알림
  (recurrings || []).forEach(r => {
    if (r.enabled === false) return;
    const dueDay = Number(r.day || 0);
    const amtStr = won_(r.amount || 0);
    if (dueDay === currentDay) {
      notifs.push({
        id: 'rec_dday_' + r.id + '_' + ym,
        type: 'recurring_dday',
        tag: 'dday_' + r.id,
        title: '🔔 오늘 고정비 결제일 (' + r.name + ')',
        body: r.name + ' ' + amtStr + '이 오늘 출금/결제돼요.',
        dueDay: dueDay,
        amount: r.amount,
        url: '/app.html?tab=recurring'
      });
    } else if (dueDay === currentDay + 1) {
      notifs.push({
        id: 'rec_d1_' + r.id + '_' + ym,
        type: 'recurring_d1',
        tag: 'd1_' + r.id,
        title: '⏰ 내일 고정비 결제 예정 (' + r.name + ')',
        body: r.name + ' ' + amtStr + '이 내일 결제될 예정이에요.',
        dueDay: dueDay,
        amount: r.amount,
        url: '/app.html?tab=recurring'
      });
    }
  });

  // 2. 월초 정산 안내 (매월 1일 ~ 5일)
  if (currentDay >= 1 && currentDay <= 5) {
    const prevYm = shiftYm_(ym, -1);
    const settlement = getSettlementStatusCore_(prevYm);
    if (!settlement || !settlement.isClosed) {
      notifs.push({
        id: 'settlement_due_' + prevYm,
        type: 'settlement',
        tag: 'settlement_' + prevYm,
        title: '📋 ' + prevYm + ' 가계부 월초 정산 시간!',
        body: '지난달 카드 명세서 대사와 투자 평가액을 맞추고 정산을 마감해주세요.',
        dueDay: currentDay,
        url: '/app.html?tab=home'
      });
    }
  }

  return notifs;
}

function checkDueNotifications(pin, ym) {
  guard_(pin);
  const items = checkDueNotificationsCore_(ym);
  return { ok: true, ym: ym || currentYm_(), notifications: items };
}

function sendNotificationTest(pin, user) {
  guard_(pin);
  const userName = normalizeUser_(user || '하콩') || '하콩';
  const now = new Date();
  const sh = notifSheet_();
  sh.appendRow([now, '테스트', userName, '테스트 알림', '알림 시스템이 정상 작동 중입니다.', '발송완료', '']);
  return {
    ok: true,
    title: '🔔 sey콩콩 가계부 알림 테스트',
    body: '축하해요! 가계부 알림이 완벽하게 연결되었습니다.',
    sentAt: Date.now()
  };
}

function getNotifications(pin, limit) {
  guard_(pin);
  const sh = notifSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const count = Math.min(Number(limit) || 20, lastRow - 1);
  const startRow = Math.max(2, lastRow - count + 1);
  const vals = sh.getRange(startRow, 1, count, 7).getValues();
  const rows = [];
  for (let i = vals.length - 1; i >= 0; i--) {
    rows.push({
      date: dateTimeText_(vals[i][0]),
      type: vals[i][1],
      user: vals[i][2],
      title: vals[i][3],
      body: vals[i][4],
      status: vals[i][5],
      meta: vals[i][6]
    });
  }
  return rows;
}

