(function () {
'use strict';

/* ── 테마 동기화 ─────────────────────────────────────────────────────── */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('qa_theme', t);
}
applyTheme(localStorage.getItem('qa_theme') || 'dark');
window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'setTheme') applyTheme(e.data.theme);
});

/* ── Firebase 초기화 ─────────────────────────────────────────────────── */
var firebaseConfig = {
  apiKey:            "AIzaSyAk9PGqBHxiG9fVwVZZg6ZGBOWaaSAXOBc",
  authDomain:        "qa-manager-9c145.firebaseapp.com",
  databaseURL:       "https://qa-manager-9c145-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "qa-manager-9c145",
  storageBucket:     "qa-manager-9c145.firebasestorage.app",
  messagingSenderId: "1037146076792",
  appId:             "1:1037146076792:web:b8ddcdb31d527d2d545f8d"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
var _db        = firebase.database();
var DB_REF     = _db.ref('lot_schedule');
var RESULT_REF = _db.ref('oled_results');

/* ── 상태 ────────────────────────────────────────────────────────────── */
var STATE = {
  items:    [],   // lot_schedule 전체
  results:  {},   // oled_results 전체 {lotId: {...}}
  period:   'month',  // 'month' | 'quarter' | 'year'
  dept:     'all',    // 'all' | '합성생산' | '정제생산/소자이관'
  charts:   {},       // Chart.js 인스턴스 핸들
};

/* ── Chart.js 공통 설정 ──────────────────────────────────────────────── */
var BRAND     = '#be0039';
var BRAND_BG  = 'rgba(190, 0, 57, 0.12)';
var COLOR_SYNTH  = '#ef4444';
var COLOR_REFINE = '#9333ea';
var COLOR_BLUE   = '#4a9eff';
var COLOR_GREEN  = '#10b981';
var COLOR_AMBER  = '#f59e0b';
var COLOR_PURPLE = '#7c3aed';

Chart.defaults.font.family = "'Inter', 'Noto Sans KR', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = '#6b7280';
Chart.defaults.borderColor = '#e8d0d4';

/* ── 날짜 유틸 ───────────────────────────────────────────────────────── */
function parseDate(s) {
  if (!s) return null;
  var d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function ymKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function yqKey(d) {
  return d.getFullYear() + '-Q' + (Math.floor(d.getMonth() / 3) + 1);
}
function yKey(d) {
  return String(d.getFullYear());
}
function periodKey(d, period) {
  if (period === 'year')    return yKey(d);
  if (period === 'quarter') return yqKey(d);
  return ymKey(d);
}

/* 현재 기간 키 (오늘 기준) */
function currentKey(period) {
  return periodKey(new Date(), period);
}

/* 직전 기간 키 */
function prevKey(period) {
  var d = new Date();
  if (period === 'year')    d.setFullYear(d.getFullYear() - 1);
  else if (period === 'quarter') d.setMonth(d.getMonth() - 3);
  else                      d.setMonth(d.getMonth() - 1);
  return periodKey(d, period);
}

/* 직전 N개 기간 키 시퀀스 (시간순) */
function lastNKeys(period, n) {
  var keys = [];
  var d = new Date();
  d.setDate(1);
  for (var i = n - 1; i >= 0; i--) {
    var t = new Date(d);
    if (period === 'year')         t.setFullYear(d.getFullYear() - i);
    else if (period === 'quarter') t.setMonth(d.getMonth() - i * 3);
    else                           t.setMonth(d.getMonth() - i);
    keys.push(periodKey(t, period));
  }
  return keys;
}

/* 두 날짜 간 일수 */
function daysBetween(a, b) {
  return Math.floor((b - a) / 86400000);
}

/* ── 데이터 필터링 ───────────────────────────────────────────────────── */
function filteredItems() {
  if (STATE.dept === 'all') return STATE.items;
  return STATE.items.filter(function (it) { return it.dept === STATE.dept; });
}

/* 항목의 "기준 날짜" — transferDate (이관일) */
function refDate(item) {
  return parseDate(item.transferDate);
}

/* ── KPI 계산 ───────────────────────────────────────────────────────── */
function computeKPI() {
  var items = filteredItems();
  var curK  = currentKey(STATE.period);
  var prvK  = prevKey(STATE.period);

  var curCount = 0, prvCount = 0;
  var ongoingCount = 0;
  var leadtimes = [];
  var urgentInPeriod = 0;
  var refineInPeriodTotal = 0;
  var refineInPeriodWithResult = 0;

  items.forEach(function (it) {
    var d = refDate(it);
    if (!d) return;
    var k = periodKey(d, STATE.period);

    if (k === curK) {
      curCount++;
      if (it.urgent) urgentInPeriod++;
      if (it.dept === '정제생산/소자이관') {
        refineInPeriodTotal++;
        if (STATE.results[it.id]) refineInPeriodWithResult++;
      }
    }
    if (k === prvK) prvCount++;

    // 진행 중 (정제/소자 미완료)
    if (it.dept === '정제생산/소자이관' && !it.completed) ongoingCount++;

    // 평균 소요일 (완료 Lot 기준)
    if (it.completed && it.completedAt) {
      var ed = parseDate(it.completedAt);
      if (ed && d) {
        var diff = daysBetween(d, ed);
        if (diff >= 0 && diff < 365) leadtimes.push(diff);
      }
    }
  });

  // 평균 소요일
  var avgLT = leadtimes.length
    ? (leadtimes.reduce(function (a, b) { return a + b; }, 0) / leadtimes.length)
    : null;

  // delta 계산
  var deltaPct = null;
  if (prvCount > 0) deltaPct = ((curCount - prvCount) / prvCount) * 100;
  else if (curCount > 0) deltaPct = 100;

  return {
    curCount:   curCount,
    prvCount:   prvCount,
    deltaPct:   deltaPct,
    ongoing:    ongoingCount,
    avgLT:      avgLT,
    leadCount:  leadtimes.length,
    urgentPct:  curCount > 0 ? (urgentInPeriod / curCount) * 100 : 0,
    urgentCnt:  urgentInPeriod,
    resultRate: refineInPeriodTotal > 0 ? (refineInPeriodWithResult / refineInPeriodTotal) * 100 : null,
    resultDone: refineInPeriodWithResult,
    resultTot:  refineInPeriodTotal,
  };
}

/* ── KPI 렌더 ────────────────────────────────────────────────────────── */
function renderKPI() {
  var k = computeKPI();
  var periodLabel = STATE.period === 'month' ? '달' : (STATE.period === 'quarter' ? '분기' : '년');

  document.querySelectorAll('.kpi-period-label').forEach(function (el) {
    el.textContent = periodLabel;
  });

  document.getElementById('kpiTotal').textContent = k.curCount.toLocaleString();
  var deltaEl = document.getElementById('kpiTotalDelta');
  if (k.deltaPct === null) {
    deltaEl.innerHTML = '<span class="delta-flat">— </span>이전 기간 데이터 없음';
  } else {
    var arrow = k.deltaPct > 0 ? '▲' : (k.deltaPct < 0 ? '▼' : '—');
    var cls   = k.deltaPct > 0 ? 'delta-up' : (k.deltaPct < 0 ? 'delta-down' : 'delta-flat');
    deltaEl.innerHTML = '<span class="' + cls + '">' + arrow + ' ' + Math.abs(k.deltaPct).toFixed(1) + '%</span> 전 기간 대비';
  }

  document.getElementById('kpiOngoing').textContent = k.ongoing.toLocaleString();
  document.getElementById('kpiOngoingDelta').textContent = '정제/소자이관 미완료';

  var ltEl = document.getElementById('kpiLeadtime');
  ltEl.innerHTML = k.avgLT !== null
    ? k.avgLT.toFixed(1) + '<span class="kpi-sub" style="margin-left:4px">일</span>'
    : '—';
  document.getElementById('kpiLeadtimeDelta').textContent = '완료 Lot ' + k.leadCount + '건 평균';

  document.getElementById('kpiUrgent').innerHTML =
    k.urgentPct.toFixed(0) + '<span class="kpi-sub" style="margin-left:2px">%</span>';
  document.getElementById('kpiUrgentDelta').textContent = '⚡ ' + k.urgentCnt + '건';

  var rrEl = document.getElementById('kpiResultRate');
  rrEl.innerHTML = k.resultRate !== null
    ? k.resultRate.toFixed(0) + '<span class="kpi-sub" style="margin-left:2px">%</span>'
    : '—';
  document.getElementById('kpiResultRateDelta').textContent =
    k.resultRate !== null ? (k.resultDone + '/' + k.resultTot + ' 결과 입력') : '데이터 없음';
}

/* ── 차트 1: 평가 추이 ───────────────────────────────────────────────── */
function renderTrendChart() {
  var n = STATE.period === 'month' ? 12 : (STATE.period === 'quarter' ? 8 : 5);
  var keys = lastNKeys(STATE.period, n);
  var bySynth  = {};
  var byRefine = {};
  keys.forEach(function (k) { bySynth[k] = 0; byRefine[k] = 0; });

  filteredItems().forEach(function (it) {
    var d = refDate(it);
    if (!d) return;
    var k = periodKey(d, STATE.period);
    if (!(k in bySynth)) return;
    if (it.dept === '합성생산') bySynth[k]++;
    else byRefine[k]++;
  });

  var labels = keys.map(function (k) {
    if (STATE.period === 'month') {
      var p = k.split('-');
      return p[1] + '월';
    }
    if (STATE.period === 'quarter') return k.replace('-Q', ' Q');
    return k + '년';
  });

  document.getElementById('trendSub').textContent =
    STATE.period === 'month' ? '최근 12개월 / 부서별'
    : STATE.period === 'quarter' ? '최근 8분기 / 부서별'
    : '최근 5년 / 부서별';

  var ctx = document.getElementById('trendChart');
  if (STATE.charts.trend) STATE.charts.trend.destroy();

  var datasets = [];
  if (STATE.dept !== '정제생산/소자이관') {
    datasets.push({
      label: '합성생산',
      data: keys.map(function (k) { return bySynth[k]; }),
      backgroundColor: COLOR_SYNTH + 'cc',
      borderColor: COLOR_SYNTH,
      borderWidth: 1,
      borderRadius: 4,
    });
  }
  if (STATE.dept !== '합성생산') {
    datasets.push({
      label: '정제/소자이관',
      data: keys.map(function (k) { return byRefine[k]; }),
      backgroundColor: COLOR_REFINE + 'cc',
      borderColor: COLOR_REFINE,
      borderWidth: 1,
      borderRadius: 4,
    });
  }

  STATE.charts.trend = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 10, padding: 12 } },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

/* ── 차트 2: 재료별 Top 8 ────────────────────────────────────────────── */
function renderMaterialChart() {
  var n = STATE.period === 'month' ? 3 : (STATE.period === 'quarter' ? 4 : 3);
  var keys = lastNKeys(STATE.period, n);
  var keySet = {};
  keys.forEach(function (k) { keySet[k] = true; });

  var counts = {};
  filteredItems().forEach(function (it) {
    var d = refDate(it);
    if (!d) return;
    var k = periodKey(d, STATE.period);
    if (!keySet[k]) return;
    var mat = (it.material || '').trim() || '(미입력)';
    counts[mat] = (counts[mat] || 0) + 1;
  });

  var entries = Object.keys(counts)
    .map(function (m) { return [m, counts[m]]; })
    .sort(function (a, b) { return b[1] - a[1]; })
    .slice(0, 8);

  document.getElementById('materialSub').textContent =
    STATE.period === 'month' ? '최근 3개월 누적'
    : STATE.period === 'quarter' ? '최근 4분기 누적'
    : '최근 3년 누적';

  var ctx = document.getElementById('materialChart');
  if (STATE.charts.material) STATE.charts.material.destroy();

  if (entries.length === 0) {
    drawEmptyChart(ctx, '데이터 없음');
    return;
  }

  STATE.charts.material = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(function (e) { return e[0]; }),
      datasets: [{
        label: '평가 건수',
        data: entries.map(function (e) { return e[1]; }),
        backgroundColor: BRAND,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: { grid: { display: false } },
      },
    },
  });
}

