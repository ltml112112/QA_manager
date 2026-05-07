# QA Manager — TODO & 개선 계획

> Last updated: 2026-05-07
>
> 미결 작업 + 향후 개선 계획. 우선순위 높은 순.
> 완료된 작업의 상세 before/after는 git history 참조 (구 `plan.md`).

---

## 진행 현황

| 단계 | 상태 | 작업 시점 | 비고 |
|------|------|----------|------|
| STAGE 0 — RTDB 보안 점검 | ✅ 완료 | 2026-05-05 | RTDB 규칙 + API 키 도메인 제한 적용. 자세히는 `docs/architecture/auth.md` 6절 |
| STAGE 1 — 공통 코드 추출 | ✅ 완료 | 2026-05-05 | `firebase-config.js`, `theme-sync.js`, `utils.js` 신설 — 6곳 평문 config + 16곳 IIFE 통합 |
| STAGE 2 — 앱 간 통신 표준화 | ⏳ 예정 | — | postMessage Bridge (아래 §1) |
| STAGE 3 — 대형 앱 리팩토링 | ⏳ 예정 | — | 06·05·10·15 함수 분해 (아래 §2) |
| STAGE 4 — 측정 데이터 입력 앱 구현 | ⏳ 예정 | — | 18·19·20번 (아래 §3) |
| STAGE 5 — 운영·모니터링 강화 | ⏳ 예정 | — | 캐시·로깅·감사 (아래 §4) |

> **추천 진행 순서**: STAGE 2 → STAGE 5 → STAGE 3 → STAGE 4
> (통신 표준화·운영 안정화 → 리팩토링 → 신규 앱 구현)

---

## 🟡 성능 — 즉시 착수 가능

### `06_lot_schedule` 캘린더 전체 재렌더 최소화

**파일**: `apps/06_lot_schedule/app.js`

- 한 건 수정·완료처리·삭제마다 `renderCalendar()` 전체 DOM 재생성
- Firebase `on('value')` 리스너도 전체 `renderCalendar()` 트리거
- 개선: 변경된 Lot 셀만 부분 재렌더 (`renderCell(dateStr)` 헬퍼 신설)

**우선순위 낮음**: 데이터 규모 커지면 착수.

---

## §1. STAGE 2 — 앱 간 통신 표준화

### 배경
01번(OLED) 앱이 06번(일정)에 분석 결과를 전달할 때, **두 앱이 같은 Firebase 경로(`oled_results`)를 약속해서 우회 통신**하고 있음. 한쪽이 경로를 바꾸면 조용히 깨짐. 테마 동기화 외에는 직접적인 앱 ↔ 앱 / 포털 ↔ 앱 통신 채널이 부재.

### 작업 계획

**`assets/js/portal-bridge.js` 신규 작성**
```javascript
window.QABridge = {
  send: function(type, payload) {
    window.parent.postMessage({ source: 'qa-app', type: type, payload: payload }, '*');
  },
  on: function(type, handler) {
    window.addEventListener('message', function(e) {
      if (e.data && e.data.source === 'qa-app' && e.data.type === type) {
        handler(e.data.payload, e.source);
      }
    });
  },
  sendTo: function(appId, type, payload) {
    var iframe = document.getElementById('frame-' + appId);
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ source: 'qa-app', type: type, payload: payload }, '*');
    }
  }
};
```

**표준 이벤트 명세 (작업 시 영구 문서화)**

| type | payload | 누가 보냄 | 누가 받음 | 목적 |
|------|---------|---------|---------|------|
| `oledResult.saved` | `{ lotId, ivl, lt }` | 01 (embed 모드) | 06 | OLED 결과 저장 알림 |
| `lotSchedule.openLot` | `{ lotId }` | 05 (Lot 클릭) | 06 | 06번 일정으로 점프 + 강조 |
| `dashboard.filter` | `{ material, range }` | 10 → 포털 | 다른 앱 | 공통 필터 broadcast |

**예상 작업량**: 신규 파일 1개(~30줄) + 01·06번 통신 코드 교체(~20줄) + 문서 업데이트. **3~5일**

---

## §2. STAGE 3 — 대형 앱 리팩토링

