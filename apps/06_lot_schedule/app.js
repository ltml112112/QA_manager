(function () {
'use strict';

/* ── Firebase 초기화 (공통 설정 사용) ────────────────────────────────
   테마 동기화는 index.html에서 theme-sync.js 로 별도 로드.
   Firebase config·DB 경로는 assets/js/firebase-config.js 단일 소스.
──────────────────────────────────────────────────────────────────── */
QA_initFirebase();
var _db         = firebase.database();
var DB_REF      = _db.ref(QA_DB_PATHS.lotSchedule);
var RESULT_REF  = _db.ref(QA_DB_PATHS.oledResults);  // {lotId: {savedAt, ivl, lt}}

/* ── 현재 로그인 사용자 추적 (감사 추적용) ───────────────────────────── */
var _currentUser = null;
firebase.auth().onAuthStateChanged(function (u) { _currentUser = u; });

/** 현재 사용자 정보를 감사 추적 객체로 반환 */
function _byInfo() {
  if (!_currentUser) return null;
  return { email: _currentUser.email, at: Date.now() };
}

/** 타임스탬프(ms) → 'YYYY-MM-DD' 형식 */
function _fmtAt(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

/* ── 상수 ────────────────────────────────────────────────────────────── */
var STORAGE_KEY  = 'qa_lot_schedule_v1';

/* ── OLED 결과 캐시 ─────────────────────────────────────────────────── */
window._cachedResults = {}; // {lotId: {savedAt, ivl, lt}}

/* ── 상태 ────────────────────────────────────────────────────────────── */
var today    = new Date();
var curYear, curMonth;
(function () {
  var saved = localStorage.getItem('qa_lot_schedule_month');
  if (saved) {
    var p = saved.split('-');
    var y = parseInt(p[0], 10);
    var m = parseInt(p[1], 10);
    if (!isNaN(y) && !isNaN(m) && m >= 0 && m <= 11) {
      curYear = y; curMonth = m; return;
    }
  }
  curYear  = today.getFullYear();
  curMonth = today.getMonth(); // 0-indexed
}());

/* ── 날짜 유틸 ───────────────────────────────────────────────────────── */
function toDateStr(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}
var todayStr = toDateStr(today);
// 오늘 날짜를 항상 최신으로 반환 (페이지를 오래 열어두어도 날짜 갱신)
function getTodayStr() { return toDateStr(new Date()); }

/* ── 고유 ID 생성 ─────────────────────────────────────────────────────── */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── localStorage 데이터 관리 ────────────────────────────────────────── */
/*
  아이템 스키마:
  {
    id:           string,        // 고유 ID
    dept:         string,        // 합성생산 | 공정개발 | 정제생산/소자이관
    material:     string,        // 재료명·Lot·요청사항
    transferDate: 'YYYY-MM-DD',  // 샘플 이관/시작일 (필수)
    evalStart:    'YYYY-MM-DD',  // 소자평가 시작일 (선택)
    evalTarget:   'YYYY-MM-DD',  // 소자평가 목표일 (선택)
    urgent:       boolean,       // 긴급 출하 대응 여부
    completed:    boolean,       // 소자평가 완료 여부
    completedAt:  'YYYY-MM-DD' | null,
    createdAt:    'YYYY-MM-DD',
  }
*/
function loadItems() {
  return window._cachedItems || [];
}

/* 배열 → {id: item} 객체 변환 헬퍼 */
function _arrToObj(items) {
  var obj = {};
  items.forEach(function (it) { if (it && it.id) obj[it.id] = it; });
  return obj;
}

/* 대량 저장 (메일 일괄 등록 등) — 전체를 객체 포맷으로 덮어씀 */
function saveItems(items) {
  window._cachedItems = items.slice();
  DB_REF.set(items.length ? _arrToObj(items) : null);
}

/* 단건 추가 */
function addItem(item) {
  window._cachedItems = (window._cachedItems || []).concat([item]);
  DB_REF.child(item.id).set(item);
}

/* 단건 부분 업데이트 — patch 에 포함되지 않은 필드는 Firebase에서 유지 */
function updateItem(id, patch) {
  var arr = window._cachedItems || [];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].id === id) { window._cachedItems[i] = Object.assign({}, arr[i], patch); break; }
  }
  DB_REF.child(id).update(patch);
}

/* 단건 삭제 */
function removeItem(id) {
  window._cachedItems = (window._cachedItems || []).filter(function (it) { return it.id !== id; });
  DB_REF.child(id).remove();
}

/* ── 실시간 동기화 ─────────────────────────────────────────────────────
   Auth가 IndexedDB에서 복원되기 전에 listener를 부착하면
   PERMISSION_DENIED로 cancel 되고 silent하게 죽음. QA_whenAuthReady로
   auth 발화 후 부착하고, error cb에서 backoff로 재부착.
   _itemsAttached 플래그는 첫 success snapshot 도착 시점에 set →
   실패하면 재진입 가능.
──────────────────────────────────────────────────────────────────── */
var _itemsAttached = false;
var _itemsRetryMs  = 1000;  // 1s → 2s → 4s → 8s (max 8s)

function attachItemsListener() {
  DB_REF.on('value', function (s) {
    _itemsAttached = true;
    _itemsRetryMs  = 1000;  // 성공 시 backoff 리셋
    var val = s.val();
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      window._cachedItems = Object.values(val).filter(function (v) { return v && v.id; });
    } else if (Array.isArray(val)) {
      window._cachedItems = val.filter(Boolean);
    } else {
      window._cachedItems = [];
    }
    renderCalendar();
  }, function (err) {
    // PERMISSION_DENIED 등 listener cancel 시 silent death 방지
    console.warn('[lot_schedule] items listener cancelled:', err && err.code);
    DB_REF.off('value');
    var wait = Math.min(_itemsRetryMs, 8000);
    _itemsRetryMs = Math.min(_itemsRetryMs * 2, 8000);
    setTimeout(function () {
      QA_whenAuthReady(attachItemsListener);
    }, wait);
  });
}

function setupRealtimeSync() {
  // 마이그레이션 체크는 best-effort — 실패해도 listener 부착은 진행
  DB_REF.once('value').then(function (snap) {
    var data = snap.val();
    if (data === null) {
      var legacy = [];
      try { legacy = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) {}
      if (legacy.length > 0) DB_REF.set(_arrToObj(legacy));
    } else if (Array.isArray(data)) {
      console.log('[lot_schedule] 구 배열 포맷 감지, 객체 포맷으로 마이그레이션 중...');
      DB_REF.set(_arrToObj(data.filter(Boolean)));
    }
  }).catch(function (err) {
    console.warn('[lot_schedule] 마이그레이션 체크 실패 (listener는 계속):', err && err.code);
  });
  attachItemsListener();
}

/* ── OLED 결과 실시간 동기화 ─────────────────────────────────────────── */
var _resultsRetryMs = 1000;

function attachResultsListener() {
  RESULT_REF.on('value', function (snap) {
    _resultsRetryMs = 1000;
    window._cachedResults = snap.val() || {};
    renderCalendar();
  }, function (err) {
    console.warn('[lot_schedule] results listener cancelled:', err && err.code);
    RESULT_REF.off('value');
    var wait = Math.min(_resultsRetryMs, 8000);
    _resultsRetryMs = Math.min(_resultsRetryMs * 2, 8000);
    setTimeout(function () {
      QA_whenAuthReady(attachResultsListener);
    }, wait);
  });
}

function setupResultsSync() {
  attachResultsListener();
}

function loadResult(lotId) {
  return window._cachedResults[lotId] || null;
}

function saveResult(lotId, resultData) {
  var today = getTodayStr();
  var payload = {
    savedAt: today,
    savedBy: _byInfo(),
    ivl: resultData.ivl || null,
    lt:  resultData.lt  || null,
  };
  window._cachedResults[lotId] = payload;
  RESULT_REF.child(lotId).set(payload);
}

function deleteResult(lotId) {
  delete window._cachedResults[lotId];
  RESULT_REF.child(lotId).remove();
  refreshModal();
  renderCalendar();
}

/* ── D+N 계산 ────────────────────────────────────────────────────────── */
// 이관일 기준 경과 일수 반환 (D+0 = 이관 당일, 음수 = 미래)
// asOf: 기준일 문자열 (없으면 오늘)
function calcDN(transferDateStr, asOf) {
  if (!transferDateStr) return null;
  var t = new Date(transferDateStr + 'T00:00:00');
  var n = new Date((asOf || getTodayStr()) + 'T00:00:00');
  return Math.floor((n - t) / 86400000);
}

// 뱃지 HTML 반환
function dnBadgeHTML(item, asOf) {
  if (item.completed) {
    return '<span class="dn-badge dn-done">완료</span>';
  }
  var dn = calcDN(item.transferDate, asOf);
  if (dn === null) return '';

  var label = dn === 0 ? 'D+0' : (dn > 0 ? 'D+' + dn : 'D' + dn);
  var cls   = item.urgent ? 'dn-alert' : 'dn-normal';
  return '<span class="dn-badge ' + cls + '">' + label + '</span>';
}

/* ── HTML 이스케이프 ─────────────────────────────────────────────────── */
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── 날짜 문자열 → M/D 형식 ──────────────────────────────────────────── */
function toMD(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr + 'T00:00:00');
  return (d.getMonth() + 1) + '/' + d.getDate();
}

/* ── 재료명 + Lot + 요청사항 조합 텍스트 생성 ───────────────────────── */
function buildMatText(item) {
  // 구 데이터: material 하나에 다 들어있는 경우 그대로 사용
  // 신 데이터: material + lot + request 조합
  var parts = [];
  if (item.material) parts.push(item.material);
  if (item.lot)      parts.push(item.lot);
  if (item.request)  parts.push(item.request);
  return parts.join(' ');
}

/* ── 카드 innerHTML 생성 (부서별 포맷 + D+N 뱃지) ────────────────────── */
function buildCardHTML(item, asOf) {
  var mat    = esc(buildMatText(item));
  var badge  = dnBadgeHTML(item, asOf);
  var urgent = item.urgent && !item.completed ? '⚡ ' : '';

  if (item.dept === '합성생산') {
    return urgent + mat + badge;
  }
  // 정제생산/소자이관 — (자주색 이관일) 검정재료명 <파란색 소자평가시작일> D+N
  var parts = '';
  if (item.transferDate) {
    parts += '<span class="c-purple">(' + toMD(item.transferDate) + ')</span> ';
  }
  parts += '<span class="c-dark">' + mat + '</span>';
  if (item.evalStart) {
    parts += ' <span class="c-blue">&lt;' + toMD(item.evalStart) + '&gt;</span>';
  }
  parts += badge;
  return parts;
}

