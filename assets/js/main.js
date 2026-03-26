/**
 * QA Manager Portal - main.js
 * 탭 버튼과 iframe을 동적으로 렌더링합니다.
 */

// ── 앱 목록 (탭 추가/수정은 이 배열만 편집하면 됩니다) ──────────────────────
const apps = [
  {
    id:          'oled',
    label:       'OLED IVL & LT 분석기',
    icon:        '📊',
    badge:       null,
    src:         './apps/01_oled_ivl_lt/index.html',
    loaderText:  'OLED IVL & LT 분석기 로딩 중...',
  },
  {
    id:          'hplc',
    label:       'HPLC/DSC Report 자동생성',
    icon:        '🧪',
    badge:       null,
    src:         './apps/03_hplc_dsc/index.html',
    loaderText:  'HPLC/DSC Report 자동생성 로딩 중...',
  },
  {
    id:          'lgd',
    label:       'LGD 사전심사자료 자동화',
    icon:        '📋',
    badge:       'GAS',
    src:         'https://script.google.com/macros/s/AKfycbxv4hTJIlnNUr0qjmfAdHrV4WrjLfPz5MkiW3Te4BIWj5iLO6_4btqs82huib6U4Wsq/exec',
    loaderText:  'LGD 사전심사자료 자동화 로딩 중...',
    sandbox:     'allow-scripts allow-forms allow-same-origin allow-popups allow-downloads',
  },
  {
    id:          'sdc',
    label:       'SDC 사전심사자료 자동화',
    icon:        '📄',
    badge:       'GAS',
    src:         './apps/04_sdc_eval/index.html',
    loaderText:  'SDC 사전심사자료 자동화 로딩 중...',
  },
  {
    id:          'cpl',
    label:       '소재 Lot 이력 & TREND 분석',
    icon:        '🏭',
    badge:       'NEW',
    src:         './apps/05_cpl_quality/index.html',
    loaderText:  '소재 Lot 흐름 & 품질 TREND 분석기 로딩 중...',
  },
];
// ─────────────────────────────────────────────────────────────────────────────

/**
 * apps 배열을 순회하여 탭 버튼과 iframe 래퍼를 DOM에 삽입합니다.
 * index.html의 .tab-nav 와 .frame-area 요소에 의존합니다.
 */
function renderApps() {
  const nav       = document.querySelector('.tab-nav');
  const frameArea = document.querySelector('.frame-area');

  apps.forEach(function(app, index) {
    var isFirst = index === 0;

    // ── 탭 버튼 ──────────────────────────────────────────────────────────────
    var btn = document.createElement('button');
    btn.className = 'tab-btn' + (isFirst ? ' active' : '');
    btn.dataset.appId = app.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isFirst ? 'true' : 'false');
    btn.setAttribute('aria-controls', 'tab-' + app.id);
    btn.id = 'tabbtn-' + app.id;

    var iconSpan = document.createElement('span');
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = app.icon;
    btn.appendChild(iconSpan);

    btn.appendChild(document.createTextNode(' ' + app.label));

    if (app.badge) {
      var badge = document.createElement('span');
      badge.className = 'tab-badge';
      badge.textContent = app.badge;
      btn.appendChild(document.createTextNode(' '));
      btn.appendChild(badge);
    }

    btn.addEventListener('click', function() { switchTab(app.id, btn); });
    nav.appendChild(btn);

    // ── iframe 래퍼 ──────────────────────────────────────────────────────────
    var wrap = document.createElement('div');
    wrap.className = 'frame-wrap' + (isFirst ? ' active' : '');
    wrap.id = 'tab-' + app.id;
    wrap.setAttribute('role', 'tabpanel');
    wrap.setAttribute('aria-labelledby', 'tabbtn-' + app.id);

    var loader = document.createElement('div');
    loader.className = 'loader';
    loader.id = 'loader-' + app.id;
    loader.innerHTML =
      '<div class="spinner"></div>' +
      '<div class="loader-text">' + app.loaderText + '</div>';

    var iframe = document.createElement('iframe');
    iframe.id    = 'iframe-' + app.id;
    iframe.src   = app.src;
    iframe.title = app.label;
    if (app.sandbox) { iframe.setAttribute('sandbox', app.sandbox); }
    iframe.addEventListener('load', function() { hideLoader(app.id); });

    wrap.appendChild(loader);
    wrap.appendChild(iframe);
    frameArea.appendChild(wrap);
  });
}

// ── 탭 전환 ──────────────────────────────────────────────────────────────────
function switchTab(id, btn) {
  document.querySelectorAll('.tab-btn').forEach(function(b) {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.frame-wrap').forEach(function(w) {
    w.classList.remove('active');
  });
  btn.classList.add('active');
  btn.setAttribute('aria-selected', 'true');
  document.getElementById('tab-' + id).classList.add('active');
}

// ── 로더 숨기기 ──────────────────────────────────────────────────────────────
function hideLoader(id) {
  var el = document.getElementById('loader-' + id);
  if (el) el.classList.add('hidden');
}

// ── 초기화 ───────────────────────────────────────────────────────────────────
(function init() {
  renderApps();

  // 브랜드 버튼 — 페이지 새로고침
  var brandBtn = document.getElementById('brandBtn');
  if (brandBtn) {
    brandBtn.addEventListener('click', function() { location.reload(); });
    brandBtn.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.reload(); }
    });
  }

  // 탭 키보드 내비게이션 — 위/아래 화살표로 탭 전환
  document.querySelector('.tab-nav').addEventListener('keydown', function(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    var btns = Array.from(document.querySelectorAll('.tab-btn'));
    var current = btns.findIndex(function(b) { return b.classList.contains('active'); });
    var next = e.key === 'ArrowDown'
      ? (current + 1) % btns.length
      : (current - 1 + btns.length) % btns.length;
    btns[next].focus();
    btns[next].click();
  });
})();
