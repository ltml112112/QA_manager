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
  },
  {
    id:          'sdc',
    label:       'SDC 사전심사자료 자동화',
    icon:        '📄',
    badge:       'GAS',
    src:         './apps/04_sdc_eval/index.html',
    loaderText:  'SDC 사전심사자료 자동화 로딩 중...',
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

    var iconSpan = document.createElement('span');
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
  });
  document.querySelectorAll('.frame-wrap').forEach(function(w) {
    w.classList.remove('active');
  });
  btn.classList.add('active');
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
})();
