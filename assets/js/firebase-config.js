/* ══════════════════════════════════════════════════════════════════════
   Firebase 공통 설정 (모든 앱·코어 파일에서 공유)
   ──────────────────────────────────────────────────────────────────────
   • 하드코딩 분산 방지 — 키 변경 시 이 파일 한 곳만 수정
   • Firebase 보안: API 키 자체는 공개 가능. Firebase Console의
     "API 키 도메인 제한" + "RTDB 보안규칙(@ltml.co.kr 인증)"이 진짜 방어선
   • 사용 측에서는 firebase.initializeApp(window.QA_FIREBASE_CONFIG)
     형태로 호출. 이 파일은 SDK를 로드하지 않음
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  root.QA_FIREBASE_CONFIG = {
    apiKey:            'AIzaSyAk9PGqBHxiG9fVwVZZg6ZGBOWaaSAXOBc',
    authDomain:        'qa-manager-9c145.firebaseapp.com',
    databaseURL:       'https://qa-manager-9c145-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId:         'qa-manager-9c145',
    storageBucket:     'qa-manager-9c145.firebasestorage.app',
    messagingSenderId: '1037146076792',
    appId:             '1:1037146076792:web:b8ddcdb31d527d2d545f8d'
  };

  /* ── RTDB 경로 상수화 ────────────────────────────────────────────────
     앱끼리 같은 경로를 약속해서 쓰는 부분을 명시적으로 한 곳에 모음.
     새 앱이 새 경로를 쓸 때마다 여기에 추가.
  ──────────────────────────────────────────────────────────────────── */
  root.QA_DB_PATHS = {
    portalUsers:       'portal_users',         // index.html — 사용자 역할
    lotSchedule:       'lot_schedule',         // 06번
    oledResults:       'oled_results',         // 01·06번 공유
    pnFlowDocs:        'pn_flow_docs',         // 15번
    measurementHplc:   'measurement_hplc',     // 18번 (예정)
    measurementDscTga: 'measurement_dsc_tga',  // 19번 (예정)
    lotFlow:           'lot_flow'              // 20번 (예정)
  };

  root.QA_AUTH = {
    allowedDomain: '@ltml.co.kr',
    adminEmails:   ['jhbaik@ltml.co.kr']  // DB 미존재·타임아웃 시 fallback admin
  };

  /* ── 헬퍼: 중복 init 방지 + DB 핸들 반환 ────────────────────────────
     포털 iframe 내부에서 한 앱이 여러 번 로드되거나 SDK가 이미
     초기화돼 있을 때 안전하게 호출 가능.
  ──────────────────────────────────────────────────────────────────── */
  root.QA_initFirebase = function () {
    if (typeof firebase === 'undefined') return null;
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(root.QA_FIREBASE_CONFIG);
    }
    return firebase;
  };

  /* ── 헬퍼: 인증 완료(=non-null user) 후에만 콜백 실행 ───────────────
     iframe에서 SDK가 IndexedDB로부터 세션 복원하기 전에 RTDB 리스너를
     부착하면 PERMISSION_DENIED로 리스너가 취소되어 auth 복원 후에도
     데이터가 안 들어오는 영구 실패가 발생함.
     이 헬퍼로 첫 non-null user를 기다린 뒤 DB 호출을 시작해야 안전.
  ──────────────────────────────────────────────────────────────────── */
  root.QA_whenAuthReady = function (cb) {
    if (typeof firebase === 'undefined' || !firebase.auth) return;
    var auth = firebase.auth();
    if (auth.currentUser) { cb(auth.currentUser); return; }
    var unsub = auth.onAuthStateChanged(function (u) {
      if (u) {
        if (typeof unsub === 'function') unsub();
        cb(u);
      }
    });
  };
})(window);