/* ── 카드 DOM 요소 생성 ──────────────────────────────────────────────── */
function createCard(item, asOf) {
  var card = document.createElement('div');
  var cls  = 'lot-card';
  if (item.dept === '합성생산') cls += ' dept-synth';
  else                          cls += ' dept-refine';
  if (item.completed)           cls += ' is-done';
  if (item.urgent && !item.completed) cls += ' is-urgent';
  card.className = cls;
  card.innerHTML = buildCardHTML(item, asOf);
  card.dataset.id = item.id;
  // 호버 툴팁: 잘린 텍스트 전체 보기
  card.title = buildMatText(item);
  return card;
}

/* ── 달력 타이틀 업데이트 ────────────────────────────────────────────── */
function updateTitle() {
  document.getElementById('calTitle').textContent =
    curYear + '년 ' + (curMonth + 1) + '월';
}

/* ── 요약 스트립 렌더 ────────────────────────────────────────────────── */
function renderSummary(items) {
  var strip   = document.getElementById('summaryStrip');
  var active  = items.filter(function (it) { return !it.completed; });
  var synth   = active.filter(function (it) { return it.dept === '합성생산'; });
  var refine  = active.filter(function (it) { return it.dept === '정제생산/소자이관'; });
  var alerts  = active.filter(function (it) { return it.urgent; });
  var done    = items.filter(function (it) { return it.completed; });

  function chip(cls, filter, label) {
    return '<span class="sum-chip ' + cls + '" data-filter="' + filter + '" style="cursor:pointer">' + label + '</span>';
  }

  var html = chip('chip-total', 'active',  '진행 중 ' + active.length + '건')
           + '<span class="sum-sep">|</span>';
  if (synth.length)  html += chip('chip-synth',  'synth',  '합성 '      + synth.length);
  if (refine.length) html += chip('chip-refine', 'refine', '정제/소자 ' + refine.length);
  if (alerts.length) html += '<span class="sum-sep">|</span>'
                           + chip('chip-alert', 'alert', '⚡ 시급 ' + alerts.length);
  if (done.length)   html += '<span class="sum-sep">|</span>'
                           + chip('chip-done', 'done', '완료 ' + done.length);

  strip.innerHTML = html;

  // 칩 클릭 → 필터 모달
  strip.querySelectorAll('.sum-chip[data-filter]').forEach(function (el) {
    el.addEventListener('click', function () {
      openFilterModal(this.dataset.filter);
    });
  });
}

/* ── 달력 그리드 렌더링 ──────────────────────────────────────────────── */
var MAX_CARDS = 3; // 셀당 최대 표시 카드 수

function renderCalendar() {
  localStorage.setItem('qa_lot_schedule_month', curYear + '-' + curMonth);
  updateTitle();
  var grid  = document.getElementById('calGrid');
  grid.innerHTML = '';

  var items = loadItems();
  renderSummary(items);

  // 날짜별 아이템 인덱싱 — 항상 원래 이관일에만 표시
  var curTodayStr  = getTodayStr();
  var nowDate      = new Date();
  var isFutureMonth =
    curYear > nowDate.getFullYear() ||
    (curYear === nowDate.getFullYear() && curMonth > nowDate.getMonth());

  var byDate    = {};
  var byDateAsOf = {};
  items.forEach(function (it) {
    if (!it.transferDate) return;
    var displayDate = it.transferDate;
    var asOf;
    if (isFutureMonth) {
      // 미래 달 내 항목: projected D+N 기준일
      asOf = displayDate;
    }
    if (!byDate[displayDate]) {
      byDate[displayDate] = [];
      byDateAsOf[displayDate] = asOf;
    }
    byDate[displayDate].push(it);
  });

  var firstDay = new Date(curYear, curMonth, 1);
  var lastDay  = new Date(curYear, curMonth + 1, 0);
  var startDow = firstDay.getDay();
  var prevLast = new Date(curYear, curMonth, 0).getDate();
  var total    = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;

  for (var i = 0; i < total; i++) {
    var dayNum, dateStr, otherMonth = false;

    if (i < startDow) {
      dayNum = prevLast - startDow + i + 1;
      var py = curMonth === 0 ? curYear - 1 : curYear;
      var pm = curMonth === 0 ? 11 : curMonth - 1;
      dateStr = py + '-' + String(pm + 1).padStart(2,'0') + '-' + String(dayNum).padStart(2,'0');
      otherMonth = true;
    } else if (i >= startDow + lastDay.getDate()) {
      dayNum = i - startDow - lastDay.getDate() + 1;
      var ny = curMonth === 11 ? curYear + 1 : curYear;
      var nm = curMonth === 11 ? 0 : curMonth + 1;
      dateStr = ny + '-' + String(nm + 1).padStart(2,'0') + '-' + String(dayNum).padStart(2,'0');
      otherMonth = true;
    } else {
      dayNum  = i - startDow + 1;
      dateStr = curYear + '-' + String(curMonth + 1).padStart(2,'0') + '-' + String(dayNum).padStart(2,'0');
    }

    var dow  = i % 7;
    var cell = document.createElement('div');
    cell.className = 'cal-cell'
      + (otherMonth ? ' other-month' : '')
      + (dateStr === curTodayStr ? ' is-today' : '');
    cell.dataset.date = dateStr;

    // 날짜 숫자 + 부서별 카운트
    var dayItems0 = byDate[dateStr] || [];
    var synthCnt  = dayItems0.filter(function(it) { return it.dept === '합성생산'; }).length;
    var refineCnt = dayItems0.filter(function(it) { return it.dept !== '합성생산'; }).length;

    var dateRow = document.createElement('div');
    dateRow.className = 'cell-date-row';

    var dn = document.createElement('div');
    dn.className = 'cell-daynum'
      + (dow === 0 ? ' sun' : '')
      + (dow === 6 ? ' sat' : '');
    dn.textContent = dayNum;
    dateRow.appendChild(dn);

    if (synthCnt > 0 || refineCnt > 0) {
      var counts = document.createElement('div');
      counts.className = 'cell-dept-counts';
      if (synthCnt > 0) {
        var sc = document.createElement('span');
        sc.className = 'dept-cnt synth-cnt';
        sc.textContent = synthCnt;
        counts.appendChild(sc);
      }
      if (refineCnt > 0) {
        var rc = document.createElement('span');
        rc.className = 'dept-cnt refine-cnt';
        rc.textContent = refineCnt;
        counts.appendChild(rc);
      }
      dateRow.appendChild(counts);
    }

    cell.appendChild(dateRow);

    // ── 카드 배치 ──
    var dayItems = byDate[dateStr] || [];
    var toShow   = dayItems.slice(0, MAX_CARDS);
    var overflow = dayItems.length - toShow.length;

    var cellAsOf = byDateAsOf[dateStr];
    toShow.forEach(function (item) {
      var card = createCard(item, cellAsOf);
      (function(capturedItem) {
        card.addEventListener('click', function (e) {
          e.stopPropagation();
          if (capturedItem.completed) {
            openItemModal(capturedItem.id);
          } else {
            openModal(e.currentTarget.closest('.cal-cell').dataset.date);
          }
        });
      })(item);
      cell.appendChild(card);
    });

    if (overflow > 0) {
      var more = document.createElement('div');
      more.className = 'cell-more';
      more.textContent = '+' + overflow + '개 더보기';
      cell.appendChild(more);
    }

    // 셀 클릭 → 모달
    cell.addEventListener('click', function () {
      openModal(this.dataset.date);
    });

    grid.appendChild(cell);
  }
}

/* ── 개별 등록 팝업 열기/닫기 ───────────────────────────────────────── */
function openIndivPopup() {
  document.getElementById('indivPopupOverlay').classList.add('open');
}
function closeIndivPopup() {
  document.getElementById('indivPopupOverlay').classList.remove('open');
}

document.getElementById('btnOpenIndivPopup').addEventListener('click', openIndivPopup);
document.getElementById('btnIndivPopupClose').addEventListener('click', closeIndivPopup);
document.getElementById('indivPopupOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeIndivPopup();
});

/* ── 월 네비게이션 ───────────────────────────────────────────────────── */
document.getElementById('btnPrevMonth').addEventListener('click', function () {
  curMonth--;
  if (curMonth < 0) { curMonth = 11; curYear--; }
  renderCalendar();
});

document.getElementById('btnNextMonth').addEventListener('click', function () {
  curMonth++;
  if (curMonth > 11) { curMonth = 0; curYear++; }
  renderCalendar();
});

document.getElementById('btnToday').addEventListener('click', function () {
  curYear  = today.getFullYear();
  curMonth = today.getMonth();
  renderCalendar();
  openModal(getTodayStr());
});

/* ── 재료명 자동완성 ─────────────────────────────────────────────────── */
function getUniqueMaterials() {
  var items = loadItems();
  var seen  = {};
  var list  = [];
  // 최신 등록 순으로 유니크 재료명 수집
  items.slice().reverse().forEach(function (it) {
    var name = (it.material || '').trim();
    if (name && !seen[name]) { seen[name] = true; list.push(name); }
  });
  return list;
}

function renderAC(query) {
  var drop  = document.getElementById('acDropdown');
  var names = getUniqueMaterials();
  var q     = query.trim().toLowerCase();
  var filtered = q
    ? names.filter(function (n) { return n.toLowerCase().indexOf(q) !== -1; })
    : names;

  if (!filtered.length) { drop.classList.remove('open'); return; }

  drop.innerHTML = filtered.map(function (n) {
    var display = esc(n);
    if (q) {
      // 매칭 부분 굵게 표시
      var idx = n.toLowerCase().indexOf(q);
      display = esc(n.slice(0, idx))
        + '<span class="ac-match">' + esc(n.slice(idx, idx + q.length)) + '</span>'
        + esc(n.slice(idx + q.length));
    }
    return '<div class="ac-item" data-val="' + esc(n) + '">' + display + '</div>';
  }).join('');
  drop.classList.add('open');

  drop.querySelectorAll('.ac-item').forEach(function (el) {
    el.addEventListener('mousedown', function (e) {
      e.preventDefault(); // blur 방지
      document.getElementById('fMaterial').value = this.dataset.val;
      drop.classList.remove('open');
    });
  });
}

(function initAC() {
  var input = document.getElementById('fMaterial');
  var drop  = document.getElementById('acDropdown');

  input.addEventListener('focus', function () { renderAC(this.value); });
  input.addEventListener('input', function () { renderAC(this.value); });
  input.addEventListener('blur',  function () {
    setTimeout(function () { drop.classList.remove('open'); }, 150);
  });
  // ESC로 드롭다운 닫기
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') drop.classList.remove('open');
  });
})();

/* ── 폼 기본값 세팅 (리셋 후 날짜 기본값 채우기) ────────────────────── */
function setFormDefaults() {
  var t = getTodayStr();
  document.getElementById('fTransferDate').value = t;
  document.getElementById('fEvalStart').value    = t;
}

/* ── 폼 리셋 헬퍼 ────────────────────────────────────────────────────── */
function resetForm() {
  document.getElementById('scheduleForm').reset();
  document.getElementById('fEditId').value = '';
  document.getElementById('btnSubmit').textContent = '등록하기';
  document.getElementById('btnCancelEdit').style.display = 'none';
  updateDeptRadio();
  setFormDefaults();
}

