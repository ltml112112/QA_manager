# QA Manager — TODO

전체 코드 리뷰 결과 남은 작업 목록. 우선순위 높은 순.
이 파일만 보고 각 항목을 수정할 수 있도록 **파일 경로·라인·변경 전후 예시**까지 명시.

작업 브랜치: `claude/explore-web-frameworks-JfWQI`

---

## 진행 완료 (참고)

### 이전 리뷰분
- [x] `03_hplc_dsc/index.html` 전체 중복 문서 제거 (2830줄 → 1424줄)
- [x] `main.js` 잠금 토글 데드 코드 제거 (`_toggleLockedVisibility`, `_lockedHidden`, `_UK`)
- [x] `CLAUDE.md` 구버전 정정 (핑크 테마 색상값, 3-파일 구조, 섹션 번호, Step 4)
- [x] `global_style.css` 목차 동기화 + `--portal-text-faint` 정식 정의
- [x] `05_cpl_quality` Mermaid CDN/호출 제거, `#mermaid-viewer` → `#genealogy-viewer`
- [x] `06_lot_schedule` 데드 함수 제거 (`editItem`, `autoDept`)
- [x] `기능설명.md` 잠금 토글 문장 간단화
- [x] `01_oled_ivl_lt/index.html` 다크테마 하드코딩 색상 36군데 → CSS 변수 교체

### 이번 리뷰(2026-04-15) 확인분 — 이미 반영돼 있음
- [x] `05_cpl_quality` 검색 lowercase 캐싱 (`STATE.lotSearchIndex`) — `app.js:30, 527, 578`
- [x] `05_cpl_quality` 계보 엣지 중복 방지 `Set` — `app.js:742` (`edgeSet`)
- [x] `05_cpl_quality` BFS visited Set — `app.js:713, 741`
- [x] `06_lot_schedule` Firebase 개별 쓰기 헬퍼 — `app.js:101(addItem) / 107(updateItem) / 116(removeItem)` 신설, 객체 기반 스키마(`_arrToObj`)로 마이그레이션
- [x] `06_lot_schedule` 개별 등록 폼 날짜 상호 검증 — `app.js:613~626, 1240~1252` (`transferDate ≤ evalStart ≤ evalTarget`)
- [x] `06_lot_schedule` 조회 중 년/월 localStorage 저장 — `app.js:39(복원), 310(저장)` 키 `qa_lot_schedule_month`

---

## 🔴 치명 — 보안

### 1. Firebase Realtime Database 보안 규칙 설정

**위치**: Firebase 콘솔 (`qa-manager-9c145` 프로젝트 → Realtime Database → 규칙)

**현상**
- `CLAUDE.md:829` 에 "현재 테스트 모드 (`.read/.write: true`) — 추후 도메인 제한 예정" 명시
- Firebase URL을 아는 누구나 `lot_schedule`, `oled_results` 경로를 **읽기/쓰기/삭제 가능**
- 데이터베이스 URL은 `apps/06_lot_schedule/app.js:18` 에 평문 노출 (정상 — Firebase API 키는 공개용)
- 실제 위험은 보안 규칙

**조치안 (택 1)**

**A. 도메인 기반 제한 (간단, 익명 접근 유지)**
```json
{
  "rules": {
    ".read":  "auth == null || auth != null",
    ".write": "auth == null || auth != null",
    "lot_schedule":  { ".read": true, ".write": true },
    "oled_results":  { ".read": true, ".write": true }
  }
}
```
+ App Check(reCAPTCHA Enterprise) 활성화로 도메인(`*.pages.dev`, 내부 도메인) 이외 호출 차단

**B. 익명 인증 의무화 (권장)**
```json
{
  "rules": {
    ".read":  "auth != null",
    ".write": "auth != null"
  }
}
```
+ `apps/06_lot_schedule/app.js:24` 직후에 익명 로그인 추가:
```javascript
firebase.auth().signInAnonymously().catch(function(e){ console.error(e); });
```
+ `index.html` 에 `firebase-auth-compat.js` SDK 추가

**영향 범위**: `06_lot_schedule`만 Firebase 사용 중. 규칙 변경 시 이 앱만 검증하면 됨.

---

## 🟠 중요 — 버그/정합성

### 2. `15_calibration` 탭이 `main.js`에 누락됨

**파일**: `assets/js/main.js` (마지막 탭 항목 뒤, `];` 직전)

