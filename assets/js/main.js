/**
 * QA Manager Portal - main.js
 * 탭 버튼과 iframe을 동적으로 렌더링합니다.
 */

// ── 앱 목록 (탭 추가/수정은 이 배열만 편집하면 됩니다) ──────────────────────
const apps = [
  // ── 소자평가 ────────────────────────────────────────────────────────────────
  {
    id:          'oled',
    group:       '소자평가',
    label:       'OLED IVL & LT 분석',
    icon:        '·',
    badge:       null,
    src:         './apps/01_oled_ivl_lt/index.html',
    loaderText:  'OLED IVL & LT 분석 로딩 중...',
  },
  {
    id:          'lotschedule',
    group:       '소자평가',
    label:       '소자평가 Lot 일정 관리',
    icon:        '·',
    badge:       null,
    src:         './apps/06_lot_schedule/index.html',
    loaderText:  '소자평가 Lot 일정 관리 로딩 중...',
  },

  // ── 자동화 ─────────────────────────────────────────────────────────────────
  {
    id:          'hplc',
    group:       '자동화',
    label:       'HPLC/DSC Report 자동화',
    icon:        '·',
    badge:       null,
    src:         './apps/03_hplc_dsc/index.html',
    loaderText:  'HPLC/DSC Report 자동화 로딩 중...',
    locked:      true,
  },
  {
    id:          'lgd',
    group:       '자동화',
    label:       'LGD 사전심사자료 자동화',
    icon:        '·',
    badge:       null,
    src:         'https://script.google.com/macros/s/AKfycbxv4hTJIlnNUr0qjmfAdHrV4WrjLfPz5MkiW3Te4BIWj5iLO6_4btqs82huib6U4Wsq/exec',
    loaderText:  'LGD 사전심사자료 자동화 로딩 중...',
    sandbox:     'allow-scripts allow-forms allow-same-origin allow-popups allow-downloads',
    locked:      true,
  },
  {
    id:          'sdc',
    group:       '자동화',
    label:       'SDC 사전심사자료 자동화',
    icon:        '·',
    badge:       null,
    src:         './apps/04_sdc_eval/index.html',
    loaderText:  'SDC 사전심사자료 자동화 로딩 중...',
    locked:      true,
  },
  {
    id:          'coa_dev',
    group:       '자동화',
    label:       'COA 생성 — 개발용',
    icon:        '·',
    badge:       null,
    src:         './apps/07_coa_dev/index.html',
    loaderText:  'COA 생성(개발) 로딩 중...',
    locked:      true,
    wip:         true,
  },
  {
    id:          'coa_prod',
    group:       '자동화',
    label:       'COA 생성 — 양산용',
    icon:        '·',
    badge:       null,
    src:         './apps/08_coa_prod/index.html',
    loaderText:  'COA 생성(양산) 로딩 중...',
    locked:      true,
    wip:         true,
  },
  {
    id:          'ext_code',
    group:       '자동화',
    label:       '외부코드 관리 (고객사별)',
    icon:        '·',
    badge:       null,
    src:         './apps/09_ext_code/index.html',
    loaderText:  '외부코드 관리 로딩 중...',
    locked:      true,
    wip:         true,
  },

  // ── 품질 데이터 ────────────────────────────────────────────────────────────
  {
    id:          'cpl',
    group:       '품질 데이터',
    label:       'Lot 추적관리 & SQC',
    icon:        '·',
    badge:       null,
    src:         './apps/05_cpl_quality/index.html',
    loaderText:  'Lot 추적관리 & SQC 로딩 중...',
    locked:      true,
  },
  {
    id:          'dashboard',
    group:       '품질 데이터',
    label:       '품질 대시보드',
    icon:        '·',
    badge:       null,
    src:         './apps/10_quality_dashboard/index.html',
    loaderText:  '품질 대시보드 로딩 중...',
    locked:      true,
    wip:         true,
  },
  {
    id:          'complaint',
    group:       '품질 데이터',
    label:       '불량·컴플레인 관리',
    icon:        '·',
    badge:       null,
    src:         './apps/11_complaint/index.html',
    loaderText:  '불량·컴플레인 관리 로딩 중...',
    locked:      true,
    wip:         true,
  },

  // ── 제품·소재 관리 ─────────────────────────────────────────────────────────
  {
    id:          'spec_ctq',
    group:       '제품·소재 관리',
    label:       '제품 Spec & CTQ/CTP',
    icon:        '·',
    badge:       null,
    src:         './apps/12_spec_ctq/index.html',
    loaderText:  '제품 Spec & CTQ/CTP 로딩 중...',
    locked:      true,
    wip:         true,
  },
  {
    id:          'iqc',
    group:       '제품·소재 관리',
    label:       '원자재 입고검사 (IQC)',
    icon:        '·',
    badge:       null,
    src:         './apps/13_iqc/index.html',
    loaderText:  '원자재 입고검사 로딩 중...',
    locked:      true,
    wip:         true,
  },

  // ── 문서 관리 ──────────────────────────────────────────────────────────────
  {
    id:          'sys_docs',
    group:       '문서 관리',
    label:       '시스템 문서 & SOP',
    icon:        '·',
    badge:       null,
    src:         './apps/14_sys_docs/index.html',
    loaderText:  '시스템 문서 & SOP 로딩 중...',
    locked:      true,
  },
  {
    id:          'calibration',
    group:       '문서 관리',
    label:       '측정기기 교정 일정',
    icon:        '·',
    badge:       null,
    src:         './apps/15_calibration/index.html',
    loaderText:  '측정기기 교정 일정 로딩 중...',
    locked:      true,
    wip:         true,
  },
];
// ─────────────────────────────────────────────────────────────────────────────