/* ── 부서 라디오 시각 상태 동기화 ───────────────────────────────────── */
function updateDeptRadio() {
  document.querySelectorAll('input[name="fDept"]').forEach(function(r) {
    r.closest('.radio-chip').classList.toggle('checked', r.checked);
  });
}
document.querySelectorAll('input[name="fDept"]').forEach(function(r) {
  r.addEventListener('change', updateDeptRadio);
});

/* ── 폼 → 아이템 객체 변환 ───────────────────────────────────────────── */
function readFormData() {
  var deptRadio = document.querySelector('input[name="fDept"]:checked');
  return {
    dept:         deptRadio ? deptRadio.value : '',
    material:     document.getElementById('fMaterial').value.trim(),
    lot:          document.getElementById('fLot').value.trim(),
    request:      document.getElementById('fRequest').value.trim(),
    transferDate: document.getElementById('fTransferDate').value,
    evalStart:    document.getElementById('fEvalStart').value,
    evalTarget:   document.getElementById('fEvalTarget').value,
    urgent:       document.getElementById('fUrgent').checked,
  };
}

/* ── 폼 ← 아이템 객체 채우기 (수정 모드) ────────────────────────────── */
function fillForm(item) {
  document.getElementById('fEditId').value          = item.id;
  document.querySelectorAll('input[name="fDept"]').forEach(function(r) {
    r.checked = (r.value === item.dept);
  });
  updateDeptRadio();
  document.getElementById('fMaterial').value        = item.material || '';
  document.getElementById('fLot').value             = item.lot      || '';
  document.getElementById('fRequest').value         = item.request  || '';
  document.getElementById('fTransferDate').value    = item.transferDate;
  document.getElementById('fEvalStart').value       = item.evalStart  || '';
  document.getElementById('fEvalTarget').value      = item.evalTarget || '';
  document.getElementById('fUrgent').checked        = !!item.urgent;
  document.getElementById('btnSubmit').textContent  = '수정 저장';
  document.getElementById('btnCancelEdit').style.display = 'block';
  openIndivPopup();
}

/* ── 폼 제출 (신규 등록 + 수정 저장 통합) ───────────────────────────── */
document.getElementById('scheduleForm').addEventListener('submit', function (e) {
  e.preventDefault();

  var fd = readFormData();
  if (!fd.dept || !fd.material || !fd.transferDate) {
    alert('부서/상태, 재료명, 이관일은 필수 항목입니다.');
    return;
  }

  // 날짜 상호 검증
  if (fd.evalStart && fd.evalStart < fd.transferDate) {
    alert('소자평가 시작일은 이관일보다 빠를 수 없습니다.');
    document.getElementById('fEvalStart').focus();
    return;
  }
  if (fd.evalTarget && fd.evalStart && fd.evalTarget < fd.evalStart) {
    alert('완료 요청일은 평가 시작일보다 빠를 수 없습니다.');
    document.getElementById('fEvalTarget').focus();
    return;
  }
  if (fd.evalTarget && !fd.evalStart && fd.evalTarget < fd.transferDate) {
    alert('완료 요청일은 이관일보다 빠를 수 없습니다.');
    document.getElementById('fEvalTarget').focus();
    return;
  }

  var editId = document.getElementById('fEditId').value;

  if (editId) {
    // ── 수정 — completed/completedAt 은 유지되므로 patch 만 전송 ──
    fd.updatedBy = _byInfo();
    updateItem(editId, fd);
  } else {
    // ── 신규 등록 ──
    var _by = _byInfo();
    var newItem = Object.assign(fd, {
      id:          genId(),
      completed:   false,
      completedAt: null,
      createdAt:   getTodayStr(),
      createdBy:   _by,
      updatedBy:   _by,
    });
    addItem(newItem);

    // 등록된 달로 이동
    var d = new Date(fd.transferDate + 'T00:00:00');
    if (!isNaN(d)) {
      curYear  = d.getFullYear();
      curMonth = d.getMonth();
    }
  }

  resetForm();
  closeIndivPopup();
  renderCalendar();
});

document.getElementById('btnCancelEdit').addEventListener('click', function () {
  resetForm();
  closeIndivPopup();
});

/* ── 모달 열기/닫기 ──────────────────────────────────────────────────── */
var modalCurrentDate   = null;
var modalCurrentFilter = null;
var modalCurrentSearch = null;

function openModal(dateStr) {
  modalCurrentDate   = dateStr;
  modalCurrentFilter = null;
  var overlay = document.getElementById('modalOverlay');
  var titleEl = document.getElementById('modalTitle');
  var bodyEl  = document.getElementById('modalBody');
  var items   = loadItems();
  var curT    = getTodayStr();
  var isToday = (dateStr === curT);

  bodyEl.innerHTML = '';
  bodyEl.classList.remove('is-2col');

  if (isToday) {
    // 오늘 클릭 → 합성생산: 오늘 이관만 / 정제생산: 전체 미완료
    titleEl.textContent = '📊 오늘 기준 전체 진행 현황';
    var active = items.filter(function (it) {
      if (it.dept === '합성생산') return it.transferDate === curT && !it.completed;
      return !it.completed;
    });
    active.sort(function (a, b) {
      return (calcDN(b.transferDate) || 0) - (calcDN(a.transferDate) || 0);
    });
    if (!active.length) {
      bodyEl.innerHTML = '<div class="modal-empty">진행 중인 항목이 없습니다.</div>';
    } else {
      renderBodyTwoCols(bodyEl, active, null);
    }
  } else {
    var d      = new Date(dateStr + 'T00:00:00');
    var lbl    = (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
    var isPast = dateStr < curT;

    // 합성생산: 클릭 당일 이관만 / 정제생산: 그 날 기준 활성 전체
    var activeOnDate = items.filter(function (it) {
      if (it.dept === '합성생산') return it.transferDate === dateStr && !it.completed;
      if (it.transferDate > dateStr) return false;
      if (!it.completed) return true;
      return it.completedAt && it.completedAt > dateStr;
    });
    activeOnDate.sort(function (a, b) {
      return (calcDN(b.transferDate, dateStr) || 0) - (calcDN(a.transferDate, dateStr) || 0);
    });

    if (!activeOnDate.length) {
      titleEl.textContent = lbl + ' 이관/진행 항목';
      bodyEl.innerHTML = '<div class="modal-empty">이 날짜에 등록된 항목이 없습니다.</div>';
    } else {
      titleEl.textContent = lbl + (isPast ? ' 기준 현황' : ' 이관 예정');
      renderBodyTwoCols(bodyEl, activeOnDate, dateStr);
    }
  }

  overlay.classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('modalBody').classList.remove('is-2col');
  document.getElementById('modalBox').classList.remove('search-mode');
  document.getElementById('modalSearchInput').value = '';
  modalCurrentDate   = null;
  modalCurrentFilter = null;
  modalCurrentSearch = null;
}

/* ── 필터 모달 (요약 스트립 칩 클릭) ────────────────────────────────── */
var FILTER_TITLES = {
  active: '진행 중 전체', synth: '합성생산 진행 중',
  refine: '정제생산/소자이관 진행 중', alert: '⚡ 시급', done: '소자평가 완료 목록',
};

function openFilterModal(filter) {
  var items  = loadItems();
  var active = items.filter(function (it) { return !it.completed; });
  var filtered;
  switch (filter) {
    case 'synth':  filtered = active.filter(function (it) { return it.dept === '합성생산'; }); break;
    case 'refine': filtered = active.filter(function (it) { return it.dept === '정제생산/소자이관'; }); break;
    case 'alert':  filtered = active.filter(function (it) { return it.urgent; }); break;
    case 'done':   filtered = items.filter(function (it)  { return it.completed; }); break;
    default:       filtered = active;
  }
  filtered = filtered.slice().sort(function (a, b) {
    return (calcDN(b.transferDate) || 0) - (calcDN(a.transferDate) || 0);
  });

  modalCurrentDate   = null;
  modalCurrentFilter = filter;
  var overlay = document.getElementById('modalOverlay');
  var bodyEl  = document.getElementById('modalBody');
  document.getElementById('modalTitle').textContent =
    (FILTER_TITLES[filter] || '목록') + ' (' + filtered.length + '건)';
  bodyEl.innerHTML = '';
  bodyEl.classList.remove('is-2col');

  if (!filtered.length) {
    bodyEl.innerHTML = '<div class="modal-empty">해당 항목이 없습니다.</div>';
  } else if (filter === 'active' || filter === 'alert') {
    // 합성/정제 2컬럼
    renderBodyTwoCols(bodyEl, filtered, null);
  } else {
    filtered.forEach(function (it) { bodyEl.appendChild(buildDetailCard(it)); });
  }
  overlay.classList.add('open');
}

/* ── 검색 모드 (기존 modal-box 재사용) ──────────────────────────────── */
function openSearchModal() {
  var box     = document.getElementById('modalBox');
  var overlay = document.getElementById('modalOverlay');
  var bodyEl  = document.getElementById('modalBody');
  var input   = document.getElementById('modalSearchInput');
  modalCurrentDate   = null;
  modalCurrentFilter = null;
  modalCurrentSearch = null;
  box.classList.add('search-mode');
  document.getElementById('modalTitle').textContent = '🔍 항목 조회';
  bodyEl.innerHTML = '<div class="modal-empty">검색어를 입력하고 검색 버튼을 누르세요.</div>';
  bodyEl.classList.remove('is-2col');
  overlay.classList.add('open');
  setTimeout(function () { input.focus(); }, 120);
}

function runModalSearch() {
  var q      = document.getElementById('modalSearchInput').value.trim().toLowerCase();
  var bodyEl = document.getElementById('modalBody');
  bodyEl.innerHTML = '';
  bodyEl.classList.remove('is-2col');

  if (!q) {
    modalCurrentSearch = null;
    bodyEl.innerHTML = '<div class="modal-empty">검색어를 입력하고 검색 버튼을 누르세요.</div>';
    return;
  }

  modalCurrentSearch = q;

  var items = loadItems();
  var filtered = items.filter(function (it) {
    return [it.material, it.lot, it.request, it.dept, it.comment || ''].some(function (v) {
      return (v || '').toLowerCase().indexOf(q) !== -1;
    });
  });
  filtered.sort(function (a, b) {
    return (calcDN(b.transferDate) || 0) - (calcDN(a.transferDate) || 0);
  });

  document.getElementById('modalTitle').textContent =
    '🔍 "' + document.getElementById('modalSearchInput').value.trim() + '" — ' + filtered.length + '건';

  if (!filtered.length) {
    bodyEl.innerHTML = '<div class="modal-empty">일치하는 항목이 없습니다.</div>';
  } else {
    renderBodyTwoCols(bodyEl, filtered, null);
  }
}

document.getElementById('btnOpenSearch').addEventListener('click', openSearchModal);
document.getElementById('btnModalDoSearch').addEventListener('click', runModalSearch);
document.getElementById('modalSearchInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') runModalSearch();
});