**현상**
- `apps/15_calibration/index.html` 플레이스홀더 파일 존재
- `CLAUDE.md` 에는 "문서 관리" 대분류 하위로 등록돼 있음 (line 26, 75, 382, 1092)
- 하지만 `main.js` `apps` 배열에는 누락 — 포털에서 탭이 안 보임
- 현재 마지막 탭은 `sys_docs` (line 154~162)

**수정**
`assets/js/main.js:162` 의 `sys_docs` 항목 뒤, `];` 앞에 아래 추가:
```javascript
  {
    id:          'calibration',
    group:       '문서 관리',
    label:       '측정기기 교정 일정',
    icon:        '·',
    badge:       null,
    src:         './apps/15_calibration/index.html',
    loaderText:  '측정기기 교정 일정 로딩 중...',
    locked:      true,
    wip:         true,
  },
```

**검증**: 저장 후 브라우저 새로고침 → 코드 입력 후 "문서 관리" 그룹에 탭 2개(`시스템 문서 & SOP`, `측정기기 교정 일정`)가 보이면 OK.

---

### 3. `06_lot_schedule/index.html` 타이틀 오탈자 ("test")

**파일**: `apps/06_lot_schedule/index.html:13`

**현상**
```html
<title>소자평가 Lot test 일정 관리</title>
```
개발 중 남은 흔적. 프로덕션 코드에 "test"가 노출됨.

**수정**
```html
<title>소자평가 Lot 일정 관리</title>
```

---

### 4. CLAUDE.md — Firebase 경로 표기 오류

**파일**: `CLAUDE.md`

**현상**
CLAUDE.md는 OLED 결과 저장 경로를 `lot_schedule_results/` 로 표기하지만, 실제 코드는 `oled_results/` 사용 중.
- `apps/06_lot_schedule/app.js:27`: `var RESULT_REF = _db.ref('oled_results');`

**수정 위치** (3군데)
| 라인 | 변경 전 | 변경 후 |
|------|---------|---------|
| `CLAUDE.md:842` | `// Firebase: lot_schedule_results/{lotId}` | `// Firebase: oled_results/{lotId}` |
| `CLAUDE.md:861` | `` > 저장 경로: `firebase.database().ref('lot_schedule_results')` (별도 경로, lot_schedule와 분리)  `` | `` > 저장 경로: `firebase.database().ref('oled_results')` (별도 경로, lot_schedule와 분리)  `` |
| `CLAUDE.md:1004` | ``` `loadResult(lotId)` / `saveResult(lotId, data)` | OLED 결과 로드 / Firebase 저장 (`lot_schedule_results/`) | ``` | ``` `loadResult(lotId)` / `saveResult(lotId, data)` | OLED 결과 로드 / Firebase 저장 (`oled_results/`) | ``` |

---

## 🟡 개선 — 성능

### 5. `06_lot_schedule` 캘린더 전체 재렌더 최소화

**파일**: `apps/06_lot_schedule/app.js`

**현상**
- 한 건 수정·완료처리·삭제마다 `renderCalendar()` 호출 → 전체 DOM 재생성
- Firebase `on('value')` 리스너도 전체 `renderCalendar()` 트리거 (line 151, 160)
- 일정 많은 달에서 편집 시 깜빡임·지연

**개선 방향**
- 변경된 Lot이 속한 셀만 부분 재렌더 — `renderCell(dateStr)` 헬퍼 신설
- `addItem`/`updateItem`/`removeItem` 성공 시 영향 셀만 재그리기
- Firebase 리스너는 최초 1회만 전체 렌더, 이후 diff 기반 반영 (낙관적 업데이트는 이미 된 상태이므로)

**우선순위 낮음**: 현재 UX 체감 문제가 크지 않으면 보류. 데이터 규모 커지면 착수.

---

### 6. 메일 붙여넣기 HTML 주입 처리

**파일**: `apps/06_lot_schedule/app.js:1910`

**현상**
```javascript
var div = document.createElement('div');
div.innerHTML = html;  // 클립보드 HTML을 그대로 주입
var table = div.querySelector('table');
```

- 사용자가 직접 붙여넣는 구조라 실질 공격 벡터는 낮음
- 다만 악성 이메일의 `<img onerror="..."/>`, `<iframe src="javascript:...">` 등이 실행될 여지 있음
- `<script>` 태그는 innerHTML로 주입해도 실행되지 않음 (브라우저 보안) — OK