### 배경
- `06_lot_schedule/app.js` **2143줄**, `05_cpl_quality/app.js` **1887줄** — 단일 파일에 모든 로직 응축
- 전역 STATE 객체에 모든 상태 저장 → 함수 호출 순서·부작용 추적 어려움
- 함수 1개가 500줄 넘는 경우 (예: `renderCalendar()`)

### 작업 계획 (06번 예시)

```
06_lot_schedule/
├── index.html        (스크립트 로드 순서만 변경)
├── style.css
└── js/
    ├── app.js              (~50줄: 진입점)
    ├── state.js            (~100줄: STATE getter/setter)
    ├── firebase-sync.js    (~150줄)
    ├── calendar.js         (~400줄)
    ├── modal-date.js       (~300줄)
    ├── modal-individual.js (~200줄)
    ├── modal-mail.js       (~400줄)
    ├── oled-result.js      (~250줄)
    └── utils.js            (~100줄)
```

**원칙**: 함수 50~100줄 이내, 한 함수 한 책임, 전역 상태는 `getState()`/`setState()` 캡슐화.

**진행**: 한 번에 다 하지 말고 한 앱씩 끝낸 후 다음 앱(06 → 05 → 10 → 15).

**예상 작업량**: 앱당 5~7일 × 4개 = **약 3~4주**. 기능 변화 0.

---

## §3. STAGE 4 — 측정 데이터 입력 앱 구현

### 배경 — 현재 막힌 흐름

```
[01 OLED 결과] → 06 일정 ✅
[HPLC 측정값]  → ??? (입력 경로 없음) → 05 추적·10 대시보드·07/08 COA
[DSC/TGA]      → ??? (입력 경로 없음) → 같음
[Lot 흐름도]   → 매번 Excel 업로드 → 05번 (브라우저 세션에서만 보임)
```

18·19·20번 앱이 WIP 플레이스홀더라 **05·10·07·08번이 받을 데이터가 없음**.

### Phase A — 20번 Lot 흐름도 관리 (가장 기반)

```javascript
// lot_flow/{uploadId}
{
  uploadedAt, uploadedBy, fileName,
  stageLabels: ['1단계', '2단계', '3단계'],
  relations:   [{ outputLot, inputLot, stage }, ...],
  lotMeta:     { 'LT-PHM295-...': { itemCode, itemName, remark } }
}
```

**05번 변경**: 흐름도 드롭존 비활성화, "Firebase 자동 로드" 표시. 품질 데이터 드롭존만 유지.

### Phase B — 18번 HPLC 데이터 입력

```javascript
// measurement_hplc/{lotId}/{timestamp}
{ lotId, measuredAt, purity, impPeaks: [{ rt, area, name }, ...], operator, rawFile }
```

> 다른 인원이 별도 개발 중인 HPLC CSV 파싱 HTML과 스키마 통일 필수.

### Phase C — 19번 DSC/TGA 데이터 입력

```javascript
// measurement_dsc_tga/{lotId}/{timestamp}
{ lotId, measuredAt, dsc: { tm }, tga: { td5, td10, residue } }
```

### Phase D — 05·10·07·08번 데이터 소스 전환

현재 임시(파일 업로드) → Firebase 직접 조회.

**예상 작업량**: A 1주 + B 1.5주 + C 1주 + D 2주 = **약 5~6주**

### 품질 데이터 표준화 (Phase B/D 시점에 같이 검토)

#### CTQ/CTP 마스터 + 표준 데이터 모델

12번 앱을 마스터로 채우고 품질 데이터는 코드로 매핑해서 저장.

```js
// 12번 앱 (마스터)
MaterialSpec: {
  productCode: 'PG1088',
  stageCode:   'PURIFY_1ST',
  paramCode:   'PURITY',
  unit:        '%',
  USL: 99.9, LSL: 99.0, UCL: ..., LCL: ...,
  type:        'CTQ',     // 'CTQ' | 'CTP'
}

// 05번 앱 (측정값 누적)
Measurement: {
  productCode, stageCode, lotId, batchNo,
  paramCode, value, measuredAt, source: 'COA-2025-04',
}
```

→ 텍스트가 아닌 `paramCode` 로 join → 양식 흔들려도 안전, 제품 간 동일 항목 비교 가능.