/* ── 단일 아이템 모달 (완료 카드 클릭) ──────────────────────────────── */
function openItemModal(itemId) {
  var items  = loadItems();
  var item   = items.find(function (it) { return it.id === itemId; });
  if (!item) return;

  modalCurrentDate = item.transferDate; // refreshModal용 저장
  var overlay = document.getElementById('modalOverlay');
  var titleEl = document.getElementById('modalTitle');
  var bodyEl  = document.getElementById('modalBody');

  var mat = buildMatText(item);
  titleEl.textContent = (item.completed ? '✓ 완료 — ' : '') + (mat.length > 30 ? mat.slice(0, 30) + '…' : mat);
  bodyEl.innerHTML = '';
  bodyEl.classList.remove('is-2col');
  bodyEl.appendChild(buildDetailCard(item));
  overlay.classList.add('open');
}

/* ── 2컬럼 렌더링 헬퍼 ───────────────────────────────────────────────── */
// allItems를 합성/정제 두 컬럼으로 렌더링. 한 종류만 있으면 단일 컬럼.
// 각 컬럼 내부: 미완료 먼저 (D+N 내림차순), 완료 나중.
function renderBodyTwoCols(bodyEl, allItems, asOf) {
  function sortCol(arr) {
    return arr.slice().sort(function (a, b) {
      if (a.completed && !b.completed) return 1;
      if (!a.completed && b.completed) return -1;
      return (calcDN(b.transferDate, asOf) || 0) - (calcDN(a.transferDate, asOf) || 0);
    });
  }

  var synth  = sortCol(allItems.filter(function (it) { return it.dept === '합성생산'; }));
  var refine = sortCol(allItems.filter(function (it) { return it.dept === '정제생산/소자이관'; }));

  if (!synth.length && !refine.length) {
    bodyEl.innerHTML = '<div class="modal-empty">해당 항목이 없습니다.</div>';
    return;
  }

  // 항상 2컬럼 (한 쪽이 0건이어도 열 유지)
  bodyEl.classList.add('is-2col');
  var twoCol = document.createElement('div');
  twoCol.className = 'modal-2col';

  var lCol = document.createElement('div');
  lCol.className = 'modal-col';
  var lHd = document.createElement('div');
  lHd.className = 'modal-col-hd hd-synth';
  lHd.textContent = '합성생산 ' + synth.length + '건';
  lCol.appendChild(lHd);
  if (synth.length) {
    synth.forEach(function (it) { lCol.appendChild(buildDetailCard(it, asOf)); });
  } else {
    var lEmpty = document.createElement('div');
    lEmpty.className = 'modal-empty';
    lEmpty.textContent = '해당 항목 없음';
    lCol.appendChild(lEmpty);
  }
  twoCol.appendChild(lCol);

  var rCol = document.createElement('div');
  rCol.className = 'modal-col';

  var rHd = document.createElement('div');
  rHd.className = 'modal-col-hd hd-refine';

  var rHdText = document.createElement('span');
  rHdText.textContent = '정제생산/소자이관 ' + refine.length + '건';
  rHd.appendChild(rHdText);

  // 이관일 필터 토글 (클릭한 날짜 기준)
  var _filterDate    = asOf || getTodayStr();
  var _filterCount   = refine.filter(function (it) { return it.transferDate === _filterDate; }).length;
  var _filterActive  = false;
  var todayToggleBtn = document.createElement('button');
  todayToggleBtn.className   = 'today-filter-btn';
  todayToggleBtn.textContent = '이관일 ' + _filterCount + '건';
  todayToggleBtn.title       = '이 날짜가 이관일인 항목만 보기';
  if (!_filterCount) todayToggleBtn.disabled = true;
  todayToggleBtn.addEventListener('click', function () {
    _filterActive = !_filterActive;
    todayToggleBtn.classList.toggle('is-on', _filterActive);
    rCol.querySelectorAll('.detail-card').forEach(function (card) {
      card.style.display = (!_filterActive || card.dataset.transfer === _filterDate) ? '' : 'none';
    });
    rHdText.textContent = '정제생산/소자이관 ' + (_filterActive ? _filterCount : refine.length) + '건';
  });
  rHd.appendChild(todayToggleBtn);
  rCol.appendChild(rHd);

  if (refine.length) {
    refine.forEach(function (it) { rCol.appendChild(buildDetailCard(it, asOf)); });
  } else {
    var rEmpty = document.createElement('div');
    rEmpty.className = 'modal-empty';
    rEmpty.textContent = '해당 항목 없음';
    rCol.appendChild(rEmpty);
  }
  twoCol.appendChild(rCol);

  bodyEl.appendChild(twoCol);
}

/* ── 모달 디테일 카드 생성 (compact) ─────────────────────────────────── */
// asOf: 기준일 문자열 (없으면 오늘) — 과거 날짜 클릭 시 그 날 기준 경과일 표시
function buildDetailCard(item, asOf) {
  var wrap = document.createElement('div');
  wrap.className = 'detail-card' + (item.completed ? ' is-done' : '') + (item.urgent && !item.completed ? ' is-urgent' : '');
  wrap.dataset.id       = item.id;
  wrap.dataset.transfer = item.transferDate || '';

  // ── 메인 행 ──
  var main = document.createElement('div');
  main.className = 'dc-main';

  // 정보 블록
  var info = document.createElement('div');
  info.className = 'dc-info';

  // 재료명 + LOT 행
  var nameRow = document.createElement('div');
  nameRow.className = 'dc-name-row';

  var matEl = document.createElement('span');
  matEl.className = 'dc-mat';
  matEl.textContent = item.material || '-';
  nameRow.appendChild(matEl);

  if (item.lot) {
    var lotEl = document.createElement('span');
    lotEl.className = 'dc-lot';
    lotEl.textContent = item.lot;
    lotEl.title = item.lot;
    nameRow.appendChild(lotEl);
  }
  info.appendChild(nameRow);

  // 날짜 메타 (정제/소자이관 미완료는 날짜 옆에 D+N 인라인 표시)
  var meta = document.createElement('div');
  meta.className = 'dc-meta';
  var ref = asOf || getTodayStr();
  var showDN = item.dept !== '합성생산' && !item.completed;

  function inlineDN(dateStr, cls) {
    if (!showDN || !dateStr) return '';
    var dn = calcDN(dateStr, ref);
    if (dn === null) return '';
    var lbl = dn === 0 ? 'D+0' : (dn > 0 ? 'D+' + dn : 'D' + dn);
    return ' <span class="dm-dn ' + cls + '">(' + lbl + ')</span>';
  }
  function inlineDTarget(dateStr) {
    if (!showDN || !dateStr) return '';
    var diff = Math.round((new Date(dateStr + 'T00:00:00') - new Date(ref + 'T00:00:00')) / 86400000);
    var lbl = diff === 0 ? 'D-DAY' : (diff > 0 ? 'D-' + diff : 'D+' + Math.abs(diff));
    return ' <span class="dm-dn dm-target">(' + lbl + ')</span>';
  }

  var mh = '<span>이관 <b>' + toMD(item.transferDate) + '</b>' + inlineDN(item.transferDate, 'dm-transfer') + '</span>';
  if (item.evalStart)  mh += '<span>평가시작 <b>' + toMD(item.evalStart) + '</b>' + inlineDN(item.evalStart, 'dm-evalstart') + '</span>';
  if (item.evalTarget) mh += '<span>요청일 <b>'  + toMD(item.evalTarget) + '</b>' + inlineDTarget(item.evalTarget) + '</span>';
  meta.innerHTML = mh;
  info.appendChild(meta);

  // 요청사항
  if (item.request) {
    var reqEl = document.createElement('div');
    reqEl.className = 'dc-req';
    reqEl.textContent = item.request;
    reqEl.title = item.request;
    info.appendChild(reqEl);
  }

  main.appendChild(info);
  wrap.appendChild(main);

  // ── 액션 버튼 ──
  var actions = document.createElement('div');
  actions.className = 'detail-actions';

  // 정제생산/소자이관만 완료 처리
  var isRefine = item.dept === '정제생산/소자이관';
  if (isRefine) {
    if (!item.completed) {
      var btnDone = document.createElement('button');
      btnDone.className = 'btn btn-success btn-sm';
      btnDone.textContent = '✓ 소자평가 완료';
      btnDone.addEventListener('click', function () { markComplete(item.id); });
      actions.appendChild(btnDone);
    } else {
      var btnUndo = document.createElement('button');
      btnUndo.className = 'btn btn-secondary btn-sm';
      btnUndo.textContent = '↩ 완료 취소';
      btnUndo.addEventListener('click', function () { markUncomplete(item.id); });
      actions.appendChild(btnUndo);
    }
  }

  // 소자평가 결과 입력 버튼 (정제생산/소자이관만)
  if (isRefine) {
    var btnResult = document.createElement('button');
    btnResult.className = 'btn-result-input';
    btnResult.textContent = '📊 결과 입력';
    btnResult.addEventListener('click', function () { openResultPopup(item.id, item); });
    actions.appendChild(btnResult);
  }

  var btnEdit = document.createElement('button');
  btnEdit.className = 'btn btn-secondary btn-sm';
  btnEdit.textContent = '✎ 수정';
  btnEdit.addEventListener('click', function () { editInModal(item.id, wrap); });
  actions.appendChild(btnEdit);

  var btnDel = document.createElement('button');
  btnDel.className = 'btn btn-secondary btn-sm btn-del';
  btnDel.textContent = '✕ 삭제';
  btnDel.addEventListener('click', function () { deleteItem(item.id); });
  actions.appendChild(btnDel);

  wrap.appendChild(actions);

  // 결과 요약 뱃지 (저장된 결과 있을 때)
  var result = loadResult(item.id);
  if (result) {
    var badge = document.createElement('div');
    badge.className = 'dc-result-badge';
    badge.title = '클릭하여 전체 결과 보기';

    // LT 레벨 데이터 정규화 (구/신 포맷 모두 지원)
    var rbLtLevels = {};
    var rbLtSel = null;
    if (result.lt) {
      if (result.lt.levels) {
        rbLtLevels = result.lt.levels;
        rbLtSel = result.lt.selectedLevel;
      } else if (result.lt.level != null) {
        rbLtLevels[result.lt.level] = { refHr: result.lt.refHr, sampleHr: result.lt.sampleHr, pct: result.lt.pct };
        rbLtSel = result.lt.level;
      }
    }
    var rbAllOrder = [99,98,97,96,95,94,93,92,91,90];
    var rbAvail = rbAllOrder.filter(function(l) { return rbLtLevels[l]; });

    // ── 상단 헤더: 아이콘 + 액션 버튼 ──
    var rbHeader = document.createElement('div');
    rbHeader.className = 'dc-rb-header';

    var rbIcon = document.createElement('span');
    rbIcon.className = 'dc-rb-icon';
    rbIcon.textContent = '📊 소자평가 결과';
    rbHeader.appendChild(rbIcon);

    var rbActions = document.createElement('span');
    rbActions.className = 'dc-rb-actions';

    var detailLink = document.createElement('span');
    detailLink.className = 'dc-rb-detail-link';
    detailLink.textContent = '상세▾';
    rbActions.appendChild(detailLink);

    var delBtn = document.createElement('button');
    delBtn.className = 'dc-rb-del';
    delBtn.title = '결과 삭제';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (confirm('저장된 결과를 삭제하시겠습니까?')) deleteResult(item.id);
    });
    rbActions.appendChild(delBtn);
    rbHeader.appendChild(rbActions);
    badge.appendChild(rbHeader);

    // ── LT 표: 레벨별 열(column) ──
    if (rbAvail.length > 0) {
      var grid = document.createElement('div');
      grid.className = 'dc-rb-grid';

      rbAvail.forEach(function(l) {
        var isSel = l === rbLtSel;
        var pct   = rbLtLevels[l].pct;

        var col = document.createElement('div');
        col.className = 'dc-rb-col' + (isSel ? ' is-sel' : '');

        var lvSpan = document.createElement('span');
        lvSpan.textContent = 'LT' + l + (isSel ? '★' : '');
        lvSpan.className = isSel ? 'dc-rb-lv-sel' : 'dc-rb-lv-dim';
        col.appendChild(lvSpan);

        var pctSpan = document.createElement('span');
        pctSpan.textContent = pct != null ? pct + '%' : '–';
        pctSpan.className = isSel ? 'dc-rb-pct-sel' : 'dc-rb-pct-dim';
        col.appendChild(pctSpan);

        grid.appendChild(col);
      });

      badge.appendChild(grid);
    }

    // ── 저장일 ──
    if (result.savedAt) {
      var dateEl = document.createElement('div');
      dateEl.className = 'dc-rb-date';
      dateEl.textContent = result.savedAt;
      badge.appendChild(dateEl);
    }

    badge.addEventListener('click', function(e) {
      e.stopPropagation();
      openResultDetail(item.id, item, result);
    });

    wrap.appendChild(badge);
  }

  // ── 감사 추적 (등록자 / 최종 수정자) ─────────────────────────────────
  var hasCreated = item.createdBy && item.createdBy.email;
  var hasUpdated = item.updatedBy && item.updatedBy.email
    && !(hasCreated && item.updatedBy.at === item.createdBy.at); // 등록과 동일하면 생략
  if (hasCreated || hasUpdated) {
    var auditEl = document.createElement('div');
    auditEl.style.cssText = [
      'font-size:10px', 'color:var(--text-muted)', 'padding:6px 10px 4px',
      'border-top:1px solid var(--border)', 'line-height:1.7',
      'opacity:0.75',
    ].join(';');
    var parts = [];
    if (hasCreated) {
      parts.push('등록 ' + item.createdBy.email + ' (' + _fmtAt(item.createdBy.at) + ')');
    }
    if (hasUpdated) {
      parts.push('수정 ' + item.updatedBy.email + ' (' + _fmtAt(item.updatedBy.at) + ')');
    }
    auditEl.textContent = parts.join('  |  ');
    wrap.appendChild(auditEl);
  }

  return wrap;
}

