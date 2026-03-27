# QA Manager - 전자재료사업부 품질경영팀 포털

## 프로젝트 개요

전자재료사업부 품질경영팀이 사용하는 업무 자동화 포털. 네 가지 도구로 구성됨:

1. **OLED IVL & LT 분석기** - OLED 소재 측정 CSV 데이터를 분석·시각화
2. **HPLC/DSC Report 자동생성** - 분석 데이터 기반 리포트 자동 생성
3. **LGD 사전심사자료 자동화** - Google Apps Script 기반 PDF/Excel 문서 자동 생성
4. **SDC 사전심사자료 자동화** - Google Apps Script 기반 구현 예정 (개발 중)
5. **소재 Lot 이력 & TREND 분석** - 전 소재 Lot 계보 추적 + 공정별 SPC TREND 시각화

**호스팅**: Cloudflare Pages 정적 호스팅 — 상대경로 직접 참조 방식 사용

---

## 파일 구조

```
QA_manager/
├── index.html                        # 포털 허브 (shell only — 탭/iframe은 JS가 생성)
├── LT소재 로고(영문).jpg              # 원본 로고 (하위 호환용)
├── assets/
│   ├── img/
│   │   └── lt_logo.jpg               # 포털 사이드바 로고
│   ├── css/
│   │   └── global_style.css          # 전체 디자인 시스템 (CSS 변수·컴포넌트·레이아웃)
│   └── js/
│       └── main.js                   # 탭·iframe 동적 렌더링 + 테마 관리
└── apps/
    ├── 01_oled_ivl_lt/
    │   └── index.html                # OLED IVL & LT 분석기
    ├── 02_lgd_eval/
    │   ├── index.html                # LGD 사전심사자료 자동화 UI (GAS 클라이언트)
    │   └── code.gs                   # Google Apps Script 백엔드
    ├── 03_hplc_dsc/
    │   └── index.html                # HPLC/DSC Report 자동생성
    ├── 04_sdc_eval/
    │   └── index.html                # SDC 사전심사자료 자동화 (개발 중 플레이스홀더)
    └── 05_cpl_quality/
        └── index.html                # 소재 Lot 이력 & TREND 분석 (단일 파일 앱)
```

---

## 핵심 아키텍처

### index.html — 포털 허브 (Shell)

`index.html`은 빈 컨테이너 역할만 함. 탭 버튼과 iframe은 **`main.js`가 런타임에 동적 생성**:

```html
<div class="sidebar">
  <nav class="tab-nav" role="tablist" aria-label="앱 목록">
    <!-- main.js가 탭 버튼 삽입 -->
  </nav>
</div>
<div class="frame-area"><!-- main.js가 iframe 래퍼 삽입 --></div>
<script src="./assets/js/main.js"></script>
```

탭을 추가/수정할 때 `index.html`은 **건드리지 않음** — `main.js`의 `apps` 배열만 수정.

### main.js — 앱 레지스트리

파일 최상단의 `apps` 배열이 포털의 전체 탭 구성을 정의함:

```javascript
const apps = [
  {
    id:         'oled',                             // 탭 식별자 (고유해야 함)
    label:      'OLED IVL & LT 분석기',              // 탭 버튼에 표시되는 이름
    icon:       '📊',                               // 탭 버튼 앞 아이콘
    badge:      null,                               // 뱃지 텍스트 (없으면 null)
    src:        './apps/01_oled_ivl_lt/index.html', // iframe src (상대경로 or 외부 URL)
    loaderText: 'OLED IVL & LT 분석기 로딩 중...',  // 로딩 오버레이 텍스트
    // sandbox: '...',                              // 외부 URL(GAS) 앱에만 추가 — 아래 설명 참고
  },
  // ... 나머지 앱
];
```

#### `sandbox` 필드 — 외부 URL(GAS) 앱 전용

로컬 상대경로 앱(`./apps/...`)에는 `sandbox` 불필요. **GAS 외부 URL** 앱에만 아래처럼 추가:

```javascript
{
  id:      'lgd',
  src:     'https://script.google.com/macros/s/.../exec',
  sandbox: 'allow-scripts allow-forms allow-same-origin allow-popups allow-downloads',
}
```

