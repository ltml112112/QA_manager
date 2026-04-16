/**
 * QA Manager Portal - main.js
 * 탭 버튼과 iframe을 동적으로 렌더링합니다.
 */
(function () {
  'use strict';

  // ── 앱 목록 (탭 추가/수정은 이 배열만 편집하면 됩니다) ────────────────────
  var apps = [
    // ── 소자평가 ──────────────────────────────────────────────────────────────
    {
      id:         'oled',
      group:      '소자평가',
      label:      'OLED IVL & LT 분석',
      icon:       '·',
      badge:      null,
      src:        './apps/01_oled_ivl_lt/index.html',
      loaderText: 'OLED IVL & LT 분석 로딩 중...',
    },
    {
      id:         'lotschedule',
      group:      '소자평가',
      label:      '소자평가 Lot 일정 관리',
      icon:       '·',
      badge:      null,
      src:        './apps/06_lot_schedule/index.html',
      loaderText: '소자평가 Lot 일정 관리 로딩 중...',
    },

    // ── 자동화 ────────────────────────────────────────────────────────────────
    {
      id:         'hplc',
      group:      '자동화',
      label:      'HPLC/DSC Report 자동화',
      icon:       '·',
      badge:      null,
      src:        './apps/03_hplc_dsc/index.html',
      loaderText: 'HPLC/DSC Report 자동화 로딩 중...',
      locked:     true,
    },
    {
      id:         'lgd',
      group:      '자동화',
      label:      'LGD 사전심사자료 자동화',
      icon:       '·',
      badge:      null,
      src:        'https://script.google.com/macros/s/AKfycbxv4hTJIlnNUr0qjmfAdHrV4WrjLfPz5MkiW3Te4BIWj5iLO6_4btqs82huib6U4Wsq/exec',
      loaderText: 'LGD 사전심사자료 자동화 로딩 중...',
      sandbox:    'allow-scripts allow-forms allow-same-origin allow-popups allow-downloads',
      locked:     true,
    },
    {
      id:         'sdc',
      group:      '자동화',
      label:      'SDC 사전심사자료 자동화',
      icon:       '·',
      badge:      null,
      src:        './apps/04_sdc_eval/index.html',
      loaderText: 'SDC 사전심사자료 자동화 로딩 중...',
      locked:     true,
    },
    {
      id:         'coa_dev',
      group:      '자동화',
      label:      'COA 생성 — 개발용',
      icon:       '·',
      badge:      null,
      src:        './apps/07_coa_dev/index.html',
      loaderText: 'COA 생성(개발) 로딩 중...',
      locked:     true,
      wip:        true,
    },
    {
      id:         'coa_prod',
      group:      '자동화',
      label:      'COA 생성 — 양산용',
      icon:       '·',
      badge:      null,
      src:        './apps/08_coa_prod/index.html',
      loaderText: 'COA 생성(양산) 로딩 중...',
      locked:     true,
      wip:        true,
    },
    {
      id:         'ext_code',
      group:      '자동화',
      label:      '외부코드 관리 (고객사별)',
      icon:       '·',
      badge:      null,
      src:        './apps/09_ext_code/index.html',
      loaderText: '외부코드 관리 로딩 중...',
      locked:     true,
      wip:        true,
    },

    // ── 품질 데이터 ───────────────────────────────────────────────────────────
    {
      id:         'cpl',
      group:      '품질 데이터',
      label:      'Lot 추적관리 & SQC',
      icon:       '·',
      badge:      null,
      src:        './apps/05_cpl_quality/index.html',
      loaderText: 'Lot 추적관리 & SQC 로딩 중...',
      locked:     true,
    },
    {
      id:         'dashboard',
      group:      '품질 데이터',
      label:      '품질 대시보드',
      icon:       '·',
      badge:      null,
      src:        './apps/10_quality_dashboard/index.html',
      loaderText: '품질 대시보드 로딩 중...',
      locked:     true,
      wip:        true,
    },
    {
      id:         'complaint',
      group:      '품질 데이터',
      label:      '불량·컴플레인 관리',
      icon:       '·',
      badge:      null,
      src:        './apps/11_complaint/index.html',
      loaderText: '불량·컴플레인 관리 로딩 중...',
      locked:     true,
      wip:        true,
    },

    // ── 제품·소재 관리 ─────────────────────────────────────────────────────────
    {
      id:         'spec_ctq',
      group:      '제품·소재 관리',
      label:      '제품 Spec & CTQ/CTP',
      icon:       '·',
      badge:      null,
      src:        './apps/12_spec_ctq/index.html',
      loaderText: '제품 Spec & CTQ/CTP 로딩 중...',
      locked:     true,
      wip:        true,
    },
    {
      id:         'iqc',
      group:      '제품·소재 관리',
      label:      '원자재 입고검사 (IQC)',
      icon:       '·',
      badge:      null,
      src:        './apps/13_iqc/index.html',
      loaderText: '원자재 입고검사 로딩 중...',
      locked:     true,
      wip:        true,
    },

    // ── 문서 관리 ──────────────────────────────────────────────────────────────
    {
      id:         'sys_docs',
      group:      '문서 관리',
      label:      '시스템 문서 & SOP',
      icon:       '·',
      badge:      null,
      src:        './apps/14_sys_docs/index.html',
      loaderText: '시스템 문서 & SOP 로딩 중...',
      locked:     true,
    },
  ];
  // ──────────────────────────────────────────────────────────────────────────

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  잠금 시스템
  //
  //  비밀번호를 변경하려면:
  //  1) 브라우저 콘솔(HTTPS 페이지)에서 아래 실행 후 출력된 값 복사
  //     crypto.subtle.digest('SHA-256',new TextEncoder().encode('새비밀번호'))
  //       .then(b=>console.log(Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('')))
  //  2) _PH 값을 출력된 64자리 hex 문자열로 교체 후 배포
  //  3) _p 배열은 삭제하고 아래 주석을 제거해도 됨
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  var _PH = null; // SHA-256 해시 (startup에서 비동기 계산)
  var _p  = [57,52,48,52,49,52]; // startup 1회만 사용 후 null 처리

  // 페이지 로드 시 즉시 해시 계산 → _p 삭제
  (function _initHash() {
    var pw = _p.map(function(c) { return String.fromCharCode(c); }).join('');
    _p = null; // 원본 즉시 삭제

    if (window.crypto && window.crypto.subtle) {
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw))
        .then(function(buf) {
          _PH = Array.from(new Uint8Array(buf))
            .map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
        });
    } else {
      // HTTP 개발 환경 폴백 (HTTPS 배포 시 이 경로는 실행되지 않음)
      _PH = '\x00' + pw; // 직접 비교 플래그
    }
  })();

  // ── 속도 제한 (sessionStorage 기반) ────────────────────────────────────────
  var _RK  = '_qr';
  var _MAX = 5;       // 최대 시도 횟수
  var _LMS = 30000;   // 잠금 시간 (30초)

  function _rd() {
    try { return JSON.parse(sessionStorage.getItem(_RK)) || { n: 0, u: 0 }; }
    catch (e) { return { n: 0, u: 0 }; }
  }
  function _wr(d) {
    try { sessionStorage.setItem(_RK, JSON.stringify(d)); } catch (e) {}
  }
  function _lockedUntil() {
    var d = _rd();
    return (d.n >= _MAX && Date.now() < d.u) ? d.u : 0;
  }
  function _onFail() {
    var d = _rd();
    d.n = (d.n || 0) + 1;
    if (d.n >= _MAX) d.u = Date.now() + _LMS;
    _wr(d);
  }
  function _onSuccess() {
    try { sessionStorage.removeItem(_RK); } catch (e) {}
  }

  // ── 세션 잠금 상태 ─────────────────────────────────────────────────────────
  var _unlocked = false;

  // ── 비밀번호 검증 (async) ─────────────────────────────────────────────────
  function _verify(input) {
    var val = input.trim();
    if (!_PH) return Promise.reject(new Error('init'));

    // HTTP 개발 환경 폴백
    if (_PH.charAt(0) === '\x00') {
      return Promise.resolve(val === _PH.slice(1));
    }

    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(val))
      .then(function(buf) {
        var hex = Array.from(new Uint8Array(buf))
          .map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
        return hex === _PH;
      });
  }

  // ── 그룹 내 전원 잠금 여부 ────────────────────────────────────────────────
  function _allLocked(groupName) {
    return apps.filter(function(a) { return a.group === groupName; })
               .every(function(a) { return !!a.locked; });
  }

  // ── 잠금 해제 후 탭 표시 ──────────────────────────────────────────────────
  function _revealLockedTabs() {
    // 숨겨진 그룹 헤더 표시
    apps.forEach(function(app) {
      if (!app.group) return;
      var hdr = document.getElementById('grphdr-' + app.group);
      if (hdr) hdr.style.display = '';
    });

    apps.forEach(function(app) {
      if (!app.locked) return;
      var btn    = document.getElementById('tabbtn-' + app.id);
      var wrap   = document.getElementById('tab-'    + app.id);
      var iframe = document.getElementById('iframe-' + app.id);
      if (btn)  btn.style.display  = '';
      if (wrap) wrap.style.display = '';
      // src는 DOM이 아닌 IIFE 내부 apps 배열에서만 읽음
      if (iframe && !iframe.getAttribute('src')) {
        iframe.src = app.src;
      }
    });
  }

  // ── 비밀번호 모달 ─────────────────────────────────────────────────────────
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

    // 잠금 중 상태 즉시 표시
    var lu0 = _lockedUntil();
    if (lu0) {
      inp.disabled = true;
      err.textContent = '잠시 후 다시 시도하세요. (' + Math.ceil((lu0 - Date.now()) / 1000) + '초)';
    }

    function _close() { overlay.remove(); }

    var confirmBtn = document.createElement('button');

    function _attempt() {
      var until = _lockedUntil();
      if (until) {
        err.textContent = '너무 많이 시도했습니다. ' + Math.ceil((until - Date.now()) / 1000) + '초 후 다시 시도하세요.';
        return;
      }
      var val = inp.value.trim();
      if (!val) return;

      // 중복 클릭 방지
      confirmBtn.disabled = true;
      inp.disabled = true;
      confirmBtn.textContent = '확인 중...';

      _verify(val).then(function(ok) {
        if (ok) {
          _unlocked = true;
          _onSuccess();
          _revealLockedTabs();
          _close();
        } else {
          _onFail();
          var lu = _lockedUntil();
          if (lu) {
            var s = Math.ceil((lu - Date.now()) / 1000);
            err.textContent = '코드가 올바르지 않습니다. ' + s + '초 잠금.';
            inp.disabled = true;
          } else {
            var d = _rd();
            var rem = _MAX - d.n;
            err.textContent = '코드가 올바르지 않습니다.' + (rem > 0 ? ' (' + rem + '회 남음)' : '');
            confirmBtn.disabled = false;
            inp.disabled = false;
          }
          inp.value = '';
          inp.style.borderColor = '#ef4444';
          setTimeout(function() {
            inp.style.borderColor = '';
            if (!_lockedUntil()) err.textContent = '';
          }, 3000);
          confirmBtn.textContent = '확인';
        }
      }).catch(function() {
        err.textContent = '오류가 발생했습니다. 다시 시도하세요.';
        confirmBtn.disabled = false;
        inp.disabled = false;
        confirmBtn.textContent = '확인';
      });
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

  // ── DOM 렌더링 ────────────────────────────────────────────────────────────
  function renderApps() {
    var nav       = document.querySelector('.tab-nav');
    var frameArea = document.querySelector('.frame-area');
    var unlocked  = _unlocked;
    var firstVisible = true;
    var lastGroup = null;

    apps.forEach(function(app) {
      var hidden  = app.locked && !unlocked;
      var isFirst = firstVisible && !hidden;
      if (isFirst) firstVisible = false;

      // 그룹 헤더
      if (app.group && app.group !== lastGroup) {
        lastGroup = app.group;
        var grpHdr = document.createElement('div');
        grpHdr.className = 'tab-group-header';
        grpHdr.id = 'grphdr-' + app.group;
        grpHdr.textContent = app.group;
        if (_allLocked(app.group) && !unlocked) grpHdr.style.display = 'none';
        nav.appendChild(grpHdr);
      }

      // 탭 버튼
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

      // iframe 래퍼
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
      if (app.sandbox) iframe.setAttribute('sandbox', app.sandbox);
      iframe.addEventListener('load', function() { hideLoader(app.id); });

      // 잠긴 탭: src 미설정, data-src도 DOM에 노출하지 않음
      if (!hidden) {
        iframe.src = app.src;
      }

      wrap.appendChild(loader);
      wrap.appendChild(iframe);
      frameArea.appendChild(wrap);
    });
  }

  // ── 탭 전환 ──────────────────────────────────────────────────────────────
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

  // ── 로더 숨기기 ──────────────────────────────────────────────────────────
  function hideLoader(id) {
    var el = document.getElementById('loader-' + id);
    if (el) el.classList.add('hidden');
  }

  // ── 초기화 ───────────────────────────────────────────────────────────────
  (function init() {
    renderApps();

    var brandBtn = document.getElementById('brandBtn');
    if (brandBtn) {
      brandBtn.addEventListener('click', function() { location.reload(); });
      brandBtn.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.reload(); }
      });
    }

    var statusDot = document.querySelector('.status-dot');
    if (statusDot) {
      if (_unlocked) {
        _revealLockedTabs();
      } else {
        statusDot.style.cursor = 'pointer';
        statusDot.title = '접근 코드 입력';
        statusDot.addEventListener('click', function() {
          _createPassModal();
        });
      }
    }

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

})();
