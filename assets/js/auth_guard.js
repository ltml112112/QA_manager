/**
 * auth_guard.js — QA Manager Portal 앱별 직접 URL 접근 차단
 *
 * 사용법 (각 앱 HTML <head> 최하단):
 *   <!-- 관리자 전용 앱 -->
 *   <script>window._AG_ADMIN_ONLY = true;</script>
 *   <script src="../../assets/js/auth_guard.js"></script>
 *
 *   <!-- 일반 사용자도 접근 가능한 앱 -->
 *   <script>window._AG_ADMIN_ONLY = false;</script>
 *   <script src="../../assets/js/auth_guard.js"></script>
 *
 * Firebase SDK가 이미 로드된 앱(06_lot_schedule 등)에서는 그대로 재사용하고,
 * SDK가 없는 앱에서는 동적으로 주입합니다.
 */
(function () {
  'use strict';

  var ADMIN_ONLY  = !!window._AG_ADMIN_ONLY;
  var LOGIN_URL   = '../../login.html';
  var PORTAL_URL  = '../../index.html';

  var SDK_VER  = '10.12.0';
  var SDK_BASE = 'https://www.gstatic.com/firebasejs/' + SDK_VER + '/';

  var FIREBASE_CONFIG = {
    apiKey:            'AIzaSyAk9PGqBHxiG9fVwVZZg6ZGBOWaaSAXOBc',
    authDomain:        'qa-manager-9c145.firebaseapp.com',
    databaseURL:       'https://qa-manager-9c145-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId:         'qa-manager-9c145',
    storageBucket:     'qa-manager-9c145.firebasestorage.app',
    messagingSenderId: '1037146076792',
    appId:             '1:1037146076792:web:b8ddcdb31d527d2d545f8d'
  };

  /* ── 로딩 오버레이 ─────────────────────────────────────────────────── */
  var _style = document.createElement('style');
  _style.textContent = '@keyframes _ag_spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(_style);

  var _ov = document.createElement('div');
  _ov.id = '_ag_overlay';
  _ov.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:999999',
    'background:#fdf5f6', 'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:center', 'gap:12px',
    "font-family:'Inter','Noto Sans KR',sans-serif",
  ].join(';');

  var _sp = document.createElement('div');
  _sp.style.cssText = [
    'width:24px', 'height:24px',
    'border:3px solid #e8d0d4', 'border-top-color:#be0039',
    'border-radius:50%', 'animation:_ag_spin 0.8s linear infinite',
  ].join(';');

  var _tx = document.createElement('div');
  _tx.style.cssText = 'font-size:12px;color:#6b7280;';
  _tx.textContent = '인증 확인 중...';

  _ov.appendChild(_sp);
  _ov.appendChild(_tx);

  function _attachOverlay() {
    (document.body || document.documentElement).appendChild(_ov);
  }
  if (document.body) {
    _attachOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', _attachOverlay);
  }

  function _removeOverlay() {
    var el = document.getElementById('_ag_overlay');
    if (el) el.remove();
  }

  function _blocked(reason) {
    _tx.textContent = reason || '접근 권한이 없습니다.';
    _sp.style.display = 'none';
    setTimeout(function () {
      window.location.replace(PORTAL_URL);
    }, 1500);
  }

  /* ── Firebase SDK 동적 주입 ──────────────────────────────────────────
     앱에 Firebase SDK가 없는 경우 순차적으로 스크립트를 주입합니다.
     app-compat → auth-compat → (admin 전용 앱이면) database-compat
  ──────────────────────────────────────────────────────────────────── */
  function _loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    s.onerror = function () {
      // SDK 로드 실패 시 포털로 안전하게 이동
      window.location.replace(PORTAL_URL);
    };
    document.head.appendChild(s);
  }

  function _loadFirebaseThenInit() {
    _loadScript(SDK_BASE + 'firebase-app-compat.js', function () {
      _loadScript(SDK_BASE + 'firebase-auth-compat.js', function () {
        if (ADMIN_ONLY) {
          _loadScript(SDK_BASE + 'firebase-database-compat.js', function () {
            _initGuard();
          });
        } else {
          _initGuard();
        }
      });
    });
  }

  /* ── 진입점 ─────────────────────────────────────────────────────────
     firebase 전역이 이미 있으면 (06_lot_schedule 등) 그대로 사용,
     없으면 동적으로 SDK 주입 후 시작.
  ──────────────────────────────────────────────────────────────────── */
  if (typeof firebase !== 'undefined' && typeof firebase.app === 'function') {
    // firebase-database가 없는데 admin 전용이면 추가 로드
    if (ADMIN_ONLY && typeof firebase.database === 'undefined') {
      _loadScript(SDK_BASE + 'firebase-database-compat.js', function () {
        _initGuard();
      });
    } else {
      _initGuard();
    }
  } else {
    _loadFirebaseThenInit();
  }

  /* ── 인증 확인 ─────────────────────────────────────────────────────── */
  function _initGuard() {
    // named app '_guard' 사용 → 앱 기본 firebase.app()과 충돌 없음
    var _app;
    try {
      _app = firebase.app('_guard');
    } catch (e) {
      _app = firebase.initializeApp(FIREBASE_CONFIG, '_guard');
    }
    var _auth = _app.auth();

    // Firebase 초기화 직후 null이 먼저 발화될 수 있으므로 즉시 리다이렉트 금지.
    // 1.5초 내 onAuthStateChanged 미발화 시 로그인 페이지로 이동.
    var _loginRedirectTimer = setTimeout(function () {
      if (!_auth.currentUser) {
        window.location.replace(LOGIN_URL);
      }
    }, 1500);

    _auth.onAuthStateChanged(function (user) {
      clearTimeout(_loginRedirectTimer);

      // ① 미로그인 또는 이메일 인증 미완료
      if (!user || !user.emailVerified) {
        // 일시적 null 발화 방어 — 잠시 후 재확인
        setTimeout(function () {
          var cu = _auth.currentUser;
          if (!cu || !cu.emailVerified) {
            window.location.replace(LOGIN_URL);
          }
        }, 1500);
        return;
      }

      // ② 도메인 검증
      var email = (user.email || '').toLowerCase();
      if (!email.endsWith('@ltml.co.kr')) {
        _auth.signOut();
        window.location.replace(LOGIN_URL);
        return;
      }

      // ③ 일반 사용자도 접근 가능한 앱 → 바로 통과
      if (!ADMIN_ONLY) {
        _removeOverlay();
        return;
      }

      // ④ 관리자 전용 앱 → RTDB에서 역할 확인 (5초 타임아웃)
      var _db = firebase.database(_app);
      var _dbTimer = setTimeout(function () {
        _blocked('권한 확인 시간 초과.');
      }, 5000);

      _db.ref('portal_users/' + user.uid + '/role').once('value')
        .then(function (snap) {
          clearTimeout(_dbTimer);
          if (snap.val() === 'admin') {
            _removeOverlay();
          } else {
            _blocked('관리자만 접근할 수 있습니다.');
          }
        })
        .catch(function () {
          clearTimeout(_dbTimer);
          _blocked('권한 확인에 실패했습니다.');
        });
    });
  }
})();