| 권한 | 이유 |
|------|------|
| `allow-scripts` | JS 실행 |
| `allow-forms` | 폼 제출 |
| `allow-same-origin` | `google.script.run` 동작 |
| `allow-popups` | 새 탭 열기 (구글시트 등) |
| `allow-downloads` | ZIP 파일 다운로드 |

`renderApps()`가 이 배열을 순회하며 `.tab-nav`에 탭 버튼을, `.frame-area`에 iframe 래퍼를 주입함.

### global_style.css — 디자인 시스템

모든 앱이 공유하는 CSS. 각 앱의 `<head>`에서 아래와 같이 참조:

```html
<link rel="stylesheet" href="../../assets/css/global_style.css">
```

앱별 고유 스타일만 `<style>` 블록에 남기고, 공통 변수·리셋·컴포넌트는 이 파일을 사용.

### 테마 동기화

- 포털 사이드바(`.sidebar`)는 **항상 라이트** — `--portal-*` 변수로 격리되어 테마 전환에 영향받지 않음
- 탭 콘텐츠(iframe 내부)만 라이트/다크 전환
- **현재 상태**: 테마 전환 버튼 미구현. `main.js`에 `postMessage` 전송 코드 없음
- **구현 시**: 포털이 `postMessage({ type: 'setTheme', theme })` 전송 → 각 앱이 수신

각 앱에 아래 수신 코드가 있어야 테마 동기화가 작동함 (현재 모든 앱에 포함되어 있음):

```javascript
(function() {
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('qa_theme', theme);
  }
  applyTheme(localStorage.getItem('qa_theme') || 'dark');
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'setTheme') applyTheme(e.data.theme);
  });
})();
```

---

## 디자인 시스템 (`global_style.css`)

### 테마 수정 가이드 — 어디를 건드려야 하나

파일은 8개 섹션으로 나뉨. 테마 관련 수정은 **섹션 3** 에서만 이루어짐.

#### 포털 사이드바 색상 변경 → 섹션 3-A

```css
/* global_style.css · 섹션 3-A */
:root {
  --portal-bg:           #f4f6fb;   /* 사이드바 배경 */
  --portal-surface:      #ffffff;   /* 사이드바 카드 배경 */
  --portal-surface-2:    #eef0f7;   /* 사이드바 2단계 표면 */
  --portal-border:       #d1d5e8;   /* 사이드바 구분선 */
  --portal-text:         #1a1f3e;   /* 사이드바 텍스트 */
  --portal-text-muted:   #6b7280;   /* 사이드바 보조 텍스트 */
  --portal-accent:       #be0039;   /* 활성 탭 강조색 */
  --portal-accent-hover: #d4004a;   /* 활성 탭 hover */
  --portal-success:      #10b981;   /* 가동 중 상태 점 */
  --portal-danger:       #ef4444;   /* 오류 상태 */
  --portal-warning:      #f59e0b;   /* 경고 상태 */
}
```

> 이 변수들은 `html[data-theme="dark"]`에서 **재정의되지 않음** → 다크 모드로 전환해도 사이드바는 항상 라이트.

#### 사이드바 너비

사이드바는 `260px` 고정. 변경 시 `global_style.css`에서 두 곳을 동시에 수정해야 함:

```css
.sidebar    { width: 260px; }   /* 섹션 5-A */
.frame-area { left: 260px; }    /* 섹션 5-F */
```

#### 앱 콘텐츠 라이트 기본값 변경 → 섹션 3-B

```css
/* global_style.css · 섹션 3-B */
:root {
  --bg:           #f4f6fb;          /* 앱 전체 배경 */
  --surface:      #ffffff;          /* 카드·패널 배경 */
  --surface-2:    #eef0f7;          /* 2단계 표면 (테이블 헤더 등) */
  --border:       #d1d5e8;          /* 테두리 */
  --border-hover: #b0b7d1;          /* hover 테두리 */
  --text:         #1a1f3e;          /* 본문 텍스트 */
  --text-muted:   #6b7280;          /* 보조 텍스트 */
  --text-faint:   #9ca3af;          /* 희미한 텍스트 (placeholder 등) */
  --accent:       #be0039;          /* 강조색 (버튼·링크) */
  --accent-hover: #d4004a;          /* 강조색 hover */
  --success:      #10b981;          /* 성공 */
  --danger:       #ef4444;          /* 오류·삭제 */
  --warning:      #f59e0b;          /* 경고 */
  --radius:       12px;             /* 카드 모서리 반경 */
  --radius-sm:    8px;              /* 인풋·버튼 모서리 반경 */
}
```

