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
 * Firebase SDK(firebase-app-compat + firebase-auth-compat)가
 * 이 파일보다 먼저 로드되어 있어야 합니다.
 */
(function () {
  'use strict';

  var ADMIN_ONLY = !!window._AG_ADMIN_ONLY;

  // 루트 상대경로 (apps/XX_xxx/index.html 기준 → ../../)
  var LOGIN_URL  = '../../login.html';
  var PORTAL_URL = '../../index.html';

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

  // body가 준비되기 전에도 삽입되도록
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

  /* ── Firebase 초기화 (named app — 각 앱의 default 앱과 충돌 방지) ──── */
  var _app;
  try {
    _app = firebase.app('_guard');
  } catch (e) {
    _app = firebase.initializeApp(FIREBASE_CONFIG, '_guard');
  }
  var _auth = _app.auth();

  /* ── 인증 상태 확인 ─────────────────────────────────────────────────── */
  // Firebase 초기화 직후 null이 먼저 발화될 수 있으므로 즉시 리다이렉트 금지.
  // onAuthStateChanged가 발화하면 타이머 취소 후 재확인.
  var _loginRedirectTimer = setTimeout(function () {
    // 1.5초 내 onAuthStateChanged 미발화 시 로그인 페이지로 이동
    if (!_auth.currentUser) {
      window.location.replace(LOGIN_URL);
    }
  }, 1500);

  _auth.onAuthStateChanged(function (user) {
    clearTimeout(_loginRedirectTimer);

    // ① 미로그인 또는 이메일 인증 미완료
    if (!user || !user.emailVerified) {
      // 잠시 대기 후 재확인 — 일시적 null 발화 방어
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

    // ④ 관리자 전용 앱 → 역할 확인 (RTDB hanging 대비 5초 타임아웃)
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
})();