/* ── 인라인 수정 (모달 내 카드 → 폼 변환) ───────────────────────────── */
function editInModal(itemId, cardEl) {
  var items = loadItems();
  var item  = items.find(function (it) { return it.id === itemId; });
  if (!item) return;

  var parent = cardEl.parentNode;

  var form = document.createElement('div');
  form.className = 'detail-card';
  form.style.gap = '8px';
  form.style.background = 'var(--surface)';
  form.style.borderColor = 'var(--accent)';

  // 재료명 + LOT
  var r1 = document.createElement('div');
  r1.style.cssText = 'display:flex;gap:6px;';
  var inpMat = document.createElement('input');
  inpMat.className = 'form-input';
  inpMat.style.cssText = 'flex:1;font-size:13px;padding:5px 8px;';
  inpMat.placeholder = '재료명';
  inpMat.value = item.material || '';
  var inpLot = document.createElement('input');
  inpLot.className = 'form-input';
  inpLot.style.cssText = 'flex:1;font-size:13px;padding:5px 8px;';
  inpLot.placeholder = 'LOT 번호';
  inpLot.value = item.lot || '';
  r1.appendChild(inpMat);
  r1.appendChild(inpLot);
  form.appendChild(r1);

  // 요청사항
  var inpReq = document.createElement('input');
  inpReq.className = 'form-input';
  inpReq.style.cssText = 'font-size:12px;padding:4px 8px;';
  inpReq.placeholder = '요청사항';
  inpReq.value = item.request || '';
  form.appendChild(inpReq);

  // 날짜 row
  var r2 = document.createElement('div');
  r2.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
  function mkD(val, lbl) {
    var w = document.createElement('div');
    w.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex:1;min-width:100px;';
    var l = document.createElement('div');
    l.style.cssText = 'font-size:10px;color:var(--text-muted);';
    l.textContent = lbl;
    var i = document.createElement('input');
    i.type = 'date'; i.className = 'form-input';
    i.style.cssText = 'font-size:12px;padding:4px 6px;';
    i.min = '2000-01-01';
    i.max = '2099-12-31';
    i.value = val || '';
    w.appendChild(l); w.appendChild(i);
    return { w: w, i: i };
  }
  var dTf = mkD(item.transferDate, '이관일');
  var dEs = mkD(item.evalStart,    '평가시작');
  var dEt = mkD(item.evalTarget,   '완료 요청일');
  r2.appendChild(dTf.w); r2.appendChild(dEs.w); r2.appendChild(dEt.w);
  form.appendChild(r2);

  // 시급 + 저장/취소
  var r3 = document.createElement('div');
  r3.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
  var ckId  = 'ck_' + itemId;
  var ckUrg = document.createElement('input');
  ckUrg.type = 'checkbox'; ckUrg.id = ckId; ckUrg.checked = !!item.urgent;
  var lbUrg = document.createElement('label');
  lbUrg.htmlFor = ckId;
  lbUrg.style.cssText = 'font-size:12px;cursor:pointer;user-select:none;';
  lbUrg.textContent = '⚡ 시급 요청';
  r3.appendChild(ckUrg); r3.appendChild(lbUrg);
  var sp = document.createElement('div'); sp.style.flex = '1';
  r3.appendChild(sp);

  var btnSave = document.createElement('button');
  btnSave.className = 'btn btn-primary btn-sm';
  btnSave.textContent = '저장';
  btnSave.addEventListener('click', function () {
    var patch = {
      material:     inpMat.value.trim(),
      lot:          inpLot.value.trim(),
      request:      inpReq.value.trim(),
      transferDate: dTf.i.value,
      evalStart:    dEs.i.value,
      evalTarget:   dEt.i.value,
      urgent:       ckUrg.checked,
    };
    // 날짜 상호 검증
    if (patch.evalStart && patch.evalStart < patch.transferDate) {
      alert('소자평가 시작일은 이관일보다 빠를 수 없습니다.');
      dEs.i.focus(); return;
    }
    if (patch.evalTarget && patch.evalStart && patch.evalTarget < patch.evalStart) {
      alert('완료 요청일은 평가 시작일보다 빠를 수 없습니다.');
      dEt.i.focus(); return;
    }
    if (patch.evalTarget && !patch.evalStart && patch.evalTarget < patch.transferDate) {
      alert('완료 요청일은 이관일보다 빠를 수 없습니다.');
      dEt.i.focus(); return;
    }
    patch.updatedBy = _byInfo();
    updateItem(itemId, patch);
    renderCalendar();
    var updated = loadItems().find(function (it) { return it.id === itemId; });
    if (parent && updated) parent.replaceChild(buildDetailCard(updated), form);
  });

  var btnCancel = document.createElement('button');
  btnCancel.className = 'btn btn-secondary btn-sm';
  btnCancel.textContent = '취소';
  btnCancel.addEventListener('click', function () {
    if (parent) parent.replaceChild(cardEl, form);
  });

  r3.appendChild(btnSave); r3.appendChild(btnCancel);
  form.appendChild(r3);

  if (parent) parent.replaceChild(form, cardEl);
  inpMat.focus();
}

/* ── 삭제 ────────────────────────────────────────────────────────────── */
function deleteItem(id) {
  if (!confirm('이 항목을 삭제하시겠습니까?')) return;
  removeItem(id);
  RESULT_REF.child(id).remove();
  renderCalendar();
  refreshModal();
}

/* ── 완료 / 완료 취소 처리 ───────────────────────────────────────────── */
function refreshModal() {
  if (modalCurrentDate)        openModal(modalCurrentDate);
  else if (modalCurrentFilter) openFilterModal(modalCurrentFilter);
  else if (modalCurrentSearch) runModalSearch();
}

/* ── OLED 결과 입력 팝업 ─────────────────────────────────────────────── */
var _resultPopupItemId = null;

function openResultPopup(itemId, item) {
  _resultPopupItemId = itemId;

  // Lot 라벨 표시
  var lotLabel = [item.material, item.lot].filter(Boolean).join(' / ');
  document.getElementById('resultPopupLotLabel').textContent = lotLabel || itemId;

  // iframe src 설정 (embed 모드)
  var iframe = document.getElementById('resultIframe');
  iframe.src = '../01_oled_ivl_lt/index.html?embed=1';

  document.getElementById('resultPopupOverlay').classList.add('open');
}

function closeResultPopup() {
  document.getElementById('resultPopupOverlay').classList.remove('open');
  // iframe 초기화 (다음 열 때 새로 로드)
  var iframe = document.getElementById('resultIframe');
  iframe.src = '';
  _resultPopupItemId = null;
}