// ── 잠금 해제 상태 관리 ───────────────────────────────────────────────────────
var _UC = [57, 52, 48, 52, 49, 52]; // '9','4','0','4','1','4'

var _sessionUnlocked = false;

function _isUnlocked() {
  return _sessionUnlocked;
}

function _checkPass(input) {
  var expected = _UC.map(function(c) { return String.fromCharCode(c); }).join('');
  return input === expected;
}

/**
 * apps 배열을 순회하여 탭 버튼과 iframe 래퍼를 DOM에 삽입합니다.
 * index.html의 .tab-nav 와 .frame-area 요소에 의존합니다.
 */
// 그룹 내 모든 앱이 locked인지 확인
function _isGroupAllLocked(groupName) {
  return apps.filter(function(a) { return a.group === groupName; })
             .every(function(a) { return !!a.locked; });
}

function renderApps() {
  var nav       = document.querySelector('.tab-nav');
  var frameArea = document.querySelector('.frame-area');
  var unlocked  = _isUnlocked();
  var firstVisible = true;
  var lastGroup = null;

  apps.forEach(function(app) {
    var hidden   = app.locked && !unlocked;
    var isFirst  = firstVisible && !hidden;
    if (isFirst) firstVisible = false;

    // ── 그룹 헤더 ──────────────────────────────────────────────────────────────
    if (app.group && app.group !== lastGroup) {
      lastGroup = app.group;
      var grpHdr = document.createElement('div');
      grpHdr.className = 'tab-group-header';
      grpHdr.id = 'grphdr-' + app.group;
      grpHdr.textContent = app.group;
      if (_isGroupAllLocked(app.group) && !unlocked) grpHdr.style.display = 'none';
      nav.appendChild(grpHdr);
    }

    // ── 탭 버튼 ──────────────────────────────────────────────────────────────
    var btn = document.createElement('button');
    btn.className = 'tab-btn' + (isFirst ? ' active' : '') + (app.wip ? ' tab-wip' : '');
    btn.dataset.appId = app.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isFirst ? 'true' : 'false');
    btn.setAttribute('aria-controls', 'tab-' + app.id);
    btn.id = 'tabbtn-' + app.id;
    if (hidden) btn.style.display = 'none';

    var iconSpan = document.createElement('span');
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = app.icon;
    btn.appendChild(iconSpan);

    var labelSpan = document.createElement('span');
    labelSpan.className = 'tab-label';
    labelSpan.textContent = app.label;
    btn.appendChild(document.createTextNode(' '));
    btn.appendChild(labelSpan);

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
    if (hidden) wrap.style.display = 'none';

    var loader = document.createElement('div');
    loader.className = 'loader';
    loader.id = 'loader-' + app.id;
    loader.innerHTML =
      '<div class="spinner"></div>' +
      '<div class="loader-text">' + app.loaderText + '</div>';

    var iframe = document.createElement('iframe');
    iframe.id    = 'iframe-' + app.id;
    iframe.title = app.label;
    if (app.sandbox) { iframe.setAttribute('sandbox', app.sandbox); }
    iframe.addEventListener('load', function() { hideLoader(app.id); });

    // 잠긴 탭은 src를 아직 설정하지 않음 (해제 시 설정)
    if (!hidden) {
      iframe.src = app.src;
    }
    iframe.dataset.src = app.src;

    wrap.appendChild(loader);
    wrap.appendChild(iframe);
    frameArea.appendChild(wrap);
  });
}