> 현재 기본 테마는 **라이트 모드** 기준으로 설정되어 있음.

#### 다크 모드 색상 변경 → 섹션 3-C (미구현 — 필요 시 추가)

```css
/* global_style.css · 섹션 3-C */
html[data-theme="dark"] {
  --bg:      #0f1117;
  --surface: #1a1f2e;
  /* ... 나머지 변수 오버라이드 */
}
```

> **주의**: 여기서 `--portal-*` 변수는 절대 추가하지 않음. 추가하는 순간 다크 모드에서 사이드바도 어두워짐.

#### 공통 컴포넌트 클래스

| 클래스 | 설명 |
|--------|------|
| `.btn .btn-primary` | 강조색 버튼 |
| `.btn .btn-secondary` | 테두리 버튼 |
| `.btn .btn-block` | 전체 너비 버튼 |
| `.btn .btn-lg / .btn-sm` | 크기 변형 |
| `.card` | 배경·테두리·그림자 카드 |
| `.card-header` | 카드 제목 영역 (하단 구분선 포함) |
| `.card-title` | 강조색 섹션 제목 |
| `.form-input` | 인풋 필드 (focus 링 포함) |
| `.form-select` | 셀렉트 박스 |
| `.form-label` | 라벨 (`.req` · `.opt` 서브클래스) |
| `.data-table` | 분석 결과 테이블 |
| `.dropzone` | 파일 드래그앤드롭 영역 |
| `.progress-track / .progress-fill` | 프로그레스 바 |
| `.badge-primary/success/danger/warning` | 상태 뱃지 |
| `.alert-success/danger/warning/info` | 알림 박스 |
| `.log-box` | 터미널형 로그 박스 |

---

## 새 도구 추가 가이드 (Step-by-Step)

> 현재 5개 도구(01~05)가 구현되어 있음. **6번째 이후 도구를 추가할 때** 이 순서를 따르면 됩니다.

### Step 1 — 폴더 및 파일 생성

`apps/` 아래에 번호와 이름을 붙인 폴더를 만들고 `index.html`을 생성:

```
apps/
└── 06_새도구이름/
    └── index.html
```

> 폴더명 규칙: `숫자두자리_영문이름` (예: `06_chemical_db`)

### Step 2 — index.html 기본 뼈대 작성

아래 구조를 복사해서 시작. **반드시 폰트 link + `global_style.css` 링크를 포함**:

```html
<!DOCTYPE html>
<html lang="ko" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="../../assets/css/global_style.css">
<style>
/* 이 앱만의 고유 스타일만 여기에 작성 */
body { padding: 24px; }
.container { max-width: 900px; margin: 0 auto; }
</style>
</head>
<body>
<div class="container">

  <div class="card">
    <div class="card-header">
      <span>🔧</span> 도구 제목
    </div>
    <!-- 콘텐츠 -->
  </div>

</div>
<script>
/* 테마 동기화 — 반드시 포함 */
(function() {
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('qa_theme', theme);
  }
  applyTheme(localStorage.getItem('qa_theme') || 'dark');
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'setTheme') applyTheme(e.data.theme);
  });
})();
</script>
</body>
</html>
```

**핵심 주의사항:**
- `global_style.css`에서 이미 제공하는 CSS(`:root` 변수, `* reset`, `body` 기본 스타일, `.card`, `.btn`, `.form-input` 등)는 `<style>`에 **다시 쓰지 말 것** — 중복
- 앱 고유 레이아웃과 특수 컴포넌트만 `<style>`에 추가

### Step 3 — main.js의 apps 배열에 등록

`assets/js/main.js` 파일 최상단 `apps` 배열에 항목 추가:

```javascript
const apps = [
  // ... 기존 항목들 ...
  {
    id:         '새도구아이디',              // 영문 고유값 (다른 id와 중복 불가)
    label:      '새 도구 이름',              // 탭 버튼에 표시할 한글 이름
    icon:       '🔧',                       // 이모지 아이콘
    badge:      null,                       // 뱃지 없으면 null, 있으면 예: 'NEW' 또는 'GAS'
    src:        './apps/06_새도구이름/index.html', // 상대경로 (또는 GAS 배포 URL)
    loaderText: '새 도구 로딩 중...',        // 로딩 오버레이 메시지
  },
];
```

