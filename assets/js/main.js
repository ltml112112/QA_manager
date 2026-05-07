/**
 * QA Manager Portal - main.js
 * 탭 버튼과 iframe을 동적으로 렌더링합니다.
 * 역할(role): 'admin' = 전체 탭, 'user' = locked 아닌 탭만
 */

// ── 앱 목록 (탭 추가/수정은 이 배열만 편집하면 됩니다) ──────────────────────
var apps = [
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
  {
    id:          'lcms',
    group:       '자동화',
    label:       'LC/MS Report 변환기',
    icon:        '·',
    badge:       null,
    src:         './apps/16_lcms_converter/index.html',
    loaderText:  'LC/MS Report 변환기 로딩 중...',
    locked:      true,
  },

  // ── 측정 데이터 관리 ───────────────────────────────────────────────────────
  {
    id:          'hplc_data',
    group:       '측정 데이터 관리',
    label:       'HPLC 데이터 입력',
    icon:        '·',
    badge:       null,
    src:         './apps/18_hplc_data/index.html',
    loaderText:  'HPLC 데이터 입력 로딩 중...',
    locked:      true,
    wip:         true,
  },
  {
    id:          'dsc_tga',
    group:       '측정 데이터 관리',
    label:       'DSC / TGA 데이터 입력',
    icon:        '·',
    badge:       null,
    src:         './apps/19_dsc_tga/index.html',
    loaderText:  'DSC / TGA 데이터 입력 로딩 중...',
    locked:      true,
    wip:         true,
  },
  {
    id:          'lot_flow',
    group:       '측정 데이터 관리',
    label:       'Lot 흐름도 관리',
    icon:        '·',
    badge:       null,
    src:         './apps/20_lot_flow/index.html',
    loaderText:  'Lot 흐름도 관리 로딩 중...',
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
  {
    id:          'coa_dev',
    group:       '품질 데이터',
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
    group:       '품질 데이터',
    label:       'COA 생성 — 양산용',
    icon:        '·',
    badge:       null,
    src:         './apps/08_coa_prod/index.html',
    loaderText:  'COA 생성(양산) 로딩 중...',
    locked:      true,
    wip:         true,
  },

  // ── 공정 이력 관리 ─────────────────────────────────────────────────────────
  {
    id:          'pn_flow',
    group:       '공정 이력 관리',
    label:       'P/N 공정 Flow 관리',
    icon:        '·',
    badge:       null,
    src:         './apps/15_pn_flow/index.html',
    loaderText:  'P/N 공정 Flow 관리 로딩 중...',
    locked:      true,
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
    id:          'roadmap',
    group:       '로드맵',
    label:       '포털 개발 로드맵',
    icon:        '·',
    badge:       null,
    src:         './apps/17_roadmap/index.html',
    loaderText:  '로드맵 로딩 중...',
    locked:      true,
  },
];
// ─────────────────────────────────────────────────────────────────────────────

// 그룹 내 모든 앱이 사용자에게 숨겨지는지 확인
function _isGroupHiddenForRole(groupName, isAdmin) {
  if (isAdmin) return false;
  return apps.filter(function (a) { return a.group === groupName; })
             .every(function (a) { return !!a.locked; });
}

/**
 * apps 배열을 순회하여 탭 버튼과 iframe 래퍼를 DOM에 삽입합니다.
 * role: 'admin' → locked 탭 포함 전체 표시
 * role: 'user'  → locked 탭 숨김
 */
function renderApps(role) {
  var nav       = document.querySelector('.tab-nav');
  var frameArea = document.querySelector('.frame-area');
  // 이미 렌더링된 경우 중복 방지 (initPortal이 두 번 호출되어도 탭이 두 배가 되지 않음)
  if (nav.querySelector('.tab-btn')) return;
  var isAdmin   = (role === 'admin');
  var firstVisible = true;
  var lastGroup = null;

  apps.forEach(function (app) {
    var hidden = app.locked && !isAdmin;  // admin이면 locked 탭도 표시

    // ── 그룹 헤더 ──────────────────────────────────────────────────────────
    if (app.group && app.group !== lastGroup) {
      lastGroup = app.group;
      // 그룹 내 모든 앱이 숨겨지는 경우 헤더도 생성하지 않음
      if (!_isGroupHiddenForRole(app.group, isAdmin)) {
        var grpHdr = document.createElement('div');
        grpHdr.className   = 'tab-group-header';
        grpHdr.id          = 'grphdr-' + app.group;
        grpHdr.textContent = app.group;
        // 그룹 내 모든 앱이 locked인 경우 게스트 뷰 토글 시 헤더도 숨김
        if (apps.filter(function(a){return a.group===app.group;}).every(function(a){return !!a.locked;})) {
          grpHdr.dataset.allLocked = 'true';
        }
        nav.appendChild(grpHdr);
      }
    }

    // hidden 앱은 DOM 생성 자체를 skip — F12로도 URL이 보이지 않음
    if (hidden) return;

    var isFirst = firstVisible;
    if (isFirst) firstVisible = false;

    // ── 탭 버튼 ────────────────────────────────────────────────────────────
    var btn = document.createElement('button');
    btn.className = 'tab-btn' + (isFirst ? ' active' : '') + (app.wip ? ' tab-wip' : '');
    btn.dataset.appId = app.id;
    if (isAdmin && app.locked) btn.dataset.locked = 'true';  // 게스트 뷰 토글용
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isFirst ? 'true' : 'false');
    btn.setAttribute('aria-controls', 'tab-' + app.id);
    btn.id = 'tabbtn-' + app.id;

    var iconSpan = document.createElement('span');
    iconSpan.setAttribute('aria-hidden', 'true');
    iconSpan.textContent = app.icon;
    btn.appendChild(iconSpan);

    var labelSpan = document.createElement('span');
    labelSpan.className   = 'tab-label';
    labelSpan.textContent = app.label;
    btn.appendChild(document.createTextNode(' '));
    btn.appendChild(labelSpan);

    if (app.badge) {
      var badge = document.createElement('span');
      badge.className   = 'tab-badge';
      badge.textContent = app.badge;
      btn.appendChild(document.createTextNode(' '));
      btn.appendChild(badge);
    }

    btn.addEventListener('click', function () { switchTab(app.id, btn); });
    nav.appendChild(btn);

    // ── iframe 래퍼 ────────────────────────────────────────────────────────
    var wrap = document.createElement('div');
    wrap.className = 'frame-wrap' + (isFirst ? ' active' : '');
    wrap.id        = 'tab-' + app.id;
    if (isAdmin && app.locked) wrap.dataset.locked = 'true';  // 게스트 뷰 토글용
    wrap.setAttribute('role', 'tabpanel');
    wrap.setAttribute('aria-labelledby', 'tabbtn-' + app.id);

    var loader = document.createElement('div');
    loader.className = 'loader';
    loader.id        = 'loader-' + app.id;
    loader.innerHTML =
      '<div class="spinner"></div>' +
      '<div class="loader-text">' + app.loaderText + '</div>';

    var iframe = document.createElement('iframe');
    iframe.id    = 'iframe-' + app.id;
    iframe.title = app.label;
    if (app.sandbox) { iframe.setAttribute('sandbox', app.sandbox); }
    iframe.addEventListener('load', function () { hideLoader(app.id); });
    iframe.src = app.src;

    wrap.appendChild(loader);
    wrap.appendChild(iframe);
    frameArea.appendChild(wrap);
  });
}

