# Firebase RTDB 연동 표준 패턴

> Last updated: 2026-05-07

**RTDB를 사용하는 새 앱은 반드시 이 패턴을 따를 것.** 안 지키면 첫 진입 시 데이터 로딩 실패 + 빈 화면이 영구 고착되는 케이스 발생.

---

## 1. 발견된 race 두 가지 (역사 기록)

### Race A — iframe Auth 하이드레이션 race

iframe SDK가 IndexedDB로부터 세션 복원 전에 `.on('value')` 부착 시 PERMISSION_DENIED로 listener cancel. error cb 미등록이면 silent하게 죽고, `_syncStarted` 같은 시도-시점 flag 때문에 재시도도 차단됨.

### Race B — 다중 iframe(20+개) 동시 부팅 throttle

모든 iframe이 동시에 Firebase WebSocket 열면 RTDB 서버 측 listen 큐가 throttle되어 일부 listener가 응답 자체를 못 받음 (success/error 둘 다 안 발화).

> Race B 방지는 `main.js`의 iframe lazy-load 메커니즘이 담당 — `docs/architecture/iframe-loading.md` 참고. 이 파일의 패턴은 Race A 방지에 집중.

---

## 2. 표준 listener 부착 패턴

```javascript
QA_initFirebase();
var DB_REF = firebase.database().ref(QA_DB_PATHS.yourPath);

var _retryMs = 500;
var _t0 = null;
var _stuckTimer = null;

function _setLoadingState(state, msg) {
  var overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  if (state === 'hide') { overlay.style.display = 'none'; return; }
  overlay.style.display = '';
  var txt = overlay.querySelector('.lo-text');
  if (txt) txt.textContent = msg || '데이터 로딩 중...';
  overlay.classList.toggle('lo-retry', state === 'retry');
  overlay.classList.toggle('lo-stuck', state === 'stuck');
  var btn = overlay.querySelector('.lo-retry-btn');
  if (btn) btn.style.display = (state === 'stuck') ? '' : 'none';
}

function attachListener() {
  _t0 = Date.now();
  if (_stuckTimer) clearTimeout(_stuckTimer);
  _stuckTimer = setTimeout(function () {
    console.warn('[your-app] 30s 응답 없음, stuck UI 표시');
    _setLoadingState('stuck', '연결이 지연되고 있습니다');
  }, 30000);

  DB_REF.on('value', function (snap) {
    if (_stuckTimer) { clearTimeout(_stuckTimer); _stuckTimer = null; }
    _setLoadingState('hide');
    _retryMs = 500;  // 성공 시 backoff 리셋
    // 데이터 처리...
  }, function (err) {
    if (_stuckTimer) { clearTimeout(_stuckTimer); _stuckTimer = null; }
    console.warn('[your-app] listener cancelled:', err && err.code);
    _setLoadingState('retry', '연결 재시도 중...');
    DB_REF.off('value');
    var wait = Math.min(_retryMs, 8000);
    _retryMs = Math.min(_retryMs * 2, 8000);
    setTimeout(function () { QA_whenAuthReady(attachListener); }, wait);
  });
}

// auth ready 후 부착 시작 — 직접 onAuthStateChanged 사용 금지
QA_whenAuthReady(attachListener);
```

---

## 3. 필수 요소 체크리스트

새 RTDB-사용 앱 작성 시:

- [ ] **`QA_whenAuthReady(cb)`** 로 sync 시작 — `firebase.auth().onAuthStateChanged` 직접 사용 금지
- [ ] `.on('value', success, errorCb)` — **errorCb 반드시 등록** (silent death 방지)
- [ ] error cb에서 backoff 재부착 (500ms → 1s → 2s → 4s → 8s)
- [ ] **시도-시점 flag 사용 금지** — `_syncStarted = true` 류는 첫 success snapshot 도착 시점에만 set하거나 아예 사용하지 않음
- [ ] 로딩 오버레이 (`<div id="loadingOverlay">` + style.css 끝에 `.loading-overlay` CSS)
- [ ] 30초 stuck 안전망 + "다시 시도" 버튼 (`window._yourAppManualRetry`)

---

## 4. `QA_whenAuthReady(cb, timeoutMs)` 동작

`assets/js/firebase-config.js` 정의. 다음을 보장:

1. `onAuthStateChanged` 첫 non-null user 발화까지 대기
2. `getIdToken(false)` 추가 대기 — auth 토큰이 RTDB connection에 전파될 때까지
3. 5초 hardTimer + 3초 getIdToken timer fallback 보유 → **영구 hang 불가**
4. cb는 정확히 1회만 호출됨

---

## 5. 진단 콘솔 로그

문제 발생 시 콘솔에 다음 키워드로 검색:

| 로그 | 의미 |
|---|---|
| `[QA_whenAuthReady] cb 발화 { ms, hasUser }` | auth ready 시점 (정상) |
| `[QA_whenAuthReady] timeout/null fallback firing` | 5초 내 auth 미해결 — IDB 권한/네트워크 문제 |
| `[QA_whenAuthReady] getIdToken 3s timeout` | 토큰 갱신이 hang — 네트워크 문제 |
| `[your-app] listener cancelled: PERMISSION_DENIED` | auth가 RTDB connection에 전파 안 됨 |
| `[your-app] 30s 응답 없음, stuck UI 표시` | listen이 throttle/silent hang |
| `.info/connected: false`만 나옴 | WebSocket 자체가 못 열림 (방화벽/확장 문제) |

---

## 6. 참조 구현

새 앱 작성 시 아래 셋 중 가장 가까운 형태를 카피해서 시작:

- `apps/06_lot_schedule/app.js` — items + results 두 listener
- `apps/10_quality_dashboard/app.js` — 동일 패턴
- `apps/15_pn_flow/app.js` — 단일 listener + `.info/connected` 모니터링

---

## 7. 새 RTDB 경로 추가 시 보안 규칙 동시 추가 (필수)

코드에 새 `db.ref('new_path')` 추가만 하면 default deny로 PERMISSION_DENIED. Firebase 콘솔 RTDB Rules 탭에서 동일 도메인 패턴으로 규칙 추가 필요. 자세한 내용은 `docs/architecture/auth.md` 6절 참고.

---

## 8. 같은 Firebase 프로젝트 재사용

모든 앱이 동일한 `firebaseConfig`를 사용하고 **`db.ref('경로')`만 다르게** 지정:

```javascript
// 예시
var DB_REF = db.ref('lot_schedule');     // 06번 앱
var DB_REF = db.ref('oled_results');     // 06번 앱 (별도 경로)
var DB_REF = db.ref('pn_flow_docs');     // 15번 앱
var DB_REF = db.ref('measurement_hplc'); // 18번 앱 (예정)
```

각 경로별 데이터 스키마는 해당 앱의 `docs/apps/{번호}-*.md`에 기재.