> **이것만 하면 끝.** `index.html`은 수정할 필요 없음. 저장 후 배포하면 탭이 자동으로 나타남.

### Step 4 — 확인 체크리스트

- [ ] `apps/06_xxx/index.html` 존재하는가?
- [ ] `<html lang="ko" data-theme="dark">` 로 시작하는가?
- [ ] `<link rel="preconnect">` 2개 + Google Fonts `<link>` 포함되어 있는가?
- [ ] `<link rel="stylesheet" href="../../assets/css/global_style.css">` 포함되어 있는가?
- [ ] 테마 동기화 JS(`window.addEventListener('message', ...)`) 포함되어 있는가?
- [ ] `main.js`의 `apps` 배열에 올바른 `src` 경로로 등록했는가?
- [ ] `id`가 기존 앱들과 겹치지 않는가? (`oled`, `hplc`, `lgd`, `sdc`, `cpl` 사용 중)
- [ ] GAS 외부 URL 앱이라면 `sandbox` 필드를 추가했는가?

---

## 1. OLED IVL & LT 분석기 (`apps/01_oled_ivl_lt/index.html`)

### 기능 요약
- CSV 파일 드래그앤드롭 업로드 (최대 8개)
- 파일명 패턴으로 슬롯 자동 매칭
- REF/SAMPLE 비교 테이블 (4개 주요 조합 + 4개 추가 조합)
- LT 수명 곡선 차트, 스펙트럼 차트
- 요약 선택 및 클립보드 복사
- IndexedDB 임시저장 (최대 10개 세션)

### 파일 슬롯 구조
| 슬롯 키 | 역할 |
|---------|------|
| `REF_IVL1`, `REF_IVL2` | 기준 IVL 데이터 |
| `SAMPLE_IVL1`, `SAMPLE_IVL2` | 시료 IVL 데이터 |
| `REF_LT1`, `REF_LT2` | 기준 수명 데이터 |
| `SAMPLE_LT1`, `SAMPLE_LT2` | 시료 수명 데이터 |

### 파일명 인식 규칙
- `REF_` 또는 `SAMPLE_` 로 시작 (대소문자 무관)
- `IVL` 또는 `LT` (또는 한글 `수명`) 포함
- 숫자 `1` 또는 `2` 포함
- 예시: `REF_IVL1_sample.csv`, `SAMPLE_LT2_run3.csv`

### 분석 기준
- **측정 기준점**: J=10mA/cm² 행 (CSV 5번째 컬럼 기준으로 가장 가까운 값 탐색)
- **추출 지표**: 전압(V), 효율(cd/A), EQE(%), CIEx, CIEy, 최대파장(nm)
- **LT Low 모드**: LT95, LT94, LT93, LT92, LT91, LT90
- **LT High 모드**: LT99, LT98, LT97, LT96

### 색상 코딩 (비교 테이블)
| 범위 | 색상 | 의미 |
|------|------|------|
| ±5% 이내 | 파란색 | 정상 |
| ±5% 초과 | 빨간색 | 이상 |
| 105% 초과 | 보라색 | 우수 |

### 자동 요약 선택 로직
1. REF1-SAMPLE1 조합의 비율이 모두 97.5~102.5% 범위이고 파장 차이 ±2nm 이내이면 해당 조합 선택
2. 조건 미충족 시 4가지 조합 중 평균 편차가 가장 작은 조합 선택
3. LT: 양쪽 모두 ≥100hr인 레벨 중 가장 높은 레벨, 퍼센트는 가장 낮은 값 선택

### 주요 전역 변수
```javascript
fm = {}         // 파일 맵 {슬롯키: File 객체}
pd = {}         // 파싱된 데이터 {슬롯키: [[행데이터]]}
lastIvl = {}    // 최근 분석 IVL 결과
lastLtLv = {}   // 최근 분석 LT 레벨
sumSel = { ivl: -1, lt: -1, ivlRec: -1, ltRec: -1 }  // 요약 선택 상태
ivlDP = 1       // 소수점 자리수 (0, 1, 2)
ltMode = 'low'  // 'low' 또는 'high'
```