// ── 탭 전환 ──────────────────────────────────────────────────────────────────
function switchTab(id, btn) {
  document.querySelectorAll('.tab-btn').forEach(function (b) {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.frame-wrap').forEach(function (w) {
    w.classList.remove('active');
  });
  btn.classList.add('active');
  btn.setAttribute('aria-selected', 'true');
  document.getElementById('tab-' + id).classList.add('active');

  // 활성화된 iframe에 탭 전환 알림 — 리스너가 죽어있으면 재연결 기회
  var iframe = document.getElementById('iframe-' + id);
  if (iframe && iframe.contentWindow) {
    try { iframe.contentWindow.postMessage({ type: 'tabActivated' }, '*'); } catch (e) {}
  }
}

// ── 로더 숨기기 ──────────────────────────────────────────────────────────────
function hideLoader(id) {
  var el = document.getElementById('loader-' + id);
  if (el) el.classList.add('hidden');
}

// ── 게스트 뷰 토글 (관리자 전용) ─────────────────────────────────────────────
window.toggleGuestView = function (guestOn) {
  // locked 탭 버튼 표시/숨김
  document.querySelectorAll('.tab-btn[data-locked="true"]').forEach(function (b) {
    b.style.display = guestOn ? 'none' : '';
  });
  // locked iframe 래퍼 표시/숨김
  document.querySelectorAll('.frame-wrap[data-locked="true"]').forEach(function (w) {
    w.style.display = guestOn ? 'none' : '';
  });
  // 그룹 내 전체가 locked인 그룹 헤더 표시/숨김
  document.querySelectorAll('.tab-group-header[data-all-locked="true"]').forEach(function (h) {
    h.style.display = guestOn ? 'none' : '';
  });
  // 현재 활성 탭이 locked이면 첫 번째 비잠금 탭으로 전환
  if (guestOn) {
    var activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn && activeBtn.dataset.locked === 'true') {
      var first = document.querySelector('.tab-btn:not([data-locked="true"])');
      if (first) first.click();
    }
  }
};

// ── 포털 초기화 — index.html의 Firebase Auth 콜백이 역할 확인 후 호출 ────────
window.initPortal = function (role) {
  renderApps(role);

  // 브랜드 버튼 — 페이지 새로고침
  var brandBtn = document.getElementById('brandBtn');
  if (brandBtn) {
    brandBtn.addEventListener('click', function () { location.reload(); });
    brandBtn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.reload(); }
    });
  }

  // 탭 키보드 내비게이션 — 위/아래 화살표로 탭 전환
  document.querySelector('.tab-nav').addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    var btns = Array.from(document.querySelectorAll('.tab-btn')).filter(function (b) {
      return b.style.display !== 'none';
    });
    var current = btns.findIndex(function (b) { return b.classList.contains('active'); });
    var next = e.key === 'ArrowDown'
      ? (current + 1) % btns.length
      : (current - 1 + btns.length) % btns.length;
    btns[next].focus();
    btns[next].click();
  });
};