/* ── 결과 상세보기 모달 ─────────────────────────────────────────────── */
function openResultDetail(lotId, item, result) {
  var overlay = document.getElementById('resultDetailOverlay');
  var body    = document.getElementById('resultDetailBody');
  var footer  = document.getElementById('resultDetailFooter');

  document.getElementById('resultDetailTitle').textContent =
    '📊 ' + [item.material, item.lot].filter(Boolean).join(' / ') + ' — 소자평가 결과';
  var detailMeta = [];
  if (result.savedAt)  detailMeta.push('저장일: ' + result.savedAt);
  if (result.savedBy && result.savedBy.email) detailMeta.push('저장: ' + result.savedBy.email);
  if (result.ivl && result.ivl.blockLabel)    detailMeta.push('블록: ' + result.ivl.blockLabel);
  document.getElementById('resultDetailDate').textContent = detailMeta.join('  |  ');

  // ── 유틸 ──
  function fv(v, d) { return (v != null && !isNaN(v)) ? parseFloat(v).toFixed(d) : '-'; }
  function pctCls(p) {
    if (isNaN(p)) return '';
    return Math.abs(p - 100) <= 5 ? 'rd-pct-good' : (p > 105 ? 'rd-pct-warn' : 'rd-pct-bad');
  }
  function pctHtml(p) {
    if (p == null || isNaN(p)) return '-';
    return '<span class="' + pctCls(p) + '">' + p.toFixed(1) + '%</span>';
  }

  // ── LT 레벨 데이터 정규화 (구/신 포맷 모두 지원) ──
  var levels = {};
  var selectedLevel = null;
  if (result.lt) {
    if (result.lt.levels) {
      levels = result.lt.levels;
      selectedLevel = result.lt.selectedLevel;
    } else if (result.lt.level != null) {
      // 구 포맷 backward compat
      levels[result.lt.level] = { refHr: result.lt.refHr, sampleHr: result.lt.sampleHr, pct: result.lt.pct };
      selectedLevel = result.lt.level;
    }
  }
  var allLevelOrder = [99,98,97,96,95,94,93,92,91,90];
  var availLevels = allLevelOrder.filter(function(l) { return levels[l]; });

  // ── 가로 테이블 컬럼 정의 ──
  var ivl = result.ivl || {};
  var ref = ivl.ref || {}, smp = ivl.sample || {};

  // 헤더 행
  var thRow = '<tr><th class="rd-th-block">Block</th>';
  if (ivl.ref) {
    thRow += '<th class="rd-ivl-t rd-ivl-l">Op.V<br>(V)</th>';
    thRow += '<th class="rd-ivl-t">EL EFF<br>(cd/A)</th>';
    thRow += '<th class="rd-ivl-t">EQE<br>(%)</th>';
    thRow += '<th class="rd-ivl-t">CIEx</th>';
    thRow += '<th class="rd-ivl-t">CIEy</th>';
    thRow += '<th class="rd-ivl-t rd-ivl-r">λmax<br>(nm)</th>';
  }
  availLevels.forEach(function(l) {
    var isSel = l === selectedLevel;
    thRow += '<th class="' + (isSel ? 'rd-th-lt-sel' : 'rd-th-lt') + '">LT' + l + (isSel ? ' ★' : '') + '<br>(h)</th>';
  });
  thRow += '</tr>';

  // REF 행
  var refRow = '<tr class="rd-row-ref"><td class="rd-th-block">REF</td>';
  if (ivl.ref) {
    refRow += '<td class="rd-ivl-l">' + fv(ref.volt,2) + '</td>';
    refRow += '<td>' + fv(ref.eff,2) + '</td>';
    refRow += '<td>' + fv(ref.eqe,2) + '</td>';
    refRow += '<td>' + fv(ref.cx,3)  + '</td>';
    refRow += '<td>' + fv(ref.cy,3)  + '</td>';
    refRow += '<td class="rd-ivl-r">' + fv(ref.mwl,0) + '</td>';
  }
  availLevels.forEach(function(l) {
    var v = levels[l].refHr;
    var isSel = l === selectedLevel;
    refRow += '<td' + (isSel ? ' class="rd-lt-sel-cell"' : '') + '>' + (v != null ? parseFloat(v).toFixed(1) : '-') + '</td>';
  });
  refRow += '</tr>';

  // SAMPLE 행
  var smpRow = '<tr class="rd-row-smp"><td class="rd-th-block rd-sample">SAMPLE</td>';
  if (ivl.ref) {
    smpRow += '<td class="rd-sample rd-ivl-l">' + fv(smp.volt,2) + '</td>';
    smpRow += '<td class="rd-sample">'           + fv(smp.eff,2)  + '</td>';
    smpRow += '<td class="rd-sample">'           + fv(smp.eqe,2)  + '</td>';
    smpRow += '<td class="rd-sample">'           + fv(smp.cx,3)   + '</td>';
    smpRow += '<td class="rd-sample">'           + fv(smp.cy,3)   + '</td>';
    smpRow += '<td class="rd-sample rd-ivl-r">'  + fv(smp.mwl,0)  + '</td>';
  }
  availLevels.forEach(function(l) {
    var v = levels[l].sampleHr;
    var isSel = l === selectedLevel;
    smpRow += '<td class="rd-sample' + (isSel ? ' rd-lt-sel-cell' : '') + '">' + (v != null ? parseFloat(v).toFixed(1) : '-') + '</td>';
  });
  smpRow += '</tr>';

  // Result 행
  var resRow = '<tr class="rd-row-res"><td class="rd-th-block">Result</td>';
  if (ivl.ref) {
    var vP = (ref.volt && smp.volt) ? ref.volt / smp.volt * 100 : null;
    resRow += '<td class="rd-ivl-l rd-ivl-b">' + pctHtml(vP) + '</td>';
    [[smp.eff,ref.eff],[smp.eqe,ref.eqe],[smp.cx,ref.cx],[smp.cy,ref.cy]].forEach(function(pair) {
      var p = (pair[0] != null && pair[1] != null && pair[1] !== 0) ? pair[0] / pair[1] * 100 : null;
      resRow += '<td class="rd-ivl-b">' + pctHtml(p) + '</td>';
    });
    var mwlDiff = (ref.mwl != null && smp.mwl != null) ? (parseInt(smp.mwl) - parseInt(ref.mwl)) : null;
    resRow += '<td class="rd-ivl-r rd-ivl-b">' + (mwlDiff != null ? (mwlDiff > 0 ? '+' : '') + mwlDiff + 'nm' : '-') + '</td>';
  }
  availLevels.forEach(function(l) {
    var p = levels[l].pct;
    var isSel = l === selectedLevel;
    resRow += '<td class="' + (isSel ? 'rd-lt-sel-cell rd-lt-sel-bot' : '') + '">' + (p != null ? pctHtml(p) : '-') + '</td>';
  });
  resRow += '</tr>';

  body.innerHTML =
    '<div class="rd-table-wrap"><table class="rd-table rd-table-h">' +
    thRow + refRow + smpRow + resRow +
    '</table></div>';

  // 푸터 버튼
  footer.innerHTML = '';
  var btnReInput = document.createElement('button');
  btnReInput.className = 'btn btn-secondary btn-sm';
  btnReInput.textContent = '📊 결과 재입력';
  btnReInput.addEventListener('click', function() {
    closeResultDetail();
    openResultPopup(lotId, item);
  });
  footer.appendChild(btnReInput);

  var btnDel2 = document.createElement('button');
  btnDel2.className = 'btn btn-secondary btn-sm btn-del';
  btnDel2.textContent = '✕ 결과 삭제';
  btnDel2.addEventListener('click', function() {
    if (confirm('저장된 결과를 삭제하시겠습니까?')) {
      closeResultDetail();
      deleteResult(lotId);
    }
  });
  footer.appendChild(btnDel2);

  var btnClose2 = document.createElement('button');
  btnClose2.className = 'btn btn-primary btn-sm';
  btnClose2.textContent = '닫기';
  btnClose2.style.marginLeft = 'auto';
  btnClose2.addEventListener('click', closeResultDetail);
  footer.appendChild(btnClose2);

  overlay.classList.add('open');
}

function closeResultDetail() {
  document.getElementById('resultDetailOverlay').classList.remove('open');
}

document.getElementById('btnResultDetailClose').addEventListener('click', closeResultDetail);
document.getElementById('resultDetailOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeResultDetail();
});

document.getElementById('btnResultPopupClose').addEventListener('click', closeResultPopup);
document.getElementById('resultPopupOverlay').addEventListener('click', function(e) {
  if (e.target === this) closeResultPopup();
});

// 01번 앱(iframe)에서 분석 결과를 postMessage로 전달받음
window.addEventListener('message', function(e) {
  if (e.origin !== window.location.origin) return;
  if (!e.data || e.data.type !== 'oledResult') return;
  if (!_resultPopupItemId) return;

  saveResult(_resultPopupItemId, { ivl: e.data.ivl, lt: e.data.lt });
  closeResultPopup();
  renderCalendar();
  refreshModal();
});

function markComplete(id) {
  updateItem(id, { completed: true, completedAt: getTodayStr(), updatedBy: _byInfo() });
  renderCalendar();
  refreshModal();
}

function markUncomplete(id) {
  updateItem(id, { completed: false, completedAt: null, updatedBy: _byInfo() });
  renderCalendar();
  refreshModal();
}

/* ── 모달 닫기 이벤트 ────────────────────────────────────────────────── */
document.getElementById('btnModalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeModal();
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  // 우선순위: 결과 상세보기 → 결과 입력 팝업 → 날짜 모달 순으로 닫기
  if (document.getElementById('resultDetailOverlay').classList.contains('open')) {
    closeResultDetail(); return;
  }
  if (document.getElementById('resultPopupOverlay').classList.contains('open')) {
    closeResultPopup(); return;
  }
  closeModal();
});


/* ── 월/년 선택 피커 ─────────────────────────────────────────────────── */
var mpOpen = false;
var mpYear = curYear;

function renderMonthPicker() {
  document.getElementById('mpYearLabel').textContent = mpYear + '년';
  var months = document.getElementById('mpMonths');
  months.innerHTML = '';
  var names = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  names.forEach(function(name, i) {
    var btn = document.createElement('button');
    btn.className = 'mp-month-btn' + (mpYear === curYear && i === curMonth ? ' mp-cur' : '');
    btn.textContent = name;
    btn.addEventListener('click', function() {
      curYear  = mpYear;
      curMonth = i;
      renderCalendar();
      closeMonthPicker();
    });
    months.appendChild(btn);
  });
}

function openMonthPicker() {
  mpYear = curYear;
  renderMonthPicker();
  document.getElementById('monthPicker').classList.add('open');
  mpOpen = true;
}

function closeMonthPicker() {
  document.getElementById('monthPicker').classList.remove('open');
  mpOpen = false;
}

document.getElementById('calTitle').addEventListener('click', function(e) {
  e.stopPropagation();
  if (mpOpen) closeMonthPicker(); else openMonthPicker();
});
document.getElementById('mpPrevYear').addEventListener('click', function(e) {
  e.stopPropagation(); mpYear--; renderMonthPicker();
});
document.getElementById('mpNextYear').addEventListener('click', function(e) {
  e.stopPropagation(); mpYear++; renderMonthPicker();
});
document.addEventListener('click', function() { if (mpOpen) closeMonthPicker(); });
document.getElementById('monthPicker').addEventListener('click', function(e) { e.stopPropagation(); });

// 피커가 열려 있을 때 renderCalendar 호출 시 현재 월 강조 갱신
var _origRenderCalendar = renderCalendar;
renderCalendar = function() {
  _origRenderCalendar();
  if (mpOpen) renderMonthPicker(); // 선택 강조 동기화
};

/* ── 휠 스크롤로 월 이동 ────────────────────────────────────────────── */
document.querySelector('.cal-main').addEventListener('wheel', function(e) {
  // 모달 열려 있으면 스크롤 무시
  if (document.getElementById('modalOverlay').classList.contains('open')) return;
  e.preventDefault();
  if (e.deltaY > 0) {
    curMonth++; if (curMonth > 11) { curMonth = 0; curYear++; }
  } else {
    curMonth--; if (curMonth < 0) { curMonth = 11; curYear--; }
  }
  renderCalendar();
}, { passive: false });