### JS가 동적으로 생성하는 클래스명 (절대 이름 변경 금지)
JS 코드가 `className`으로 직접 참조하는 클래스들. 이름을 바꾸면 표시가 깨짐:

`r1` `r2` `ev` `bh` `blue` `red` `purple` `ivl-d` `lt-sum` `sel-tag` `ok`

### IVL 결과 색상 — 브랜드 테마와 독립 고정값 (절대 CSS 변수로 바꾸지 말 것)

`.t td.blue`, `.t td.red`, `.t td.purple` 및 `global_style.css`의 `.data-table td.cell-ok/ng`는
**의미 있는 분석 결과 색상**이므로 브랜드 테마 변경에 따라가면 안 됨. 하드코딩 고정값 유지:

| 클래스 | 색상 | 의미 |
|--------|------|------|
| `.blue` / `cell-ok` | `#1d6fd6` | 정상 (±5% 이내) |
| `.red` / `cell-ng` | `#ef4444` | 이탈 (±5% 초과) |
| `.purple` / `cell-excellent` | `#7c3aed` | 우수 (105% 초과) |

### 데이터셋 색상
```
REF_IVL1:    #4a9eff  (파란색)
REF_IVL2:    #a855f7  (보라색)
SAMPLE_IVL1: #ef4444  (빨간색)
SAMPLE_IVL2: #f59e0b  (주황색)
```

---

## 2. HPLC/DSC Report 자동생성 (`apps/03_hplc_dsc/index.html`)

분석 데이터 기반 리포트 자동 생성 도구. 독립 실행 가능한 단일 HTML 파일.

---

## 3. LGD 사전심사자료 자동화 (`apps/02_lgd_eval/`)

### 구조
- **프론트엔드**: `index.html` (HTML 폼 + `google.script.run` API 호출)
- **백엔드**: `code.gs` (Google Apps Script)
- **템플릿**: Google Sheets (ID: `1kh2oBZYKXaadIJoZQJ5OPYZHlwZftiFpuIT45v2SjTk`)
- **탭 `src`**: GAS 배포 URL (외부 URL 직접 참조, 로컬 파일 아님)
- **iframe sandbox**: `allow-scripts allow-forms allow-same-origin allow-popups allow-downloads` — `main.js` `lgd` 항목에 설정됨

### 생성 파일 목록 (7개)
| 파일 | 유형 |
|------|------|
| MSDS.pdf | PDF |
| 경고표지.pdf | PDF |
| 구성제품확인서.pdf | PDF |
| 작업공정별관리요령.pdf | PDF |
| 비공개물질확인서.pdf | PDF |
| MSDS.xlsx | Excel |
| Checksheet.xlsx (비공개물질) | Excel |

### 파일명 규칙 (클라이언트 측)
- 모든 파일에 `LT소재_` 접두사 추가
- 비공개물질 관련 파일에 버전 문자열 추가: `(25.8월 Ver)`
- 구성제품확인서에서 말미 숫자 제거

> 버전 문자열 변경 시 `apps/02_lgd_eval/index.html`의 `PRIVATE_SUBSTANCE_VER` 상수 수정

### GAS 백엔드 처리 흐름
1. 템플릿 스프레드시트 복사 (임시)
2. `[[플레이스홀더]]` 형식으로 값 치환 (작성일, 제품명, 색상, 상품명1~3)
3. "설정" 시트에서 출력 구성 읽기
4. PDF는 `UrlFetchApp.fetchAll()`로 병렬 생성
5. Excel은 개별/묶음 구분하여 병렬 내보내기
6. base64 인코딩 후 클라이언트로 반환
7. 임시 파일 삭제 (finally 블록)

### "설정" 시트 컬럼 구조
| 컬럼 | 내용 |
|------|------|
| 0 | 시트이름 |
| 1 | 유형 (PDF / XLSX단일 / XLSX묶음) |
| 2 | 방향 (가로 = 가로, 그 외 = 세로) |
| 3 | 확대축소 (기본/너비맞춤/높이맞춤/페이지맞춤) |
| 4~7 | 여백 (상/하/좌/우) |
| 8 | 수평정렬 (가운데/왼쪽/오른쪽) |
| 9 | 수직정렬 (위/중간/아래) |
| 10 | 구성제품그룹 (0=전체, 1/2/3=상품명 수 기준 필터) |