/* ── OLED 결과 통계 헬퍼 ─────────────────────────────────────────────── */
function collectResults() {
  // 결과 + 해당 Lot 정보 매칭
  var byId = {};
  STATE.items.forEach(function (it) { byId[it.id] = it; });

  var rows = [];
  Object.keys(STATE.results).forEach(function (lotId) {
    var r = STATE.results[lotId];
    if (!r) return;
    var item = byId[lotId];
    if (!item) return; // 해당 Lot이 사라진 경우 제외
    if (STATE.dept !== 'all' && item.dept !== STATE.dept) return;
    rows.push({ id: lotId, item: item, result: r });
  });
  return rows;
}

/* LT 결과에서 (selectedLevel, selectedPct) 추출 — 신·구 포맷 모두 지원 */
function extractLT(result) {
  if (!result || !result.lt) return { level: null, pct: null };
  var lt = result.lt;
  var level = lt.selectedLevel || lt.level || null;
  var pct = null;
  if (lt.levels && level && lt.levels[level]) pct = lt.levels[level].pct;
  else if (lt.pct != null) pct = lt.pct;
  return { level: level, pct: pct };
}

/* IVL 효율비 (sample.eff / ref.eff * 100) */
function extractEffRatio(result) {
  if (!result || !result.ivl || !result.ivl.ref || !result.ivl.sample) return null;
  var r = parseFloat(result.ivl.ref.eff);
  var s = parseFloat(result.ivl.sample.eff);
  if (!r || isNaN(r) || isNaN(s)) return null;
  return (s / r) * 100;
}

