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
 *
 * ※ 프로덕션 도메인 외(브랜치 프리뷰·localhost)에서는 인증을 건너뜁니다.
 *   PROD_HOSTS 배열에 실제 운영 도메인만 등록하세요.
 */
(function () {
  'use strict';

  var ADMIN_ONLY = !!window._AG_ADMIN_ONLY;

  /* ── 프로덕션 도메인 목록 — 여기에 없으면 인증 없이 통과 ─────────────── */
  var PROD_HOSTS = [
    'qa-manager.pages.dev',
  ];

  var hostname = location.hostname;
  var isProd = PROD_HOSTS.some(function (h) { return hostname === h; });

  if (!isProd) {
    // 브랜치 프리뷰 / localhost → 인증 없이 바로 통과
    return;
  }

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
  _auth.onAuthStateChanged(function (user) {
    // ① 미로그인 또는 이메일 인증 미완료
    if (!user || !user.emailVerified) {
      window.location.replace(LOGIN_URL);
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

    // ④ 관리자 전용 앱 → 역할 확인
    var _db = firebase.database(_app);
    _db.ref('portal_users/' + user.uid + '/role').once('value')
      .then(function (snap) {
        if (snap.val() === 'admin') {
          _removeOverlay();
        } else {
          _blocked('관리자만 접근할 수 있습니다.');
        }
      })
      .catch(function () {
        _blocked('권한 확인에 실패했습니다.');
      });
  });
})();