**개선 방향 (선택)**
```javascript
// 옵션 1: DOMParser 사용 — 스크립트·이벤트 핸들러 실행 위험 제거
var doc = new DOMParser().parseFromString(html, 'text/html');
var table = doc.querySelector('table');

// 옵션 2: 속성 스크러빙 후 innerHTML
div.innerHTML = html;
div.querySelectorAll('*').forEach(function(el){
  [...el.attributes].forEach(function(a){
    if (a.name.startsWith('on') || a.value.toLowerCase().includes('javascript:')) {
      el.removeAttribute(a.name);
    }
  });
});
```

**우선순위 낮음**: 사내 포털 + 사용자 자기 클립보드 붙여넣기 구조라 현실 위협 거의 없음. 감사(audit) 대응용으로 대비만.

---

## 🟢 경미 — 코드 품질

### 7. 플레이스홀더 앱 공통화 (04, 07~15)

**파일**: `apps/04_sdc_eval/index.html`, `apps/07_coa_dev/` ~ `apps/15_calibration/`

**현상**
- 9개 앱의 `index.html`이 동일한 "개발 예정" 플레이스홀더를 복붙
- 스타일, 테마 동기화 IIFE 모두 중복

**개선 방향**
- 실제 기능 구현 시점에 어차피 파일 전체를 교체 → **지금 공통화 이득 없음**
- 실제 구현 PR에서 같이 정리하는 방침 유지

---

### 8. `01_oled_ivl_lt/index.html` 차트 fallback 색상 정리

**파일**: `apps/01_oled_ivl_lt/index.html`

**현상**
- Chart.js 컨텍스트 내 `getPropertyValue('--tx').trim() || '#e4e8f5'` 같은 fallback 값 잔존
- `--tx`는 `global_style.css` 3-C 섹션 alias로 살아있어 동작엔 문제 없음
- 구(舊) 테마 하드코딩 잔재

**개선 방향**
- `--tx` → `--text` 로 통일하고 fallback을 현재 라이트 테마 색(`#1e1a1b`)으로 교체
- 또는 fallback 제거 (CSS 변수가 항상 정의돼 있다는 가정)

**우선순위 낮음**: 동작 영향 없음. 테마 대변경 시 같이 처리.

---

### 9. `02_lgd_eval/index.html` 인라인 CSS 동기화 메모

**파일**: `apps/02_lgd_eval/index.html`

**현상**
- GAS로 배포되어 `../../assets/css/global_style.css` 상대경로 참조 불가 → 인라인 `:root` + 리셋 + 컴포넌트 CSS 유지
- 브랜드 색상 변경 시 `global_style.css` 만 바꾸면 **LGD 화면은 옛 색 유지** — 사고 주의

**운영 규칙**
- 브랜드 색상 변경 PR 체크리스트에 `apps/02_lgd_eval/index.html` 인라인 `:root` 동기화 포함
- 변경 후 Google Apps Script 편집기에서 **재배포 필수**

---

### 10. 중복 유틸 공통화 (장기)

**파일**: `apps/*/app.js` 전반

**현상**
- 여러 앱에서 비슷한 유틸 각자 구현
  - `esc` / `escHtml` / `escapeHtml` (06, 05 등)
  - `fmtVal` (05)
  - `normDate` / 날짜 포맷 (06)

**개선 방향**
- `assets/js/util.js` 신규 파일에 공통 유틸 정의
- 각 앱 `index.html` 에서 `<script src="../../assets/js/util.js"></script>` 개별 로드
- 주의: iframe 격리 구조라 ES 모듈 대신 전역 `window.QA_Util` 네임스페이스 권장

**우선순위 낮음**: 파일 추가 로드 비용 vs 중복 제거 이득 저울질. 앱 20개 이상 될 때 재검토.

---

## 운영 메모

- 색상 변경은 `global_style.css` 섹션 3-A (포털) / 3-B (앱) 만 수정
- 의미 색상(`.t td.blue/.red/.purple`, `.data-table .cell-ok/ng`)은 **브랜드 테마와 독립 고정값**
- 새 앱 추가 시 `apps/16_xxx/` 규칙 + `main.js` `apps` 배열만 수정 (`index.html`은 건드리지 않음)
- `02_lgd_eval` 는 GAS 배포본이라 상대경로 CSS 불가 → 인라인 유지 (예외)
- Firebase DB URL, API 키는 `apps/06_lot_schedule/app.js:14~23` 평문 노출 — 정상. Firebase는 공개 설계됨. 보안은 **Security Rules** 로 담보.