/* ── 차트 3: LT 레벨 분포 ────────────────────────────────────────────── */
function renderLtLevelChart() {
  var rows = collectResults();
  var levelOrder = [99, 98, 97, 96, 95, 94, 93, 92, 91, 90];
  var counts = {};
  levelOrder.forEach(function (l) { counts[l] = 0; });

  rows.forEach(function (r) {
    var lt = extractLT(r.result);
    if (lt.level && counts[lt.level] != null) counts[lt.level]++;
  });

  // 0이 아닌 레벨만 표시
  var labels = [], data = [];
  levelOrder.forEach(function (l) {
    if (counts[l] > 0) { labels.push('LT' + l); data.push(counts[l]); }
  });

  var ctx = document.getElementById('ltLevelChart');
  if (STATE.charts.ltLevel) STATE.charts.ltLevel.destroy();

  if (data.length === 0) { drawEmptyChart(ctx, 'OLED 결과 없음'); return; }

  STATE.charts.ltLevel = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '건수',
        data: data,
        backgroundColor: COLOR_PURPLE,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

/* ── 차트 4: LT % 분포 (히스토그램) ──────────────────────────────────── */
function renderLtPctChart() {
  var rows = collectResults();
  // bin: <80, 80-90, 90-95, 95-100, 100-105, 105-110, ≥110
  var bins = [
    { label: '<80',     min: -Infinity, max: 80,        color: COLOR_SYNTH },
    { label: '80–90',   min: 80,        max: 90,        color: COLOR_SYNTH },
    { label: '90–95',   min: 90,        max: 95,        color: COLOR_AMBER },
    { label: '95–100',  min: 95,        max: 100,       color: COLOR_BLUE },
    { label: '100–105', min: 100,       max: 105,       color: COLOR_GREEN },
    { label: '105–110', min: 105,       max: 110,       color: COLOR_PURPLE },
    { label: '≥110',    min: 110,       max: Infinity,  color: COLOR_PURPLE },
  ];
  var counts = bins.map(function () { return 0; });

  rows.forEach(function (r) {
    var lt = extractLT(r.result);
    if (lt.pct == null) return;
    for (var i = 0; i < bins.length; i++) {
      if (lt.pct >= bins[i].min && lt.pct < bins[i].max) { counts[i]++; break; }
    }
  });

  var ctx = document.getElementById('ltPctChart');
  if (STATE.charts.ltPct) STATE.charts.ltPct.destroy();

  if (counts.every(function (c) { return c === 0; })) {
    drawEmptyChart(ctx, 'OLED 결과 없음'); return;
  }

  STATE.charts.ltPct = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: bins.map(function (b) { return b.label; }),
      datasets: [{
        label: 'Lot 수',
        data: counts,
        backgroundColor: bins.map(function (b) { return b.color; }),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

/* ── 차트 5: IVL 효율비 분포 ─────────────────────────────────────────── */
function renderEffRatioChart() {
  var rows = collectResults();
  var bins = [
    { label: '<90',    min: -Infinity, max: 90,       color: COLOR_SYNTH },
    { label: '90–95',  min: 90,        max: 95,       color: COLOR_AMBER },
    { label: '95–100', min: 95,        max: 100,      color: COLOR_BLUE },
    { label: '100–105',min: 100,       max: 105,      color: COLOR_GREEN },
    { label: '105–110',min: 105,       max: 110,      color: COLOR_PURPLE },
    { label: '≥110',   min: 110,       max: Infinity, color: COLOR_PURPLE },
  ];
  var counts = bins.map(function () { return 0; });

  rows.forEach(function (r) {
    var ratio = extractEffRatio(r.result);
    if (ratio == null) return;
    for (var i = 0; i < bins.length; i++) {
      if (ratio >= bins[i].min && ratio < bins[i].max) { counts[i]++; break; }
    }
  });

  var ctx = document.getElementById('effRatioChart');
  if (STATE.charts.effRatio) STATE.charts.effRatio.destroy();

  if (counts.every(function (c) { return c === 0; })) {
    drawEmptyChart(ctx, 'OLED 결과 없음'); return;
  }

  STATE.charts.effRatio = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: bins.map(function (b) { return b.label; }),
      datasets: [{
        label: 'Lot 수',
        data: counts,
        backgroundColor: bins.map(function (b) { return b.color; }),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

/* ── 빈 차트 placeholder ─────────────────────────────────────────────── */
function drawEmptyChart(canvas, msg) {
  var ctx = canvas.getContext('2d');
  var w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#9ca3af';
  ctx.font = '13px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(msg, w / 2, h / 2);
}

/* ── 진행 중 재료 리스트 ─────────────────────────────────────────────── */
function renderOngoingList() {
  var items = filteredItems().filter(function (it) {
    return it.dept === '정제생산/소자이관' && !it.completed && it.transferDate;
  });

  // 이관일 오래된 순 (D+N 큰 순)
  var today = new Date();
  items.forEach(function (it) {
    var d = parseDate(it.transferDate);
    it._dn = d ? Math.floor((today - d) / 86400000) : -999;
  });
  items.sort(function (a, b) { return b._dn - a._dn; });
  items = items.slice(0, 30);

  var box = document.getElementById('ongoingList');
  document.getElementById('ongoingSub').textContent = '미완료 정제/소자이관 ' + items.length + '건';

  if (items.length === 0) {
    box.innerHTML = '<div class="empty-state">진행 중인 항목이 없습니다.</div>';
    return;
  }

  box.innerHTML = '';
  items.forEach(function (it) {
    var row = document.createElement('div');
    var cls = 'ongoing-row';
    if (it.urgent) cls += ' is-urgent';
    if (it._dn >= 14) cls += ' is-overdue';
    row.className = cls;

    var matBlock = document.createElement('div');
    matBlock.innerHTML =
      '<div class="ongoing-mat">' + (it.urgent ? '⚡ ' : '') + esc(it.material || '(미입력)') + '</div>' +
      (it.lot ? '<div class="ongoing-lot">' + esc(it.lot) + '</div>' : '');

    var meta = document.createElement('div');
    meta.className = 'ongoing-meta';
    var dnCls = 'ongoing-dn';
    if (it._dn >= 14) dnCls += ' dn-danger';
    else if (it._dn >= 7) dnCls += ' dn-alert';
    var dnLabel = it._dn === 0 ? 'D+0' : (it._dn > 0 ? 'D+' + it._dn : 'D' + it._dn);
    meta.innerHTML =
      '<span class="' + dnCls + '">' + dnLabel + '</span>' +
      '<span class="ongoing-date">' + it.transferDate + '</span>';

    var pin = document.createElement('div');
    pin.className = 'ongoing-result-pin';
    pin.textContent = STATE.results[it.id] ? '✓ 결과' : '';

    row.appendChild(matBlock);
    row.appendChild(meta);
    row.appendChild(pin);
    box.appendChild(row);
  });
}

/* ── 최근 결과 테이블 ────────────────────────────────────────────────── */
function renderRecentResults() {
  var rows = collectResults();
  rows.sort(function (a, b) {
    return (b.result.savedAt || '').localeCompare(a.result.savedAt || '');
  });
  rows = rows.slice(0, 10);

  var tbody = document.querySelector('#recentResultTable tbody');
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">저장된 결과가 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function (r) {
    var lt   = extractLT(r.result);
    var eff  = extractEffRatio(r.result);
    var pctCls = pctClass(lt.pct);
    var effCls = pctClass(eff);
    return '<tr>' +
      '<td>' + (r.result.savedAt || '—') + '</td>' +
      '<td title="' + esc(r.item.material || '') + '">' + esc(r.item.material || '—') + '</td>' +
      '<td class="lot-cell" title="' + esc(r.item.lot || '') + '">' + esc(r.item.lot || '—') + '</td>' +
      '<td>' + (lt.level ? '<span class="lt-tag">LT' + lt.level + '</span>' : '—') + '</td>' +
      '<td class="' + pctCls + '">' + (lt.pct != null ? lt.pct.toFixed(1) + '%' : '—') + '</td>' +
      '<td class="' + effCls + '">' + (eff != null ? eff.toFixed(1) + '%' : '—') + '</td>' +
    '</tr>';
  }).join('');
}

function pctClass(p) {
  if (p == null) return '';
  if (Math.abs(p - 100) <= 5) return 'pct-good';
  if (p > 105) return 'pct-warn';
  return 'pct-bad';
}

/* ── HTML 이스케이프 ─────────────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── 전체 재렌더 ─────────────────────────────────────────────────────── */
function renderAll() {
  renderKPI();
  renderTrendChart();
  renderMaterialChart();
  renderLtLevelChart();
  renderLtPctChart();
  renderEffRatioChart();
  renderOngoingList();
  renderRecentResults();
}

/* ── 컨트롤 바인딩 ───────────────────────────────────────────────────── */
function bindControls() {
  document.querySelectorAll('.seg-btn[data-period]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.seg-btn[data-period]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      STATE.period = btn.dataset.period;
      renderAll();
    });
  });
  document.querySelectorAll('.seg-btn[data-dept]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.seg-btn[data-dept]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      STATE.dept = btn.dataset.dept;
      renderAll();
    });
  });
  document.getElementById('btnRefresh').addEventListener('click', function () {
    renderAll();
  });
}

/* ── 데이터 로드 (실시간 구독) ──────────────────────────────────────── */
function startSync() {
  DB_REF.on('value', function (snap) {
    var val = snap.val();
    var arr = [];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      arr = Object.values(val).filter(function (v) { return v && v.id; });
    } else if (Array.isArray(val)) {
      arr = val.filter(Boolean);
    }
    STATE.items = arr;
    renderAll();
  });
  RESULT_REF.on('value', function (snap) {
    STATE.results = snap.val() || {};
    renderAll();
  });
}

/* ── 진입 ────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  bindControls();
  startSync();
});

})();
