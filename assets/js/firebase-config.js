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

  /* ── 헬퍼: 인증 준비 후 콜백 (타임아웃 fallback 포함) ────────────────
     iframe에서 SDK가 IndexedDB로부터 세션 복원하기 전에 RTDB 리스너를
     부착하면 PERMISSION_DENIED로 리스너가 취소되어 영구 실패함.

     동작:
       1. onAuthStateChanged 첫 non-null user 발화까지 대기
          (currentUser shortcut 사용 안 함 — SDK 내부 auth state machine이
           초기화 완료된 시점에만 onAuthStateChanged가 발화하므로 더 안정적)
       2. getIdToken(false)로 ID 토큰을 명시적으로 가져옴 — 이 promise가
          resolve된 시점에는 SDK가 auth를 RTDB WebSocket connection에
          전파했음이 보장됨 (race 차단의 핵심)
       3. cb 호출 — 이후 DB 호출은 안전
       4. timeoutMs(기본 5초) 내에 1·2가 끝나지 않으면 cb(null)로 fallback —
          영구 hang 방지. 이후 RTDB error cb 쪽에서 backoff 재시도

     사용 예:
       QA_whenAuthReady(function () {
         DB_REF.on('value', successCb, errorCb);
       });
  ──────────────────────────────────────────────────────────────────── */
  root.QA_whenAuthReady = function (cb, timeoutMs) {
    if (typeof firebase === 'undefined' || !firebase.auth) { cb(null); return; }
    var auth = firebase.auth();
    var fired = false;
    var hardTimer;
    var unsub;

    function fire(u) {
      if (fired) return;
      fired = true;
      clearTimeout(hardTimer);
      try { if (typeof unsub === 'function') unsub(); } catch (e) {}
      if (!u) { cb(null); return; }
      // ID 토큰 가져오기 — auth가 RTDB connection에 전파될 때까지 대기
      u.getIdToken(false).then(function () { cb(u); })
                        .catch(function () { cb(u); });
    }

    // onAuthStateChanged는 등록 직후 1회 발화 (auth 상태 결정된 후).
    // currentUser shortcut 사용 안 함 — SDK 내부 동기화 보장이 우선.
    unsub = auth.onAuthStateChanged(function (u) {
      if (u) fire(u);
    });

    hardTimer = setTimeout(function () { fire(null); }, timeoutMs || 5000);
  };
})(window);