### GAS 배포 URL 변경 시

`assets/js/main.js`의 `apps` 배열에서 `lgd` 항목의 `src` 값을 새 URL로 교체:

```javascript
{ id: 'lgd', src: 'https://script.google.com/macros/s/새배포URL/exec', ... }
```

---

## 4. SDC 사전심사자료 자동화 (`apps/04_sdc_eval/`)

현재 **개발 중**. `apps/04_sdc_eval/index.html`에 "준비 중" 플레이스홀더 페이지가 있음.

### 구현 계획
- LGD 사전심사자동화와 동일하게 Google Apps Script 기반으로 구현 예정
- GAS 배포 완료 후 `main.js`의 `sdc` 항목 `src`를 GAS URL로 교체하거나 `index.html`에 직접 구현

### GAS 배포 URL 연결 시

```javascript
{ id: 'sdc', src: 'https://script.google.com/macros/s/새배포URL/exec', ... }
```

---

## 5. 소재 Lot 이력 & TREND 분석 (`apps/05_cpl_quality/`)

모든 소재의 Lot 계보 추적 + 공정별 SPC TREND를 확인하는 도구.
단일 HTML 파일(`index.html`)에 CSS·HTML·JS 전부 포함.

### CDN 라이브러리
```html
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
```

### 화면 레이아웃

```
[업로드 바: 흐름도 데이터(좌) | 품질 데이터(우)]
────────────────────────────────────────────────
[사이드바 (280px)]  |  [메인 패널 (flex:1, overflow-y:auto)]
  - 검색창           |    - Lot Genealogy Flow 카드 (⎘ 계보 복사 버튼 포함)
  - 단계 필터 탭     |    - 품질 데이터 추적 요약 카드
  - Lot 목록         |    - Batch Deep-Dive 카드
    (단계별 그룹,    |    - SPC 차트
     기본 첫 그룹만  |
     펼침)           |
```

- **흐름도 파일만 업로드** → 사이드바 + 계보도 즉시 표시
- **품질 파일 추가 업로드** → SPC 차트 추가 표시
- 두 파일은 독립적이나 연동됨 (흐름도=계보 뼈대, 품질=각 Lot 측정값)

### 입력 파일 2종

#### 파일 ①: 흐름도 데이터 (Excel) — 드롭존 왼쪽
| 행 | 내용 |
|----|------|
| 1 | "1단계" ~ "N단계" 헤더 (병합셀) |
| 2 | 단계별 서브컬럼: `LOTNUM`, `비고 LOTNUM`, `품목코드`, `품목명`, `투입량` |
| 3+ | 데이터 — 완제품→원료 역추적 관계 |

- **LOTNUM**: 각 단계의 주 Lot 번호
- **비고 LOTNUM**: 해당 Lot의 비고용 Lot 번호 (있을 때만 사이드바·계보도에 남색으로 표시)
- 컬럼 감지: 첫 번째 LOT 계열 컬럼 → `mainLotCol`, 두 번째 또는 "비고" 포함 컬럼 → `remarkLotCol`

#### 파일 ②: 품질 데이터 (Excel) — 드롭존 오른쪽
| 행 | 내용 |
|----|------|
| 1 | 대분류 (병합셀) — 공정단계명 ("PH633 합성원재료(TPBC) COA" 등) |
| 2 | 중분류 (병합셀) — 소재코드 |
| 3 | 소분류 — 측정항목명 ("순도(%)", "Tm(℃)" 등) |
| 4 | 상세헤더 — "Batch No.", 항목별 규격 표기 |
| 5 | **기준 행** — "기준", "USL", "LSL", "UCL", "LCL" 라벨 |
| 6+ | **데이터 행** — Batch별 측정값 + 기준값(반복) |