/* ── 초기 렌더 ─────────────────────────────────────────────────────────
   Auth ready 까지 기다려서 sync 시작 — iframe IDB 하이드레이션 race 방지.
──────────────────────────────────────────────────────────────────── */
setFormDefaults();
QA_whenAuthReady(function () {
  setupRealtimeSync();
  setupResultsSync();
});

/* ════════════════════════════════════════════════════════════════════════
   메일 붙여넣기 팝업 — 드래그/붙여넣기 + HTML 파서
   ════════════════════════════════════════════════════════════════════════ */

var mailParsedRows = null; // 파싱된 결과 저장

/* ── 날짜 정규화 ─────────────────────────────────────────────────────── */
function normDate(s) {
  if (!s) return '';
  var raw = s.trim();

  // "YYYY년 MM월 DD일" 또는 "YYYY년MM월DD일"
  var mKo = raw.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (mKo) {
    return mKo[1] + '-' + mKo[2].padStart(2,'0') + '-' + mKo[3].padStart(2,'0');
  }

  // "MM월 DD일" (연도 없음 → 현재 연도)
  var mKoNoY = raw.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (mKoNoY) {
    var yr = new Date().getFullYear().toString();
    return yr + '-' + mKoNoY[1].padStart(2,'0') + '-' + mKoNoY[2].padStart(2,'0');
  }

  var d = raw.replace(/\./g, '-').replace(/\//g, '-');
  var m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return raw;
  return m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0');
}


/* ── HTML 테이블 → 2D 배열 (rowspan/colspan 완전 처리) ──────────────── */
function htmlTableToGrid(table) {
  var rows = Array.prototype.slice.call(table.querySelectorAll('tr'));
  var grid = [];
  rows.forEach(function (tr, ri) {
    if (!grid[ri]) grid[ri] = [];
    var col = 0;
    var cells = Array.prototype.slice.call(tr.querySelectorAll('td, th'));
    cells.forEach(function (cell) {
      while (grid[ri][col] !== undefined) col++; // 이미 채워진 칸 건너뜀
      var text = cell.textContent.replace(/\s+/g, ' ').trim();
      var cs   = parseInt(cell.getAttribute('colspan') || '1');
      var rs   = parseInt(cell.getAttribute('rowspan') || '1');
      for (var r = 0; r < rs; r++) {
        if (!grid[ri + r]) grid[ri + r] = [];
        for (var c = 0; c < cs; c++) {
          grid[ri + r][col + c] = text;
        }
      }
      col += cs;
    });
  });
  return grid;
}

/* ── TSV → 2D 배열 ───────────────────────────────────────────────────── */
function tsvToGrid(text) {
  return text.split(/\r?\n/)
    .filter(function (l) { return l.trim(); })
    .map(function (l) { return l.split('\t').map(function (c) { return c.trim(); }); });
}

/* ── 헤더 감지 ───────────────────────────────────────────────────────── */
var MAIL_COL_ROLES = {
  // ── 공통 / 정제·소자 이관 표 ──
  '날짜': 'date',   '일자': 'date',
  '품명': 'material',
  'lot번호': 'lot', 'lot': 'lot',
  '중량': 'weight',
  '수령인': 'recipient',
  '비고': 'comment',
  '승화정제batchno': 'batchNo', '승화정제batch': 'batchNo',
  '다음batch이관예정일정': 'skip', '다음batch': 'skip', '이관예정일정': 'skip',
  // ── 합성생산 충주 이관 표 ──
  '이관일자': 'date',
  '품목명': 'material', '품목명품목코드': 'material',
  'batchno': 'lot',          // "Batch No." 정규화 결과
  '무게': 'weight',
  '합성이력': 'synthHist',   // 합성생산 표 판별 키
  '생산일자': 'prodDate',
};
function normHeaderKey(h) {
  // 공백 제거 → 괄호·점·중간점 제거 → g(gram 단위) 제거 → 소문자
  return h.replace(/\s+/g,'').replace(/[()（）\[\].·]/g,'').replace(/[gｇ]/gi,'').toLowerCase();
}

/* ── 표 종류 판별 ────────────────────────────────────────────────────── */
// 원문에 '합성생산팀 충주 이관내역' 문구가 있으면 합성생산 이관 표
var mailTableType = 'default'; // 'default' | 'synth'
function detectTableType(isSynthSource) {
  return isSynthSource ? 'synth' : 'default';
}
function detectMailHeader(grid) {
  for (var i = 0; i < Math.min(grid.length, 5); i++) {
    var row = grid[i] || [];
    var map = {}, hits = 0;
    row.forEach(function (cell, j) {
      var role = MAIL_COL_ROLES[normHeaderKey(cell || '')];
      if (role) { map[j] = role; hits++; }
    });
    if (hits >= 3) return { idx: i, colMap: map };
  }
  return null;
}

/* ── 데이터 추출 (헤더 이후 행 → {date,material,lot,comment,...}) ──── */
function extractMailRows(grid, headerInfo, tableType) {
  var colMap = headerInfo.colMap;
  var rows = [];
  var prev = {};
  for (var i = headerInfo.idx + 1; i < grid.length; i++) {
    var cells = grid[i] || [];
    var row = {};
    Object.keys(colMap).forEach(function (k) {
      var val = (cells[parseInt(k)] || '').trim();
      var role = colMap[k];
      if (role === 'skip') return;
      row[role] = val || prev[role] || '';
      if (val) prev[role] = val;
    });
    if (!row.material) continue;
    if (row.date) row.date = normDate(row.date);
    // 합성생산 표: 강제 지정 / 기본 표: 정제생산/소자이관 고정
    row.dept = (tableType === 'synth') ? '합성생산' : '정제생산/소자이관';
    rows.push(row);
  }
  return rows;
}

/* ── 미리보기 렌더 ────────────────────────────────────────────────────── */
function renderMailPreview(rows, tableType) {
  var result    = document.getElementById('mailParseResult');
  var dzRow     = document.getElementById('mailDzRow');
  var bulkBar   = document.getElementById('mailBulkDateBar');
  var btnClear  = document.getElementById('btnMailGridClear');
  var btnImport = document.getElementById('btnMailGridImport');
  var countEl   = document.getElementById('mgCount');

  if (!rows || !rows.length) {
    result.innerHTML = '<div class="mail-parse-warn">⚠ 인식된 항목이 없습니다. 헤더 행이 포함된 표 전체를 드래그하거나 붙여넣어 주세요.</div>';
    countEl.textContent = '';
    btnImport.style.display = 'none';
    btnClear.style.display  = 'none';
    dzRow.style.display = '';
    bulkBar.style.display = 'none';
    return;
  }

  dzRow.style.display  = 'none';
  bulkBar.style.display = '';
  document.getElementById('mailBulkDate').value = getTodayStr();
  btnClear.style.display  = '';
  btnImport.style.display = '';

  var isSynth = (tableType === 'synth');

  function updateCount() {
    var n = result.querySelectorAll('.mp-chk:checked').length;
    countEl.textContent = n + '개 선택됨';
  }

  var refHeaders = isSynth
    ? '<th class="ref-col">무게</th><th class="ref-col">합성이력</th><th class="ref-col">생산일자</th>'
    : '<th class="ref-col">중량</th><th class="ref-col">수령인</th><th class="ref-col">승화 Batch</th>';

  var typeLabel = isSynth
    ? '<span style="font-size:11px;color:var(--accent);font-weight:600;margin-left:6px;">합성생산 이관 표</span>'
    : '<span style="font-size:11px;color:var(--text-muted);margin-left:6px;">정제/소자 이관 표</span>';

  // 상단 바: 표 형식 + 수정 버튼(우측)
  var topBar = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    + '<div style="font-size:12px;">인식된 표 형식:' + typeLabel + '</div>'
    + '<button type="button" class="mp-edit-btn" id="mpEditToggle">✏ 수정</button>'
    + '</div>';

  var html = '<div class="mail-preview-wrap">'
    + topBar
    + '<table class="mail-preview-table" id="mpTable"><thead><tr>'
    + '<th class="td-chk"><input type="checkbox" id="mpCheckAll" title="전체 선택/해제"></th>'
    + '<th>날짜</th><th>부서</th><th>품명</th><th>Lot / Batch No.</th><th>비고</th>'
    + '<th class="td-chk" title="시급 요청">⚡</th>'
    + refHeaders
    + '</tr></thead><tbody>';

  if (isSynth) {
    // ── 합성생산: Batch No. 기준 그룹화 ──
    var batchOrder = [];
    var batchMap   = {};
    rows.forEach(function (row, i) {
      var key = row.lot || ('__nokey__' + i);
      if (!batchMap[key]) { batchMap[key] = []; batchOrder.push(key); }
      batchMap[key].push({ row: row, idx: i });
    });

    batchOrder.forEach(function (batchKey, gi) {
      var group = batchMap[batchKey];
      var last  = group.length - 1;
      group.forEach(function (entry, bi) {
        var row    = entry.row;
        var i      = entry.idx;
        var isHead = (bi === 0);
        var isLast = (bi === last);
        var posCls = (isHead ? ' batch-pos-first' : '') + (isLast ? ' batch-pos-last' : '');
        var sepCls = (gi > 0 && isHead) ? ' batch-sep' : '';
        var refCols = '<td class="ref-col">' + esc(row.weight    || '') + '</td>'
          + '<td class="ref-col">' + esc(row.synthHist || '') + '</td>'
          + '<td class="ref-col">' + esc(row.prodDate  || '') + '</td>';

        html += '<tr class="batch-row' + posCls + sepCls + '" data-batch="' + esc(batchKey) + '" data-idx="' + i + '" data-head="' + (isHead ? '1' : '0') + '">'
          + '<td class="td-chk">' + (isHead ? '<input type="checkbox" class="mp-chk">' : '') + '</td>'
          + '<td><input type="date" class="mp-edit mp-date" value="' + esc(row.date || '') + '"></td>'
          + '<td class="td-dept"><span style="font-size:11.5px;color:var(--accent);font-weight:600;">합성생산</span></td>'
          + '<td><input class="mp-edit mp-material" value="' + esc(row.material || '') + '"></td>'
          + '<td><input class="mp-edit mp-lot"      value="' + esc(row.lot      || '') + '" ' + (!isHead ? 'style="color:var(--text-faint)"' : '') + '></td>'
          + '<td><input class="mp-edit mp-comment"  value="' + esc(row.comment  || '') + '"></td>'
          + '<td class="td-chk">' + (isHead ? '<input type="checkbox" class="mp-urgent">' : '') + '</td>'
          + refCols
          + '</tr>';
      });
    });
  } else {
    // ── 정제/소자이관 ──
    rows.forEach(function (row, i) {
      var refCols = '<td class="ref-col">' + esc(row.weight    || '') + '</td>'
        + '<td class="ref-col">' + esc(row.recipient || '') + '</td>'
        + '<td class="ref-col">' + esc(row.batchNo   || '') + '</td>';

      html += '<tr data-idx="' + i + '">'
        + '<td class="td-chk"><input type="checkbox" class="mp-chk"></td>'
        + '<td><input type="date" class="mp-edit mp-date" value="' + esc(row.date || '') + '"></td>'
        + '<td class="td-dept"><select class="mp-dept">'
        + '<option value="정제생산/소자이관" selected>정제/소자이관</option>'
        + '</select></td>'
        + '<td><input class="mp-edit mp-material" value="' + esc(row.material || '') + '"></td>'
        + '<td><input class="mp-edit mp-lot"      value="' + esc(row.lot      || '') + '"></td>'
        + '<td><input class="mp-edit mp-comment"  value="' + esc(row.comment  || '') + '"></td>'
        + '<td class="td-chk"><input type="checkbox" class="mp-urgent"></td>'
        + refCols
        + '</tr>';
    });
  }

  html += '</tbody></table></div>';
  result.innerHTML = html;
  updateCount();

  var table   = document.getElementById('mpTable');
  var editBtn = document.getElementById('mpEditToggle');
  var editMode = false;

  // ── 수정 버튼 토글 ──
  editBtn.addEventListener('click', function () {
    editMode = !editMode;
    table.classList.toggle('edit-mode', editMode);
    editBtn.classList.toggle('active', editMode);
    editBtn.textContent = editMode ? '✔ 완료' : '✏ 수정';
  });

  // ── 배치 그룹 외곽 하이라이트 ──
  function syncBatchHighlight(batchKey, checked) {
    result.querySelectorAll('tr.batch-row[data-batch="' + batchKey + '"]').forEach(function (tr) {
      tr.classList.toggle('batch-active', checked);
    });
  }

  function syncCheckAll() {
    var all = result.querySelectorAll('.mp-chk');
    document.getElementById('mpCheckAll').checked =
      all.length > 0 && Array.prototype.every.call(all, function (c) { return c.checked; });
  }

  // ── 행 클릭 → 체크 토글 (편집 모드 아닐 때) ──
  result.querySelectorAll('tbody tr').forEach(function (tr) {
    tr.addEventListener('click', function (e) {
      if (editMode) return;                                    // 편집 모드면 무시
      if (e.target.type === 'checkbox') return;               // 체크박스 직접 클릭은 자체 처리

      if (isSynth) {
        // 배치 그룹 토글
        var batchKey = tr.dataset.batch;
        var headTr   = result.querySelector('tr.batch-row[data-batch="' + batchKey + '"][data-head="1"]');
        if (!headTr) return;
        var cb = headTr.querySelector('.mp-chk');
        if (!cb) return;
        cb.checked = !cb.checked;
        syncBatchHighlight(batchKey, cb.checked);
      } else {
        // 개별 행 토글
        var cb = tr.querySelector('.mp-chk');
        if (!cb) return;
        cb.checked = !cb.checked;
        tr.classList.toggle('row-checked', cb.checked);
      }
      syncCheckAll();
      updateCount();
    });
  });

  // ── 전체 선택 ──
  document.getElementById('mpCheckAll').addEventListener('change', function () {
    var chk = this.checked;
    result.querySelectorAll('.mp-chk').forEach(function (cb) {
      cb.checked = chk;
      if (isSynth) {
        var bk = cb.closest('tr') && cb.closest('tr').dataset.batch;
        if (bk) syncBatchHighlight(bk, chk);
      } else {
        cb.closest('tr').classList.toggle('row-checked', chk);
      }
    });
    updateCount();
  });

  // ── 체크박스 직접 변경 ──
  result.querySelectorAll('.mp-chk').forEach(function (cb) {
    cb.addEventListener('change', function () {
      if (isSynth) {
        var bk = cb.closest('tr') && cb.closest('tr').dataset.batch;
        if (bk) syncBatchHighlight(bk, cb.checked);
      } else {
        cb.closest('tr').classList.toggle('row-checked', cb.checked);
      }
      syncCheckAll();
      updateCount();
    });
  });
}

/* ── 데이터 처리 진입점 (HTML 우선, TSV 폴백) ─────────────────────────── */
function processMailData(html, plain) {
  var grid = null;

  if (html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    var table = div.querySelector('table');
    if (table) { grid = htmlTableToGrid(table); }
  }
  if (!grid && plain) {
    grid = tsvToGrid(plain);
  }
  if (!grid || !grid.length) {
    document.getElementById('mailParseResult').innerHTML =
      '<div class="mail-parse-warn">⚠ 표 데이터를 인식하지 못했습니다.</div>';
    return;
  }

  var headerInfo = detectMailHeader(grid);
  if (!headerInfo) {
    document.getElementById('mailParseResult').innerHTML =
      '<div class="mail-parse-warn">⚠ 헤더 행(날짜/품명/Lot 번호 등)을 인식하지 못했습니다.<br>표 전체(헤더 포함)를 선택해 주세요.</div>';
    return;
  }

  // 원문(HTML 또는 plain)에 '합성생산팀 충주 이관내역' 문구가 있으면 합성생산 표
  var rawText = (html || '') + (plain || '');
  var isSynthSource = rawText.indexOf('합성생산팀 충주 이관내역') !== -1;
  var tableType = detectTableType(isSynthSource);
  mailTableType = tableType;
  mailParsedRows = extractMailRows(grid, headerInfo, tableType);
  renderMailPreview(mailParsedRows, tableType);
}

/* ── 팝업 상태 리셋 ──────────────────────────────────────────────────── */
function resetMailPopup() {
  mailParsedRows = null;
  mailTableType = 'default';
  document.getElementById('mailParseResult').innerHTML = '';
  document.getElementById('mailDzRow').style.display = '';
  document.getElementById('mailBulkDateBar').style.display = 'none';
  document.getElementById('mailBulkDate').value = '';
  document.getElementById('btnMailGridClear').style.display  = 'none';
  document.getElementById('btnMailGridImport').style.display = 'none';
  document.getElementById('mgCount').textContent = '';
}

/* ── 팝업 열기 / 닫기 ────────────────────────────────────────────────── */
function openMailPopup()  { document.getElementById('mailPopupOverlay').classList.add('open'); }
function closeMailPopup() { document.getElementById('mailPopupOverlay').classList.remove('open'); resetMailPopup(); }

document.getElementById('btnOpenMailPopup').addEventListener('click', openMailPopup);
document.getElementById('btnMailPopupClose').addEventListener('click', closeMailPopup);
document.getElementById('mailPopupOverlay').addEventListener('click', function (e) {
  if (e.target === this) closeMailPopup();
});

/* ── 드롭존 이벤트 (팝업 내부 드롭존) ───────────────────────────────── */
var dz = document.getElementById('mailDropzone');
dz.addEventListener('dragover',  function (e) { e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragleave', function ()  { dz.classList.remove('drag-over'); });
dz.addEventListener('drop', function (e) {
  e.preventDefault();
  dz.classList.remove('drag-over');
  processMailData(
    e.dataTransfer.getData('text/html'),
    e.dataTransfer.getData('text/plain')
  );
});

/* ── 달력 영역 드래그 드롭 → 메일 팝업 자동 오픈 ─────────────────────── */
var calBody = document.querySelector('.cal-body');
var _calDragCounter = 0; // dragleave 오발 방지용 카운터
calBody.addEventListener('dragenter', function (e) {
  if (!e.dataTransfer.types.includes('text/html') && !e.dataTransfer.types.includes('text/plain')) return;
  _calDragCounter++;
  calBody.classList.add('cal-drag-over');
  e.preventDefault();
});
calBody.addEventListener('dragover', function (e) { e.preventDefault(); });
calBody.addEventListener('dragleave', function () {
  _calDragCounter--;
  if (_calDragCounter <= 0) { _calDragCounter = 0; calBody.classList.remove('cal-drag-over'); }
});
calBody.addEventListener('drop', function (e) {
  e.preventDefault();
  _calDragCounter = 0;
  calBody.classList.remove('cal-drag-over');
  var html  = e.dataTransfer.getData('text/html');
  var plain = e.dataTransfer.getData('text/plain');
  if (!html && !plain) return;
  openMailPopup();
  // 팝업 DOM이 열린 직후 처리
  setTimeout(function () { processMailData(html, plain); }, 50);
});

/* ── Ctrl+V (팝업 열려 있을 때 전역 붙여넣기) ────────────────────────── */
document.addEventListener('paste', function (e) {
  if (!document.getElementById('mailPopupOverlay').classList.contains('open')) return;
  processMailData(
    e.clipboardData.getData('text/html'),
    e.clipboardData.getData('text/plain')
  );
});

/* ── 날짜 일괄 적용 ─────────────────────────────────────────────────── */
document.getElementById('btnMailBulkDate').addEventListener('click', function () {
  var val = document.getElementById('mailBulkDate').value;
  if (!val) return;
  document.querySelectorAll('#mailParseResult .mp-date').forEach(function (inp) {
    inp.value = val;
  });
});

/* ── 다시 입력 버튼 ──────────────────────────────────────────────────── */
document.getElementById('btnMailGridClear').addEventListener('click', resetMailPopup);

/* ── 등록하기 ────────────────────────────────────────────────────────── */
document.getElementById('btnMailGridImport').addEventListener('click', function () {
  if (!mailParsedRows || !mailParsedRows.length) { alert('파싱된 데이터가 없습니다.'); return; }

  var toAdd = [];
  var isSynthImport = (mailTableType === 'synth');
  document.querySelectorAll('#mailParseResult .mp-chk').forEach(function (cb) {
    if (!cb.checked) return;
    var tr = cb.closest('tr');
    // 합성생산 표: 헤드 행만 등록 (배치당 1건)
    if (isSynthImport && tr.dataset.head !== '1') return;
    var dept    = isSynthImport ? '합성생산' : tr.querySelector('.mp-dept').value;
    var dateVal = normDate(tr.querySelector('.mp-date').value.trim());
    var matVal  = tr.querySelector('.mp-material').value.trim();
    var lotVal  = tr.querySelector('.mp-lot').value.trim();
    var cmtVal  = tr.querySelector('.mp-comment').value.trim();
    var urgVal  = tr.querySelector('.mp-urgent') ? tr.querySelector('.mp-urgent').checked : false;
    if (!dateVal || !matVal) return;
    var _by2 = _byInfo();
    toAdd.push({
      id:           genId(),
      dept:         dept,
      material:     matVal,
      lot:          lotVal,
      request:      cmtVal,
      transferDate: dateVal,
      evalStart:    '',
      evalTarget:   '',
      urgent:       urgVal,
      completed:    false,
      completedAt:  null,
      createdAt:    getTodayStr(),
      createdBy:    _by2,
      updatedBy:    _by2,
    });
  });

  if (!toAdd.length) { alert('날짜와 품명이 있는 선택 항목이 없습니다.'); return; }

  toAdd.forEach(function (it) { addItem(it); });

  var d = new Date(toAdd[0].transferDate + 'T00:00:00');
  if (!isNaN(d)) { curYear = d.getFullYear(); curMonth = d.getMonth(); }
  renderCalendar();

  closeMailPopup();
  alert(toAdd.length + '개 항목이 등록되었습니다.');
});

})();