#### 업로드 표준화 — 두 옵션 (A → B 단계적)

| | A. 매핑 프로파일 | B. 표준 템플릿 강제 |
|---|---|---|
| 방식 | 첫 업로드 시 컬럼 → `paramCode` 매핑을 1회 지정·저장 | 모든 제품 동일 양식 |
| 입력 부담 | 낮음 | 높음 |
| 안정성 | 중 | 높음 |

→ A 부터 시작, 안정되면 B 로 수렴.

#### 표준화·누적 후 열리는 분석들

1. **계보도 컬러 오버레이** — 각 Lot 노드 OK/Warning/NG 자동 채색
2. **CTQ 백트레이스** — 완제품 Spec OUT → 계보 backward로 원인 단계 자동 하이라이트
3. **공정×항목 히트맵** — 행=공정단계, 열=측정항목, 셀=Cpk 색상
4. **원료↔완제품 상관 산점도** — 계보 매칭 자동 페어링
5. **드리프트 알람** — Western Electric Rules (7점 연속 추세 등)
6. **제품 비교 대시보드** (10번 앱 연동) — 같은 `paramCode` 모든 제품 Cpk 비교

#### 권장 1차 스코프

1. 12번 앱에 `MaterialSpec` 마스터 등록 UI (Firebase 저장)
2. 05번 앱 품질 업로드 → 컬럼 → `paramCode` 매핑 프로파일 저장
3. 측정값을 Firebase에 누적 저장
4. 계보도 OK/NG 컬러 오버레이 + CTQ 백트레이스 1개만 우선

**핵심 트레이드오프**: 표준화 = "마스터 등록 1회 부담"의 대가로 분석 가치 기하급수적으로 증가. 마스터를 누가/언제 채울지가 실패 포인트.

---

## §4. STAGE 5 — 운영·모니터링 강화

### `_headers` 캐시 정책 개선

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

→ `/assets/*` 1년 캐시, `/apps/*` 5분 캐시, HTML만 매번 새로.

### CDN 버전 핀 강화

```html
<!-- Before -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<!-- After -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0"></script>
```

### 에러 로깅 — `assets/js/error-logger.js` 신규

```javascript
window.addEventListener('error', function(e) {
  if (typeof firebase === 'undefined') return;
  firebase.database().ref('error_logs').push({
    msg: e.message, file: e.filename, line: e.lineno,
    user: firebase.auth().currentUser ? firebase.auth().currentUser.email : null,
    at: Date.now(), ua: navigator.userAgent, href: location.href
  }).catch(function() { /* silent */ });
});
window.addEventListener('unhandledrejection', function(e) { /* ... */ });
```

→ 모든 앱 head에 한 줄 추가 + 관리자 조회 화면(21번 앱)으로 추가.

### 감사 로그 (audit log)

각 RTDB 쓰기에 `{modifiedBy, modifiedAt}` 메타 자동 부착.

```javascript
// assets/js/db-audit.js
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

// 사용 측
DB_REF.push(QAAudit.withMeta(itemData));
```

**예상 작업량**: 캐시 1시간 + 버전 핀 2시간 + 에러 로거 1일 + 감사 로그 2일 = **약 1주**

---

## 운영 메모

- 색상 변경은 `global_style.css` 섹션 3-A (포털) / 3-B (앱) 만 수정
- 의미 색상(`.t td.blue/.red/.purple`, `.data-table .cell-ok/ng`)은 브랜드 테마와 독립 고정값
- 새 앱 추가 시 `apps/{번호}_xxx/` 규칙 + `main.js` `apps` 배열만 수정 (`index.html` 건드리지 않음). 자세히는 `docs/guides/new-app-checklist.md`
- Firebase DB URL·API 키 평문 노출 — 정상. 보안은 Security Rules로 담보. RTDB 규칙은 `@ltml.co.kr` 도메인 + 인증 필요로 설정 완료.
- `02_lgd_eval`은 GAS 배포 구조라 `global_style.css` 상대경로 불가 → 인라인 `:root` 유지. 브랜드 색상 변경 시 `apps/02_lgd_eval/index.html` 인라인 `:root`도 같이 수정 후 GAS 재배포 필요.
