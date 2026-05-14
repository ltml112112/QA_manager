(function() {
'use strict';

/* ── Firebase 초기화 (공통 설정 사용) ──────────────
   테마 동기화·Firebase config는 index.html에서 공통 모듈 로드.
─────────────────────────────────────────────────── */
QA_initFirebase();
var DB = firebase.database().ref(QA_DB_PATHS.pnFlowDocs);
var SHIP_DB = firebase.database().ref(QA_DB_PATHS.pnFlowShipments);

/* ── 현재 사용자 & 초기 로드 ───────────────────────
   _currentUser는 auth 변화 추적용으로만 사용. DB 리스너 부착은
   QA_whenAuthReady에서 별도로 시작 (null 발화로 listener가 붙어
   PERMISSION_DENIED로 영구 죽는 것 방지).
─────────────────────────────────────────────────── */
var _currentUser = null;
firebase.auth().onAuthStateChanged(function(u) { _currentUser = u; });

/* ── WebSocket 연결 상태 진단 (.info/connected) ────────
   Firebase 특수 경로 — auth 불필요, 네트워크 레벨 연결 상태만 반환.
   이게 true 안 뜨면 WebSocket 자체가 안 열리는 환경 문제.
─────────────────────────────────────────────────── */
(function () {
  var connT0 = Date.now();
  firebase.database().ref('.info/connected').on('value', function (s) {
    console.log('[pn_flow] .info/connected:', s.val(), { ms: Date.now() - connT0 });
  });
})();

/* ── 상수 ───────────────────────────────────────── */
var CHIP_MAP = {
  wet: ['Si pass', 'Column', 'DCB', 'CF', 'MC/Hex', 'Act/Hex', 'EA/Hex', 'Tol/Act/Hex', 'DCB/Act/Hex', 'DCB/ACT', '결정화', '재결정', '고운'],
  subl: ['충주', '용인', '4,5-zone 수득', '6,7-zone 불순물 제거작업', '6,7-zone 취합', '소자평가 fail'],
  react: ['DMA', 'MeOH/H2O', '결정화'],
  solid: ['MeOH/H2O', '결정화', '고체 여과 후 건조', '농축 및 고체 여과 후 건조', '건조'],
  collect: []
};

var TYPE_LABEL = { react:'반응', solid:'결정화', wet:'Wet', subl:'승화', collect:'여액' };
var SEC_LABEL  = { P:'P Type', N:'N Type', S:'Single' };

/* ── 상태 ───────────────────────────────────────── */
var STATE = {
  docs: {}, currentId: null, editKey: null, timer: null,
  collapsedSecs: new Set(), collapsedLots: new Set(),
  shipments: {}, ship: { open: false, view: 'list', selectedId: null, timer: null, filterDocId: null },
  proc: { open: false, docId: null, sectionId: null, lotId: null, refineId: null }
};

var _undoStack = [];
var MAX_UNDO = 20;

function pushUndo() {
  var d = getDoc(); if(!d) return;
  _undoStack.push(JSON.stringify(d.sections));
  if (_undoStack.length > MAX_UNDO) _undoStack.shift();
  updateUndoBtn();
}

function updateUndoBtn() {
  var btn = document.getElementById('pf-undo-btn'); if(!btn) return;
  var n = _undoStack.length;
  btn.disabled = n === 0;
  btn.textContent = n > 0 ? '↩ 되돌리기 (' + n + ')' : '↩ 되돌리기';
}

/* ── 상대 시간 ─────────────────────────────────── */
function timeAgo(ts) {
  if (!ts) return '';
  var diff = Date.now() - ts;
  var min = Math.floor(diff / 60000);
  if (min < 1)  return '방금';
  if (min < 60) return min + '분 전';
  var hr = Math.floor(min / 60);
  if (hr < 24)  return hr + '시간 전';
  var d = Math.floor(hr / 24);
  return d < 7 ? d + '일 전' : new Date(ts).toLocaleDateString('ko-KR');
}

/* ── 헬퍼 함수 ──────────────────────────────────── */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function todayStr() { return new Date().toISOString().slice(0,10); }
function getDoc() { return STATE.docs[STATE.currentId]; }

function findStep(sid) {
  var doc = getDoc(); if(!doc) return;
  for(var s of doc.sections) for(var l of s.lots) for(var st of l.steps) if(st.id===sid) return st;
}
function findLot(lid) {
  var doc = getDoc(); if(!doc) return;
  for(var s of doc.sections) for(var l of s.lots) if(l.id===lid) return l;
}
function findStepLot(sid) {
  var doc = getDoc(); if(!doc) return;
  for(var s of doc.sections) for(var l of s.lots) if(l.steps.some(st=>st.id===sid)) return l;
}
function findLotSec(lid) {
  var doc = getDoc(); if(!doc) return;
  for(var s of doc.sections) if(s.lots.some(l=>l.id===lid)) return s;
}

function stepNum(steps, idx, type) { var n=0; for(var i=0;i<=idx;i++) if(steps[i].type===type) n++; return n; }
function stepLbl(s, n) {
  if(s.type==='wet') return n+'차 Wet 정제';
  if(s.type==='subl') return n+'차 '+(s.location ? s.location+' ' : '')+'승화정제';
  if(s.type==='react') return '반응';
  if(s.type==='solid') return '결정화';
  if(s.type==='collect') return '여액 취합';
  return '';
}

/* ── 팩토리 ────────────────────────────────────── */
function mkDoc(o) { return Object.assign({id:uid(),title:'새 Flow',material:'',author:'',date:todayStr(),sections:[]},o); }
function mkSec(t) { return {id:uid(),type:t||'P',lots:[]}; }
function mkLot(n,s) { return {id:uid(),name:n||'',subName:s||'',steps:[],refines:[]}; }
function mkStep(t,o) { return Object.assign({id:uid(),type:t||'wet',detail:'',tag:null,location:'',date:'',operator:''},o); }
function mkRefine(o) { return Object.assign({id:uid(),name:'',qty:null,unit:'g'},o||{}); }

/* ── Lot 최종상태 ───────────────────────────────── */
/* 마지막 "비-예정" 스텝의 tag로 판정. 없으면 'progress' */
function lotStatus(lot) {
  var steps = lot.steps || [];
  for (var i = steps.length - 1; i >= 0; i--) {
    var t = steps[i].tag;
    if (t === 'pass') return 'pass';
    if (t === 'fail') return 'fail';
  }
  return 'progress';
}

/* ── 재고/출하 — 정제 Batch 기반 ────────────────────
   stock = refine.qty − Σ(출하 components.qty[정규화]).
   shipment.deleted=true 제외. component.unit ≠ refine.unit이면 grams 거쳐 환산.
─────────────────────────────────────────────────── */
var UNIT_TO_G = { mg: 0.001, g: 1, kg: 1000 };

function convertQty(qty, fromUnit, toUnit) {
  if (qty == null || isNaN(qty)) return 0;
  var fr = UNIT_TO_G[fromUnit] || 1;
  var tr = UNIT_TO_G[toUnit] || 1;
  return qty * fr / tr;
}

/* 정제 Batch가 소비된 총량 (refine.unit 기준) */
function refineConsumed(refineId, refineUnit) {
  var total = 0;
  var ships = STATE.shipments || {};
  Object.keys(ships).forEach(function(sid) {
    var sh = ships[sid];
    if (!sh || sh.deleted) return;
    var comps = Array.isArray(sh.components) ? sh.components : (sh.components ? Object.values(sh.components) : []);
    comps.forEach(function(c) {
      if (c && c.refineId === refineId) {
        total += convertQty(c.qty, c.unit || 'g', refineUnit || 'g');
      }
    });
  });
  return total;
}

/* 정제 Batch가 포함된 비-삭제 출하 목록 — 역방향 링크용 */
function refineShipments(refineId) {
  var out = [];
  var ships = STATE.shipments || {};
  Object.keys(ships).forEach(function(sid) {
    var sh = ships[sid];
    if (!sh || sh.deleted) return;
    var comps = Array.isArray(sh.components) ? sh.components : (sh.components ? Object.values(sh.components) : []);
    comps.forEach(function(c) {
      if (c && c.refineId === refineId) {
        out.push({ shipId: sid, sh: sh, qty: c.qty, unit: c.unit || 'g' });
      }
    });
  });
  out.sort(function(a,b){ return (b.sh.date||'').localeCompare(a.sh.date||''); });
  return out;
}

function refineStock(refine) {
  var rq = (refine && typeof refine.qty === 'number') ? refine.qty : null;
  var unit = (refine && refine.unit) || 'g';
  var hasQty = rq !== null && !isNaN(rq);
  if (!hasQty) return { stock: null, qty: null, unit: unit, hasQty: false, consumed: 0, ratio: 0 };
  var consumed = refineConsumed(refine.id, unit);
  var stock = rq - consumed;
  if (stock < 0) stock = 0;
  var ratio = rq > 0 ? stock / rq : 0;
  return { stock: stock, qty: rq, unit: unit, hasQty: true, consumed: consumed, ratio: ratio };
}

/* refineId 집합을 사용하는 비-삭제 출하 추출 (cascade delete 사전경고 + 정리용) */
function shipsContainingRefines(refineIds) {
  var set = {}; refineIds.forEach(function(rid){ set[rid] = true; });
  var hits = [];
  Object.keys(STATE.shipments || {}).forEach(function(sid) {
    var sh = STATE.shipments[sid];
    if (!sh || sh.deleted) return;
    var comps = Array.isArray(sh.components) ? sh.components : [];
    var idx = [];
    comps.forEach(function(c, i) { if (c && c.refineId && set[c.refineId]) idx.push(i); });
    if (idx.length) hits.push({ shId: sid, sh: sh, indices: idx });
  });
  return hits;
}

/* 비-삭제 출하에서 주어진 refineId의 component 모두 제거. 호출자가 confirm 후 호출.
   반환: 제거된 component 총 개수 */
function cleanRefineComponentsFromShipments(refineIds) {
  var hits = shipsContainingRefines(refineIds);
  if (!hits.length) return 0;
  var set = {}; refineIds.forEach(function(rid){ set[rid] = true; });
  var total = 0;
  hits.forEach(function(h) {
    var sh = h.sh;
    var keep = (sh.components || []).filter(function(c) { return !c.refineId || !set[c.refineId]; });
    var removed = (sh.components || []).length - keep.length;
    if (removed > 0) {
      sh.components = keep;
      saveShipNow(sh.id);
      total += removed;
    }
  });
  return total;
}

/* refineIds 삭제 전 confirm. 출하 참조 0이면 그냥 true.
   참조 있으면 list 보여주고 OK 누르면 cascade clean 후 true.
   취소면 false. */
function confirmCascadeDelete(refineIds, kindLabel) {
  var hits = shipsContainingRefines(refineIds);
  if (!hits.length) return true;
  var totalComps = hits.reduce(function(s, h){ return s + h.indices.length; }, 0);
  var preview = hits.slice(0, 6).map(function(h) {
    return '· ' + (h.sh.shipName || '(이름 없음)') + ' — ' + h.indices.length + '개';
  }).join('\n');
  var more = hits.length > 6 ? '\n· ...외 ' + (hits.length - 6) + '건' : '';
  var msg = (kindLabel || '항목') + '이(가) 출하 ' + hits.length + '건의 ' + totalComps + '개 컴포넌트에서 사용 중입니다:\n\n' +
    preview + more + '\n\n삭제 시 해당 출하 컴포넌트도 함께 제거됩니다 (출하 자체는 유지).\n계속하시겠습니까?';
  if (!confirm(msg)) return false;
  cleanRefineComponentsFromShipments(refineIds);
  return true;
}

/* 고아 component 스캔 — 비-삭제 출하 중 lot 또는 refine이 사라진 component 추출 */
function findOrphanComponents() {
  var orphans = [];
  Object.keys(STATE.shipments || {}).forEach(function(sid) {
    var sh = STATE.shipments[sid];
    if (!sh || sh.deleted) return;
    var comps = Array.isArray(sh.components) ? sh.components : [];
    comps.forEach(function(c, i) {
      var doc = c && STATE.docs[c.docId];
      var sec = doc && (doc.sections||[]).find(function(s){return s.id===c.sectionId;});
      var lot = sec && (sec.lots||[]).find(function(l){return l.id===c.lotId;});
      var refine = lot && c.refineId && (lot.refines||[]).find(function(r){return r.id===c.refineId;});
      var isOrphan = !lot || (c.refineId && !refine);
      if (isOrphan) orphans.push({ shId: sid, sh: sh, idx: i, c: c });
    });
  });
  return orphans;
}

function fmtQty(n, unit) {
  if (n === null || n === undefined || isNaN(n)) return '';
  var s = (Math.round(n * 100) / 100).toString();
  return s + (unit || 'g');
}

/* 출하 Lot 팩토리 */
function mkShip(o) {
  return Object.assign({
    id: uid(),
    shipName: '',
    customer: '',
    date: todayStr(),
    note: '',
    components: [],
    deleted: false,
    createdAt: Date.now(),
    createdBy: (_currentUser && _currentUser.email) || ''
  }, o || {});
}

/* 출하 Lot 합계 (단위는 첫 component의 단위, 혼합이면 grams로 정규화) */
function shipTotal(sh) {
  var comps = Array.isArray(sh.components) ? sh.components : (sh.components ? Object.values(sh.components) : []);
  if (!comps.length) return { qty: 0, unit: 'g' };
  var allG = 0;
  var firstUnit = comps[0].unit || 'g';
  var sameUnit = true;
  comps.forEach(function(c) {
    if ((c.unit || 'g') !== firstUnit) sameUnit = false;
    allG += convertQty(c.qty, c.unit || 'g', 'g');
  });
  if (sameUnit) return { qty: convertQty(allG, 'g', firstUnit), unit: firstUnit };
  return { qty: allG, unit: 'g' };
}

/* ── 저장 상태 표시 ─────────────────────────────── */
var _connected = true; // .info/connected 구독 전까지 가정
function setSaveStatus(state, msg) {
  var el = document.getElementById('pf-save-status'); if(!el) return;
  el.classList.remove('pf-ss-idle','pf-ss-saving','pf-ss-saved','pf-ss-error','pf-ss-offline');
  el.classList.add('pf-ss-'+state);
  var labels = { idle:'대기', saving:'저장 중...', saved:'저장됨', error:'저장 실패', offline:'오프라인' };
  var txt = el.querySelector('.pf-ss-txt'); if(txt) txt.textContent = labels[state] || state;
  el.title = msg || labels[state] || '';
}

/* ── Firebase 저장 ─────────────────────────────── */
var _pendingSave = false;
function flushSave() {
  if (!_pendingSave) return;
  clearTimeout(STATE.timer);
  _pendingSave = false;
  performSave();
}
function performSave() {
  var d = getDoc(); if(!d) return;
  d.updatedAt = Date.now();
  d.updatedBy = (_currentUser && _currentUser.email) || '';
  if (!_connected) { setSaveStatus('offline', '네트워크 연결을 확인하세요.'); return; }
  setSaveStatus('saving');
  DB.child(d.id).set(d)
    .then(function() {
      setSaveStatus('saved', '저장됨 ' + new Date().toLocaleTimeString());
      renderUpdatedInfo();
    })
    .catch(function(err) {
      console.error('[pn_flow] Firebase set 실패:', err && err.code, err && err.message, err);
      setSaveStatus('error', '저장 실패: ' + (err && (err.code || err.message) || '알 수 없는 오류'));
    });
}
function save() {
  clearTimeout(STATE.timer);
  _pendingSave = true;
  setSaveStatus('saving');
  STATE.timer = setTimeout(function() {
    _pendingSave = false;
    performSave();
  }, 1000);
}

/* ── 출하 Lot 저장 ───────────────────────────────
   docs와 분리된 debounce. 즉시 저장이 필요한 경우 saveShipNow 사용.
─────────────────────────────────────────────────── */
function performSaveShip(sh) {
  if (!sh || !sh.id) return;
  sh.updatedAt = Date.now();
  sh.updatedBy = (_currentUser && _currentUser.email) || '';
  if (!_connected) { setSaveStatus('offline', '네트워크 연결을 확인하세요.'); return; }
  setSaveStatus('saving');
  SHIP_DB.child(sh.id).set(sh)
    .then(function() { setSaveStatus('saved', '출하 저장됨 ' + new Date().toLocaleTimeString()); })
    .catch(function(err) {
      console.error('[pn_flow] 출하 저장 실패:', err && err.code, err && err.message);
      setSaveStatus('error', '출하 저장 실패: ' + (err && (err.code || err.message) || '알 수 없는 오류'));
    });
}
function saveShipNow(shId) {
  var sh = STATE.shipments[shId]; if (!sh) return;
  clearTimeout(STATE.ship.timer);
  performSaveShip(sh);
}
function saveShip(shId) {
  var sh = STATE.shipments[shId]; if (!sh) return;
  clearTimeout(STATE.ship.timer);
  setSaveStatus('saving');
  STATE.ship.timer = setTimeout(function() { performSaveShip(sh); }, 600);
}

window.addEventListener('beforeunload', flushSave);

var _firstLoad = true;
var SEED_ID  = 'phn295-example'; // 고정 ID — 버전 바꾸면 자동 갱신
var SEED_VER = 5;
var E1884_ID = 'e1884-initial-flow'; // E1884 초기 문서 — 없을 때만 생성

/* ── Firebase 배열 정규화 ─────────────────────────
   Firebase RTDB는 배열을 {"0":..,"1":..} 객체로 저장.
   읽어올 때 sequential key이면 자동 복원하지만
   삭제·null 항목 등으로 키가 비면 객체로 반환됨.
   모든 sections/lots/steps를 반드시 JS 배열로 보장. */
function normDoc(d) {
  if (!d) return d;
  if (!Array.isArray(d.sections)) d.sections = d.sections ? Object.values(d.sections) : [];
  d.sections.forEach(function(s) {
    if (!Array.isArray(s.lots)) s.lots = s.lots ? Object.values(s.lots) : [];
    s.lots.forEach(function(l) {
      if (!Array.isArray(l.steps)) l.steps = l.steps ? Object.values(l.steps) : [];
      if (!Array.isArray(l.refines)) l.refines = l.refines ? Object.values(l.refines) : [];
      if (!Array.isArray(l.deletedSteps)) l.deletedSteps = l.deletedSteps ? Object.values(l.deletedSteps) : [];
    });
  });
  return d;
}

var _loadRetryMs = 500;
var _loadT0 = null;
var _loadStuckTimer = null;

/* ── 로딩 오버레이 토글 ───────────────────────────
   첫 snapshot 도착 시 #loadingOverlay 제거. error cb에서 "재연결 중..."
   30s 응답 없으면 stuck UI + 다시 시도 버튼.
─────────────────────────────────────────────────── */
function _setLoadingState(state, msg) {
  var overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  if (state === 'hide') { overlay.style.display = 'none'; return; }
  overlay.style.display = '';
  var txt = overlay.querySelector('.lo-text');
  if (txt) txt.textContent = msg || '데이터 로딩 중...';
  overlay.classList.toggle('lo-retry', state === 'retry');
  overlay.classList.toggle('lo-stuck', state === 'stuck');
  var btn = overlay.querySelector('.lo-retry-btn');
  if (btn) btn.style.display = (state === 'stuck') ? '' : 'none';
}

function _clearStuckTimer() {
  if (_loadStuckTimer) { clearTimeout(_loadStuckTimer); _loadStuckTimer = null; }
}

function load() {
  _loadT0 = Date.now();
  console.log('[pn_flow] DB.on(value) 부착');
  _clearStuckTimer();
  _loadStuckTimer = setTimeout(function() {
    console.warn('[pn_flow] 30s 응답 없음, stuck UI 표시');
    _setLoadingState('stuck', '연결이 지연되고 있습니다');
  }, 30000);

  DB.on('value', function(snap) {
    _clearStuckTimer();
    console.log('[pn_flow] 첫 snapshot 도착', { ms: Date.now() - _loadT0 });
    _setLoadingState('hide');
    _loadRetryMs = 500;  // 성공 시 backoff 리셋
    var incoming = snap.val() || {};

    if (_firstLoad) {
      _firstLoad = false;

      // incoming 병합 — 로컬에서 막 생성한 문서(아직 저장 전)나 편집 중인 문서는 보존
      Object.keys(incoming).forEach(function(id) {
        if (id === STATE.currentId && (STATE.editKey || _pendingSave)) return;
        STATE.docs[id] = normDoc(incoming[id]);
      });

      // 고정 ID로 예시 문서 유무·버전 확인 → 없거나 구버전이면 (재)생성
      var ex = STATE.docs[SEED_ID];
      if (!ex || ex._seed !== SEED_VER) {
        var doc = buildSeed();
        doc.id   = SEED_ID;
        doc._seed = SEED_VER;
        STATE.docs[SEED_ID] = doc;
        DB.child(SEED_ID).set(doc);
      }

      // E1884 초기 문서 — 없을 때만 생성 (사용자 편집 내용 보존)
      if (!STATE.docs[E1884_ID]) {
        var e1884doc = buildE1884();
        e1884doc.id = E1884_ID;
        STATE.docs[E1884_ID] = e1884doc;
        DB.child(E1884_ID).set(e1884doc);
      }

      render();
      return;
    }

    /* ── 실시간 업데이트 ────────────────────────────── */
    Object.keys(incoming).forEach(function(id) {
      if (id === STATE.currentId && (STATE.editKey || _pendingSave)) return;
      STATE.docs[id] = normDoc(incoming[id]);
    });
    // 다른 세션에서 삭제된 문서 반영
    // — 단, 로컬 편집/저장 대기 중인 문서는 삭제 제외
    //   (아직 Firebase에 없는 신규 문서가 삭제되면 currentId가 null로 리셋되고
    //    이후 save debounce가 터졌을 때 getDoc()이 undefined → save 포기가 됨)
    Object.keys(STATE.docs).forEach(function(id) {
      var isActive = id === STATE.currentId && (STATE.editKey || _pendingSave);
      if (!incoming[id] && !isActive) delete STATE.docs[id];
    });
    // 현재 보던 문서가 삭제됐으면 목록으로
    if (STATE.currentId && !STATE.docs[STATE.currentId]) {
      STATE.currentId = null;
      STATE.editKey = null;
    }

    if (!STATE.currentId) {
      renderList();
    } else if (!STATE.editKey) {
      render();
    }
    if (STATE.proc.open) renderProcessPopup();
  }, function(err) {
    _clearStuckTimer();
    // PERMISSION_DENIED 등 listener cancel 시 silent death 방지
    console.warn('[pn_flow] DB listener cancelled:', err && err.code, { ms: Date.now() - _loadT0 });
    _setLoadingState('retry', '연결 재시도 중...');
    DB.off('value');
    var wait = Math.min(_loadRetryMs, 8000);
    _loadRetryMs = Math.min(_loadRetryMs * 2, 8000);
    setTimeout(function() {
      QA_whenAuthReady(load);
    }, wait);
  });
}

window._pnFlowManualRetry = function () {
  console.log('[pn_flow] 사용자 수동 재시도');
  _clearStuckTimer();
  _setLoadingState('loading', '데이터 로딩 중...');
  try { DB.off('value'); } catch (e) {}
  try { SHIP_DB.off('value'); } catch (e) {}
  QA_whenAuthReady(function() { load(); loadShipments(); });
};

/* ── 출하 Lot 리스너 ─────────────────────────────
   pn_flow_shipments는 docs와 별도 path. 동일한 backoff 패턴 적용.
   error cb 미등록 시 silent death — 빈 화면 + 재고 차감 0 고착.
─────────────────────────────────────────────────── */
var _shipRetryMs = 500;
function loadShipments() {
  console.log('[pn_flow] SHIP_DB.on(value) 부착');
  SHIP_DB.on('value', function(snap) {
    _shipRetryMs = 500;
    var incoming = snap.val() || {};
    STATE.shipments = {};
    Object.keys(incoming).forEach(function(id) {
      var sh = incoming[id];
      // components 배열 정규화
      if (sh.components && !Array.isArray(sh.components)) {
        sh.components = Object.values(sh.components);
      }
      STATE.shipments[id] = sh;
    });
    // 재고 배지 갱신 — 현재 보고 있는 doc의 모든 정제 Batch
    if (STATE.currentId && getDoc()) {
      (getDoc().sections || []).forEach(function(s) {
        (s.lots || []).forEach(function(l) {
          (l.refines || []).forEach(function(r) { renderRefineStock(r.id); });
        });
      });
    }
    // 출하 모달이 열려 있으면 다시 그리기
    if (STATE.ship.open) renderShipModal();
    // 공정 미리보기 팝업이 열려 있으면 잔량 배지 갱신
    if (STATE.proc.open) renderProcessPopup();
  }, function(err) {
    console.warn('[pn_flow] SHIP_DB listener cancelled:', err && err.code);
    SHIP_DB.off('value');
    var wait = Math.min(_shipRetryMs, 8000);
    _shipRetryMs = Math.min(_shipRetryMs * 2, 8000);
    setTimeout(function() { QA_whenAuthReady(loadShipments); }, wait);
  });
}

/* ── 인증 준비 후 DB 부착 ────────────────────────
   onAuthStateChanged 직접 사용 시 첫 발화가 null이면 listener가
   permission denied로 영구 죽음. QA_whenAuthReady가 first non-null
   user 또는 5초 timeout 후 발화.
─────────────────────────────────────────────────── */
QA_whenAuthReady(function() { load(); loadShipments(); });

/* ── 뮤테이터 ───────────────────────────────────── */
window.APP = {
  onSearchInput: function() { renderList(); },
  initSortable: function() {
    if (typeof Sortable === 'undefined') return;
    var docBody = document.getElementById('doc-body');
    if (docBody) {
      Sortable.create(docBody, { animation: 150, handle: '.pf-sec-header', onEnd: function(evt) { APP.moveSecDrag(evt.oldIndex, evt.newIndex); } });
    }
    document.querySelectorAll('.pf-lot-row').forEach(function(row) {
      Sortable.create(row, { animation: 150, group: 'lots', handle: '.pf-lot-header', filter: '.pf-add-lot-col', onEnd: function(evt) {
        var fromSecId = evt.from.closest('.pf-section').dataset.secId;
        var toSecId = evt.to.closest('.pf-section').dataset.secId;
        APP.moveLotDrag(evt.item.dataset.lotId, fromSecId, toSecId, evt.oldIndex, evt.newIndex);
      }});
    });
    document.querySelectorAll('.pf-steps-list').forEach(function(list) {
      Sortable.create(list, { animation: 150, onEnd: function(evt) {
        var lotId = evt.from.closest('.pf-lot-col').dataset.lotId;
        APP.moveStepDrag(evt.item.dataset.stepId, lotId, lotId, evt.oldIndex, evt.newIndex);
      }});
    });
  },
  undo: function() {
    if (!_undoStack.length) return;
    var d = getDoc(); if(!d) return;
    d.sections = normDoc({sections: JSON.parse(_undoStack.pop())}).sections;
    updateUndoBtn();
    save(); render();
    setSaveStatus('saved', '실행 취소됨');
  },
  moveSecDrag: function(oldIdx, newIdx) {
    var d = getDoc(); if(!d) return;
    if (oldIdx === newIdx) return;
    pushUndo();
    var el = d.sections.splice(oldIdx, 1)[0];
    d.sections.splice(newIdx, 0, el);
    save(); render();
  },
  moveLotDrag: function(lotId, fromSecId, toSecId, oldIdx, newIdx) {
    var d = getDoc(); if(!d) return;
    var fS = d.sections.find(function(s){return s.id===fromSecId;});
    var tS = d.sections.find(function(s){return s.id===toSecId;});
    if(!fS || !tS) return;
    if (fromSecId === toSecId && oldIdx === newIdx) return;
    pushUndo();
    var l = fS.lots.splice(oldIdx, 1)[0];
    tS.lots.splice(newIdx, 0, l);
    save(); render();
  },
  moveStepDrag: function(stepId, fromLotId, toLotId, oldIdx, newIdx) {
    var d = getDoc(); if(!d) return;
    var fL, tL;
    d.sections.forEach(function(s) { s.lots.forEach(function(l) {
      if(l.id===fromLotId) fL = l;
      if(l.id===toLotId) tL = l;
    });});
    if(!fL || !tL) return;
    if (fromLotId === toLotId && oldIdx === newIdx) return;
    pushUndo();
    var st = fL.steps.splice(oldIdx, 1)[0];
    tL.steps.splice(newIdx, 0, st);
    save(); render();
  },
  newDoc: function() {
    var d = mkDoc();
    STATE.docs[d.id] = d;
    STATE.currentId = d.id;
    render();
    save();
  },
  showList: function() {
    closeEdit();
    STATE.currentId = null;
    render();
  },
  openDoc: function(id) {
    STATE.currentId = id;
    _undoStack = [];
    updateUndoBtn();
    render();
  },
  deleteDoc: function(id) {
    var doc = STATE.docs[id]; if(!doc) return;
    if(!confirm('"'+(doc.title||'(제목 없음)')+'" 문서를 휴지통으로 이동하시겠습니까?\n(정제 Batch 데이터는 유지 — 출하 component 영향 없음. 완전 삭제는 휴지통에서 진행)')) return;
    doc.deleted = true;
    doc.deletedAt = Date.now();
    doc.deletedBy = (_currentUser && _currentUser.email) || '';
    DB.child(id).set(doc);
    render();
  },
  restoreDoc: function(id) {
    var doc = STATE.docs[id]; if(!doc) return;
    delete doc.deleted;
    delete doc.deletedAt;
    delete doc.deletedBy;
    DB.child(id).set(doc);
    render();
  },
  purgeDoc: function(id) {
    var doc = STATE.docs[id]; if(!doc) return;
    var refineIds = [];
    (doc.sections || []).forEach(function(s) {
      (s.lots || []).forEach(function(l) {
        (l.refines || []).forEach(function(r) { refineIds.push(r.id); });
      });
    });
    if(!confirm('"'+(doc.title||'(제목 없음)')+'" 문서를 완전 삭제합니다.\n복구할 수 없습니다. 계속하시겠습니까?')) return;
    if (refineIds.length && !confirmCascadeDelete(refineIds, '이 문서의 정제 Batch')) return;
    delete STATE.docs[id];
    DB.child(id).remove();
    render();
  },
  addSection: function(t) {
    var d = getDoc(); if(!d) return;
    d.sections.push(mkSec(t));
    save();
    render();
  },
  deleteSection: function(sid) {
    var d = getDoc(); if(!d) return;
    var sec = (d.sections || []).find(function(s){return s.id===sid;});
    var refineIds = [];
    if (sec) (sec.lots || []).forEach(function(l) {
      (l.refines || []).forEach(function(r) { refineIds.push(r.id); });
    });
    if (refineIds.length && !confirmCascadeDelete(refineIds, '이 섹션의 정제 Batch')) return;
    d.sections = d.sections.filter(s=>s.id!==sid);
    save();
    render();
  },
  toggleSec: function(sid, ev) {
    if(ev) ev.stopPropagation();
    if(STATE.collapsedSecs.has(sid)) STATE.collapsedSecs.delete(sid);
    else STATE.collapsedSecs.add(sid);
    render();
  },
  /* 모든 Lot 공정 일괄 접기/펼치기 — 개별 Lot 헤더의 ▼/▶와 동일 동작을
     문서 내 모든 Lot에 한꺼번에 적용. 전부 접혀있으면 펼치고, 아니면 모두 접음. */
  toggleAllLots: function() {
    var d = getDoc(); if(!d) return;
    var lotIds = [];
    (d.sections||[]).forEach(function(s) {
      (s.lots||[]).forEach(function(l) { lotIds.push(l.id); });
    });
    if (!lotIds.length) return;
    var allCollapsed = lotIds.every(function(id){return STATE.collapsedLots.has(id);});
    if (allCollapsed) lotIds.forEach(function(id){STATE.collapsedLots.delete(id);});
    else              lotIds.forEach(function(id){STATE.collapsedLots.add(id);});
    render();
  },
  toggleLot: function(lid, ev) {
    if(ev) ev.stopPropagation();
    if(STATE.collapsedLots.has(lid)) STATE.collapsedLots.delete(lid);
    else STATE.collapsedLots.add(lid);
    render();
  },
  addLot: function(sid) {
    var d = getDoc(); if(!d) return;
    var s = d.sections.find(x=>x.id===sid); if(!s) return;
    s.lots.push(mkLot(''));
    save();
    render();
  },
  deleteLot: function(lid) {
    var d = getDoc(); if(!d) return;
    var lot = findLot(lid);
    var refineIds = lot ? (lot.refines || []).map(function(r){return r.id;}) : [];
    if (refineIds.length && !confirmCascadeDelete(refineIds, '이 Lot의 정제 Batch')) return;
    for(var s of d.sections) s.lots = s.lots.filter(l=>l.id!==lid);
    save();
    render();
  },
  cloneLot: function(lid, ev) {
    if(ev) ev.stopPropagation();
    var d = getDoc(); if(!d) return;
    var src = findLot(lid); var sec = findLotSec(lid);
    if(!src || !sec) return;
    var copy = {
      id: uid(),
      name: (src.name || '') + ' (복제)',
      subName: src.subName || '',
      steps: (src.steps || []).map(function(st) {
        return Object.assign({}, st, { id: uid() });
      }),
      refines: (src.refines || []).map(function(r) {
        return Object.assign({}, r, { id: uid() });
      })
    };
    var idx = sec.lots.findIndex(l=>l.id===lid);
    sec.lots.splice(idx+1, 0, copy);
    save();
    render();
  },
  addStep: function(lid, type) {
    var l = findLot(lid); if(!l) return;
    var st = mkStep(type);
    l.steps.push(st);
    STATE.editKey = st.id;
    save();
    render();
    setTimeout(function() {
      var ta = document.getElementById('ep-ta-'+st.id);
      if(ta) ta.focus();
    }, 30);
  },
  deleteStep: function(sid) {
    var l = findStepLot(sid); if(!l) return;
    var st = (l.steps||[]).find(function(s){return s.id===sid;}); if(!st) return;
    st.deletedAt = Date.now();
    st.deletedBy = (_currentUser && _currentUser.email) || '';
    if (!Array.isArray(l.deletedSteps)) l.deletedSteps = [];
    l.deletedSteps.push(st);
    l.steps = l.steps.filter(function(s){return s.id!==sid;});
    if(STATE.editKey===sid) closeEdit();
    save();
    render();
  },
  restoreStep: function(sid) {
    var d = getDoc(); if(!d) return;
    var lot, step, idx = -1;
    for (var i=0; i<d.sections.length && !step; i++) {
      var sec = d.sections[i];
      for (var j=0; j<(sec.lots||[]).length && !step; j++) {
        var l = sec.lots[j];
        var trash = Array.isArray(l.deletedSteps) ? l.deletedSteps : [];
        idx = trash.findIndex(function(s){return s.id===sid;});
        if (idx !== -1) { lot = l; step = trash[idx]; break; }
      }
    }
    if (!lot || !step) return;
    delete step.deletedAt;
    delete step.deletedBy;
    lot.deletedSteps.splice(idx, 1);
    if (!Array.isArray(lot.steps)) lot.steps = [];
    lot.steps.push(step);
    save();
    render();
  },
  purgeStep: function(sid) {
    var d = getDoc(); if(!d) return;
    if (!confirm('이 공정을 완전 삭제합니다. 복구할 수 없습니다.')) return;
    for (var i=0; i<d.sections.length; i++) {
      var sec = d.sections[i];
      for (var j=0; j<(sec.lots||[]).length; j++) {
        var l = sec.lots[j];
        if (!Array.isArray(l.deletedSteps)) continue;
        var idx = l.deletedSteps.findIndex(function(s){return s.id===sid;});
        if (idx !== -1) { l.deletedSteps.splice(idx, 1); save(); render(); return; }
      }
    }
  },
  setSectionType: function(sid, type) {
    var d = getDoc(); if(!d) return;
    var s = d.sections.find(x=>x.id===sid); if(s) s.type=type;
    save();
    render();
  },
  updateLotName: function(lid, val) {
    var l = findLot(lid); if(l) l.name=val;
    save();
  },
  /* 정제 Batch (refines) — 합성 Batch(Lot) 내 정제 산출물 잔량 */
  addRefine: function(lid) {
    var l = findLot(lid); if(!l) return;
    if (!Array.isArray(l.refines)) l.refines = [];
    l.refines.push(mkRefine({ unit: l.unit || 'g' }));
    save();
    render();
  },
  deleteRefine: function(lid, rid) {
    var l = findLot(lid); if(!l) return;
    if (!confirmCascadeDelete([rid], '정제 Batch')) return;
    l.refines = (l.refines || []).filter(function(r){return r.id!==rid;});
    save();
    render();
  },
  updateRefineField: function(lid, rid, field, val) {
    var l = findLot(lid); if(!l) return;
    var r = (l.refines || []).find(function(x){return x.id===rid;});
    if (!r) return;
    if (field === 'qty') {
      var trimmed = String(val).trim();
      if (trimmed === '') { r.qty = null; }
      else {
        var n = Number(trimmed);
        if (isNaN(n) || n < 0) return; // 음수 거부
        r.qty = n;
      }
      renderRefineStock(rid);
    } else if (field === 'unit') {
      r.unit = val || 'g';
      renderRefineStock(rid);
    } else {
      r[field] = val;
    }
    save();
  },
  // updateLotSub removed
  onMetaChange: function() {
    var d = getDoc(); if(!d) return;
    d.title = document.getElementById('inp-title').value;
    d.material = document.getElementById('inp-material').value;
    d.author = document.getElementById('inp-author').value;
    d.date = document.getElementById('inp-date').value;
    save();
  },
  setStepField: function(sid, field, val) {
    var st = findStep(sid); if(st) st[field]=val;
    save();
    // date/operator는 드로어 내부 입력이라 full render 불필요
    if (field === 'tag' || field === 'type' || field === 'location') render();
  },
  setStepType: function(sid, type) {
    var st = findStep(sid); if(st) st.type=type;
    save();
    render();
  },
  onDetailInput: function(sid, val) {
    var st = findStep(sid); if(st) st.detail=val;
    save();
  },
  insertChip: function(sid, chip) {
    var ta = document.getElementById('ep-ta-'+sid); if(!ta) return;
    var s = ta.selectionStart, e = ta.selectionEnd;
    var before = ta.value.slice(0,s), after = ta.value.slice(e);
    var sep = (before && !/[\s_(\/]$/.test(before)) ? ' ' : '';
    ta.value = before + sep + chip + after;
    var pos = s + sep.length + chip.length;
    ta.setSelectionRange(pos, pos);
    ta.focus();
    APP.onDetailInput(sid, ta.value);
  },
  onStepClick: function(sid) {
    if(STATE.editKey===sid) { closeEdit(); return; }
    APP.openEdit(sid);
  },
  openEdit: function(sid) {
    var prev = STATE.editKey;
    STATE.editKey = sid;
    // 스텝 카드 선택 표시 갱신 (editing class) + 드로어 열기
    if (prev !== sid) renderDoc();
    renderDrawer();
  },
  closeEdit: function() {
    closeEdit();
    renderDoc();
    renderDrawer();
  },
  /* ── 출하 Lot 관리 ─────────────────────────────── */
  openShipMgr: function() {
    STATE.ship.open = true;
    STATE.ship.view = 'list';
    STATE.ship.selectedId = null;
    // 편집 중인 문서에서 열면 자동 필터 — 다른 문서의 출하는 숨김
    STATE.ship.filterDocId = STATE.currentId || null;
    renderShipModal();
  },
  setShipFilter: function(docId) {
    STATE.ship.filterDocId = docId || null;
    STATE.ship.view = 'list';
    STATE.ship.selectedId = null;
    renderShipModal();
  },
  closeShipMgr: function() {
    STATE.ship.open = false;
    clearTimeout(STATE.ship.timer);
    renderShipModal();
    if (STATE.proc.open) { STATE.proc.open = false; renderProcessPopup(); }
  },
  /* 고아 component 정리 — 원본 lot/refine이 사라진 출하 component를 일괄 제거 */
  cleanupOrphans: function() {
    var orphans = findOrphanComponents();
    if (!orphans.length) { alert('고아 컴포넌트가 없습니다.'); renderShipModal(); return; }
    var byShip = {};
    orphans.forEach(function(o) {
      if (!byShip[o.shId]) byShip[o.shId] = { sh: o.sh, indices: [] };
      byShip[o.shId].indices.push(o.idx);
    });
    var shipCount = Object.keys(byShip).length;
    var preview = Object.keys(byShip).slice(0, 6).map(function(sid) {
      var s = byShip[sid];
      return '· ' + (s.sh.shipName || '(이름 없음)') + ' — ' + s.indices.length + '개';
    }).join('\n');
    var more = shipCount > 6 ? '\n· ...외 ' + (shipCount - 6) + '건' : '';
    if (!confirm('원본 Lot/정제 Batch가 삭제된 고아 컴포넌트 ' + orphans.length + '개를 출하 ' + shipCount + '건에서 제거합니다:\n\n' + preview + more + '\n\n계속하시겠습니까?')) {
      return;
    }
    Object.keys(byShip).forEach(function(sid) {
      var sh = STATE.shipments[sid]; if (!sh) return;
      var rmSet = {}; byShip[sid].indices.forEach(function(i){ rmSet[i] = true; });
      sh.components = (sh.components || []).filter(function(c, i) { return !rmSet[i]; });
      saveShipNow(sid);
    });
    alert('고아 컴포넌트 ' + orphans.length + '개를 정리했습니다.');
    renderShipModal();
  },
  newShip: function() {
    var sh = mkShip({ shipName: 'SHIP-' + new Date().toISOString().slice(0,10) });
    STATE.shipments[sh.id] = sh;
    STATE.ship.view = 'detail';
    STATE.ship.selectedId = sh.id;
    saveShipNow(sh.id);
    renderShipModal();
  },
  openShipDetail: function(shId) {
    STATE.ship.view = 'detail';
    STATE.ship.selectedId = shId;
    renderShipModal();
  },
  backToShipList: function() {
    STATE.ship.view = 'list';
    STATE.ship.selectedId = null;
    renderShipModal();
  },
  deleteShip: function(shId) {
    var sh = STATE.shipments[shId]; if(!sh) return;
    if (!confirm('출하 Lot "'+(sh.shipName||'(이름 없음)')+'"을(를) 삭제하시겠습니까?\n(소프트 삭제 — 차감된 재고는 복원됩니다)')) return;
    sh.deleted = true;
    saveShipNow(shId);
    if (STATE.ship.selectedId === shId) APP.backToShipList();
    else renderShipModal();
  },
  restoreShip: function(shId) {
    var sh = STATE.shipments[shId]; if(!sh) return;
    sh.deleted = false;
    saveShipNow(shId);
    renderShipModal();
  },
  purgeShip: function(shId) {
    var sh = STATE.shipments[shId]; if(!sh) return;
    if (!confirm('출하 Lot "'+(sh.shipName||'(이름 없음)')+'" 을(를) 완전 삭제합니다.\n복구할 수 없습니다. 계속하시겠습니까?')) return;
    delete STATE.shipments[shId];
    SHIP_DB.child(shId).remove();
    renderShipModal();
  },
  updateShipField: function(shId, field, val) {
    var sh = STATE.shipments[shId]; if(!sh) return;
    sh[field] = val;
    saveShip(shId);
    if (field === 'shipName' || field === 'customer' || field === 'date') {
      // detail 헤더만 갱신, 입력 중 blur 방지 위해 list로 안 돌아감
      var hd = document.getElementById('pf-ship-detail-title');
      if (hd && field === 'shipName') hd.textContent = sh.shipName || '(이름 없음)';
    }
  },
  /* 일괄 추가 — 정제 Batch 행에서 qty>0인 것 수집·검증·일괄 push */
  addShipComponentsBatch: function(shId) {
    var sh = STATE.shipments[shId]; if(!sh) return;
    var rows = document.querySelectorAll('.pf-pick-table tbody tr.pf-pick-row');
    var picks = [];
    var errors = [];
    for (var ri = 0; ri < rows.length; ri++) {
      var tr = rows[ri];
      var inp = tr.querySelector('.pf-pick-qty-inp');
      if (!inp) continue;
      var raw = String(inp.value || '').trim();
      if (!raw) continue;
      var qty = Number(raw);
      if (isNaN(qty) || qty < 0) continue;  // 음수만 거부 — 0g 구성은 허용 (추후 입력)
      var docId = tr.dataset.docId, sectionId = tr.dataset.secId, lotId = tr.dataset.lotId, refineId = tr.dataset.refineId;
      var doc = STATE.docs[docId];
      var sec = doc && (doc.sections||[]).find(function(s){return s.id===sectionId;});
      var lot = sec && (sec.lots||[]).find(function(l){return l.id===lotId;});
      var refine = lot && (lot.refines||[]).find(function(r){return r.id===refineId;});
      if (!doc || !sec || !lot || !refine) { errors.push('알 수 없는 정제 Batch ('+(refineId||'')+')'); continue; }
      var rU = refine.unit || 'g';
      // refine.qty 미입력이거나 qty=0이면 stock 검증 스킵
      if (typeof refine.qty === 'number' && qty > 0) {
        var available = refine.qty - refineConsumed(refineId, rU);
        if (qty > available + 1e-6) {
          errors.push('['+sec.type+'] '+(refine.name||lot.name||'(이름 없음)')+' — 입력 '+fmtQty(qty, rU)+' > 가용 '+fmtQty(available, rU));
          continue;
        }
      }
      picks.push({ docId: docId, sectionId: sectionId, lotId: lotId, refineId: refineId,
                   qty: qty, unit: rU, refine: refine, lot: lot, sec: sec, doc: doc });
    }
    if (errors.length) {
      alert('가용 재고 초과·오류 행 (해당 행만 누락):\n\n' + errors.join('\n'));
    }
    if (!picks.length) {
      if (!errors.length) alert('사용수량이 입력된 행이 없습니다. 표에서 수량을 입력하세요.');
      return;
    }
    if (!Array.isArray(sh.components)) sh.components = [];
    picks.forEach(function(p) {
      sh.components.push({
        docId: p.docId,
        sectionId: p.sectionId,
        lotId: p.lotId,
        refineId: p.refineId,
        qty: p.qty,
        unit: p.unit,
        refineNameSnapshot: p.refine.name || '',
        lotNameSnapshot: p.lot.name || '',
        sectionTypeSnapshot: p.sec.type || '',
        docTitleSnapshot: p.doc.title || '',
        materialSnapshot: p.doc.material || ''
      });
    });
    saveShipNow(shId);
    renderShipModal();
  },
  clearPickGrid: function() {
    document.querySelectorAll('.pf-pick-table tbody .pf-pick-qty-inp').forEach(function(inp) { inp.value = ''; });
  },
  removeShipComponent: function(shId, idx) {
    var sh = STATE.shipments[shId]; if(!sh) return;
    var comps = Array.isArray(sh.components) ? sh.components : [];
    if (idx < 0 || idx >= comps.length) return;
    if (!confirm('이 컴포넌트를 제거하시겠습니까?')) return;
    comps.splice(idx, 1);
    sh.components = comps;
    saveShipNow(shId);
    renderShipModal();
  },
  /* ── 공정 미리보기 팝업: 출하 모달을 닫지 않고 공정·잔량 동시 확인 ──── */
  openProcessPopup: function(docId, sectionId, lotId, refineId, ev) {
    if (ev) ev.stopPropagation();
    var doc = STATE.docs[docId];
    if (!doc) { alert('원본 문서를 찾을 수 없습니다.'); return; }
    var sec = (doc.sections||[]).find(function(s){return s.id===sectionId;});
    var lot = sec && (sec.lots||[]).find(function(l){return l.id===lotId;});
    if (!sec || !lot) { alert('원본 Lot이 삭제되었거나 이동되었습니다.'); return; }
    STATE.proc.open = true;
    STATE.proc.docId = docId;
    STATE.proc.sectionId = sectionId;
    STATE.proc.lotId = lotId;
    STATE.proc.refineId = refineId || null;
    renderProcessPopup();
  },
  closeProcessPopup: function() {
    STATE.proc.open = false;
    STATE.proc.docId = STATE.proc.sectionId = STATE.proc.lotId = STATE.proc.refineId = null;
    renderProcessPopup();
  },
  /* 정제 Batch 출하이력 popover 토글 */
  toggleRefineHistory: function(refineId, ev) {
    if (ev) ev.stopPropagation();
    document.querySelectorAll('.pf-lot-hist-pop.pf-open').forEach(function(p) {
      if (p.dataset.refineId !== refineId) p.classList.remove('pf-open');
    });
    var pop = document.querySelector('.pf-lot-hist-pop[data-refine-id="'+refineId+'"]');
    if (!pop) return;
    if (pop.classList.contains('pf-open')) {
      pop.classList.remove('pf-open');
      return;
    }
    var btn = ev && (ev.currentTarget || ev.target);
    if (btn && btn.getBoundingClientRect) {
      var rect = btn.getBoundingClientRect();
      var popW = 280;
      var left = rect.left;
      if (left + popW > window.innerWidth - 8) left = Math.max(8, window.innerWidth - popW - 8);
      pop.style.top = (rect.bottom + 4) + 'px';
      pop.style.left = left + 'px';
    }
    pop.classList.add('pf-open');
  },
  jumpToShip: function(shId, ev) {
    if (ev) ev.stopPropagation();
    if (!STATE.shipments[shId]) { alert('출하 Lot을 찾을 수 없습니다.'); return; }
    // 모든 popover 닫기
    document.querySelectorAll('.pf-lot-hist-pop.pf-open').forEach(function(p) { p.classList.remove('pf-open'); });
    STATE.ship.open = true;
    STATE.ship.view = 'detail';
    STATE.ship.selectedId = shId;
    renderShipModal();
  },
  updateShipCompQty: function(shId, idx, val) {
    var sh = STATE.shipments[shId]; if(!sh) return;
    var comps = Array.isArray(sh.components) ? sh.components : [];
    var c = comps[idx]; if(!c) return;
    var qty = Number(val);
    if (isNaN(qty) || qty < 0) return;
    var doc = STATE.docs[c.docId];
    var sec = doc && (doc.sections||[]).find(function(s){return s.id===c.sectionId;});
    var lot = sec && (sec.lots||[]).find(function(l){return l.id===c.lotId;});
    var refine = lot && c.refineId && (lot.refines||[]).find(function(r){return r.id===c.refineId;});
    // 정제 Batch에 qty가 입력된 경우에만 stock 검증 (qty 미입력이면 placeholder 모드로 자유 입력 허용)
    if (refine && typeof refine.qty === 'number' && qty > 0) {
      var rU = refine.unit || 'g';
      var consumedExceptSelf = refineConsumed(c.refineId, rU) - convertQty(c.qty, c.unit || 'g', rU);
      var available = refine.qty - consumedExceptSelf;
      var qtyInRU = convertQty(qty, c.unit || 'g', rU);
      if (qtyInRU > available + 1e-6) {
        alert('가용 재고('+fmtQty(available, rU)+')를 초과합니다.');
        return;
      }
    }
    c.qty = qty;
    saveShip(shId);
  },
  exportXlsx: function() {
    var d = getDoc(); if(!d) { alert('문서가 선택되지 않았습니다.'); return; }
    if (typeof XLSX === 'undefined') { alert('XLSX 라이브러리를 불러오지 못했습니다.'); return; }

    /* ── Step type 색상 ─────────────────────────────── */
    var FILL = { react:'DBE7FF', solid:'E4F1FA', wet:'E0F5E6', subl:'EFE4FB', collect:'FFF6DB' };
    var FONT = { react:'1D4ED8', solid:'1A6A9F', wet:'166534', subl:'5B21B6', collect:'92400E' };

    var wb = XLSX.utils.book_new();

    /* ── Sheet 1: 문서정보 ───────────────────────────── */
    var meta = [
      ['제목',     d.title || ''],
      ['소재코드', d.material || ''],
      ['작성자',   d.author || ''],
      ['작성일',   d.date || ''],
      ['최근 수정', d.updatedAt ? new Date(d.updatedAt).toISOString().slice(0,16).replace('T',' ') : ''],
      ['수정자',   d.updatedBy || '']
    ];
    var wsMeta = XLSX.utils.aoa_to_sheet(meta);
    wsMeta['!cols'] = [{wch:14},{wch:60}];
    XLSX.utils.book_append_sheet(wb, wsMeta, '문서정보');

    /* ── Sheet 2: 공정도 (Lot별 열 레이아웃) ─────────── */
    var ws = {};
    var merges = [];
    var rowHeights = [];

    var sections = d.sections || [];
    var maxLots = 1;
    sections.forEach(function(s) { maxLots = Math.max(maxLots, (s.lots||[]).length); });

    function sc(r, c, v, s) {
      var addr = XLSX.utils.encode_cell({r:r, c:c});
      ws[addr] = { v: v, t: (typeof v === 'number') ? 'n' : 's', s: s || {} };
    }

    var curRow = 0;

    /* 문서 제목 행 */
    var titleVal = (d.title || 'P/N 공정 Flow') + (d.material ? '  (' + d.material + ')' : '');
    sc(curRow, 0, titleVal, {
      font: { bold:true, sz:13, color:{rgb:'111827'} },
      fill: { fgColor:{rgb:'F3F4F6'} },
      alignment: { horizontal:'center', vertical:'center' }
    });
    for (var fc = 1; fc < maxLots; fc++) sc(curRow, fc, '', { fill:{fgColor:{rgb:'F3F4F6'}} });
    if (maxLots > 1) merges.push({s:{r:curRow,c:0}, e:{r:curRow,c:maxLots-1}});
    rowHeights[curRow] = {hpt:22};
    curRow++;

    /* 각 섹션 블록 */
    sections.forEach(function(s) {
      var lots = s.lots || [];
      var lotCount = lots.length;
      if (!lotCount) return;

      var maxSteps = 0;
      lots.forEach(function(l) { maxSteps = Math.max(maxSteps, (l.steps||[]).length); });

      /* 섹션 헤더 */
      var secBg = s.type === 'P' ? '1D4ED8' : s.type === 'N' ? '6D28D9' : '047857';
      var secLbl = SEC_LABEL[s.type] + ' 섹션  (' + lotCount + '개 Lot' + (maxSteps ? ', 최대 ' + maxSteps + ' 공정' : '') + ')';
      sc(curRow, 0, secLbl, {
        font: { bold:true, sz:11, color:{rgb:'FFFFFF'} },
        fill: { fgColor:{rgb:secBg} },
        alignment: { horizontal:'center', vertical:'center' }
      });
      for (var fc2 = 1; fc2 < lotCount; fc2++) sc(curRow, fc2, '', { fill:{fgColor:{rgb:secBg}} });
      if (lotCount > 1) merges.push({s:{r:curRow,c:0}, e:{r:curRow,c:lotCount-1}});
      rowHeights[curRow] = {hpt:18};
      curRow++;

      /* Lot 이름 행 */
      var nameBg = s.type === 'P' ? 'DBEAFE' : s.type === 'N' ? 'EDE9FE' : 'D1FAE5';
      lots.forEach(function(l, ci) {
        var stKey = lotStatus(l);
        var stLbl = {pass:' [PASS]', fail:' [FAIL]', progress:' [진행 중]'}[stKey] || '';
        var nameStr = (l.name || '(이름 없음)') + stLbl + (l.subName ? '\n(' + l.subName + ')' : '');
        sc(curRow, ci, nameStr, {
          font: { bold:true, sz:10, color:{rgb:'1E293B'} },
          fill: { fgColor:{rgb:nameBg} },
          alignment: { horizontal:'center', vertical:'center', wrapText:true }
        });
      });
      rowHeights[curRow] = {hpt: lots.some(function(l){return l.subName;}) ? 30 : 18};
      curRow++;

      /* 정제 Batch 잔량 행 — refines가 있는 Lot 한정 */
      var hasRefines = lots.some(function(l){ return (l.refines||[]).some(function(r){return typeof r.qty === 'number';}); });
      if (hasRefines) {
        var maxRefRows = 0;
        lots.forEach(function(l) {
          maxRefRows = Math.max(maxRefRows, (l.refines||[]).filter(function(r){return typeof r.qty === 'number';}).length);
        });
        lots.forEach(function(l, ci) {
          var refs = (l.refines||[]).filter(function(r){return typeof r.qty === 'number';});
          if (!refs.length) {
            sc(curRow, ci, '', { fill:{fgColor:{rgb:'F9FAFB'}} });
            return;
          }
          var lines = refs.map(function(r) {
            var sk = refineStock(r);
            var label = (r.name || '(이름 없음)') + ': ' + fmtQty(sk.stock, sk.unit) + ' / ' + fmtQty(sk.qty, sk.unit);
            return label;
          });
          // 색상은 합산 잔여 비율 기준
          var totalQty = 0, totalStock = 0;
          refs.forEach(function(r) {
            var sk = refineStock(r);
            totalQty += convertQty(sk.qty, sk.unit, 'g');
            totalStock += convertQty(sk.stock, sk.unit, 'g');
          });
          var ratio = totalQty > 0 ? totalStock / totalQty : 0;
          var fillC = totalStock <= 0 ? 'FEE2E2' : (ratio < 0.2 ? 'FEF3C7' : (ratio < 0.5 ? 'F3F4F6' : 'DCFCE7'));
          var fontC = totalStock <= 0 ? 'B91C1C' : (ratio < 0.2 ? 'B45309' : (ratio < 0.5 ? '1F2937' : '15803D'));
          sc(curRow, ci, lines.join('\n'), {
            font: { sz:9, color:{rgb:fontC} },
            fill: { fgColor:{rgb:fillC} },
            alignment: { horizontal:'center', vertical:'center', wrapText:true }
          });
        });
        rowHeights[curRow] = {hpt: Math.max(28, maxRefRows * 14)};
        curRow++;
      }

      /* 공정 행 */
      if (maxSteps > 0) {
        for (var si = 0; si < maxSteps; si++) {
          var rowH = 15;
          lots.forEach(function(l, ci) {
            var steps = l.steps || [];
            var st = steps[si];
            if (!st) {
              sc(curRow, ci, '', { fill:{fgColor:{rgb:'F9FAFB'}} });
              return;
            }
            var n = stepNum(steps, si, st.type);
            var lbl = stepLbl(st, n);
            var tagStr = st.tag === 'pass' ? ' ✓' : st.tag === 'fail' ? ' ✗' : st.tag === 'pending' ? ' ⋯' : '';
            var parts = [lbl + tagStr];
            if (st.location) parts.push('위치: ' + st.location);
            if (st.detail)   parts.push(st.detail);
            var dateParts = [st.date || '', st.operator || ''].filter(Boolean);
            if (dateParts.length) parts.push(dateParts.join(' · '));
            var cellVal = parts.join('\n');
            if (cellVal.split('\n').length > rowH / 15) rowH = cellVal.split('\n').length * 15;
            var fill = FILL[st.type] || 'F3F4F6';
            var fontClr = st.tag === 'fail' ? 'DC2626' : (FONT[st.type] || '374151');
            sc(curRow, ci, cellVal, {
              font: { sz:9, color:{rgb:fontClr}, bold: st.tag === 'fail' },
              fill: { fgColor:{rgb:fill} },
              alignment: { wrapText:true, vertical:'top' }
            });
          });
          rowHeights[curRow] = {hpt: Math.max(rowH, 28)};
          curRow++;
        }
      }

      /* 구분 빈 행 */
      curRow++;
    });

    /* 시트 범위 & 설정 */
    ws['!ref'] = XLSX.utils.encode_range({s:{r:0,c:0}, e:{r:curRow-1, c:maxLots-1}});
    ws['!merges'] = merges;
    var cols = [];
    for (var ci2 = 0; ci2 < maxLots; ci2++) cols.push({wch:30});
    ws['!cols'] = cols;
    ws['!rows'] = rowHeights;

    XLSX.utils.book_append_sheet(wb, ws, '공정도');

    /* ── Sheet 3: 출하 Lot (이 문서의 Lot이 포함된 비-삭제 출하만) ── */
    var docLotIds = {};
    (d.sections||[]).forEach(function(s) {
      (s.lots||[]).forEach(function(l) { docLotIds[l.id] = { sec: s, lot: l }; });
    });
    var shipRows = [['출하명','고객','일자','메모','Type','합성 Batch','정제 Batch','수량','단위','문서']];
    var TYPE_ORDER_XL = { P:0, N:1, S:2 };
    var shipList = Object.values(STATE.shipments||{}).filter(function(sh){
      if (!sh || sh.deleted) return false;
      var comps = Array.isArray(sh.components) ? sh.components : (sh.components ? Object.values(sh.components) : []);
      return comps.some(function(c){ return docLotIds[c.lotId]; });
    }).sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
    shipList.forEach(function(sh) {
      var comps = Array.isArray(sh.components) ? sh.components : Object.values(sh.components||{});
      comps = comps.slice().sort(function(a,b) {
        var ta = TYPE_ORDER_XL[a.sectionTypeSnapshot]; if (ta===undefined) ta=9;
        var tb = TYPE_ORDER_XL[b.sectionTypeSnapshot]; if (tb===undefined) tb=9;
        if (ta !== tb) return ta - tb;
        var la = (a.lotNameSnapshot||'').localeCompare(b.lotNameSnapshot||'');
        if (la !== 0) return la;
        return (a.refineNameSnapshot||'').localeCompare(b.refineNameSnapshot||'');
      });
      comps.forEach(function(c, ci) {
        if (!docLotIds[c.lotId]) return; // 다른 문서의 Lot은 스킵
        shipRows.push([
          ci === 0 ? (sh.shipName||'') : '',
          ci === 0 ? (sh.customer||'') : '',
          ci === 0 ? (sh.date||'') : '',
          ci === 0 ? (sh.note||'') : '',
          c.sectionTypeSnapshot || '',
          c.lotNameSnapshot || '',
          c.refineNameSnapshot || '',
          (typeof c.qty === 'number') ? c.qty : '',
          c.unit || 'g',
          c.docTitleSnapshot || ''
        ]);
      });
    });
    if (shipRows.length > 1) {
      var wsShip = XLSX.utils.aoa_to_sheet(shipRows);
      wsShip['!cols'] = [{wch:22},{wch:14},{wch:12},{wch:24},{wch:6},{wch:22},{wch:22},{wch:10},{wch:6},{wch:22}];
      ['A1','B1','C1','D1','E1','F1','G1','H1','I1','J1'].forEach(function(addr) {
        if (wsShip[addr]) wsShip[addr].s = {
          font:{bold:true, color:{rgb:'4338CA'}},
          fill:{fgColor:{rgb:'EEF2FF'}},
          alignment:{horizontal:'center'}
        };
      });
      XLSX.utils.book_append_sheet(wb, wsShip, '출하 Lot');
    }

    var fname = (d.material || d.title || 'PN_Flow').replace(/[\\/:*?"<>|]/g,'_') + '_' + (d.date || todayStr()) + '.xlsx';
    XLSX.writeFile(wb, fname);
  }
};

function closeEdit() {
  STATE.editKey = null;
}

/* ── 키보드 단축키 ───────────────────────────────── */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    // popover 우선 닫기
    var openPop = document.querySelector('.pf-lot-hist-pop.pf-open');
    if (openPop) { openPop.classList.remove('pf-open'); return; }
    if (STATE.proc.open) { APP.closeProcessPopup(); return; }
    if (STATE.ship.open) { APP.closeShipMgr(); return; }
    if (STATE.editKey) { closeEdit(); renderDoc(); renderDrawer(); }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && STATE.currentId && !STATE.editKey) {
    e.preventDefault();
    APP.undo();
  }
});

/* 클릭 외부 — 열린 popover/팝업 닫기 (STAGE 3+) */
document.addEventListener('click', function(e) {
  var openPops = document.querySelectorAll('.pf-lot-hist-pop.pf-open');
  if (openPops.length && !e.target.closest('.pf-lot-hist-wrap')) {
    openPops.forEach(function(p) { p.classList.remove('pf-open'); });
  }
  // 공정 팝업: 외부 클릭으로 닫기 (트리거 ↗ 버튼 클릭은 stopPropagation으로 보호됨)
  if (STATE.proc.open && !e.target.closest('#pf-proc-popup')) {
    APP.closeProcessPopup();
  }
});

/* ── 렌더링 ────────────────────────────────────── */
function render() {
  if(!STATE.currentId) renderList();
  else { renderDoc(); renderDrawer(); }
}

function renderList() {
  document.getElementById('v-list').classList.remove('pf-hidden');
  document.getElementById('v-doc').classList.add('pf-hidden');
  var keyword = (document.getElementById('list-search') ? document.getElementById('list-search').value : '').toLowerCase();
  var allDocs = Object.values(STATE.docs).sort(function(a,b){
    return (b.date||'').localeCompare(a.date||'');
  });
  var deletedDocs = allDocs.filter(function(d){ return d.deleted; });
  var docs = allDocs.filter(function(d) {
    if (d.deleted) return false;
    if(!keyword) return true;
    var t = (d.title||'').toLowerCase();
    var m = (d.material||'').toLowerCase();
    var a = (d.author||'').toLowerCase();
    return t.indexOf(keyword) !== -1 || m.indexOf(keyword) !== -1 || a.indexOf(keyword) !== -1;
  });
  var html = docs.map(function(d) {
    var secs = Array.isArray(d.sections) ? d.sections : Object.values(d.sections||{});
    var lc = secs.reduce(function(sum,s){
      var lots = Array.isArray(s.lots) ? s.lots : Object.values(s.lots||{});
      return sum + lots.length;
    }, 0);
    var updInfo = d.updatedAt
      ? '<span class="pf-card-upd"> · '+timeAgo(d.updatedAt)+(d.updatedBy?' · '+esc(d.updatedBy.split('@')[0]):'')+'</span>'
      : '';
    return '<div class="pf-doc-card" onclick="APP.openDoc(\''+d.id+'\')">'+
      '<div class="pf-card-title">'+esc(d.title||'제목 없음')+'</div>'+
      '<div class="pf-card-meta">'+
      (d.material?'<span class="pf-card-chip mat">'+esc(d.material)+'</span>':'')+
      (d.author?'<span class="pf-card-chip">'+esc(d.author)+'</span>':'')+
      (d.date?'<span class="pf-card-chip date">'+esc(d.date)+'</span>':'')+
      '</div><div class="pf-card-stats">'+secs.length+'섹션 · '+lc+' Lot'+updInfo+'</div>'+
      '<button class="pf-card-del" onclick="APP.deleteDoc(\''+d.id+'\');event.stopPropagation()">삭제</button></div>';
  }).join('');
  document.getElementById('doc-grid').innerHTML = html || '';
  document.getElementById('list-empty').classList.toggle('pf-hidden', !!docs.length);

  /* 휴지통 (삭제된 문서) — 목록 하단 collapsible (빈 상태도 항상 표시) */
  var trashEl = document.getElementById('pf-doc-trash');
  if (trashEl) {
    trashEl.classList.remove('pf-hidden');
    var bodyHtml = deletedDocs.length === 0
      ? '<div class="pf-trash-empty">휴지통이 비어있습니다. (문서 카드 우상단 "삭제" 버튼으로 삭제하면 여기로 이동)</div>'
      : '<table class="pf-trash-table"><tbody>'+
        deletedDocs.map(function(d) {
          var when = d.deletedAt ? new Date(d.deletedAt).toISOString().slice(0,16).replace('T',' ') : '';
          var by = d.deletedBy ? ' · '+esc(d.deletedBy.split('@')[0]) : '';
          return '<tr class="pf-trash-row">'+
            '<td class="pf-trash-title">'+esc(d.title||'(제목 없음)')+
              (d.material?' <span class="pf-trash-mat">'+esc(d.material)+'</span>':'')+'</td>'+
            '<td class="pf-trash-when">'+esc(when)+by+'</td>'+
            '<td class="pf-trash-act">'+
              '<button class="pf-trash-restore" onclick="APP.restoreDoc(\''+d.id+'\')">복원</button>'+
              '<button class="pf-trash-purge" onclick="APP.purgeDoc(\''+d.id+'\')">완전 삭제</button>'+
            '</td>'+
          '</tr>';
        }).join('')+
        '</tbody></table>';
    trashEl.innerHTML = '<details class="pf-trash"><summary>🗑️ 휴지통 — 삭제된 문서 ('+deletedDocs.length+')</summary>'+
      bodyHtml+
    '</details>';
  }
}

function renderDoc() {
  document.getElementById('v-list').classList.add('pf-hidden');
  document.getElementById('v-doc').classList.remove('pf-hidden');
  var d = getDoc(); if(!d) return;
  document.getElementById('inp-title').value = d.title||'';
  document.getElementById('inp-material').value = d.material||'';
  document.getElementById('inp-author').value = d.author||'';
  document.getElementById('inp-date').value = d.date||'';
  renderSummary();
  var secs = d.sections||[];
  var html = secs.length === 0 ? renderEmptyDoc() : secs.map(renderSec).join('');
  document.getElementById('doc-body').innerHTML = html;
  renderUpdatedInfo();
  renderStepTrash();
  // 전체 Lot 공정 접기/펼치기 버튼 라벨 갱신
  var togBtn = document.getElementById('pf-toggle-all-btn');
  if (togBtn) {
    var lotIds = [];
    secs.forEach(function(s){ (s.lots||[]).forEach(function(l){ lotIds.push(l.id); }); });
    var allCollapsed = lotIds.length && lotIds.every(function(id){return STATE.collapsedLots.has(id);});
    togBtn.textContent = allCollapsed ? '▶ 공정 전체 펼치기' : '▼ 공정 전체 접기';
    togBtn.disabled = !lotIds.length;
  }
  APP.initSortable();
}

/* ── 공정 휴지통 — 편집기 하단 collapsible ───────────
   삭제된 step 은 lot.deletedSteps[] 에 보관. 섹션/Lot 별로 그룹화하여
   복원·완전삭제 버튼 제공. */
function renderStepTrash() {
  var el = document.getElementById('pf-step-trash');
  if (!el) return;
  var d = getDoc();
  if (!d) { el.innerHTML = ''; el.classList.add('pf-hidden'); return; }
  var groups = [];
  var total = 0;
  (d.sections||[]).forEach(function(sec) {
    (sec.lots||[]).forEach(function(l) {
      var trash = Array.isArray(l.deletedSteps) ? l.deletedSteps : [];
      if (!trash.length) return;
      groups.push({ sec: sec, lot: l, steps: trash });
      total += trash.length;
    });
  });
  // 빈 상태에도 항상 표시 — 기능 발견성 + 위치 일관성
  el.classList.remove('pf-hidden');

  var STEP_LABEL = { react:'반응', solid:'결정화', wet:'Wet 정제', subl:'승화정제', collect:'여액 취합' };
  var rows = groups.map(function(g) {
    var stepsHtml = g.steps.map(function(st) {
      var lbl = STEP_LABEL[st.type] || st.type || '공정';
      if (st.type === 'subl' && st.location) lbl = (st.location + ' ' + lbl);
      var meta = [];
      if (st.date) meta.push(esc(st.date));
      if (st.operator) meta.push(esc(st.operator));
      if (st.deletedAt) meta.push('삭제 ' + new Date(st.deletedAt).toISOString().slice(0,16).replace('T',' '));
      if (st.deletedBy) meta.push(esc(st.deletedBy.split('@')[0]));
      var detail = st.detail ? '<div class="pf-trash-step-detail">'+esc(st.detail)+'</div>' : '';
      return '<li class="pf-trash-step pf-trash-step-'+esc(st.type||'')+'">'+
        '<div class="pf-trash-step-hd">'+
          '<span class="pf-trash-step-type pf-leg '+esc(st.type||'')+'">'+esc(lbl)+'</span>'+
          (st.tag ? '<span class="pf-trash-step-tag pf-tag pf-tag-'+esc(st.tag)+'">'+esc(st.tag.toUpperCase())+'</span>' : '')+
          '<span class="pf-trash-step-meta">'+meta.join(' · ')+'</span>'+
          '<span class="pf-trash-step-act">'+
            '<button class="pf-trash-restore" onclick="APP.restoreStep(\''+st.id+'\')">복원</button>'+
            '<button class="pf-trash-purge" onclick="APP.purgeStep(\''+st.id+'\')">완전 삭제</button>'+
          '</span>'+
        '</div>'+
        detail+
      '</li>';
    }).join('');
    return '<div class="pf-trash-group">'+
      '<div class="pf-trash-group-hd">'+
        '<span class="pf-trash-group-sec pf-sec-'+esc(g.sec.type||'')+'">'+esc(g.sec.type||'')+'</span>'+
        '<span class="pf-trash-group-lot">'+esc(g.lot.name||'(이름 없음)')+'</span>'+
        '<span class="pf-trash-group-count">'+g.steps.length+'건</span>'+
      '</div>'+
      '<ul class="pf-trash-step-list">'+stepsHtml+'</ul>'+
    '</div>';
  }).join('');

  var bodyHtml = total === 0
    ? '<div class="pf-trash-empty">휴지통이 비어있습니다. (공정 단계 ✕ 버튼으로 삭제하면 여기로 이동)</div>'
    : '<div class="pf-trash-body">'+rows+'</div>';

  el.innerHTML = '<details class="pf-trash"><summary>🗑️ 휴지통 — 삭제된 공정 ('+total+')</summary>'+
    bodyHtml+
  '</details>';
}

/* ── 요약 스트립 ───────────────────────────────── */
function renderSummary() {
  var d = getDoc(); if(!d) return;
  var counts = { P:0, N:0, S:0, lots:0, pass:0, fail:0, progress:0 };
  (d.sections||[]).forEach(function(s) {
    if (s.type === 'P' || s.type === 'N' || s.type === 'S') counts[s.type] += (s.lots||[]).length;
    (s.lots||[]).forEach(function(l) {
      counts.lots++;
      counts[lotStatus(l)]++;
    });
  });
  var el = document.getElementById('doc-summary');
  if (!el) return;
  el.innerHTML =
    '<span class="pf-sum-chip pf-sum-p">P Type <b>'+counts.P+'</b></span>'+
    '<span class="pf-sum-chip pf-sum-n">N Type <b>'+counts.N+'</b></span>'+
    '<span class="pf-sum-chip pf-sum-s">Single <b>'+counts.S+'</b></span>'+
    '<span class="pf-sum-sep"></span>'+
    '<span class="pf-sum-chip">전체 Lot <b>'+counts.lots+'</b></span>'+
    '<span class="pf-sum-chip pf-sum-pass">PASS <b>'+counts.pass+'</b></span>'+
    '<span class="pf-sum-chip pf-sum-fail">FAIL <b>'+counts.fail+'</b></span>'+
    '<span class="pf-sum-chip pf-sum-prog">진행 중 <b>'+counts.progress+'</b></span>';
}

/* ── 변경 이력 표시 ─────────────────────────────── */
function renderUpdatedInfo() {
  var d = getDoc(); var el = document.getElementById('pf-updated-info');
  if (!el) return;
  if (!d || !d.updatedAt) { el.textContent = ''; return; }
  var dt = new Date(d.updatedAt);
  var y = dt.getFullYear(), m = String(dt.getMonth()+1).padStart(2,'0'), day = String(dt.getDate()).padStart(2,'0');
  var hh = String(dt.getHours()).padStart(2,'0'), mm = String(dt.getMinutes()).padStart(2,'0');
  var by = d.updatedBy ? ' · '+d.updatedBy : '';
  el.textContent = '최근 수정 '+y+'-'+m+'-'+day+' '+hh+':'+mm+by;
}

function renderSec(s) {
  var tc = s.type==='N'?'pf-sec-n':(s.type==='S'?'pf-sec-s':'pf-sec-p');
  var isCollapsed = STATE.collapsedSecs.has(s.id);
  var d = getDoc();
  var secIdx = d ? d.sections.indexOf(s) : -1;
  var canUp   = secIdx > 0;
  var canDown = d ? secIdx < d.sections.length - 1 : false;
  var bodyHtml = isCollapsed
    ? (function() {
        var counts = {pass:0,fail:0,progress:0};
        (s.lots||[]).forEach(function(l){ counts[lotStatus(l)]++; });
        return '<div class="pf-sec-collapsed-bar '+tc+'">'
          +'<span>'+s.lots.length+' Lot</span>'
          +'<span>✅ PASS '+counts.pass+'</span>'
          +'<span>❌ FAIL '+counts.fail+'</span>'
          +'<span>🔄 진행 중 '+counts.progress+'</span>'
          +'<button class="pf-sec-collapse" onclick="APP.toggleSec(\''+s.id+'\',event)">▶ 펼치기</button>'
          +'</div>';
      })()
    : '<div class="pf-lot-row">'+
      (s.lots||[]).map(l=>renderLot(l,s)).join('')+
      '<div class="pf-add-lot-col"><button class="pf-add-lot-btn" onclick="APP.addLot(\''+s.id+'\',event)">+ Lot 추가</button></div>'+
      '</div>';
  return '<div class="pf-section" data-sec-id="'+s.id+'">'+
    '<div class="pf-sec-header '+tc+'">'+
    '<button class="pf-sec-collapse" onclick="APP.toggleSec(\''+s.id+'\',event)">'+(isCollapsed?'▶':'▼')+'</button>'+
    '<span class="pf-sec-type-badge">'+SEC_LABEL[s.type]+'</span>'+
    '<span class="pf-sec-lot-count">'+s.lots.length+' Lot</span>'+
    '<div class="pf-sec-ctrl">'+
    '<button class="pf-sec-tog'+(s.type==='P'?' active':'')+'" onclick="APP.setSectionType(\''+s.id+'\',\'P\',event)">P</button>'+
    '<button class="pf-sec-tog'+(s.type==='N'?' active':'')+'" onclick="APP.setSectionType(\''+s.id+'\',\'N\',event)">N</button>'+
    '<button class="pf-sec-tog'+(s.type==='S'?' active':'')+'" onclick="APP.setSectionType(\''+s.id+'\',\'S\',event)">S</button>'+
    '<button class="pf-sec-del" onclick="APP.deleteSection(\''+s.id+'\',event)">✕ 섹션 삭제</button>'+
    '</div></div>'+
    bodyHtml+'</div>';
}

/* 정제 Batch 행의 📦 재고 배지 + 🔗 이력 popover */
function renderRefineStockBadge(r) {
  var sk = refineStock(r);
  if (!sk.hasQty) return '';
  var tier = 'full';
  if (sk.stock <= 0) tier = 'empty';
  else if (sk.ratio < 0.2) tier = 'low';
  else if (sk.ratio < 0.5) tier = 'mid';
  var titleParts = ['재고 '+fmtQty(sk.stock, sk.unit)+' / 입력 '+fmtQty(sk.qty, sk.unit)];
  if (sk.consumed > 0) titleParts.push('출하됨 '+fmtQty(sk.consumed, sk.unit));
  return '<span class="pf-refine-stock pf-stock-'+tier+'" title="'+esc(titleParts.join(' · '))+'">📦 '+esc(fmtQty(sk.stock, sk.unit))+'</span>';
}

function renderRefineHistoryBadge(r) {
  var hist = refineShipments(r.id);
  if (!hist.length) return '';
  var popRows = hist.map(function(h) {
    return '<button class="pf-lot-hist-row" onclick="APP.jumpToShip(\''+h.shipId+'\',event)">'+
      '<span class="pf-lot-hist-name">'+esc(h.sh.shipName||'(이름 없음)')+'</span>'+
      '<span class="pf-lot-hist-qty">'+esc(fmtQty(h.qty, h.unit))+'</span>'+
      '<span class="pf-lot-hist-meta">'+esc((h.sh.customer||'-')+' · '+(h.sh.date||'-'))+'</span>'+
      '</button>';
  }).join('');
  return '<span class="pf-lot-hist-wrap" onclick="event.stopPropagation()">'+
    '<button class="pf-lot-hist-btn" title="이 정제 Batch가 포함된 출하 '+hist.length+'건" onclick="APP.toggleRefineHistory(\''+r.id+'\',event)">🔗 '+hist.length+'</button>'+
    '<div class="pf-lot-hist-pop" data-refine-id="'+r.id+'">'+
      '<div class="pf-lot-hist-hd">출하 이력 ('+hist.length+'건)</div>'+
      popRows+
    '</div>'+
  '</span>';
}

function renderLot(l, s) {
  var tc = s.type==='N'?'pf-lot-n':(s.type==='S'?'pf-lot-s':'pf-lot-p');
  var status = lotStatus(l);
  var statusLbl = {pass:'PASS', fail:'FAIL', progress:'진행 중'}[status];
  var isCollapsed = STATE.collapsedLots.has(l.id);
  var lastStep = (l.steps||[]).filter(st=>st.tag&&st.tag!=='pending').slice(-1)[0];
  var lastInfo = lastStep
    ? (stepLbl(lastStep, stepNum(l.steps, l.steps.indexOf(lastStep), lastStep.type))
       + (lastStep.date?' · '+lastStep.date:'')
       + (lastStep.operator?' · '+lastStep.operator:''))
    : (l.steps&&l.steps.length ? l.steps.length+'스텝' : '스텝 없음');
  // 정제 Batch 영역은 공정 접힘 여부와 무관하게 항상 노출 (사용자 요구).
  var refinesHtml = renderRefinesSection(l);
  var processBody = isCollapsed
    ? '<div class="pf-lot-collapsed-body">'+
        '<span>총 '+(l.steps||[]).length+'스텝</span>'+
        (lastInfo?'<span>마지막: '+esc(lastInfo)+'</span>':'')+
        '<button class="pf-add-lot-btn" style="margin-top:4px" onclick="APP.toggleLot(\''+l.id+'\',event)">▶ 펼치기</button>'+
      '</div>'
    : '<div class="pf-steps-list">'+
        (l.steps||[]).map((st,i)=>renderStep(st,l,i)).join('')+
      '</div>'+
      '<div class="pf-add-step-bar">'+
      '<button class="pf-qadd react" onclick="APP.addStep(\''+l.id+'\',\'react\',event)">+반응</button>'+
      '<button class="pf-qadd solid" onclick="APP.addStep(\''+l.id+'\',\'solid\',event)">+결정화</button>'+
      '<button class="pf-qadd wet" onclick="APP.addStep(\''+l.id+'\',\'wet\',event)">+Wet</button>'+
      '<button class="pf-qadd subl" onclick="APP.addStep(\''+l.id+'\',\'subl\',event)">+승화</button>'+
      '<button class="pf-qadd collect" onclick="APP.addStep(\''+l.id+'\',\'collect\',event)">+여액</button>'+
      '</div>';
  return '<div class="pf-lot-col pf-lot-st-'+status+'" data-lot-id="'+l.id+'">'+
    '<div class="pf-lot-header '+tc+'">'+
    '<div class="pf-lot-head-top">'+
      '<span class="pf-lot-status pf-st-'+status+'">'+statusLbl+'</span>'+
      '<button class="pf-lot-collapse-btn" title="공정 접기/펼치기" onclick="APP.toggleLot(\''+l.id+'\',event)">'+(isCollapsed?'▶':'▼')+'</button>'+
      '<button class="pf-lot-ctl-btn" title="Lot 복제" onclick="APP.cloneLot(\''+l.id+'\',event)">⎘</button>'+
      '<button class="pf-lot-ctl-btn pf-lot-del-btn" title="Lot 삭제" onclick="APP.deleteLot(\''+l.id+'\',event)">✕</button>'+
    '</div>'+
    '<input class="pf-lot-name-inp" value="'+esc(l.name)+'" placeholder="합성 Batch No." oninput="APP.updateLotName(\''+l.id+'\',this.value)" onclick="event.stopPropagation()">'+
    '</div>'+refinesHtml+processBody+'</div>';
}

/* 정제 Batch 한 행의 재고/이력 배지만 partial 갱신 */
function renderRefineStock(rid) {
  var slot = document.querySelector('[data-refine-stock="'+rid+'"]');
  if (!slot) return;
  // refine 객체 검색
  var found = null;
  if (STATE.currentId && getDoc()) {
    (getDoc().sections||[]).forEach(function(s) {
      (s.lots||[]).forEach(function(l) {
        (l.refines||[]).forEach(function(r) { if (r.id === rid) found = r; });
      });
    });
  }
  if (!found) return;
  slot.innerHTML = renderRefineStockBadge(found) + renderRefineHistoryBadge(found);
}

/* 정제 Batch 섹션 — Lot 카드 body 하단에 노출.
   합성 Batch(Lot)에서 정제 공정을 거쳐 나온 산출물들의 잔량 기록용. */
function renderRefinesSection(l) {
  var refines = Array.isArray(l.refines) ? l.refines : [];
  var rows = refines.map(function(r){ return renderRefineRowHtml(l, r); }).join('');
  return '<div class="pf-refines" onclick="event.stopPropagation()">'+
    '<div class="pf-refines-hd">'+
      '<span class="pf-refines-title">정제 Batch · 잔량'+(refines.length?' ('+refines.length+'건)':'')+'</span>'+
      '<button class="pf-refines-add" onclick="APP.addRefine(\''+l.id+'\')">+ 정제 Batch 추가</button>'+
    '</div>'+
    (refines.length
      ? '<div class="pf-refines-list">'+rows+'</div>'
      : '<div class="pf-refines-empty">아직 정제 Batch가 없습니다.</div>')+
  '</div>';
}

function renderRefineRowHtml(l, r) {
  var qtyVal = (typeof r.qty === 'number') ? r.qty : '';
  var unitVal = r.unit || 'g';
  return '<div class="pf-refine-row" data-refine-row-id="'+r.id+'">'+
    '<div class="pf-refine-top">'+
      '<input class="pf-refine-name-inp" placeholder="L00L-000-000" value="'+esc(r.name||'')+'" oninput="APP.updateRefineField(\''+l.id+'\',\''+r.id+'\',\'name\',this.value)">'+
      '<input class="pf-refine-qty-inp" type="number" min="0" step="0.01" inputmode="decimal" placeholder="수량" value="'+esc(String(qtyVal))+'" oninput="APP.updateRefineField(\''+l.id+'\',\''+r.id+'\',\'qty\',this.value)">'+
      '<span class="pf-refine-unit-lbl">'+esc(unitVal)+'</span>'+
    '</div>'+
    '<div class="pf-refine-bot">'+
      '<span class="pf-refine-badges" data-refine-stock="'+r.id+'">'+
        renderRefineStockBadge(r)+renderRefineHistoryBadge(r)+
      '</span>'+
      '<button class="pf-refine-del-btn" title="삭제" onclick="APP.deleteRefine(\''+l.id+'\',\''+r.id+'\')">✕</button>'+
    '</div>'+
  '</div>';
}


function renderStep(st, l, i) {
  var n = stepNum(l.steps, i, st.type);
  var lbl = stepLbl(st, n);
  var pending = st.tag==='pending'?'pf-pending':'';
  var editing = STATE.editKey===st.id?'pf-step-editing':'';
  var tagHtml = st.tag&&st.tag!=='pending'?'<span class="pf-tag pf-tag-'+st.tag+'">'+st.tag.toUpperCase()+'</span>':'';
  var metaParts = [];
  if (st.date)     metaParts.push('<span class="pf-step-date">📅 '+esc(st.date)+'</span>');
  if (st.operator) metaParts.push('<span class="pf-step-op">👤 '+esc(st.operator)+'</span>');
  var metaHtml = metaParts.length ? '<div class="pf-step-meta">'+metaParts.join('')+'</div>' : '';
  var stepHtml = '<div class="pf-step '+st.type+' '+pending+' '+editing+'" data-step-id="'+st.id+'" onclick="APP.onStepClick(\''+st.id+'\');event.stopPropagation()">'+
    '<div class="pf-step-hd"><span class="pf-step-lbl">'+esc(lbl)+tagHtml+'</span>'+
    '<span class="pf-step-btns">'+
    '<button class="pf-sb pf-sb-del" onclick="APP.deleteStep(\''+st.id+'\');event.stopPropagation()">✕</button>'+
    '</span></div>'+
    (st.detail?'<div class="pf-step-detail">'+esc(st.detail)+'</div>':'')+
    metaHtml+
    '</div>';
  return stepHtml;
}

/* 드로어 안에 렌더되는 편집 내용 (래퍼 없이 내용만) */
function renderEditPanelInner(st) {
  var chips = (CHIP_MAP[st.type]||[]).map(c=>'<button class="pf-chip" onclick="APP.insertChip(\''+st.id+'\',\''+c.replace(/'/g,"\\'")+'\')" data-chip="'+c+'">'+esc(c)+'</button>').join('');
  var locHtml = st.type==='subl'?
    '<div class="ep-row ep-row-loc"><span class="ep-lbl">위치</span>'+
    '<button class="ep-tog'+(st.location==='충주'?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'location\',\'충주\')">충주</button>'+
    '<button class="ep-tog'+(st.location==='용인'?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'location\',\'용인\')">용인</button>'+
    '<button class="ep-tog'+(!st.location?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'location\',\'\')">미지정</button></div>':'';
  var tagHtml = '<div class="ep-row ep-row-tag"><span class="ep-lbl">결과</span>'+
    '<button class="ep-tog ep-pass'+(st.tag==='pass'?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'tag\',\'pass\')">PASS</button>'+
    '<button class="ep-tog ep-fail'+(st.tag==='fail'?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'tag\',\'fail\')">FAIL</button>'+
    '<button class="ep-tog ep-pend'+(st.tag==='pending'?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'tag\',\'pending\')">예정</button>'+
    '<button class="ep-tog'+(!st.tag?' ep-on':'')+'" onclick="APP.setStepField(\''+st.id+'\',\'tag\',null)">없음</button></div>';
  var metaHtml = '<div class="ep-row ep-row-meta">'+
    '<span class="ep-lbl">진행</span>'+
    '<input type="date" class="ep-inp ep-inp-date" value="'+esc(st.date||'')+'" oninput="APP.setStepField(\''+st.id+'\',\'date\',this.value)">'+
    '<input type="text" class="ep-inp ep-inp-op" placeholder="담당자" value="'+esc(st.operator||'')+'" oninput="APP.setStepField(\''+st.id+'\',\'operator\',this.value)">'+
    '</div>';
  return '<div class="ep-row ep-row-type"><span class="ep-lbl">유형</span>'+
    ['react','solid','wet','subl','collect'].map(t=>'<button class="ep-type-btn '+t+(st.type===t?' ep-on':'')+'" onclick="APP.setStepType(\''+st.id+'\',\''+t+'\')">'+
    ({react:'반응',solid:'결정화',wet:'Wet',subl:'승화',collect:'여액'}[t])+'</button>').join('')+
    '</div>'+locHtml+tagHtml+metaHtml+
    '<div class="ep-detail-wrap"><textarea class="ep-ta" id="ep-ta-'+st.id+'" placeholder="상세 내용" oninput="APP.onDetailInput(\''+st.id+'\',this.value)" rows="6">'+
    esc(st.detail||'')+'</textarea><div class="ep-chips">'+chips+'</div></div>';
}

/* ── 드로어 렌더 ─────────────────────────────────── */
function renderDrawer() {
  var drawer = document.getElementById('pf-drawer');
  var body   = document.getElementById('pf-drawer-body');
  var lbl    = document.getElementById('pf-drawer-lbl');
  if (!drawer || !body) return;
  if (!STATE.editKey) { drawer.classList.remove('pf-drawer-open'); return; }
  var st = findStep(STATE.editKey);
  var l  = findStepLot(STATE.editKey);
  if (!st || !l) { drawer.classList.remove('pf-drawer-open'); return; }
  drawer.classList.add('pf-drawer-open');
  var i = l.steps.findIndex(s=>s.id===STATE.editKey);
  var n = stepNum(l.steps, i, st.type);
  if (lbl) lbl.textContent = stepLbl(st,n) + '  ·  ' + (l.name||'');
  // 커서 보존
  var ta = document.getElementById('ep-ta-'+st.id);
  var hadFocus = ta && document.activeElement === ta;
  var sel = ta ? [ta.selectionStart, ta.selectionEnd] : [0,0];
  body.innerHTML = renderEditPanelInner(st);
  var newTa = document.getElementById('ep-ta-'+st.id);
  if (newTa) {
    if (hadFocus) { newTa.focus(); try { newTa.setSelectionRange(sel[0],sel[1]); } catch(e){} }
    else newTa.focus();
  }
}

/* ── 출하 Lot 모달 렌더 ──────────────────────────── */
function renderShipModal() {
  var overlay = document.getElementById('pf-ship-overlay');
  if (!overlay) return;
  if (!STATE.ship.open) { overlay.classList.remove('pf-ship-open'); return; }
  overlay.classList.add('pf-ship-open');
  var body = document.getElementById('pf-ship-body');
  if (!body) return;
  // 입력 포커스 보존
  var active = document.activeElement;
  var activeId = active && active.id;
  var selStart = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  if (STATE.ship.view === 'detail' && STATE.ship.selectedId && STATE.shipments[STATE.ship.selectedId]) {
    body.innerHTML = renderShipDetail(STATE.shipments[STATE.ship.selectedId]);
  } else {
    STATE.ship.view = 'list';
    body.innerHTML = renderShipList();
  }
  if (activeId) {
    var el = document.getElementById(activeId);
    if (el) {
      el.focus();
      if (selStart !== null && el.setSelectionRange) {
        try { el.setSelectionRange(selStart, selStart); } catch(e){}
      }
    }
  }
}

function renderShipList() {
  var filterDocId = STATE.ship.filterDocId;
  var filterDoc = filterDocId ? STATE.docs[filterDocId] : null;
  // 필터 대상 문서가 사라졌으면 필터 해제
  if (filterDocId && !filterDoc) { STATE.ship.filterDocId = null; filterDocId = null; }

  // 한 shipment이 touch하는 docId 집합
  function shipDocIds(sh) {
    var ids = [];
    (sh.components || []).forEach(function(c) {
      if (c.docId && ids.indexOf(c.docId) === -1) ids.push(c.docId);
    });
    return ids;
  }

  var allShips = Object.values(STATE.shipments).filter(function(sh){ return !sh.deleted; });
  allShips.sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
  var deleted = Object.values(STATE.shipments).filter(function(sh){ return sh.deleted; });

  function shipRowHtml(sh, extraTags) {
    var tot = shipTotal(sh);
    var comps = Array.isArray(sh.components) ? sh.components : [];
    return '<tr class="pf-ship-row" onclick="APP.openShipDetail(\''+sh.id+'\')">'+
      '<td class="pf-ship-name">'+esc(sh.shipName||'(이름 없음)')+(extraTags||'')+'</td>'+
      '<td>'+esc(sh.customer||'-')+'</td>'+
      '<td>'+esc(sh.date||'-')+'</td>'+
      '<td class="pf-ship-num">'+fmtQty(tot.qty, tot.unit)+'</td>'+
      '<td class="pf-ship-num">'+comps.length+'</td>'+
      '<td><button class="pf-ship-del-btn" onclick="event.stopPropagation();APP.deleteShip(\''+sh.id+'\')">삭제</button></td>'+
    '</tr>';
  }

  var headRow = '<thead><tr>'+
      '<th>출하명</th><th>고객</th><th>일자</th><th>총량</th><th>구성</th><th></th>'+
    '</tr></thead>';

  var tableHtml = '';
  if (filterDocId) {
    // ── 필터 모드: 해당 문서를 포함하는 출하만 ─────────────────
    var shipsF = allShips.filter(function(sh){ return shipDocIds(sh).indexOf(filterDocId) !== -1; });
    if (shipsF.length === 0) {
      tableHtml = '<div class="pf-ship-empty">이 문서에 연결된 출하 Lot이 없습니다. 우상단 <strong>+ 새 출하 Lot</strong>으로 시작하세요.</div>';
    } else {
      tableHtml = '<table class="pf-ship-table">'+headRow+'<tbody>'+
        shipsF.map(function(sh){ return shipRowHtml(sh, ''); }).join('')+
      '</tbody></table>';
    }
  } else {
    // ── 그룹 모드: 문서별로 묶어서 한 번에 보여줌 ─────────────
    if (allShips.length === 0) {
      tableHtml = '<div class="pf-ship-empty">아직 출하 Lot이 없습니다. <strong>+ 새 출하 Lot</strong>으로 시작하세요.</div>';
    } else {
      // docId → [ship,...] map (출하는 touch하는 모든 doc 그룹에 노출)
      var grouped = {};
      var orphans = []; // 컴포넌트 없는 출하
      allShips.forEach(function(sh) {
        var ids = shipDocIds(sh);
        if (ids.length === 0) { orphans.push(sh); return; }
        ids.forEach(function(did) {
          (grouped[did] = grouped[did] || []).push(sh);
        });
      });
      // 그룹 정렬: material 알파순 → title
      var docIds = Object.keys(grouped).sort(function(a, b) {
        var da = STATE.docs[a] || {}; var db_ = STATE.docs[b] || {};
        var ma = (da.material || da.title || '').toLowerCase();
        var mb = (db_.material || db_.title || '').toLowerCase();
        if (ma !== mb) return ma < mb ? -1 : 1;
        return (da.title || '').localeCompare(db_.title || '');
      });
      var bodyParts = [];
      docIds.forEach(function(did) {
        var doc = STATE.docs[did] || {};
        var shipsG = grouped[did];
        var lbl = esc((doc.material || '(소재 없음)') + ' · ' + (doc.title || '(제목 없음)'));
        bodyParts.push(
          '<tr class="pf-ship-grp-hd">'+
            '<td colspan="6">'+
              '<button class="pf-ship-grp-filter" title="이 제품만 보기" onclick="event.stopPropagation();APP.setShipFilter(\''+did+'\')">'+lbl+' <span class="pf-ship-grp-cnt">'+shipsG.length+'건</span> <span class="pf-ship-grp-arrow">→</span></button>'+
            '</td>'+
          '</tr>'
        );
        shipsG.forEach(function(sh) {
          // 다른 문서도 함께 포함된 출하인지 표시 (혼합 출하 마커)
          var idsAll = shipDocIds(sh);
          var mixTag = idsAll.length > 1 ? ' <span class="pf-ship-mix" title="다른 문서도 포함 ('+idsAll.length+')">🔗'+idsAll.length+'</span>' : '';
          bodyParts.push(shipRowHtml(sh, mixTag));
        });
      });
      if (orphans.length) {
        bodyParts.push(
          '<tr class="pf-ship-grp-hd pf-ship-grp-orphan"><td colspan="6"><span class="pf-ship-grp-lbl">미할당 (구성 없음)</span> · '+orphans.length+'건</td></tr>'
        );
        orphans.forEach(function(sh) { bodyParts.push(shipRowHtml(sh, '')); });
      }
      tableHtml = '<table class="pf-ship-table">'+headRow+'<tbody>'+bodyParts.join('')+'</tbody></table>';
    }
  }

  var deletedSection = '';
  if (deleted.length) {
    deletedSection = '<details class="pf-ship-deleted"><summary>삭제된 출하 ('+deleted.length+')</summary>'+
      '<table class="pf-ship-table"><tbody>'+
      deleted.map(function(sh) {
        return '<tr class="pf-ship-row pf-ship-deleted-row">'+
          '<td>'+esc(sh.shipName||'(이름 없음)')+'</td>'+
          '<td>'+esc(sh.customer||'-')+'</td>'+
          '<td>'+esc(sh.date||'-')+'</td>'+
          '<td>'+
            '<button class="pf-ship-restore-btn" onclick="APP.restoreShip(\''+sh.id+'\')">복원</button>'+
            '<button class="pf-ship-purge-btn" onclick="APP.purgeShip(\''+sh.id+'\')">완전 삭제</button>'+
          '</td>'+
        '</tr>';
      }).join('')+'</tbody></table></details>';
  }

  var filterBanner = filterDocId
    ? '<div class="pf-ship-filter-bar">'+
        '<span class="pf-ship-filter-lbl">필터:</span>'+
        '<span class="pf-ship-filter-chip">'+esc((filterDoc.material||'')+' · '+(filterDoc.title||''))+'</span>'+
        '<button class="pf-ship-filter-clear" onclick="APP.setShipFilter(null)">✕ 전체 보기</button>'+
      '</div>'
    : '';

  // 고아 컴포넌트 개수 — 0보다 크면 정리 버튼 노출
  var orphanCount = findOrphanComponents().length;
  var orphanBtn = orphanCount > 0
    ? '<button class="btn pf-ship-orphan-btn" title="원본 Lot/정제 Batch가 삭제된 출하 컴포넌트 정리" onclick="APP.cleanupOrphans()">🧹 고아 정리 ('+orphanCount+')</button>'
    : '';

  return '<div class="pf-ship-toolbar">'+
      '<h3 class="pf-ship-h">출하 Lot 목록</h3>'+
      orphanBtn+
      '<button class="btn btn-primary" onclick="APP.newShip()">+ 새 출하 Lot</button>'+
    '</div>'+
    filterBanner+
    tableHtml+
    deletedSection;
}

function renderShipDetail(sh) {
  var compsRaw = Array.isArray(sh.components) ? sh.components : [];
  var TYPE_ORDER = { P: 0, N: 1, S: 2 };
  var GRP_ORDER = ['P','N','S','OTHER'];
  var GRP_LABEL = { P:'P Type', N:'N Type', S:'Single', OTHER:'기타' };
  function typeBucket(t) { return (t === 'P' || t === 'N' || t === 'S') ? t : 'OTHER'; }
  function bucketRows(rows, typeAccessor) {
    var b = { P:[], N:[], S:[], OTHER:[] };
    rows.forEach(function(r) { b[typeBucket(typeAccessor(r))].push(r); });
    return b;
  }

  /* 구성 (이미 추가된 components) — 합성→정제 순, P/N/S 그룹 헤더·테두리 */
  var comps = compsRaw.map(function(c, i) { return { c: c, i: i }; });
  comps.sort(function(a, b) {
    var ta = TYPE_ORDER[a.c.sectionTypeSnapshot]; if (ta === undefined) ta = 9;
    var tb = TYPE_ORDER[b.c.sectionTypeSnapshot]; if (tb === undefined) tb = 9;
    if (ta !== tb) return ta - tb;
    var la = (a.c.lotNameSnapshot||'').localeCompare(b.c.lotNameSnapshot||'');
    if (la !== 0) return la;
    return (a.c.refineNameSnapshot||'').localeCompare(b.c.refineNameSnapshot||'');
  });
  var tot = shipTotal(sh);
  var compTableHtml = '';
  if (comps.length) {
    var compBuckets = bucketRows(comps, function(e){return e.c.sectionTypeSnapshot;});
    var compParts = [];
    GRP_ORDER.forEach(function(t) {
      var rowsT = compBuckets[t]; if (!rowsT.length) return;
      var grpCls = 'pf-pick-grp-' + t;
      compParts.push(
        '<tr class="pf-pick-grp-hd '+grpCls+'">'+
          '<td colspan="6"><span class="pf-pick-grp-lbl">'+GRP_LABEL[t]+'</span> · '+rowsT.length+'건</td>'+
        '</tr>'
      );
      rowsT.forEach(function(entry, idx) {
        var c = entry.c, i = entry.i;
        var typeCls = c.sectionTypeSnapshot === 'N' ? 'pf-comp-n' : (c.sectionTypeSnapshot === 'S' ? 'pf-comp-s' : 'pf-comp-p');
        var typeLbl = c.sectionTypeSnapshot || '-';
        var doc = STATE.docs[c.docId];
        var sec = doc && (doc.sections||[]).find(function(s){return s.id===c.sectionId;});
        var lot = sec && (sec.lots||[]).find(function(l){return l.id===c.lotId;});
        var refine = lot && c.refineId && (lot.refines||[]).find(function(r){return r.id===c.refineId;});
        var orphan = (!lot || (c.refineId && !refine)) ? '<span class="pf-comp-orphan" title="원본이 삭제됨 — 드릴다운 불가">⚠</span>' : '';
        var refIdArg = c.refineId ? '\''+c.refineId+'\'' : 'null';
        var jumpBtn = lot
          ? '<button class="pf-comp-jump" title="공정 미리보기" onclick="APP.openProcessPopup(\''+c.docId+'\',\''+c.sectionId+'\',\''+c.lotId+'\','+refIdArg+',event)">↗</button>'
          : '';
        var refineLabel = c.refineNameSnapshot
          ? '<span class="pf-batch-name">'+esc(c.refineNameSnapshot)+'</span>'
          : '<span class="pf-comp-legacy" title="정제 Batch 정보 없음 (구 데이터)">— (구 데이터)</span>';
        var classParts = ['pf-pick-row', grpCls];
        if (idx === rowsT.length - 1) classParts.push('pf-pick-grp-last');
        compParts.push(
          '<tr class="'+classParts.join(' ')+'">'+
            '<td><span class="pf-comp-type-tag '+typeCls+'">'+esc(typeLbl)+'</span></td>'+
            '<td class="pf-comp-synth"><span class="pf-batch-name">'+esc(c.lotNameSnapshot||'-')+'</span></td>'+
            '<td class="pf-comp-refine">'+refineLabel+' '+orphan+jumpBtn+'</td>'+
            '<td class="pf-comp-doc">'+esc(c.materialSnapshot||'-')+' · '+esc(c.docTitleSnapshot||'-')+'</td>'+
            '<td class="pf-ship-num">'+
              '<input type="number" min="0" step="0.01" class="pf-comp-qty-inp" value="'+esc(String(c.qty))+'" oninput="APP.updateShipCompQty(\''+sh.id+'\','+i+',this.value)">'+
              '<span class="pf-comp-unit">'+esc(c.unit||'g')+'</span>'+
            '</td>'+
            '<td><button class="pf-ship-del-btn" onclick="APP.removeShipComponent(\''+sh.id+'\','+i+')">제거</button></td>'+
          '</tr>'
        );
      });
    });
    compTableHtml = '<table class="pf-ship-table pf-pick-table"><thead><tr>'+
        '<th>Type</th><th>합성 Batch</th><th>정제 Batch</th><th>소재 · 문서</th><th>수량</th><th></th>'+
      '</tr></thead><tbody>'+compParts.join('')+'</tbody></table>';
  } else {
    compTableHtml = '<div class="pf-ship-empty pf-ship-empty-sm">아직 구성된 Batch가 없습니다. 아래 표에서 사용수량을 입력하세요.</div>';
  }

  /* 일괄 추가 그리드 — 같은 문서 내 정제 Batch만 (한 출하 = 한 문서 정책) */
  var firstCompDocId = (comps[0] && comps[0].c.docId) || null;
  // 우선순위: 이미 추가된 컴포넌트의 docId (lock) > 필터 docId
  var pickDocId = firstCompDocId || STATE.ship.filterDocId || null;
  var pickDoc = pickDocId ? STATE.docs[pickDocId] : null;
  if (pickDocId && !pickDoc) pickDocId = null; // 사라진 문서면 무시
  var pickerRows = [];
  Object.values(STATE.docs).forEach(function(doc) {
    if (pickDocId && doc.id !== pickDocId) return; // 다른 문서는 제외
    (doc.sections||[]).forEach(function(s) {
      (s.lots||[]).forEach(function(l) {
        (l.refines||[]).forEach(function(r) {
          // r.qty 미입력 batch도 노출 — 추후 입력 전 0g 구성을 허용
          pickerRows.push({ doc: doc, sec: s, lot: l, refine: r });
        });
      });
    });
  });
  pickerRows.sort(function(a, b) {
    var ta = TYPE_ORDER[a.sec.type]; if (ta === undefined) ta = 9;
    var tb = TYPE_ORDER[b.sec.type]; if (tb === undefined) tb = 9;
    if (ta !== tb) return ta - tb;
    var ma = (a.doc.material||a.doc.title||'').localeCompare(b.doc.material||b.doc.title||'');
    if (ma !== 0) return ma;
    var na = (a.lot.name||'').localeCompare(b.lot.name||'');
    if (na !== 0) return na;
    return (a.refine.name||'').localeCompare(b.refine.name||'');
  });
  // picker 위 상단 안내 — 어느 문서로 잠겨 있는지 표시
  var pickNotice = '';
  if (pickDocId && pickDoc) {
    var lockedByComp = !!firstCompDocId;
    pickNotice = '<div class="pf-pick-notice'+(lockedByComp?' pf-pick-notice-locked':'')+'">'+
      '<span class="pf-pick-notice-lbl">'+(lockedByComp?'🔒 이 출하의 문서':'필터')+'</span>'+
      '<span class="pf-pick-notice-doc">'+esc((pickDoc.material||'')+' · '+(pickDoc.title||''))+'</span>'+
      (lockedByComp ? '<span class="pf-pick-notice-hint">컴포넌트 추가 후엔 같은 문서로 고정</span>' : '')+
    '</div>';
  }
  var pickerHtml;
  if (!pickerRows.length) {
    pickerHtml = '<div class="pf-ship-empty pf-ship-empty-sm">'+
      (pickDocId
        ? '이 문서에 정제 Batch가 없습니다. Lot 카드 하단 "정제 Batch" 영역에 추가하세요.'
        : '아직 정제 Batch가 없습니다. Lot 카드 하단 "정제 Batch" 영역에 추가하세요.')+
    '</div>';
  } else {
    var pBuckets = bucketRows(pickerRows, function(r){return r.sec.type;});
    var pickerBodyParts = [];
    GRP_ORDER.forEach(function(t) {
      var rowsT = pBuckets[t]; if (!rowsT.length) return;
      var grpCls = 'pf-pick-grp-' + t;
      pickerBodyParts.push(
        '<tr class="pf-pick-grp-hd '+grpCls+'">'+
          '<td colspan="7"><span class="pf-pick-grp-lbl">'+GRP_LABEL[t]+'</span> · '+rowsT.length+'건</td>'+
        '</tr>'
      );
      rowsT.forEach(function(pr, idx) {
        var sk = refineStock(pr.refine);
        var typeCls = pr.sec.type === 'N' ? 'pf-comp-n' : (pr.sec.type === 'S' ? 'pf-comp-s' : 'pf-comp-p');
        var classParts = ['pf-pick-row', grpCls];
        if (sk.hasQty && sk.stock <= 0) classParts.push('pf-pick-empty');
        if (idx === rowsT.length - 1) classParts.push('pf-pick-grp-last');
        var rowCls = classParts.join(' ');
        var stockDisplay;
        var stockCls;
        if (!sk.hasQty) {
          stockDisplay = '<span class="pf-pick-stock-noqty" title="아직 수량 미입력 — 0g 구성 가능">미입력</span>';
          stockCls = '';
        } else {
          stockCls = 'pf-pick-stock-'+(sk.stock <= 0 ? 'empty' : (sk.ratio < 0.2 ? 'low' : (sk.ratio < 0.5 ? 'mid' : 'full')));
          stockDisplay = esc(fmtQty(sk.stock, sk.unit));
        }
        var pickJumpBtn = '<button class="pf-comp-jump" title="공정 미리보기" onclick="APP.openProcessPopup(\''+pr.doc.id+'\',\''+pr.sec.id+'\',\''+pr.lot.id+'\',\''+pr.refine.id+'\',event)">↗</button>';
        pickerBodyParts.push(
          '<tr class="'+rowCls+'" data-doc-id="'+pr.doc.id+'" data-sec-id="'+pr.sec.id+'" data-lot-id="'+pr.lot.id+'" data-refine-id="'+pr.refine.id+'">'+
            '<td><span class="pf-comp-type-tag '+typeCls+'">'+esc(pr.sec.type||'-')+'</span></td>'+
            '<td class="pf-pick-synth"><span class="pf-batch-name">'+esc(pr.lot.name||'-')+'</span></td>'+
            '<td class="pf-pick-refine"><span class="pf-batch-name">'+esc(pr.refine.name||'(이름 없음)')+'</span> '+pickJumpBtn+'</td>'+
            '<td class="pf-pick-mat">'+esc(pr.doc.material||'-')+'</td>'+
            '<td class="pf-pick-doc">'+esc(pr.doc.title||'-')+'</td>'+
            '<td class="pf-ship-num '+stockCls+'">'+stockDisplay+'</td>'+
            '<td class="pf-ship-num">'+
              '<input type="number" min="0" step="0.01" class="pf-pick-qty-inp" placeholder="0 ok"'+
                ' data-max="'+(sk.hasQty ? sk.stock : '')+'">'+
              '<span class="pf-comp-unit">'+esc(sk.unit||'g')+'</span>'+
            '</td>'+
          '</tr>'
        );
      });
    });
    pickerHtml = '<table class="pf-ship-table pf-pick-table"><thead><tr>'+
        '<th>Type</th><th>합성 Batch</th><th>정제 Batch</th><th>소재</th><th>문서</th><th>현재고</th><th>사용수량</th>'+
      '</tr></thead><tbody>'+pickerBodyParts.join('')+'</tbody></table>'+
      '<div class="pf-pick-actions">'+
        '<button class="btn btn-primary" onclick="APP.addShipComponentsBatch(\''+sh.id+'\')">+ 입력한 수량 모두 추가</button>'+
        '<button class="btn pf-pick-clear" onclick="APP.clearPickGrid()">입력 초기화</button>'+
      '</div>';
  }
  pickerHtml = pickNotice + pickerHtml;

  return '<div class="pf-ship-detail-hd">'+
      '<button class="pf-back-btn" onclick="APP.backToShipList()">← 목록</button>'+
      '<h3 id="pf-ship-detail-title" class="pf-ship-h">'+esc(sh.shipName||'(이름 없음)')+'</h3>'+
      '<button class="pf-ship-del-btn" onclick="APP.deleteShip(\''+sh.id+'\')">출하 삭제</button>'+
    '</div>'+
    '<div class="pf-ship-meta">'+
      '<label>출하명 <input id="pf-ship-inp-name" class="pf-inp" value="'+esc(sh.shipName||'')+'" oninput="APP.updateShipField(\''+sh.id+'\',\'shipName\',this.value)"></label>'+
      '<label>고객 <input id="pf-ship-inp-cust" class="pf-inp" value="'+esc(sh.customer||'')+'" placeholder="LGD, SDC..." oninput="APP.updateShipField(\''+sh.id+'\',\'customer\',this.value)"></label>'+
      '<label>일자 <input id="pf-ship-inp-date" class="pf-inp" type="date" value="'+esc(sh.date||'')+'" oninput="APP.updateShipField(\''+sh.id+'\',\'date\',this.value)"></label>'+
      '<label class="pf-ship-meta-note">메모 <input id="pf-ship-inp-note" class="pf-inp" value="'+esc(sh.note||'')+'" placeholder="" oninput="APP.updateShipField(\''+sh.id+'\',\'note\',this.value)"></label>'+
    '</div>'+
    '<div class="pf-ship-total">총 '+fmtQty(tot.qty, tot.unit)+' · '+comps.length+'개 Batch</div>'+
    compTableHtml+
    '<h4 class="pf-ship-sub pf-ship-sub-pick">+ 산출량 입력된 Lot에서 일괄 추가</h4>'+
    pickerHtml;
}

/* ── 공정 미리보기 팝업 ─────────────────────────────────────
   출하 모달을 닫지 않고 우상단에 떠 공정 step·정제 잔량을 함께 표시. */
function renderProcessPopup() {
  var pop = document.getElementById('pf-proc-popup');
  if (!pop) return;
  if (!STATE.proc.open) { pop.classList.remove('pf-proc-open'); pop.innerHTML = ''; return; }
  var doc = STATE.docs[STATE.proc.docId];
  var sec = doc && (doc.sections||[]).find(function(s){return s.id===STATE.proc.sectionId;});
  var lot = sec && (sec.lots||[]).find(function(l){return l.id===STATE.proc.lotId;});
  if (!doc || !sec || !lot) { STATE.proc.open = false; pop.classList.remove('pf-proc-open'); pop.innerHTML = ''; return; }
  var tc = sec.type==='N'?'pf-proc-n':(sec.type==='S'?'pf-proc-s':'pf-proc-p');
  var typeLbl = sec.type || '-';
  var steps = Array.isArray(lot.steps) ? lot.steps : [];
  var refines = Array.isArray(lot.refines) ? lot.refines : [];
  var stepHtml = steps.length
    ? steps.map(function(st, i) {
        var lbl = stepLbl(st, stepNum(steps, i, st.type));
        var tagHtml = st.tag && st.tag!=='pending'
          ? '<span class="pf-proc-tag pf-tag-'+st.tag+'">'+st.tag.toUpperCase()+'</span>'
          : (st.tag==='pending' ? '<span class="pf-proc-tag pf-proc-pending">예정</span>' : '');
        var metaParts = [];
        if (st.date)     metaParts.push('📅 '+esc(st.date));
        if (st.operator) metaParts.push('👤 '+esc(st.operator));
        var meta = metaParts.length ? '<div class="pf-proc-step-meta">'+metaParts.join(' · ')+'</div>' : '';
        var det = st.detail ? '<div class="pf-proc-step-det">'+esc(st.detail)+'</div>' : '';
        return '<div class="pf-proc-step '+st.type+'">'+
          '<div class="pf-proc-step-hd"><span class="pf-proc-step-lbl">'+esc(lbl)+'</span>'+tagHtml+'</div>'+
          det+meta+
        '</div>';
      }).join('')
    : '<div class="pf-proc-empty">공정 단계가 없습니다.</div>';
  var refineHtml = refines.length
    ? refines.map(function(r) {
        var hi = (STATE.proc.refineId && r.id === STATE.proc.refineId) ? ' pf-proc-refine-hi' : '';
        var stock = renderRefineStockBadge(r) || '<span class="pf-proc-refine-noqty">수량 미입력</span>';
        return '<div class="pf-proc-refine'+hi+'">'+
          '<span class="pf-batch-name">'+esc(r.name||'(이름 없음)')+'</span>'+
          stock+
        '</div>';
      }).join('')
    : '<div class="pf-proc-empty">정제 Batch가 없습니다.</div>';
  pop.innerHTML =
    '<div class="pf-proc-hd '+tc+'">'+
      '<span class="pf-proc-type-tag">'+esc(typeLbl)+'</span>'+
      '<span class="pf-proc-title"><span class="pf-batch-name">'+esc(lot.name||'(이름 없음)')+'</span></span>'+
      '<button class="pf-proc-close" onclick="APP.closeProcessPopup()" title="닫기 (Esc)">✕</button>'+
    '</div>'+
    '<div class="pf-proc-meta">'+esc(doc.material||'-')+' · '+esc(doc.title||'-')+'</div>'+
    '<div class="pf-proc-sec">'+
      '<div class="pf-proc-sec-hd">📦 정제 Batch 잔량</div>'+
      '<div class="pf-proc-refines">'+refineHtml+'</div>'+
    '</div>'+
    '<div class="pf-proc-sec">'+
      '<div class="pf-proc-sec-hd">공정 단계 ('+steps.length+')</div>'+
      '<div class="pf-proc-steps">'+stepHtml+'</div>'+
    '</div>';
  pop.classList.add('pf-proc-open');
}

/* ── 빈 문서 CTA ─────────────────────────────────── */
function renderEmptyDoc() {
  return '<div class="pf-empty-doc">'+
    '<div class="pf-empty-doc-title">첫 섹션을 추가해 시작하세요</div>'+
    '<div class="pf-empty-doc-sub">소재의 Type에 맞는 섹션을 선택하세요</div>'+
    '<div class="pf-empty-doc-btns">'+
    '<button class="pf-empty-btn pf-empty-p" onclick="APP.addSection(\'P\')">'+
    '<span class="pf-empty-btn-type">P</span><span>P Type 섹션</span></button>'+
    '<button class="pf-empty-btn pf-empty-n" onclick="APP.addSection(\'N\')">'+
    '<span class="pf-empty-btn-type">N</span><span>N Type 섹션</span></button>'+
    '<button class="pf-empty-btn pf-empty-s" onclick="APP.addSection(\'S\')">'+
    '<span class="pf-empty-btn-type">S</span><span>Single 섹션</span></button>'+
    '</div></div>';
}

/* ── 시드 데이터 ────────────────────────────────── */
function S(type,detail,tag,location){ return {id:uid(),type:type,detail:detail||'',tag:tag||null,location:location||''}; }

function buildSeed() {
  var ps = mkSec('P');
  ps.lots = [
    Object.assign(mkLot('P-MI18-TOL (1,704g)', '(L25I-305-108-TOL)'), {steps:[
      S('react','(Xylene) 후 농축/결정화(ACT)'),
      S('wet',  '(Si pass, DCB, MC/Hex)'),
      S('solid','농축/결정화(ACT)'),
      S('wet',  '(H2O slurry)'),
      S('wet',  '(재결정, DCB/MC)'),
      S('wet',  '(Slurry, Toluene)'),
      S('subl', '후 재처리'),
      S('wet',  '재결정(DCB/MC)'),
      S('wet',  '슬러리(Toluene)')
    ]}),
    Object.assign(mkLot('P-ND01-Tol3 (538g)'), {steps:[
      S('react','(Xylene) 후 농축/결정화(ACT)'),
      S('wet',  '(Si pass, DCB, MC/Hex)'),
      S('solid','농축/결정화(ACT)'),
      S('wet',  '(Si pass, DCB, MC/Hex, 고운실리카)'),
      S('solid','농축/결정화(ACT)'),
      S('wet',  '(Slurry, Toluene)'),
      S('wet',  '(재결정, DCB/MC)'),
      S('wet',  '(Slurry, Toluene)'),
      S('wet',  '(Slurry, Toluene)')
    ]}),
    Object.assign(mkLot('P-ND06-Tol3 (815g)'), {steps:[
      S('react','(Xylene) 후 농축/결정화(ACT)'),
      S('wet',  '(Si pass, DCB, MC/Hex)'),
      S('solid','농축/결정화(ACT)'),
      S('wet',  '(Si pass, DCB, MC/Hex, 고운실리카)'),
      S('solid','농축/결정화(ACT)'),
      S('wet',  '(Slurry, Toluene)'),
      S('wet',  '(재결정, DCB/MC)'),
      S('wet',  '(Slurry, Toluene)'),
      S('wet',  '(Slurry, Toluene)')
    ]})
  ];

  var ns = mkSec('N');
  ns.lots = [
    Object.assign(mkLot('L26D-202-109-Si-R'), {steps:[
      S('react','(DMA)후'),
      S('solid','MeOH/H2O  결정화'),
      S('wet','(Si pass_ DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(column_ DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(Tol/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex  재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex  재결정)'),
      S('wet','(DCB/Act/Hex) 재결정'),
      S('subl','(소자평가 fail)','fail','충주'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('subl','(6,7-zone 불순물 제거작업)\n(4,5-zone 수득, 소자fail)','fail','용인'),
      S('wet','(고운 Si pass_DCB, MC/Hex 후 Act/Hex 결졍화)'),
      S('wet','(Tol/Act/Hex 재결정)'),
      S('subl','(pass)','pass','충주')
    ]}),
    Object.assign(mkLot('P-ND14-COL-TOLAHX'), {steps:[
      S('react','(DMA)후 MeOH/H2O  결정화'),
      S('wet','(Si pass_DCB, CF 후 Act/Hex 결정화)'),
      S('wet','(Column_DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(Tol/Act/Hex 재결정)'),
      S('subl','(fail)','fail',''),
      S('wet','','pending','')
    ]}),
    Object.assign(mkLot('P-67zmix-TOLACHX'), {steps:[
      S('react','(DMA)후'),
      S('solid','MeOH/H2O  결정화'),
      S('wet','(Si pass_ DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(column_ DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(Tol/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex  재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex  재결정)'),
      S('wet','(DCB/Act/Hx) 재결정'),
      S('subl','(소자평가 fail)','fail','충주'),
      S('wet','(DCB/Act/Hx 재결정)'),
      S('subl','(6,7-zone 불순물 제거작업)\n(4,5-zone 수득, 소자fail)','fail','용인'),
      S('subl','(6,7-zone 취합 후 추가 승화정제, 4,5-zone 회수)','','용인'),
      S('wet','(고운 si pass_DCB, MC/Hx 후 Act/Hex 결정화)'),
      S('wet','(DCB/Act/Hx 재결정)'),
      S('wet','(Tol/Act/Hx 재결정)'),
      S('subl','','','충주')
    ]}),
    Object.assign(mkLot('L26B-202-101(4,5,6)'), {steps:[
      S('react','(DMA)후'),
      S('solid','MeOH/H2O  결정화'),
      S('wet','(Si pass_ DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(Column_DCB, MC/Hex 후 EA/Hex 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('subl','(fail)','fail',''),
      S('wet','(고운 Si pass_DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('subl','(pass)','pass','')
    ]}),
    Object.assign(mkLot('L26C-202-114(4,5,6)'), {steps:[
      S('react','(DMA)후'),
      S('solid','MeOH/H2O  결정화'),
      S('wet','(Si pass_ DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','(Column_DCB, MC/Hex 후 EA/Hex 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('subl','(fail)','fail',''),
      S('wet','(고운 Si pass_DCB, MC/Hex 후 Act/Hex 결정화)'),
      S('wet','L26B-202-101 7,8,9차 재결정 여액 취합 후  Si pass 후 Act/Hex 결정화'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('wet','(TolAct/Hex 재결정)'),
      S('subl','(pass)','pass','')
    ]}),
    Object.assign(mkLot('P-ND02-COL-BOTTOM'), {steps:[
      S('collect','본품 재결정 여액 취합'),
      S('subl','(6,7-zone  불순물 제거작업)','','용인'),
      S('subl','(6,7-zone  불순물 제거작업)','','용인'),
      S('wet','(Colimn_DCB, MC/Hx  후 Act/Hx 결정화)'),
      S('wet','(DCB/Act/Hex 재결정)'),
      S('subl','','','용인')
    ]}),
    Object.assign(mkLot('P-ND08-TOLACHX3'), {steps:[
      S('react','(DMA)후 MeOH/H2O  결정화'),
      S('wet','(Si pass_DCB, MC/Hx 후 Act/Hx 결정화)'),
      S('wet','(Column_DCB, MC/Hex 후 Act/Hx 결정화)'),
      S('wet','(Tol/Act/Hx 재결정)'),
      S('wet','(Tol/Act/Hex 재결정)'),
      S('wet','(Tol/Act/Hex 재결정)'),
      S('subl','(6,7-zone  불순물 제거작업)\n(4,5-zone 수득, 소자 fail)','fail','용인'),
      S('wet','(column_DCB, MC/Hx 후 Act/Hx 결정화)'),
      S('wet','(DCB/Act/Hx 재결정)'),
      S('wet','(Tol/Act/Hx 재결정)'),
      S('subl','(pass)','pass','용인')
    ]})
  ];

  return mkDoc({
    title: 'P/N Type 재료 공정 Flow 정리',
    material: 'LT-PHM295',
    author: '백지홍',
    date: '2026-04-21',
    sections: [ps, ns]
  });
}

function buildE1884() {
  function S(t, detail, tag, loc) { return mkStep(t, { detail: detail||'', tag: tag||null, location: loc||'' }); }
  var sec = mkSec('S');
  sec.lots = [
    Object.assign(mkLot(''), { steps: [
      S('react',  ''),
      S('solid',  '고체 여과 후 건조'),
      S('wet',    'Si pass'),
      S('solid',  '농축 및 고체 여과 후 건조'),
      S('wet',    'DCB/ACT 재결정'),
      S('wet',    'DCB/ACT 재결정'),
      S('solid',  '건조'),
      S('subl',   '')
    ]})
  ];
  return mkDoc({
    title: 'E1884 공정 Flow',
    material: 'E1884',
    author: '',
    date: todayStr(),
    sections: [sec]
  });
}

/* ── 연결 상태 구독 ─────────────────────────────── */
firebase.database().ref('.info/connected').on('value', function(snap) {
  _connected = snap.val() === true;
  if (!_connected) {
    setSaveStatus('offline', '네트워크 연결을 확인하세요.');
  } else {
    // 연결 복구 시 현재 상태가 error/offline이면 대기로 전환
    var el = document.getElementById('pf-save-status');
    if (el && (el.classList.contains('pf-ss-offline') || el.classList.contains('pf-ss-error'))) {
      setSaveStatus('idle');
    }
    // 오프라인 중에 쌓인 pending 저장 flush
    if (_pendingSave) flushSave();
  }
});

})();
