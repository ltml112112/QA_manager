# QA Manager 개선 계획서

> 2026-05-05 작성 — `claude/comprehensive-code-review-emQyT` 브랜치
>
> 본 문서는 [종합 코드 리뷰](#종합-코드-리뷰-요약) 결과에 따라 도출된
> 단계별 개선 계획입니다. **STAGE 0**(보안 점검)과 **STAGE 1**(공통 코드 추출)은
> 완료되었습니다. STAGE 2~5는 향후 진행 예정입니다.

---

## 목차

- [진행 현황](#진행-현황)
- [STAGE 0 — 보안 긴급 점검 ✅](#stage-0--보안-긴급-점검-완료)
- [STAGE 1 — 공통 코드 추출 ✅](#stage-1--공통-코드-추출-완료)
- [STAGE 2 — 앱 간 통신 표준화](#stage-2--앱-간-통신-표준화)
- [STAGE 3 — 대형 앱 리팩토링](#stage-3--대형-앱-리팩토링)
- [STAGE 4 — 측정 데이터 입력 앱 구현](#stage-4--측정-데이터-입력-앱-구현)
- [STAGE 5 — 운영·모니터링 강화](#stage-5--운영모니터링-강화)
- [추천 진행 일정](#추천-진행-일정)
- [종합 코드 리뷰 요약](#종합-코드-리뷰-요약)

---

## 진행 현황

| 단계 | 상태 | 작업 시점 | 비고 |
|------|------|----------|------|
| STAGE 0 — 보안 점검 | ✅ 완료 | 2026-05-05 | RTDB 규칙 검증, API 키 도메인 제한 권고 |
| STAGE 1 — 공통 코드 추출 | ✅ 완료 | 2026-05-05 | firebase-config.js, theme-sync.js, utils.js |
| STAGE 2 — 앱 간 통신 표준화 | ⏳ 예정 | — | postMessage Bridge |
| STAGE 3 — 대형 앱 리팩토링 | ⏳ 예정 | — | 06·05·10·15 함수 분해 |
| STAGE 4 — 측정 데이터 앱 구현 | ⏳ 예정 | — | 18·19·20번 |
| STAGE 5 — 운영·모니터링 | ⏳ 예정 | — | 캐시·로깅·감사 |

---

## STAGE 0 — 보안 긴급 점검 (완료)

### 무엇을 / 왜
Firebase API 키가 코드 6곳에 평문으로 들어 있어 GitHub에 노출돼 있음. 키 자체가 노출되는 건 Firebase 설계상 문제 없으나, **(1) API 키 도메인 제한**과 **(2) RTDB 보안규칙**이 진짜 방어선임. 이 두 가지가 설정돼 있는지 확인이 절대 우선.

### 결과 (Before → After)

#### RTDB 보안규칙

**Before (가정)**
- 테스트 모드(`.read: true, .write: true`) 였다면 전 세계가 모든 데이터 읽기/쓰기 가능

**After (적용 권고)**
```json
{
  "rules": {
    "lot_schedule":       { ".read": "auth!=null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)", ".write": "..." },
    "oled_results":       { ".read": "...", ".write": "..." },
    "pn_flow_docs":       { ".read": "...", ".write": "..." },
    "measurement_hplc":   { ".read": "...", ".write": "..." },
    "measurement_dsc_tga":{ ".read": "...", ".write": "..." },
    "lot_flow":           { ".read": "...", ".write": "..." },
    "portal_users": {
      "$uid": {
        ".read":  "auth!=null && (auth.uid===$uid || root.child('portal_users').child(auth.uid).child('role').val()==='admin')",
        ".write": "..."
      }
    }
  }
}
```

#### API 키 도메인 제한

Firebase Console → API 키 → **Application restrictions = HTTP referrers**
- `https://*.cloudflare-pages-domain.pages.dev/*`
- `http://localhost:*/*`

### 영향
- 외부 공격자가 API 키를 알아내도 **우리 도메인 외에서는 사용 불가**
- DB 데이터는 **`@ltml.co.kr` 인증된 사용자만 접근**
- `portal_users` 는 본인 또는 admin만 수정 가능

---

## STAGE 1 — 공통 코드 추출 (완료)

### 무엇을 / 왜
같은 Firebase 설정·테마 동기화 코드가 여러 앱에 복붙되어, 한 줄만 고쳐도 6~16곳을 동시에 수정해야 했음. **단일 소스(single source of truth)** 로 모음.

### 결과 (Before → After)

#### 추가된 파일

```
assets/js/
├── firebase-config.js   (신규) — Firebase config + DB 경로 + 도메인/관리자 화이트리스트
├── theme-sync.js        (신규) — 라이트/다크 테마 IIFE
└── utils.js             (신규) — esc / genId / toDateStr / fmtVal 등 공통 헬퍼
```

#### Firebase 설정 평문 하드코딩 위치 변화

**Before** (6개 파일에 동일한 7줄 config 박혀 있음)
```
index.html, login.html, auth_guard.js,
apps/06_lot_schedule/app.js, apps/10_quality_dashboard/app.js,
apps/15_pn_flow/app.js
```

**After**
```
assets/js/firebase-config.js   ← 단일 소스 (실제 정의)
assets/js/auth_guard.js        ← fallback (외부 도메인 iframe 등 비정상 환경 대비)
```

→ API 키·DB URL 변경 시 **`firebase-config.js` 한 곳만 수정**하면 모든 앱에 반영.

#### Firebase DB 경로 상수화

**Before**
```javascript
// 06번
firebase.database().ref('lot_schedule')
firebase.database().ref('oled_results')
// 15번
firebase.database().ref('pn_flow_docs')
// index.html
db.ref('portal_users/' + user.uid)
```
→ 각 앱이 약속된 경로명을 **암묵적으로** 공유. 한쪽이 바꾸면 조용히 깨짐.

**After**
```javascript
firebase.database().ref(QA_DB_PATHS.lotSchedule)
firebase.database().ref(QA_DB_PATHS.oledResults)
firebase.database().ref(QA_DB_PATHS.pnFlowDocs)
db.ref(QA_DB_PATHS.portalUsers + '/' + user.uid)
```
→ `firebase-config.js` 의 `QA_DB_PATHS` 객체 한 곳에서 모든 경로 관리. 미래 앱(18·19·20)도 미리 등록.

#### 테마 동기화 IIFE

**Before** (16개 파일에 동일한 9줄 IIFE 복붙)
- 06·05·10·15 app.js + 01·03·14·16·17 + WIP 9개

**After** (각 앱 HTML head에 한 줄)
```html
<script src="../../assets/js/theme-sync.js"></script>
```
- 라이트 기본 테마 앱(16·17번)은 `<script>window.QA_THEME_DEFAULT='light';</script>` 한 줄 추가

### 코드 변화량

| 항목 | Before | After | 차이 |
|------|--------|-------|------|
| Firebase config 평문 인스턴스 | 6 | 1 (+1 fallback) | **-5** |
| 테마 동기화 IIFE 인스턴스 | 16 | 1 | **-15** |
| 신규 공통 모듈 | 0 | 3 (총 약 130줄) | +130 |
| 앱 코드 라인 감소량 | — | — | **약 -200줄** |

### 영향
- **유지보수성 ↑** — 키 변경, DB 경로 추가, 테마 로직 수정이 한 곳에서 완결
- **새 앱 추가 더 쉬움** — 공통 모듈 3개 `<script>` 태그만 넣으면 됨
- **기능 변화 0** — 동작은 정확히 동일. 회귀 테스트 부담 최소
- **호환성** — auth_guard.js는 firebase-config.js 미로드 환경(외부 도메인)에서도 fallback으로 동작

### 사용법 (새 앱 추가 시)

**Firebase 사용 앱**
```html
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
<script src="../../assets/js/firebase-config.js"></script>
<script src="../../assets/js/theme-sync.js"></script>
<script src="../../assets/js/utils.js"></script>
<script>window._AG_ADMIN_ONLY = true;</script>
<script src="../../assets/js/auth_guard.js"></script>
```
```javascript
// app.js
QA_initFirebase();
var DB = firebase.database().ref(QA_DB_PATHS.measurementHplc);  // 새 경로는 firebase-config.js에 추가
```

**Firebase 미사용 앱 (테마만 필요)**
```html
<script src="../../assets/js/theme-sync.js"></script>
```

---

## STAGE 2 — 앱 간 통신 표준화

### 무엇을 / 왜
현재 01번(OLED) 앱이 06번(일정)에 분석 결과를 전달할 때, **두 앱이 같은 Firebase 경로(`oled_results`)를 약속해서 우회 통신**하고 있음. 한쪽이 경로를 바꾸면 조용히 깨짐.

테마 동기화 외에는 직접적인 앱 ↔ 앱 / 포털 ↔ 앱 통신 채널이 부재. **필요한 통신을 명시적으로 선언하고 표준화**해야 새로운 통합(예: 05번 Lot 클릭 → 06번 일정으로 점프)이 가능.

### 작업 계획

#### 2-1. `assets/js/portal-bridge.js` 신규 작성

```javascript
window.QABridge = {
  // 앱이 부모 포털 또는 다른 iframe에 이벤트 전송
  send: function(type, payload) {
    window.parent.postMessage({ source: 'qa-app', type: type, payload: payload }, '*');
  },
  // 이벤트 수신 (포털·다른 앱에서 보낸 것)
  on: function(type, handler) {
    window.addEventListener('message', function(e) {
      if (e.data && e.data.source === 'qa-app' && e.data.type === type) {
        handler(e.data.payload, e.source);
      }
    });
  },
  // 포털이 특정 앱 iframe으로 직접 전송 (양방향 라우팅용)
  sendTo: function(appId, type, payload) {
    var iframe = document.getElementById('frame-' + appId);
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ source: 'qa-app', type: type, payload: payload }, '*');
    }
  }
};
```

#### 2-2. 표준 이벤트 명세 (문서화)

| type | payload | 누가 보냄 | 누가 받음 | 목적 |
|------|---------|---------|---------|------|
| `oledResult.saved` | `{ lotId, ivl, lt }` | 01 (embed 모드) | 06 | OLED 결과 저장 알림 |
| `lotSchedule.openLot` | `{ lotId }` | 05 (Lot 클릭) | 06 | 06번 일정으로 점프 + 강조 |
| `dashboard.filter` | `{ material, range }` | 10 → 포털 | 다른 앱 | 공통 필터 broadcast |
| `theme.set` | `{ theme: 'dark'\|'light' }` | 포털 | 모든 앱 | 테마 동기화 (기존) |

→ 이 표는 STAGE 2 작업 시 README의 별도 섹션으로 영구 문서화.

#### 2-3. 기존 코드 변환

**Before — 01번 (현재)**
```javascript
window.parent.postMessage({ type: 'oledResult', ivl: ..., lt: ... }, '*');
```

**After**
```javascript
QABridge.send('oledResult.saved', { lotId, ivl, lt });
```

**Before — 06번 (현재 — Firebase 경로 직접 구독)**
```javascript
RESULT_REF.on('value', snap => { ... });  // oled_results 경로 polling
```

**After (저장 통지는 postMessage, 영구 데이터는 여전히 Firebase)**
```javascript
QABridge.on('oledResult.saved', (payload) => {
  refreshLotCard(payload.lotId);
});
```

### 영향
- 앱 간 의존성이 **표준 명세 표 한 장**으로 추적 가능
- 새 앱 추가 시 어떤 이벤트를 듣고/보낼지 명확
- Firebase 경로 우회 통신 제거 → 05↔06, 06↔10 같은 새 통합 쉬워짐

### 작업량
- 신규 파일 1개 (~30줄)
- 01·06번 통신 코드 교체 (~20줄)
- README 업데이트 (~50줄)
- **예상 기간: 3~5일**

---

## STAGE 3 — 대형 앱 리팩토링

### 무엇을 / 왜
- `06_lot_schedule/app.js` **2143줄**, `05_cpl_quality/app.js` **1887줄** 등 단일 파일에 모든 로직 응축
- 전역 STATE 객체에 모든 상태 저장 → 함수 호출 순서·부작용 추적 어려움
- 함수 1개가 500줄 넘는 경우 (예: `renderCalendar()`) → 한 군데 수정이 다른 곳을 깨뜨릴 위험

### 작업 계획

#### 3-1. 06번 앱 분해 (예시)

**Before 구조**
```
06_lot_schedule/
├── index.html
├── style.css
└── app.js  (2143줄: 모든 것)
```

**After 구조**
```
06_lot_schedule/
├── index.html        (스크립트 로드 순서 변경)
├── style.css
└── js/
    ├── app.js              (~50줄: 진입점만)
    ├── state.js            (~100줄: STATE getter/setter)
    ├── firebase-sync.js    (~150줄: setupRealtimeSync, 마이그레이션)
    ├── calendar.js         (~400줄: renderCalendar 분해)
    ├── modal-date.js       (~300줄: 날짜·검색 모달)
    ├── modal-individual.js (~200줄: 개별 등록 폼)
    ├── modal-mail.js       (~400줄: 메일 일괄 등록 + 파싱)
    ├── oled-result.js      (~250줄: OLED 결과 입력·표시)
    └── utils.js            (~100줄: 06번 전용 유틸)
```

#### 3-2. 함수 분해 원칙

| 항목 | 기준 |
|------|------|
| 함수 길이 | 50~100줄 이내 |
| 한 함수 한 책임 | "이 함수는 무엇을 하나" 한 문장으로 답 가능 |
| 전역 상태 접근 | `getState()` / `setState()` 캡슐화 (직접 STATE.x = ... 금지) |

#### 3-3. 단계적 진행 권장

| 주차 | 대상 | 작업 |
|------|------|------|
| 1주차 | 06번 | 폴더 구조 분리 + `renderCalendar` 분해 |
| 2주차 | 06번 | 모달·메일 파싱 분리, 회귀 테스트 |
| 3주차 | 05번 | 동일 패턴 적용 (계보·SPC 분리) |
| 4주차 | 10·15번 | 동일 패턴 적용 |

> **주의**: 한 번에 다 하지 말 것. 한 앱씩 끝내고 안정성 확인 후 다음 앱.

### 영향
- 버그 발생 시 어느 파일을 봐야 할지 즉시 판단 가능
- 함수 단위 테스트 작성 가능 (현재 불가)
- 새 기능 추가 시 영향 범위 예측 가능

### 작업량
- 앱당 **5~7일** × 4개 앱 = **약 3~4주**
- 단, 기능 변화 0이라 사용자에겐 보이지 않음

---

## STAGE 4 — 측정 데이터 입력 앱 구현

### 무엇을 / 왜
**현재 막힌 흐름**:
```
[01 OLED 결과] → 06 일정 ✅
[HPLC 측정값]  → ??? (입력 경로 없음) → 05 추적·10 대시보드·07/08 COA
[DSC/TGA]      → ??? (입력 경로 없음) → 같음
[Lot 흐름도]   → 매번 Excel 업로드 → 05번 (브라우저 세션에서만 보임)
```

18·19·20번 앱이 WIP 플레이스홀더 상태라 **05·10·07·08번이 받을 데이터가 없음**.

### 작업 계획

#### Phase A — 20번 Lot 흐름도 관리 (가장 기반)

```
입력: Excel 흐름도 → Firebase `lot_flow/` 영구 저장
조회: 05번이 매번 파일 업로드 대신 Firebase에서 직접 읽기
```

**Firebase 스키마** (CLAUDE.md 가이드 준수)
```javascript
// lot_flow/{uploadId}
{
  uploadedAt:  'YYYY-MM-DD',
  uploadedBy:  'user@ltml.co.kr',
  fileName:    '흐름도_240801.xlsx',
  stageLabels: ['1단계', '2단계', '3단계'],
  relations:   [{ outputLot, inputLot, stage }, ...],
  lotMeta:     { 'LT-PHM295-...': { itemCode, itemName, remark } }
}
```

**05번 변경**: 흐름도 드롭존 → 항상 비활성, "Firebase에서 자동 로드" 메시지 표시. 품질 데이터 드롭존만 유지.

#### Phase B — 18번 HPLC 데이터 입력

CSV 업로드 → Lot번호 매칭 → `measurement_hplc/{lotId}/{timestamp}` 저장.

```javascript
{
  lotId, measuredAt, purity, impPeaks: [{ rt, area, name }, ...],
  operator, rawFile
}
```

**다른 인원이 별도 개발 중인 HPLC CSV 파싱 HTML과 스키마 통일 필수.**

#### Phase C — 19번 DSC/TGA 데이터 입력

탭으로 DSC/TGA 분리. 측정값을 `measurement_dsc_tga/{lotId}/{timestamp}` 저장.

```javascript
{
  lotId, measuredAt,
  dsc: { tm },
  tga: { td5, td10, residue }
}
```

#### Phase D — 05·10·07·08번 데이터 소스 전환

현재 임시(파일 업로드) → Firebase 직접 조회로 전환.
- 05번: 흐름도·품질 데이터 모두 Firebase에서 읽기
- 10번: 이미 Firebase 사용 중. 새 경로(measurement_*) 추가 차트
- 07/08번: COA 발행 시 Firebase에서 측정값 자동 채우기

### 영향
- 데이터 입력 **1번**, 활용 **N번** (Closed Loop 형성)
- 신규 앱 추가 시 데이터 소스 걱정 없이 작성 가능
- 품질 추적성(traceability)이 진짜로 작동
- COA 자동 발행 가능

### 작업량
- Phase A: 1주
- Phase B: 1.5주 (외부 파싱 코드 통합 시간 포함)
- Phase C: 1주
- Phase D: 2주 (05·10·07·08 4개 앱 수정)
- **합계 약 5~6주**

---

## STAGE 5 — 운영·모니터링 강화

### 무엇을 / 왜
- 사용자가 오류 만나도 개발자가 알 길이 없음
- `_headers` 캐시 정책이 모든 파일을 `no-cache` 로 처리 → 정적 자산 매번 검증
- 품질 데이터 시스템에서 "누가 언제 수정했나" 감사 로그 부재 → 규제 위험

### 작업 계획

#### 5-1. `_headers` 캐시 정책 개선

**Before**
```
/*.html
  Cache-Control: no-store
/*
  Cache-Control: no-cache
```

**After**
```
/*.html
  Cache-Control: no-store

/assets/*
  Cache-Control: public, max-age=31536000

/apps/*
  Cache-Control: public, max-age=300

/*
  Cache-Control: no-cache
```
→ `/assets/*` (CSS·JS·이미지) 1년 캐시, `/apps/*` (앱 콘텐츠) 5분 캐시, HTML만 매번 새로.

#### 5-2. CDN 버전 핀 강화

**Before**
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
```
→ `@4` 만 명시 → minor 업데이트로 UI 깨질 수 있음

**After**
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0"></script>
```

#### 5-3. 에러 로깅 — `assets/js/error-logger.js`

```javascript
window.addEventListener('error', function(e) {
  if (typeof firebase === 'undefined') return;
  firebase.database().ref('error_logs').push({
    msg:   e.message,
    file:  e.filename,
    line:  e.lineno,
    user:  firebase.auth().currentUser ? firebase.auth().currentUser.email : null,
    at:    Date.now(),
    ua:    navigator.userAgent,
    href:  location.href
  }).catch(function() { /* silent */ });
});
window.addEventListener('unhandledrejection', function(e) {
  /* Promise reject 잡기 */
});
```

→ 모든 앱 head에 한 줄 추가하면 자동 수집.

→ 관리자용 간단한 조회 화면을 21번 앱으로 추가 (날짜·사용자별 오류 로그).

#### 5-4. 감사 로그 (audit log)

각 RTDB 쓰기에 `{modifiedBy, modifiedAt}` 메타 자동 부착.

**Helper 추가** — `assets/js/db-audit.js`
```javascript
window.QAAudit = {
  withMeta: function(data) {
    var u = firebase.auth().currentUser;
    return Object.assign({}, data, {
      _meta: {
        modifiedBy: u ? u.email : 'anonymous',
        modifiedAt: firebase.database.ServerValue.TIMESTAMP
      }
    });
  }
};
```

**사용 측**
```javascript
// Before
DB_REF.push(itemData);
// After
DB_REF.push(QAAudit.withMeta(itemData));
```

#### 5-5. Firebase API 키 도메인 제한 재확인

(STAGE 0 작업이지만 정기 재확인 필요)

### 영향
- 페이지 로딩 속도 향상 (정적 자산 재다운로드 X)
- 사용자 오류 자동 수집 → 관리자가 사후 조치 가능
- "누가 언제 수정했는지" 감사 가능 → 품질 시스템 신뢰성 확보
- 외부 의존성 안정화

### 작업량
- 5-1 캐시: 1시간
- 5-2 버전 핀: 2시간
- 5-3 에러 로거: 1일
- 5-4 감사 로그: 2일 (모든 RTDB 쓰기 위치 수정)
- **합계 약 1주**

---

## 추천 진행 일정

| 주차 | 단계 | 작업 |
|------|------|------|
| ✅ 완료 | STAGE 0 | Firebase Console 보안 점검 |
| ✅ 완료 | STAGE 1 | 공통 코드 추출 |
| 1주차 | STAGE 2 | postMessage Bridge 작성 + 표준 명세 |
| 2~3주차 | STAGE 5 | 캐시·버전 핀·에러로깅·감사로그 (운영 안정화 우선) |
| 4~7주차 | STAGE 3 | 대형 앱 리팩토링 (06 → 05 → 10 → 15) |
| 8~13주차 | STAGE 4 | 측정 데이터 앱 (20 → 18 → 19 → 데이터 소스 전환) |

> **권장 순서 이유**:
> - STAGE 2(통신 표준화) 먼저 → STAGE 4(데이터 흐름 구현) 시 활용
> - STAGE 5(운영) 빠르게 → 향후 작업의 안정성·디버깅 향상
> - STAGE 3(리팩토링) 중간 → STAGE 4 작업 시 06번을 또 건드릴 텐데 이미 정리돼 있어야 안전
> - STAGE 4(앱 구현) 마지막 → 가장 큰 작업, 다른 모든 토대가 준비된 후

---

## 종합 코드 리뷰 요약

(2026-05-05 리뷰 결과 요약)

| 영역 | 등급 | 핵심 메모 |
|------|------|---------|
| 아키텍처 | B | iframe 격리·탭 레지스트리 깔끔. main.js 응축 |
| 보안 | C → **B+** (STAGE 0·1 후) | 공통 모듈로 키 단일화 |
| 디자인 | B | --portal-* vs --* 격리 우수, 다크모드 미완성 |
| 기능 | C | 완성 7~8개 / WIP 9개 |
| 확장성 | C | vanilla JS 한계, 빌드 시스템 0 |
| 운영 | D | 모니터링·CDN fallback·환경 분리 부재 |
| 법규 | D → **B** (STAGE 0 후) | RTDB 규칙 적용으로 개선 |

**Overall: C+ → B (STAGE 1 완료 후)** — 보안·코드 중복은 정리됨. 운영·확장성은 후속 단계 필요.

---

## 부록 — STAGE 1 변경 파일 목록

### 신규 파일 (3개)
- `assets/js/firebase-config.js`
- `assets/js/theme-sync.js`
- `assets/js/utils.js`

### 수정된 파일 (20개)
- `index.html`, `login.html`
- `assets/js/auth_guard.js`
- `apps/05_cpl_quality/{index.html, app.js}`
- `apps/06_lot_schedule/{index.html, app.js}`
- `apps/10_quality_dashboard/{index.html, app.js}`
- `apps/15_pn_flow/{index.html, app.js}`
- `apps/01_oled_ivl_lt/index.html`
- `apps/03_hplc_dsc/index.html`
- `apps/14_sys_docs/index.html`
- `apps/16_lcms_converter/index.html`
- `apps/17_roadmap/index.html`
- WIP 10개: `apps/{04_sdc_eval, 07_coa_dev, 08_coa_prod, 09_ext_code, 11_complaint, 12_spec_ctq, 13_iqc, 18_hplc_data, 19_dsc_tga, 20_lot_flow}/index.html`

### 변경되지 않은 파일
- `apps/02_lgd_eval/` — GAS 외부 URL 앱이라 인라인 설정 의도적 유지
- `apps/05_cpl_quality/style.css`, 다른 CSS 파일들
- `assets/js/main.js` — Firebase 미사용 (탭 렌더링만)
