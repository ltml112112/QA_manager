(function () {
'use strict';

/* ── Firebase 초기화 (공통 설정 사용) ────────────────────────────────
   테마 동기화·Firebase config는 index.html에서 공통 모듈 로드.
──────────────────────────────────────────────────────────────────── */
QA_initFirebase();
var _db        = firebase.database();
var DB_REF     = _db.ref(QA_DB_PATHS.lotSchedule);
var RESULT_REF = _db.ref(QA_DB_PATHS.oledResults);

/* ── WebSocket 연결 상태 진단 (.info/connected) ─────────────────────
   Firebase 특수 경로 — auth 불필요, 네트워크 연결 상태만 반환.
   true 발화 안 되면 WebSocket 자체가 안 열리는 환경 문제.
──────────────────────────────────────────────────────────────────── */
(function () {
  var connT0 = Date.now();
  _db.ref('.info/connected').on('value', function (s) {
    console.log('[dashboard] .info/connected:', s.val(), { ms: Date.now() - connT0 });
  });
})();

/* ── 상태 ────────────────────────────────────────────────────────────── */
var STATE = {
  items:     [],          // lot_schedule 전체
  results:   {},          // oled_results 전체 {lotId: {...}}
  period:    'month',     // 'month' | 'quarter' | 'year'
  material:  null,        // 재료명 (null = 전체)
  fromMonth: null,        // 'YYYY-MM' (월별 모드 시작월)
  toMonth:   null,        // 'YYYY-MM' (월별 모드 종료월)
  ltLevel:   'auto',      // 'auto' | 99..90 (LT 절대값 차트용)
  charts:    {},          // Chart.js 인스턴스 핸들
};

/* ── 부서 매칭 (합성생산만 제외) ─────────────────────────────────────── */
function isTargetDept(item) {
  return !!item && item.dept !== '합성생산';
}

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
/* 부서 + 재료 필터 적용 (월 범위는 차트별로 별도 적용) */
function filteredItems() {
  return STATE.items.filter(function (it) {
    if (!isTargetDept(it)) return false;
    if (STATE.material && (it.material || '').trim() !== STATE.material) return false;
    return true;
  });
}

/* 월 범위 체크 — 월별 모드일 때만 적용 */
function inMonthRange(d) {
  if (STATE.period !== 'month') return true;
  if (!d) return false;
  var k = ymKey(d);
  if (STATE.fromMonth && k < STATE.fromMonth) return false;
  if (STATE.toMonth   && k > STATE.toMonth)   return false;
  return true;
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
  var resultTotal = 0;
  var resultDone  = 0;

  items.forEach(function (it) {
    var d = refDate(it);

    if (d) {
      var k = periodKey(d, STATE.period);
      if (k === curK) {
        curCount++;
        if (it.urgent) urgentInPeriod++;
        resultTotal++;
        if (STATE.results[it.id]) resultDone++;
      }
      if (k === prvK) prvCount++;
    }

    // 진행 중 — 합성생산이 아니고 미완료인 모든 항목 (필터 무시: 전체 카운트)
    // (위 items는 이미 isTargetDept 통과한 것들이지만, 재료 필터도 적용된 상태)
    if (!it.completed) ongoingCount++;

    // 평균 소요일 (완료 Lot 기준)
    if (it.completed && it.completedAt && d) {
      var ed = parseDate(it.completedAt);
      if (ed) {
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
    resultRate: resultTotal > 0 ? (resultDone / resultTotal) * 100 : null,
    resultDone: resultDone,
    resultTot:  resultTotal,
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
  document.getElementById('kpiOngoingDelta').textContent =
    STATE.material ? ('미완료 — ' + STATE.material) : '미완료 (전체 재료)';

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

/* ── 월 범위 → 키 시퀀스 ─────────────────────────────────────────────── */
/* 월별 모드일 때 fromMonth~toMonth 사이 모든 월 키 반환 */
function monthRangeKeys() {
  if (!STATE.fromMonth || !STATE.toMonth) {
    return lastNKeys('month', 12);
  }
  var keys = [];
  var fp = STATE.fromMonth.split('-');
  var tp = STATE.toMonth.split('-');
  var y = parseInt(fp[0], 10), m = parseInt(fp[1], 10);
  var ty = parseInt(tp[0], 10), tm = parseInt(tp[1], 10);
  var safety = 0;
  while ((y < ty || (y === ty && m <= tm)) && safety < 240) {
    keys.push(y + '-' + String(m).padStart(2, '0'));
    m++;
    if (m > 12) { m = 1; y++; }
    safety++;
  }
  return keys;
}

/* ── 차트 1: 평가 추이 ───────────────────────────────────────────────── */
function renderTrendChart() {
  var keys;
  if (STATE.period === 'month') keys = monthRangeKeys();
  else if (STATE.period === 'quarter') keys = lastNKeys('quarter', 8);
  else keys = lastNKeys('year', 5);

  var counts = {};
  keys.forEach(function (k) { counts[k] = 0; });

  filteredItems().forEach(function (it) {
    var d = refDate(it);
    if (!d) return;
    var k = periodKey(d, STATE.period);
    if (!(k in counts)) return;
    counts[k]++;
  });

  var labels = keys.map(function (k) {
    if (STATE.period === 'month') {
      var p = k.split('-');
      return p[0].slice(2) + '/' + p[1];
    }
    if (STATE.period === 'quarter') return k.replace('-Q', ' Q');
    return k + '년';
  });

  document.getElementById('trendSub').textContent =
    STATE.period === 'month'
      ? (STATE.fromMonth && STATE.toMonth
          ? STATE.fromMonth + ' ~ ' + STATE.toMonth + ' (' + keys.length + '개월)'
          : '최근 12개월')
    : STATE.period === 'quarter' ? '최근 8분기'
    : '최근 5년';

  var ctx = document.getElementById('trendChart');
  if (STATE.charts.trend) STATE.charts.trend.destroy();

  STATE.charts.trend = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '평가 건수',
        data: keys.map(function (k) { return counts[k]; }),
        backgroundColor: COLOR_REFINE + 'cc',
        borderColor: COLOR_REFINE,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

/* ── 차트 2: 재료별 Top 8 ────────────────────────────────────────────── */
function renderMaterialChart() {
  // 재료 차트는 항상 전체 재료 기준 (재료 필터는 무시 — Top 비교가 핵심)
  // 월 범위가 설정된 월별 모드면 그 범위, 아니면 최근 N
  var keys, subText;
  if (STATE.period === 'month') {
    keys = monthRangeKeys();
    subText = (STATE.fromMonth && STATE.toMonth)
      ? STATE.fromMonth + ' ~ ' + STATE.toMonth
      : '최근 12개월';
  } else if (STATE.period === 'quarter') {
    keys = lastNKeys('quarter', 4);
    subText = '최근 4분기';
  } else {
    keys = lastNKeys('year', 3);
    subText = '최근 3년';
  }
  var keySet = {};
  keys.forEach(function (k) { keySet[k] = true; });

  var counts = {};
  STATE.items.forEach(function (it) {
    if (!isTargetDept(it)) return;
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

  document.getElementById('materialSub').textContent = subText;

  var ctx = document.getElementById('materialChart');
  if (STATE.charts.material) STATE.charts.material.destroy();

  if (entries.length === 0) {
    drawEmptyChart(ctx, '데이터 없음');
    return;
  }

  // 선택된 재료는 강조
  var bgColors = entries.map(function (e) {
    return (STATE.material && e[0] === STATE.material) ? BRAND : '#9333ea';
  });

  STATE.charts.material = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(function (e) { return e[0]; }),
      datasets: [{
        label: '평가 건수',
        data: entries.map(function (e) { return e[1]; }),
        backgroundColor: bgColors,
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
    if (!isTargetDept(item)) return;
    if (STATE.material && (item.material || '').trim() !== STATE.material) return;
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

/* 특정 LT 레벨의 절대값(refHr, sampleHr) 추출 — 신 포맷 levels[lv] 우선 */
function extractLevelHrs(result, level) {
  if (!result || !result.lt || !level) return null;
  var lt = result.lt;
  if (lt.levels && lt.levels[level]) {
    var lv = lt.levels[level];
    if (lv.refHr != null || lv.sampleHr != null) {
      return { refHr: lv.refHr, sampleHr: lv.sampleHr, pct: lv.pct };
    }
  }
  // 구 포맷: lt.level이 일치하면 사용
  if (lt.level == level && (lt.refHr != null || lt.sampleHr != null)) {
    return { refHr: lt.refHr, sampleHr: lt.sampleHr, pct: lt.pct };
  }
  return null;
}

/* 데이터에 등장하는 모든 LT 레벨 + 빈도 (높은 순) */
function listAvailableLevels() {
  var counts = {};
  collectResults().forEach(function (r) {
    var lt = r.result.lt;
    if (!lt) return;
    if (lt.levels) {
      Object.keys(lt.levels).forEach(function (lv) {
        var n = parseInt(lv, 10);
        if (!isNaN(n)) counts[n] = (counts[n] || 0) + 1;
      });
    } else if (lt.level) {
      counts[lt.level] = (counts[lt.level] || 0) + 1;
    }
  });
  return Object.keys(counts)
    .map(function (l) { return { level: parseInt(l, 10), count: counts[l] }; })
    .sort(function (a, b) { return b.level - a.level; });
}

/* auto 모드일 때 가장 빈도 높은 레벨 반환 */
function resolveLtLevel() {
  if (STATE.ltLevel !== 'auto') return parseInt(STATE.ltLevel, 10);
  var avail = listAvailableLevels();
  if (avail.length === 0) return null;
  // 가장 많이 등장한 레벨
  var top = avail.slice().sort(function (a, b) { return b.count - a.count; })[0];
  return top.level;
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

/* ── 차트 6: LT 절대값 추이 (line) ───────────────────────────────────── */
function renderLtAbsChart() {
  var levelTag = document.getElementById('ltAbsLevelTag');
  var sub = document.getElementById('ltAbsSub');
  var ctx = document.getElementById('ltAbsChart');
  if (STATE.charts.ltAbs) STATE.charts.ltAbs.destroy();

  var level = resolveLtLevel();
  if (!level) {
    levelTag.textContent = '—';
    sub.textContent = 'OLED 결과 없음';
    drawEmptyChart(ctx, 'OLED 결과 없음');
    return;
  }

  levelTag.textContent = 'LT' + level;
  var modeLabel = STATE.ltLevel === 'auto' ? ' (자동)' : '';
  var matLabel  = STATE.material ? ' · ' + STATE.material : '';
  sub.textContent = '평가일순 · REF / SAMPLE 시간(hr)' + modeLabel + matLabel;

  // 데이터 수집: 재료 필터 적용, 선택 레벨에 데이터 있는 것만
  var rows = collectResults().filter(function (r) {
    if (!r.result.savedAt) return false;
    return !!extractLevelHrs(r.result, level);
  });
  rows.sort(function (a, b) {
    return (a.result.savedAt || '').localeCompare(b.result.savedAt || '');
  });

  if (rows.length === 0) {
    drawEmptyChart(ctx, '선택 레벨에 해당하는 결과 없음');
    return;
  }

  var labels = rows.map(function (r) {
    var lot = (r.item.lot || r.item.material || '—');
    return r.result.savedAt + (lot ? '\n' + lot : '');
  });
  var refData    = rows.map(function (r) { return extractLevelHrs(r.result, level).refHr;    });
  var sampleData = rows.map(function (r) { return extractLevelHrs(r.result, level).sampleHr; });

  STATE.charts.ltAbs = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'REF (' + level + '%)',
          data: refData,
          borderColor: '#9ca3af',
          backgroundColor: '#9ca3af',
          borderWidth: 2,
          borderDash: [5, 4],
          pointRadius: 4,
          tension: 0.2,
        },
        {
          label: 'SAMPLE (' + level + '%)',
          data: sampleData,
          borderColor: BRAND,
          backgroundColor: BRAND_BG,
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: BRAND,
          tension: 0.2,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 12, padding: 12 } },
        tooltip: {
          callbacks: {
            title: function (items) {
              if (!items.length) return '';
              var idx = items[0].dataIndex;
              var r   = rows[idx];
              return r.result.savedAt + ' · ' + (r.item.material || '') + (r.item.lot ? ' / ' + r.item.lot : '');
            },
            label: function (item) {
              return item.dataset.label + ': ' + (item.parsed.y != null ? item.parsed.y.toFixed(1) + ' hr' : '—');
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, title: { display: true, text: '시간 (hr)' } },
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
  // 합성생산 제외 + 미완료. transferDate 없어도 표시 (D+N만 비움)
  var items = filteredItems().filter(function (it) {
    return !it.completed;
  });

  // 이관일 오래된 순 (D+N 큰 순), 이관일 없는 항목은 뒤로
  var today = new Date();
  items.forEach(function (it) {
    var d = parseDate(it.transferDate);
    it._dn = d ? Math.floor((today - d) / 86400000) : null;
  });
  items.sort(function (a, b) {
    if (a._dn === null && b._dn === null) return 0;
    if (a._dn === null) return 1;
    if (b._dn === null) return -1;
    return b._dn - a._dn;
  });
  items = items.slice(0, 30);

  var box = document.getElementById('ongoingList');
  var label = STATE.material ? ('미완료 ' + STATE.material) : '미완료 (합성생산 제외)';
  document.getElementById('ongoingSub').textContent = label + ' · ' + items.length + '건';

  if (items.length === 0) {
    box.innerHTML = '<div class="empty-state">진행 중인 항목이 없습니다.</div>';
    return;
  }

  box.innerHTML = '';
  items.forEach(function (it) {
    var row = document.createElement('div');
    var cls = 'ongoing-row';
    if (it.urgent) cls += ' is-urgent';
    if (it._dn !== null && it._dn >= 14) cls += ' is-overdue';
    row.className = cls;

    var matBlock = document.createElement('div');
    matBlock.innerHTML =
      '<div class="ongoing-mat">' + (it.urgent ? '⚡ ' : '') + esc(it.material || '(미입력)') + '</div>' +
      (it.lot ? '<div class="ongoing-lot">' + esc(it.lot) + '</div>' : '');

    var meta = document.createElement('div');
    meta.className = 'ongoing-meta';
    var dnCls = 'ongoing-dn';
    var dnLabel;
    if (it._dn === null) {
      dnLabel = '날짜 미정';
    } else {
      if (it._dn >= 14) dnCls += ' dn-danger';
      else if (it._dn >= 7) dnCls += ' dn-alert';
      dnLabel = it._dn === 0 ? 'D+0' : (it._dn > 0 ? 'D+' + it._dn : 'D' + it._dn);
    }
    meta.innerHTML =
      '<span class="' + dnCls + '">' + dnLabel + '</span>' +
      '<span class="ongoing-date">' + (it.transferDate || '—') + '</span>';

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
  if (p > 105) return 'pct-excellent';
  if (p >= 95)  return 'pct-good';
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
  renderLtAbsChart();
  renderLtLevelChart();
  renderLtPctChart();
  renderEffRatioChart();
  renderOngoingList();
  renderRecentResults();
}

/* ── 컨트롤 바인딩 ───────────────────────────────────────────────────── */
function bindControls() {
  // 기간 토글 (월/분기/년)
  document.querySelectorAll('.seg-btn[data-period]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.seg-btn[data-period]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      STATE.period = btn.dataset.period;
      updateMonthRangeVisibility();
      renderAll();
    });
  });

  // 새로고침
  document.getElementById('btnRefresh').addEventListener('click', renderAll);

  // 월 범위 input
  var fromEl = document.getElementById('fromMonth');
  var toEl   = document.getElementById('toMonth');
  fromEl.addEventListener('change', function () {
    STATE.fromMonth = fromEl.value || null;
    renderAll();
  });
  toEl.addEventListener('change', function () {
    STATE.toMonth = toEl.value || null;
    renderAll();
  });

  // LT 레벨 셀렉트
  document.getElementById('ltLevelSelect').addEventListener('change', function (e) {
    STATE.ltLevel = e.target.value;
    renderLtAbsChart();
  });

  // 재료 검색 드롭다운
  bindMaterialDropdown();
}

/* 월 범위 input 표시/숨김 */
function updateMonthRangeVisibility() {
  var wrap = document.getElementById('monthRangeWrap');
  if (STATE.period === 'month') wrap.classList.remove('is-hidden');
  else wrap.classList.add('is-hidden');
}

/* 월 범위 input 기본값 세팅 (최근 12개월) */
function initMonthRangeDefaults() {
  var fromEl = document.getElementById('fromMonth');
  var toEl   = document.getElementById('toMonth');
  if (fromEl.value || toEl.value) return; // 사용자가 이미 설정함

  var now = new Date();
  var to  = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var from_ = new Date(now);
  from_.setMonth(from_.getMonth() - 11);
  var from = from_.getFullYear() + '-' + String(from_.getMonth() + 1).padStart(2, '0');
  fromEl.value = from;
  toEl.value   = to;
  STATE.fromMonth = from;
  STATE.toMonth   = to;
}

/* ── 재료 드롭다운 ──────────────────────────────────────────────────── */
function bindMaterialDropdown() {
  var input = document.getElementById('materialSearch');
  var dd    = document.getElementById('materialDropdown');
  var clear = document.getElementById('materialClear');

  function open()  { dd.classList.add('is-open'); render(input.value); }
  function close() { dd.classList.remove('is-open'); }

  input.addEventListener('focus', open);
  input.addEventListener('input', function () {
    open();
    clear.style.display = input.value ? '' : 'none';
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { input.blur(); close(); }
  });

  clear.addEventListener('click', function () {
    input.value = '';
    clear.style.display = 'none';
    STATE.material = null;
    render('');
    renderAll();
    input.focus();
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.ac-wrap')) close();
  });

  function render(q) {
    var list = listMaterials(q);
    if (list.length === 0) {
      dd.innerHTML = '<div class="ac-empty">일치하는 재료 없음</div>';
      return;
    }
    var html = '<div class="ac-item ac-all" data-mat="">전체 재료</div>';
    html += list.map(function (m) {
      return '<div class="ac-item" data-mat="' + esc(m.name) + '">' +
             '<span>' + esc(m.name) + '</span>' +
             '<span class="ac-item-count">' + m.count + '</span>' +
             '</div>';
    }).join('');
    dd.innerHTML = html;
    dd.querySelectorAll('.ac-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var mat = el.dataset.mat;
        STATE.material = mat || null;
        input.value = mat || '';
        clear.style.display = mat ? '' : 'none';
        close();
        renderAll();
      });
    });
  }

  // 외부에서 데이터 변경 시 호출
  window._dashRefreshMatList = function () {
    if (dd.classList.contains('is-open')) render(input.value);
  };
}

/* 재료 리스트 (검색어 q로 필터, 빈도 내림차순) */
function listMaterials(q) {
  var counts = {};
  STATE.items.forEach(function (it) {
    if (!isTargetDept(it)) return;
    var m = (it.material || '').trim();
    if (!m) return;
    counts[m] = (counts[m] || 0) + 1;
  });
  var arr = Object.keys(counts).map(function (m) { return { name: m, count: counts[m] }; });
  if (q) {
    var qq = q.toLowerCase();
    arr = arr.filter(function (m) { return m.name.toLowerCase().indexOf(qq) >= 0; });
  }
  arr.sort(function (a, b) {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });
  return arr.slice(0, 50);
}

/* LT 레벨 셀렉트 옵션 갱신 */
function refreshLevelSelect() {
  var sel = document.getElementById('ltLevelSelect');
  var avail = listAvailableLevels();
  var prev = STATE.ltLevel;
  var html = '<option value="auto">자동 (가장 많은 레벨)</option>';
  avail.forEach(function (l) {
    html += '<option value="' + l.level + '">LT' + l.level + ' (' + l.count + '건)</option>';
  });
  sel.innerHTML = html;
  // 기존 선택 유지
  if (prev !== 'auto') {
    var match = Array.prototype.find.call(sel.options, function (o) { return o.value === String(prev); });
    if (match) sel.value = String(prev);
    else { sel.value = 'auto'; STATE.ltLevel = 'auto'; }
  }
}

/* ── 데이터 로드 (실시간 구독) ──────────────────────────────────────── */
var _renderTimer = null;
function scheduleRender() {
  if (_renderTimer) clearTimeout(_renderTimer);
  _renderTimer = setTimeout(renderAll, 60);
}

/* ── 실시간 부착 (error cb + backoff 재부착) ─────────────────────────
   PERMISSION_DENIED가 silent하게 listener를 죽이는 것을 방지.
   인증 race 상황(IDB 하이드레이션 전 listen)에서 cancel 시
   QA_whenAuthReady로 대기 후 재부착.
   첫 snapshot 도착 시 #loadingOverlay 제거 (items 기준).
   backoff 500ms → 1s → 2s → 4s → 8s.
──────────────────────────────────────────────────────────────────── */
var _itemsRetryMs   = 500;
var _resultsRetryMs = 500;
var _itemsT0 = null;
var _itemsStuckTimer = null;

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

function _clearItemsStuckTimer() {
  if (_itemsStuckTimer) { clearTimeout(_itemsStuckTimer); _itemsStuckTimer = null; }
}

function attachItems() {
  _itemsT0 = Date.now();
  console.log('[dashboard] items: .on(value) 부착');
  _clearItemsStuckTimer();
  _itemsStuckTimer = setTimeout(function () {
    console.warn('[dashboard] items: 30s 응답 없음, stuck UI 표시');
    _setLoadingState('stuck', '연결이 지연되고 있습니다');
  }, 30000);

  DB_REF.on('value', function (snap) {
    _clearItemsStuckTimer();
    console.log('[dashboard] items: 첫 snapshot 도착', { ms: Date.now() - _itemsT0 });
    _setLoadingState('hide');
    _itemsRetryMs = 500;
    var val = snap.val();
    var arr = [];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      arr = Object.values(val).filter(function (v) { return v && v.id; });
    } else if (Array.isArray(val)) {
      arr = val.filter(Boolean);
    }
    STATE.items = arr;
    if (window._dashRefreshMatList) window._dashRefreshMatList();
    scheduleRender();
  }, function (err) {
    _clearItemsStuckTimer();
    console.warn('[dashboard] items listener cancelled:', err && err.code, { ms: Date.now() - _itemsT0 });
    _setLoadingState('retry', '연결 재시도 중...');
    DB_REF.off('value');
    var wait = Math.min(_itemsRetryMs, 8000);
    _itemsRetryMs = Math.min(_itemsRetryMs * 2, 8000);
    setTimeout(function () { QA_whenAuthReady(attachItems); }, wait);
  });
}

window._dashboardManualRetry = function () {
  console.log('[dashboard] 사용자 수동 재시도');
  _clearItemsStuckTimer();
  _setLoadingState('loading', '데이터 로딩 중...');
  try { DB_REF.off('value'); } catch (e) {}
  try { RESULT_REF.off('value'); } catch (e) {}
  QA_whenAuthReady(function () {
    attachItems();
    attachResults();
  });
};

function attachResults() {
  RESULT_REF.on('value', function (snap) {
    _resultsRetryMs = 500;
    STATE.results = snap.val() || {};
    refreshLevelSelect();
    scheduleRender();
  }, function (err) {
    console.warn('[dashboard] results listener cancelled:', err && err.code);
    RESULT_REF.off('value');
    var wait = Math.min(_resultsRetryMs, 8000);
    _resultsRetryMs = Math.min(_resultsRetryMs * 2, 8000);
    setTimeout(function () { QA_whenAuthReady(attachResults); }, wait);
  });
}

function startSync() {
  attachItems();
  attachResults();
}

/* ── 진입 ──────────────────────────────────────────────────────────────
   Auth ready 까지 기다린 뒤 sync 시작 — iframe IDB 하이드레이션 race 방지.
──────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  bindControls();
  initMonthRangeDefaults();
  updateMonthRangeVisibility();
  refreshLevelSelect();
  QA_whenAuthReady(startSync);
});

})();