// ── 잠금 해제 후 탭 표시 ─────────────────────────────────────────────────────
function _revealLockedTabs() {
  // 숨겨진 그룹 헤더 표시
  apps.forEach(function(app) {
    if (!app.group) return;
    var hdr = document.getElementById('grphdr-' + app.group);
    if (hdr) hdr.style.display = '';
  });

  apps.forEach(function(app) {
    if (!app.locked) return;
    var btn  = document.getElementById('tabbtn-' + app.id);
    var wrap = document.getElementById('tab-' + app.id);
    var iframe = document.getElementById('iframe-' + app.id);
    if (btn)  btn.style.display  = '';
    if (wrap) wrap.style.display = '';
    // src가 아직 없으면 이제 로드
    if (iframe && !iframe.src && iframe.dataset.src) {
      iframe.src = iframe.dataset.src;
    }
  });
}

// ── 비밀번호 모달 ─────────────────────────────────────────────────────────────
function _createPassModal() {
  var overlay = document.createElement('div');
  overlay.id = 'pass-overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999',
    'display:flex', 'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.45)', 'backdrop-filter:blur(4px)',
  ].join(';');

  var box = document.createElement('div');
  box.style.cssText = [
    'background:var(--portal-surface)', 'border:1px solid var(--portal-border)',
    'border-radius:14px', 'padding:28px 32px', 'width:300px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.18)',
    'display:flex', 'flex-direction:column', 'gap:14px',
  ].join(';');

  var label = document.createElement('div');
  label.style.cssText = 'font-size:13px;color:var(--portal-text-muted);text-align:center;letter-spacing:0.02em;';
  label.textContent = '접근 코드를 입력하세요';

  var inp = document.createElement('input');
  inp.type = 'password';
  inp.placeholder = '• • • • • •';
  inp.autocomplete = 'off';
  inp.style.cssText = [
    'width:100%', 'padding:10px 14px', 'border-radius:8px',
    'border:1px solid var(--portal-border)', 'background:var(--portal-bg)',
    'color:var(--portal-text)', 'font-size:18px', 'text-align:center',
    'letter-spacing:6px', 'outline:none', 'box-sizing:border-box',
    'transition:border-color .15s',
  ].join(';');

  var err = document.createElement('div');
  err.style.cssText = 'font-size:12px;color:#ef4444;text-align:center;min-height:16px;';

  function _close() {
    overlay.remove();
  }

  function _attempt() {
    if (_checkPass(inp.value.trim())) {
      _sessionUnlocked = true;
      _revealLockedTabs();
      _close();
    } else {
      err.textContent = '코드가 올바르지 않습니다.';
      inp.value = '';
      inp.style.borderColor = '#ef4444';
      setTimeout(function() { inp.style.borderColor = ''; err.textContent = ''; }, 1500);
    }
  }

  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') _attempt();
    if (e.key === 'Escape') _close();
  });

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) _close();
  });

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;';

  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = '취소';
  cancelBtn.style.cssText = [
    'flex:1', 'padding:9px', 'border-radius:8px', 'border:1px solid var(--portal-border)',
    'background:transparent', 'color:var(--portal-text-muted)', 'cursor:pointer',
    'font-size:13px',
  ].join(';');
  cancelBtn.addEventListener('click', _close);

  var confirmBtn = document.createElement('button');
  confirmBtn.textContent = '확인';
  confirmBtn.style.cssText = [
    'flex:1', 'padding:9px', 'border-radius:8px', 'border:none',
    'background:var(--portal-accent)', 'color:#fff', 'cursor:pointer',
    'font-size:13px', 'font-weight:600',
  ].join(';');
  confirmBtn.addEventListener('click', _attempt);

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);

  box.appendChild(label);
  box.appendChild(inp);
  box.appendChild(err);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  setTimeout(function() { inp.focus(); }, 50);
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

  // 가동 중 초록 점 — 잠금 해제 (한 번 해제하면 새로고침해도 유지, 토글 없음)
  var statusDot = document.querySelector('.status-dot');
  if (statusDot) {
    if (_isUnlocked()) {
      _revealLockedTabs();
    } else {
      statusDot.style.cursor = 'pointer';
      statusDot.title = '접근 코드 입력';
      statusDot.addEventListener('click', function() {
        _createPassModal();
      });
    }
  }

  // 탭 키보드 내비게이션 — 위/아래 화살표로 탭 전환
  document.querySelector('.tab-nav').addEventListener('keydown', function(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    var btns = Array.from(document.querySelectorAll('.tab-btn')).filter(function(b) {
      return b.style.display !== 'none';
    });
    var current = btns.findIndex(function(b) { return b.classList.contains('active'); });
    var next = e.key === 'ArrowDown'
      ? (current + 1) % btns.length
      : (current - 1 + btns.length) % btns.length;
    btns[next].focus();
    btns[next].click();
  });
})();