### 전역 STATE 구조
```javascript
STATE = {
  qualityWb:       null,   // 품질 데이터 워크북
  flowWb:          null,   // 흐름도 워크북
  qualityRecords:  [],     // [{stage, batchNo, itemLabel, value, USL, LSL, UCL, LCL}]
  byOutputLot:     {},     // 완제품Lot → [원료Lot, ...]
  byInputLot:      {},     // 원료Lot  → [완제품Lot, ...]
  lotMeta:         {},     // Lot → {itemCode, itemName, remark}
  lotStage:        {},     // Lot → 단계 인덱스 (0=완제품/1단계, N=원료/마지막단계)
  stageLabels:     [],     // 흐름도 Excel 헤더 라벨 ["1단계","2단계",...]
  stageTypeLabels: [],     // 실제 공정명 ["완제품","정제1차품","정제원재료",...]
  selectedLot:     null,
  selectedBatch:   null,
  traceDir:        'backward', // 'backward' | 'forward'
  filterStage:     null,       // null=전체, 숫자=해당 stageIdx만 표시 (단계 필터 탭)
  chartInstances:  [],
}
```

### 주요 함수 목록
| 함수 | 역할 |
|------|------|
| `detectFileType(wb, slotHint)` | 첫 15행 스캔 → 품질/흐름도 자동판별 |
| `forwardFillMerges(ws, rows)` | 병합셀 forward-fill |
| `parseSubCols(rows, stages)` | 흐름도 서브컬럼 감지 (mainLotCol/remarkLotCol/품목코드/품목명) |
| `parseFlowRows(rows, subCols)` | 흐름도 데이터 행 파싱 → byOutput/byInput/lotMeta/lotStage |
| `classifyColumns(row3, row4)` | 품질 파일 컬럼 역할 분류 (batchNo/value/USL/LSL/UCL/LCL) |
| `parseQualityData()` | 품질 파서 진입점 → `STATE.qualityRecords` 채움 |
| `parseFlowData()` | 흐름도 파서 진입점 → `byOutputLot/byInputLot/lotMeta` 채움 |
| `onFlowReady()` | 흐름도 업로드 완료 → 사이드바+계보도 즉시 렌더, 품질도 있으면 SPC 추가 |
| `onQualityReady()` | 품질 업로드 완료 → 흐름도 있으면 SPC 차트 렌더 |
| `tryRenderAll()` | 흐름도만 있어도 사이드바 렌더, 둘 다 있으면 SPC 추가 |
| `renderStageFilterBar()` | 단계 필터 탭 렌더링 (전체 / 완제품 / 정제1차품 / ...) |
| `renderLotGroups(query)` | 단계별 그룹 목록 렌더링 (필터·검색 적용, 첫 그룹만 기본 펼침) |
| `renderSidebar()` | 사이드바 전체 초기화 |
| `collectFullChain(lot)` | 양방향 BFS → 전체 계보 노드·엣지 수집 (중복 엣지 즉시 dedup) |
| `assignLotColumns(nodes, edges)` | 각 Lot에 displayCol 할당 (원료=0, 완제품=N) |
| `computeLayout(nodes, edges, ...)` | barycentric tree layout 계산 (stretch 후 push-down 중첩 해소 포함) |
| `renderGenealogy(lot)` | 절대좌표 tree layout 계보도 렌더링 |
| `copyGenealogyToClipboard()` | 계보 rowspan HTML → 클립보드 복사 (Excel 병합 셀로 붙여넣기 가능) |
| `drawGenealogyConnections(...)` | SVG 연결선 그리기 |
| `renderSpcCharts()` | 공정단계별 SPC 차트 전체 렌더링 |
| `handleChartClick(batchNo)` | 차트 포인트 클릭 → Deep-Dive 진입 |
| `highlightBatch(batchNo)` | 전체 차트에서 해당 Batch 하이라이트 |
| `renderDeepDive(batchNo)` | Batch 전 공정 데이터 패널 표시 (수치 소수 3자리) |
| `renderTrackingTable(lot)` | 선택 Lot + 연관 Lot 추적 테이블 |
| `fmtVal(v)` | 숫자 → 소수 3자리 포맷 (후행 0 제거) |

### 사이드바 동작 규칙
- **단계 필터 탭**: 검색창 아래에 `전체 | 완제품 | 정제1차품 | ...` 버튼 표시. 단계가 1개면 숨김
- **그룹 기본 상태**: 첫 번째 그룹(완제품)만 펼침, 나머지 접힘
- **검색 범위**: Lot번호 + 비고 LOTNUM 모두 검색됨 (`matchLot` 함수)
- **정렬**: 전 단계 내림차순 (`localeCompare` 역순)
- **비고 표시**: `lotMeta[lot].remark` 있을 때만 남색(`#4a7fc1`)으로 Lot번호 옆에 표시

### 계보도(Genealogy Flow) 동작 규칙
- **레이아웃**: 원료(좌) → 완제품(우), 절대좌표 tree layout
- **노드 높이**: `SLOT_H = 64px` (기본), 자식 여럿이면 stretch
- **stretch 후 중첩**: `④-b` 단계에서 실제 `h` 기준 push-down 재해소
- **중복 화살표 방지**: `pushEdge()` 헬퍼로 엣지 생성 시점에 즉시 dedup
- **비고 표시**: 노드 내 Lot번호 아래에 남색(`#4a7fc1`) 동일 폰트로 표시
- **⎘ 계보 복사 버튼**: 카드 헤더 우측. 클릭 시 rowspan HTML 테이블을 클립보드 복사 → Excel 붙여넣기 시 병합 셀 생성

### 계보 복사 Excel 형식
- 컬럼: 완제품(좌) → 원료(우), 단계명이 헤더
- 행: DFS로 열거한 완전 경로 (1완제품이 N원료 사용 시 N행으로 펼침)
- 같은 컬럼에서 연속 동일값 → `rowspan`으로 병합
- 비고 있는 Lot: `LOT번호 (비고값)` 형태

### 파일 자동판별 로직 (`detectFileType`)
- 첫 15행 전체 텍스트에서 `USL` / `LSL` / `BATCH NO` 키워드 → **품질 파일**
- 첫 3행에서 `단계` 키워드 → **흐름도 파일**
- 두 조건 모두 해당 시 품질 우선, 미검출 시 드롭존 슬롯(slotHint) fallback

### SPC 차트 색상 규칙
| 선 | 색상 | 스타일 |
|----|------|--------|
| UCL / LCL | `#ef4444` 빨간색 | 점선 `[6,3]` |
| USL / LSL | `#f59e0b` 주황색 | 실선 |
| 이탈 포인트 | `#ef4444` 빨간색 | 포인트 색상 |
| 정상 포인트 | `#4a9eff` 파란색 | 포인트 색상 |

### Batch Deep-Dive 패널
- SPC 차트 포인트 클릭 시 활성화
- 위치: 품질 데이터 추적 요약 아래, SPC 차트 위
- 수치 표시: `fmtVal()` 적용 — 소수 3자리, 후행 0 제거
- 표시 항목: 측정항목, 측정값, USL, LSL, UCL, LCL, 판정(OK/NG)

---

## 개발 시 주의사항

1. **앱 수정 후 파일 저장 → 배포**만 하면 바로 반영됨 (base64 재인코딩 불필요)

2. **로고 이미지 경로**
   - 포털(`index.html`)에서: `./assets/img/lt_logo.jpg`
   - 루트의 원본 `LT소재 로고(영문).jpg`는 하위 호환용으로 유지

3. **`code.gs` 수정 시**: Google Apps Script 편집기에서 배포(새 버전)해야 반영됨

4. **파일명에 한글·공백 포함** (`LT소재 로고(영문).jpg`) — 경로 처리 시 주의

5. **앱에서 CSS 작성 시 중복 금지**: `:root` 변수, `* reset`, `body` 기본 스타일, `.card`, `.btn`, `.form-input` 등은 `global_style.css`가 이미 제공. 앱 고유 레이아웃만 `<style>`에 추가
   - **예외 — `02_lgd_eval/index.html`**: 이 앱은 GAS URL로 서빙되어 `global_style.css` 상대경로가 동작하지 않음. 인라인 `:root`·리셋·컴포넌트 CSS는 GAS 단독 실행 fallback으로 **의도적으로 유지**함
   - **브랜드 테마 변형 시 주의**: `global_style.css`의 색상 변수를 바꿔도 LGD 앱 GAS 화면에는 반영 안 됨. `apps/02_lgd_eval/index.html` 인라인 `:root` 변수도 **반드시 같이 수정**하고 GAS에 재배포해야 함

6. **구형 변수명 호환**: `global_style.css` 섹션 3-D에 각 앱이 기존에 쓰던 변수명(`--bdr`, `--tx`, `--ink`, `--primary`, `--error` 등)이 alias로 정의되어 있음 — 기존 앱 코드를 수정하지 않아도 동작

---

## 브랜치 전략

- 작업 브랜치: `claude/` 접두사 사용
- PR 머지 대상: `main`
