# QA Manager - 전자재료사업부 품질경영팀 포털

## 프로젝트 개요

전자재료사업부 품질경영팀이 사용하는 업무 자동화 포털.
사이드바는 5개 대분류로 구성되며, 탭 추가/삭제는 `main.js`의 `apps` 배열만 수정하면 됨.

### 대분류별 탭 구성

| 대분류 | id | 탭 이름 | 상태 |
|--------|-----|---------|------|
| **소자평가** | `oled` | OLED IVL & LT 분석 | 구현 완료 |
| | `lotschedule` | 소자평가 Lot 일정 관리 | 구현 완료 |
| **자동화** | `hplc` | HPLC/DSC Report 자동화 | 구현 완료 (locked) |
| | `lgd` | LGD 사전심사자료 자동화 | 구현 완료 (locked, GAS) |
| | `sdc` | SDC 사전심사자료 자동화 | 링크만 (locked) |
| | `coa_dev` | COA 생성 — 개발용 | 개발 예정 (locked) |
| | `coa_prod` | COA 생성 — 양산용 | 개발 예정 (locked) |
| | `ext_code` | 외부코드 관리 (고객사별) | 개발 예정 (locked) |
| **품질 데이터** | `cpl` | Lot 추적관리 & SQC | 구현 완료 (locked) |
| | `dashboard` | 품질 대시보드 | 개발 예정 (locked) |
| | `complaint` | 불량·컴플레인 관리 | 개발 예정 (locked) |
| **제품·소재 관리** | `spec_ctq` | 제품 Spec & CTQ/CTP | 개발 예정 (locked) |
| | `iqc` | 원자재 입고검사 (IQC) | 개발 예정 (locked) |
| **문서 관리** | `sys_docs` | 시스템 문서 & SOP | 개발 예정 (locked) |

**호스팅**: Cloudflare Pages 정적 호스팅 — 상대경로 직접 참조 방식 사용

---

## 파일 구조

```
QA_manager/
├── index.html                        # 포털 허브 (shell only — 탭/iframe은 JS가 생성)
├── login.html                        # 로그인 페이지 (Firebase Auth)
├── register.html                     # 회원가입 페이지 (@ltml.co.kr 전용)
├── LT소재 로고(영문).jpg              # 원본 로고 (하위 호환용)
├── assets/
│   ├── img/
│   │   └── lt_logo.jpg               # 포털 사이드바 로고
│   ├── css/
│   │   └── global_style.css          # 전체 디자인 시스템 (CSS 변수·컴포넌트·레이아웃)
│   └── js/
│       ├── main.js                   # 탭·iframe 동적 렌더링 + 역할 기반 탭 제어
│       └── auth_guard.js             # 앱별 직접 URL 접근 차단 (인증 게이트)
└── apps/
    ├── 01_oled_ivl_lt/
    │   └── index.html                # OLED IVL & LT 분석기 [소자평가]
    ├── 02_lgd_eval/
    │   ├── index.html                # LGD 사전심사자료 자동화 UI (GAS 클라이언트) [자동화]
    │   └── code.gs                   # Google Apps Script 백엔드
    ├── 03_hplc_dsc/
    │   └── index.html                # HPLC/DSC Report 자동생성 [자동화]
    ├── 04_sdc_eval/
    │   └── index.html                # SDC 사전심사자료 자동화 (링크) [자동화]
    ├── 05_cpl_quality/
    │   └── index.html                # 소재 Lot 이력 & TREND 분석 [품질 데이터]
    ├── 06_lot_schedule/
    │   └── index.html                # 소자평가 Lot 일정 관리 [소자평가]
    ├── 07_coa_dev/
    │   └── index.html                # COA 생성 — 개발용 (개발 예정) [자동화]
    ├── 08_coa_prod/
    │   └── index.html                # COA 생성 — 양산용 (개발 예정) [자동화]
    ├── 09_ext_code/
    │   └── index.html                # 외부코드 관리 (개발 예정) [자동화]
    ├── 10_quality_dashboard/
    │   └── index.html                # 품질 대시보드 (개발 예정) [품질 데이터]
    ├── 11_complaint/
    │   └── index.html                # 불량·컴플레인 관리 (개발 예정) [품질 데이터]
    ├── 12_spec_ctq/
    │   └── index.html                # 제품 Spec & CTQ/CTP (개발 예정) [제품·소재 관리]
    ├── 13_iqc/
    │   └── index.html                # 원자재 입고검사 IQC (개발 예정) [제품·소재 관리]
    └── 14_sys_docs/
        └── index.html                # 시스템 문서 & SOP (개발 예정) [문서 관리]
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
    group:      '소자평가',                          // 사이드바 대분류 헤더
    label:      'OLED IVL & LT 분석',               // 탭 버튼에 표시되는 이름
    icon:       '·',                                // 탭 버튼 앞 dot (이모지 사용 안 함)
    badge:      null,                               // 뱃지 텍스트 (없으면 null)
    src:        './apps/01_oled_ivl_lt/index.html', // iframe src (상대경로 or 외부 URL)
    loaderText: 'OLED IVL & LT 분석 로딩 중...',    // 로딩 오버레이 텍스트
    // sandbox: '...',                              // 외부 URL(GAS) 앱에만 추가 — 아래 설명 참고
    // locked:  true,                               // 비밀번호 잠금 (공개 탭에는 생략)
  },
  // ... 나머지 앱
];
```

> **아이콘 규칙**: 이모지 대신 `'·'` (middle dot) 고정 사용. CSS `.tab-btn` 스타일에서 통일된 도트로 표현됨.

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
  --portal-bg:           #fdf5f6;   /* 사이드바 배경 */
  --portal-surface:      #ffffff;   /* 사이드바 카드 배경 */
  --portal-surface-2:    #f5eaec;   /* 사이드바 2단계 표면 */
  --portal-border:       #e8d0d4;   /* 사이드바 구분선 */
  --portal-text:         #1e1a1b;   /* 사이드바 텍스트 */
  --portal-text-muted:   #6b7280;   /* 사이드바 보조 텍스트 */
  --portal-accent:       #be0039;   /* 활성 탭 강조색 */
  --portal-accent-hover: #d4004a;   /* 활성 탭 hover */
  --portal-accent-glow:  rgba(190, 0, 57, 0.10); /* 활성 탭 배경 glow */
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
  --bg:           #fdf5f6;          /* 앱 전체 배경 */
  --surface:      #ffffff;          /* 카드·패널 배경 */
  --surface-2:    #f5eaec;          /* 2단계 표면 (테이블 헤더 등) */
  --bg-deep:      #ede0e3;          /* 3단계 배경 (가장 진함) */
  --border:       #e8d0d4;          /* 테두리 */
  --border-hover: #d4b0b7;          /* hover 테두리 */
  --text:         #1e1a1b;          /* 본문 텍스트 */
  --text-muted:   #6b7280;          /* 보조 텍스트 */
  --text-faint:   #9ca3af;          /* 희미한 텍스트 (placeholder 등) */
  --accent:       #be0039;          /* 강조색 (버튼·링크) */
  --accent-hover: #d4004a;          /* 강조색 hover */
  --accent-glow:  rgba(190, 0, 57, 0.08); /* 강조색 글로우 */
  --success:      #10b981;          /* 성공 */
  --danger:       #ef4444;          /* 오류·삭제 */
  --warning:      #f59e0b;          /* 경고 */
  --radius:       12px;             /* 카드 모서리 반경 */
  --radius-sm:    8px;              /* 인풋·버튼 모서리 반경 */
  --radius-xs:    4px;              /* 뱃지·작은 요소 모서리 반경 */
}
```

> 현재 기본 테마는 **라이트 모드** 기준으로 설정되어 있음.

#### 다크 모드 (미구현)

현재 `global_style.css`에는 다크 모드 오버라이드 블록이 **존재하지 않음**. 각 앱의 `<html data-theme="dark">` 선언과 테마 동기화 IIFE만 남아 있어 사실상 라이트 테마만 동작함.

필요 시 섹션 3-B 뒤에 다음 블록을 추가:

```css
html[data-theme="dark"] {
  --bg:      #0f1117;
  --surface: #1a1f2e;
  /* ... 나머지 변수 오버라이드 */
}
```

> **주의**: 여기서 `--portal-*` 변수는 절대 추가하지 않음. 추가하는 순간 다크 모드에서 사이드바도 어두워짐.

#### 구형 변수명 Aliases → 섹션 3-C

`global_style.css` 섹션 3-C에는 각 앱이 기존에 쓰던 구형 변수명(`--bdr`, `--tx`, `--ink`, `--primary`, `--error`, `--card`, `--panel` 등)이 신형 변수의 alias로 정의되어 있음. 기존 앱 코드를 수정하지 않고도 동작하도록 유지하는 호환 레이어.

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

> 현재 앱 폴더는 `01~15`번까지 생성되어 있음. **16번째 이후 도구를 추가할 때** 이 순서를 따르면 됩니다.

### Step 1 — 폴더 및 파일 생성

`apps/` 아래에 번호와 이름을 붙인 폴더를 만들고 `index.html`을 생성:

```
apps/
└── 16_새도구이름/
    └── index.html
```

> 폴더명 규칙: `숫자두자리_영문이름` (예: `16_chemical_db`)

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
    icon:       '·',                        // 항상 middle dot — 이모지 사용 안 함
    badge:      null,                       // 뱃지 없으면 null, 있으면 예: 'NEW' 또는 'GAS'
    src:        './apps/16_새도구이름/index.html', // 상대경로 (또는 GAS 배포 URL)
    loaderText: '새 도구 로딩 중...',        // 로딩 오버레이 메시지
  },
];
```

> **이것만 하면 끝.** `index.html`은 수정할 필요 없음. 저장 후 배포하면 탭이 자동으로 나타남.

### Step 4 — 확인 체크리스트

- [ ] `apps/16_xxx/index.html` 존재하는가?
- [ ] `<html lang="ko" data-theme="dark">` 로 시작하는가?
- [ ] `<link rel="preconnect">` 2개 + Google Fonts `<link>` 포함되어 있는가?
- [ ] `<link rel="stylesheet" href="../../assets/css/global_style.css">` 포함되어 있는가?
- [ ] 테마 동기화 JS(`window.addEventListener('message', ...)`) 포함되어 있는가?
- [ ] `main.js`의 `apps` 배열에 올바른 `src` 경로로 등록했는가?
- [ ] `id`가 기존 앱들과 겹치지 않는가? (사용 중: `oled`, `lotschedule`, `hplc`, `lgd`, `sdc`, `coa_dev`, `coa_prod`, `ext_code`, `cpl`, `dashboard`, `complaint`, `spec_ctq`, `iqc`, `sys_docs`)
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

### Embed 모드 — 06번 앱에서 iframe으로 호출될 때

`06_lot_schedule`의 📊 결과 입력 팝업이 이 앱을 `?embed=1` 파라미터로 iframe 로드함.

```javascript
// 06번 앱이 iframe src를 이렇게 설정
iframe.src = './apps/01_oled_ivl_lt/index.html?embed=1';
```

embed 모드 진입 시 동작 차이:
| 항목 | 일반 모드 | embed 모드 |
|------|----------|-----------|
| `💾 분析결과 임시저장` 버튼 | 표시 | **숨김** |
| `📥 이 Lot에 결과 저장` 버튼 | 숨김 | **표시** (`embedSaveCard`) |

`이 Lot에 결과 저장` 클릭 시 `postMessage`로 분析 결과 전달:
```javascript
window.parent.postMessage({ type: 'oledResult', ivl: {...}, lt: {...} }, '*');
```

06번 앱의 `window.addEventListener('message', ...)` 핸들러가 수신 → `saveResult()` → Firebase 저장.

**embed 모드 진입 코드 위치**: `apps/01_oled_ivl_lt/index.html` 하단 IIFE  
(`new URLSearchParams(location.search).get('embed') === '1'` 조건부 실행)

---

## 2. HPLC/DSC Report 자동생성 (`apps/03_hplc_dsc/index.html`)

HPLC·DSC 통합 분석 PDF에서 그래프 영역을 자동 크롭해 PPTX 슬라이드로 변환하는 도구. 단일 HTML 파일에 CSS·HTML·JS 전부 포함.

### 주요 흐름
1. PDF 업로드 → `pdf.js`로 페이지 파싱 (`buildPageMap()`)
2. 페이지 유형 자동 판별 — 가로(landscape)=DSC, 세로(portrait)=HPLC
3. HPLC: 상단 메타 테이블 추출 → 그래프 영역 크롭
4. DSC: 그래프 영역 크롭 (슬라이더로 확대/여백 미세조정)
5. `pptxgenjs`로 슬라이드 병합 → HPLC + DSC 1개 PPTX 다운로드

### CDN 라이브러리
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js"></script>
```

`pptxgenjs` CDN 로드 실패 시 `cdnjs` fallback 자동 시도(`loadPptxFallback()`).

### 주요 함수
| 함수 | 역할 |
|------|------|
| `buildPageMap()` | PDF 페이지 순회 → 각 페이지 유형(hplc/dsc) 판별 |
| `getPageType(page)` | 페이지 종횡비로 유형 결정 |
| `extractHplcMeta(page)` | HPLC 상단 메타 테이블 OCR/좌표 추출 |
| `processHplcPage(p)` / `processDscPage(p)` | 크롭 수행 |
| `computeDscCrop()` | DSC 그래프 영역 좌표 계산 |
| `renderPage(p, scale)` | 페이지를 canvas로 렌더 |
| `cropB64(canvas, box)` | canvas 부분 → base64 PNG |
| `drawB64(b64)` | 미리보기 썸네일 그리기 |
| `buildPptx(items)` | 최종 PPTX 병합 생성 |
| `addSumBoxToChart(slide, ...)` | HPLC 슬라이드 요약 박스 추가 |

### DSC 슬라이드 테두리
DSC 이미지는 `addImage()` 후 별도 `addShape(rect)`로 오버레이 테두리를 그림
(`pptxgenjs`의 `addImage`가 `line` 옵션을 지원하지 않아 rect 오버레이 방식 사용).

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

### 파일 구조

```
apps/05_cpl_quality/
├── index.html   # 레이아웃 shell (업로드 바·사이드바·카드 컨테이너)
├── style.css    # 앱 고유 스타일 (계보 플로우·SPC 차트·Deep-Dive)
└── app.js       # 모든 로직 (Excel 파싱·계보 레이아웃·SPC 렌더·검색)
```

> `index.html`은 shell만 담당하고, 스타일과 로직은 외부 파일로 분리되어 있음.
> `global_style.css`는 `index.html`에서 `../../assets/css/global_style.css`로 참조.

### CDN 라이브러리
```html
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3"></script>
```

> 계보도는 자체 SVG 절대좌표 레이아웃으로 그려짐 (Mermaid 미사용).

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

## 6. 소자평가 Lot 일정 관리 (`apps/06_lot_schedule/`)

합성생산·정제생산/소자이관 부서의 소자평가 이관 일정을 월별 캘린더로 관리하는 도구.

### 파일 구조

```
apps/06_lot_schedule/
├── index.html   # 레이아웃 shell (캘린더·팝업·모달 DOM)
├── style.css    # 앱 고유 스타일 (캘린더 그리드·Lot 카드·모달·팝업)
└── app.js       # 모든 로직 (Firebase 동기화·메일 파싱·OLED 결과·렌더)
```

> `index.html`은 shell만 담당하고, 스타일과 로직은 외부 파일로 분리되어 있음.

### 화면 레이아웃

```
[topbar: 📧 메일 일괄 등록 | ✏ 개별 등록 | ‹ 년/월 › | 오늘 | 📋 샘플 | 🔍 조회]
──────────────────────────────────────────────────────────────────
[요약 스트립: 진행 중 N건 | 합성 N | 정제/소자 N | ⚡ 시급 N | 완료 N]
[범례 바: 합성생산 · 정제소자이관 · 시급요청 · 완료  +  완료 표시 토글]
──────────────────────────────────────────────────────────────────
[캘린더 풀 너비: 일 ~ 토  7열 그리드]
  각 셀: 날짜 숫자 + Lot 카드 (최대 3개, 이후 "+N개")
```

- 좌측 사이드바 없음 — 캘린더가 화면 전체 너비 사용
- 세 가지 팝업: 메일 일괄 등록 / 개별 등록 / 날짜·조회 모달

### 데이터 저장 — Firebase Realtime Database

**저장소**: Firebase Realtime Database (`qa-manager-9c145` 프로젝트)
**경로**: `lot_schedule/` (배열)
**실시간 동기화**: `DB_REF.on('value', ...)` 리스너 — 다른 사용자 변경 즉시 반영

```
Firebase DB
└── lot_schedule/   ← DB_REF 참조 경로
    ├── 0: { id, dept, material, ... }
    ├── 1: { ... }
    └── ...
```

- **`loadItems()`**: `window._cachedItems` 캐시 반환 (동기)
- **`saveItems(items)`**: `DB_REF.set(items)` — 배열 전체 덮어쓰기
- **`setupRealtimeSync()`**: 앱 시작 시 1회 호출 — 최초 연결 시 localStorage 데이터 자동 마이그레이션 후 실시간 구독 시작
- **localStorage** (`qa_lot_schedule_v1`): 마이그레이션 소스로만 사용 (이후 미사용)

#### Firebase 설정 (index.html 내 하드코딩)

```javascript
var firebaseConfig = {
  apiKey:            "AIzaSyAk9PGqBHxiG9fVwVZZg6ZGBOWaaSAXOBc",
  databaseURL:       "https://qa-manager-9c145-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "qa-manager-9c145",
  // ... 나머지 필드
};
var DB_REF = firebase.database().ref('lot_schedule');
```

> Firebase SDK: `firebase-app-compat` + `firebase-database-compat` v10.12.0 (CDN)
> 보안 규칙: 현재 테스트 모드 (`.read/.write: true`) — 추후 도메인 제한 예정

#### 다른 앱에서 Firebase 추가 시

같은 `firebaseConfig`를 재사용하고 **`db.ref('경로')`만 다르게** 지정:

```javascript
// 예시
var DB_REF = db.ref('oled_sessions');   // 01번 앱
var DB_REF = db.ref('hplc_reports');    // 03번 앱
```

### OLED 소자평가 결과 입력 시스템

정제생산/소자이관 Lot에 한해 OLED 분석기(01번 앱)를 embed하여 결과를 저장·표시하는 시스템.

#### 결과 저장 구조

```javascript
// Firebase: oled_results/{lotId}
{
  savedAt: 'YYYY-MM-DD',
  ivl: {
    blockLabel: 'REF1-SAMPLE1',      // 선택된 블록 레이블
    ref:    { volt, eff, eqe, cx, cy, mwl },
    sample: { volt, eff, eqe, cx, cy, mwl },
  },
  lt: {
    selectedLevel: 95,               // 대표 LT 레벨 (자동 선택)
    levels: {                        // 측정된 모든 레벨
      95: { refHr, sampleHr, pct },
      94: { refHr, sampleHr, pct },
      // ...
    }
  }
}
```

> 저장 경로: `firebase.database().ref('oled_results')` (별도 경로, lot_schedule와 분리)  
> 구 포맷(level/refHr/sampleHr/pct 단일값)도 backward compat으로 지원

#### 팝업 흐름

```
📊 결과 입력 버튼 클릭 (buildDetailCard 내)
  → openResultPopup(lotId, item)
  → resultPopupOverlay 열림
  → iframe src = './apps/01_oled_ivl_lt/index.html?embed=1'
  → 사용자: CSV 업로드 → ANALYZE → 이 Lot에 결과 저장
  → postMessage({ type:'oledResult', ivl, lt })
  → 06번 앱 message 핸들러: saveResult(lotId, data)
  → closeResultPopup() → renderCalendar() → refreshModal()
```

#### 결과 배지 (dc-result-badge)

결과가 저장된 Lot의 `buildDetailCard()` 하단에 표시되는 주황색 배지.

**레이아웃**: 열(column) 단위 표 형태
```
📊 소자평가 결과                    상세▾  ✕
┌──────────┬──────────┬──────────┐
│  LT95★  │   LT94   │   LT90   │  ← 레벨명 행 (선택:검정굵게 / 나머지:주황)
│  100%   │   88%    │   92%    │  ← % 행    (선택:검정굵게 / 나머지:주황)
└──────────┴──────────┴──────────┘
2025-03-15
```

- 선택 레벨(★): `dc-rb-lv-sel` / `dc-rb-pct-sel` — `var(--text)` 검정 굵게
- 비선택 레벨: `dc-rb-lv-dim` / `dc-rb-pct-dim` — `#fb923c` 주황
- 클릭 시 `openResultDetail()` 호출

#### 결과 상세보기 모달 (openResultDetail)

테이블 구조: Block(고정) | IVL 6컬럼 | LT 레벨 N컬럼

**주황 테두리 규칙**:
| 영역 | 테두리 |
|------|--------|
| IVL 섹션 외곽 (좌·우·상·하) | 3px 주황 (`rd-ivl-l/r/t/b`) |
| 선택 LT★ 열 전체 | 3px 주황 박스 (`rd-th-lt-sel`, `rd-lt-sel-cell`, `rd-lt-sel-bot`) |
| 나머지 셀 | `var(--border)` 기본색 |

#### 관련 함수

| 함수 | 역할 |
|------|------|
| `loadResult(lotId)` | Firebase에서 결과 로드 |
| `saveResult(lotId, data)` | Firebase에 결과 저장 |
| `deleteResult(lotId)` | Firebase에서 결과 삭제 |
| `openResultPopup(lotId, item)` | 결과 입력 팝업 열기 (iframe embed) |
| `closeResultPopup()` | 결과 입력 팝업 닫기 + iframe src 초기화 |
| `openResultDetail(lotId, item, result)` | 결과 상세보기 모달 렌더링 |
| `closeResultDetail()` | 결과 상세보기 모달 닫기 |

---

### 아이템 데이터 스키마

```javascript
{
  id:           string,          // genId() — Date.now().toString(36) + random
  dept:         string,          // '합성생산' | '정제생산/소자이관'
  material:     string,          // 재료명 (예: PG1088)
  lot:          string,          // Lot 번호
  request:      string,          // 요청사항
  transferDate: 'YYYY-MM-DD',    // 샘플 이관일 (필수)
  evalStart:    'YYYY-MM-DD',    // 소자평가 시작일 (선택)
  evalTarget:   'YYYY-MM-DD',    // 소자평가 완료 요청일 (선택)
  urgent:       boolean,         // 시급 요청 여부
  completed:    boolean,         // 소자평가 완료 여부
  completedAt:  'YYYY-MM-DD'|null,
  createdAt:    'YYYY-MM-DD',
}
```

### 캘린더 셀 표시 규칙

| 부서 | 기준 | 표시 조건 |
|------|------|----------|
| 합성생산 | `transferDate` | 이관 당일 셀에만 표시 |
| 정제생산/소자이관 | `transferDate` ~ 완료 | 이관일부터 완료일(또는 오늘)까지 모든 셀에 표시 |

- 셀당 최대 3개 카드, 초과 시 `+N개` 더보기 클릭 → 날짜 모달
- D+N 뱃지: 이관일 기준 경과일 (7일 이상이면 빨간색)

### 날짜 클릭 / 조회 모달 (공통)

- **고정 크기**: `min(960px, 100vw-40px)` × `min(82vh, 860px)` — Lot 수에 무관
- **오늘 클릭**: 합성생산 오늘 이관 + 정제소자 전체 미완료 2컬럼
- **과거/미래 날짜 클릭**: 해당 날 기준 활성 항목 2컬럼
- **조회(🔍) 버튼**: 동일 모달에 검색 바 추가 표시 — 품명·Lot·요청사항·부서·비고 통합 검색, Enter 지원
- **2컬럼 레이아웃**: 합성생산(왼쪽) | 정제/소자이관(오른쪽), 한 종류만 있으면 단일 컬럼

### 팝업 3종

#### ① 메일 일괄 등록 팝업

이메일에서 표를 복사(Ctrl+C → Ctrl+V) 하거나 드래그 드롭으로 붙여 넣으면 행 파싱 → 미리보기 → 일괄 등록.

**표 종류 자동 판별 로직:**
- 붙여넣은 텍스트(HTML + plain)에 `"합성생산팀 충주 이관내역"` 문구 포함 → **합성생산 표**
- 없으면 → **정제생산/소자이관 표**

**합성생산 표 미리보기 특이사항:**
- 같은 Batch No. 행들이 그룹으로 묶임
- 그룹 첫 번째 행에만 체크박스 표시 (배치당 1건 등록)
- 체크박스 클릭 또는 행 클릭(비편집 모드) → 같은 배치 전체 행에 주황 외곽선 표시
- 우측 상단 `✏ 수정` 버튼: 편집 모드 토글 (입력 필드 활성화)
- 등록 시 배치 헤드 행만 처리 → 배치당 1건

**헤더 컬럼 키워드 매핑 (`MAIL_COL_ROLES`):**

| 역할 | 인식 키워드 |
|------|-----------|
| `date` | 날짜, 일자, 이관일자 |
| `material` | 품명, 품목명, 품목명품목코드 |
| `lot` | lot번호, lot, batchno |
| `weight` | 중량, 무게 |
| `recipient` | 수령인 |
| `comment` | 비고 |
| `batchNo` | 승화정제batchno, 승화정제batch |
| `synthHist` | 합성이력 |
| `prodDate` | 생산일자 |

#### ② 개별 등록 팝업

topbar의 `✏ 개별 등록` 버튼 클릭 시 중앙 모달로 열림.
수정 버튼 클릭 시에도 자동 열림. 등록/취소 시 자동 닫힘.

필드: 부서(라디오) · 재료명(자동완성) · Lot번호 · 요청사항 · 샘플이관일* · 소자평가시작일 · 완료요청일 · ⚡ 시급

#### ③ 날짜·조회 모달

위 "날짜 클릭 / 조회 모달" 섹션 참고.

### 주요 함수 목록

| 함수 | 역할 |
|------|------|
| `loadItems()` / `saveItems(items)` | Firebase 캐시 반환 / Firebase 저장 (전체 덮어쓰기) |
| `loadResult(lotId)` / `saveResult(lotId, data)` | OLED 결과 로드 / Firebase 저장 (`oled_results/`) |
| `deleteResult(lotId)` | OLED 결과 삭제 |
| `openResultPopup(lotId, item)` | OLED 결과 입력 팝업 (iframe `?embed=1`) |
| `closeResultPopup()` | 결과 입력 팝업 닫기 + iframe src 초기화 |
| `openResultDetail(lotId, item, result)` | 결과 상세보기 모달 렌더링 |
| `closeResultDetail()` | 결과 상세보기 모달 닫기 |
| `setupRealtimeSync()` | Firebase 실시간 리스너 시작 — localStorage 마이그레이션 포함 |
| `genId()` | 고유 ID 생성 |
| `calcDN(transferDate, asOf)` | 이관일 기준 D+N 계산 |
| `renderCalendar()` | 달력 전체 재렌더 |
| `renderSummary(items)` | 요약 스트립 칩 렌더 |
| `openModal(dateStr)` | 날짜 클릭 모달 오픈 |
| `openFilterModal(filter)` | 요약 칩 클릭 필터 모달 |
| `openSearchModal()` | 조회 버튼 → 검색 모드 모달 |
| `runModalSearch()` | 검색 실행 및 결과 렌더 |
| `openIndivPopup()` / `closeIndivPopup()` | 개별 등록 팝업 |
| `openMailPopup()` / `closeMailPopup()` | 메일 일괄 등록 팝업 |
| `renderBodyTwoCols(bodyEl, items, asOf)` | 모달 2컬럼 렌더 |
| `buildDetailCard(item, asOf)` | 모달 디테일 카드 DOM 생성 |
| `fillForm(item)` | 수정 폼 채우기 + 팝업 열기 |
| `resetForm()` | 폼 초기화 |
| `editInModal(itemId, cardEl)` | 모달 내 인라인 수정 |
| `markComplete(id)` / `markUncomplete(id)` | 완료 처리/취소 |
| `deleteItem(id)` | 아이템 삭제 |
| `refreshModal()` | 현재 모달 상태 그대로 재렌더 |
| `processMailData(html, plain)` | 메일 파싱 진입점 |
| `detectTableType(isSynthSource)` | 합성/정제 표 판별 |
| `detectMailHeader(grid)` | 헤더 행 감지 |
| `extractMailRows(grid, headerInfo, tableType)` | 데이터 행 추출 |
| `renderMailPreview(rows, tableType)` | 미리보기 테이블 렌더 |
| `normDate(s)` | 날짜 문자열 정규화 |
| `htmlTableToGrid(table)` / `tsvToGrid(plain)` | HTML·TSV → 2D 배열 |

### CSS 클래스 구조

| 클래스 | 설명 |
|--------|------|
| `.app-layout` | 전체 flex 컨테이너 (캘린더 풀 너비) |
| `.cal-main` | 캘린더 메인 영역 |
| `.cal-topbar` | 상단 버튼 바 |
| `.cal-body` | 캘린더 그리드 스크롤 영역 |
| `.cal-dow-row` / `.cal-grid` | 요일 헤더 / 날짜 그리드 |
| `.cal-cell` | 날짜 셀 |
| `.lot-card.dept-synth` | 합성생산 카드 (빨간색 좌측 바) |
| `.lot-card.dept-refine` | 정제/소자이관 카드 (보라색 좌측 바) |
| `.lot-card.is-urgent` | 시급 카드 (점선 테두리) |
| `.lot-card.is-done` | 완료 카드 (취소선, 투명도) |
| `.dn-badge.dn-normal / .dn-alert / .dn-done` | D+N 뱃지 |
| `.summary-strip` / `.sum-chip` | 요약 스트립 |
| `.modal-overlay` / `.modal-box` | 날짜·조회 모달 (고정 크기) |
| `.modal-search-bar` | 검색 모드 전용 검색 바 |
| `.modal-box.search-mode` | 검색 바 표시 토글 |
| `.modal-2col` / `.modal-col` | 2컬럼 레이아웃 |
| `.detail-card` | 모달 내 아이템 카드 |
| `.indiv-popup-overlay` / `.indiv-popup` | 개별 등록 팝업 |
| `.mail-popup-overlay` / `.mail-popup` | 메일 일괄 등록 팝업 |
| `.mail-preview-table` | 메일 파싱 미리보기 테이블 |
| `.batch-row` | 합성생산 배치 그룹 행 |
| `.batch-active` | 배치 체크 상태 (주황 외곽선) |
| `.batch-pos-first` / `.batch-pos-last` | 배치 그룹 첫/마지막 행 (외곽선 제어) |
| `.mp-edit-btn.active` | 미리보기 수정 모드 버튼 상태 |
| `.result-popup-overlay` / `.result-popup` | OLED 결과 입력 팝업 (iframe 포함) |
| `.result-detail-overlay` / `.result-detail-modal` | OLED 결과 상세보기 모달 |
| `.dc-result-badge` | 결과 저장된 Lot의 요약 배지 (표 형태) |
| `.dc-rb-col` / `.dc-rb-col.is-sel` | 배지 LT 열 / 선택 열 배경 강조 |
| `.dc-rb-lv-sel` / `.dc-rb-lv-dim` | 배지 레벨명 (선택:검정 / 비선택:주황) |
| `.dc-rb-pct-sel` / `.dc-rb-pct-dim` | 배지 % (선택:검정 / 비선택:주황) |
| `.rd-table` / `.rd-table-wrap` | 결과 상세 테이블 / 스크롤 래퍼 |
| `.rd-th-lt-sel` / `.rd-lt-sel-cell` / `.rd-lt-sel-bot` | 선택 LT★ 열 주황 박스 테두리 |
| `.rd-ivl-l/r/t/b` | IVL 섹션 외곽 주황 테두리 (각 방향) |

---

## 7~15번 앱 — 개발 예정 플레이스홀더

아래 앱들은 `apps/` 폴더에 플레이스홀더 `index.html`이 생성되어 있음.
실제 기능 구현 시 해당 파일을 교체하면 됨. `main.js`의 `src` 경로는 변경 불필요.

| 번호 | 폴더 | 대분류 | 설명 |
|------|------|--------|------|
| 07 | `07_coa_dev/` | 자동화 | COA 생성 — 개발용. 개발 단계 소재 COA 자동 생성 |
| 08 | `08_coa_prod/` | 자동화 | COA 생성 — 양산용. Lot 번호 → DB 연동 → PDF 자동 발행 |
| 09 | `09_ext_code/` | 자동화 | 외부코드 관리. 고객사별 외부 코드 ↔ 내부 코드 매핑 (내부 코드 비공개 유지) |
| 10 | `10_quality_dashboard/` | 품질 데이터 | 품질 대시보드. 월/분기/연 단위 품질 지표 집계·시각화 |
| 11 | `11_complaint/` | 품질 데이터 | 불량·컴플레인 관리. 05번 앱 Lot 계보와 연동하여 원인 역추적 |
| 12 | `12_spec_ctq/` | 제품·소재 관리 | 제품 Spec & CTQ/CTP. 소재별 규격 + 핵심 품질/공정 파라미터 등록 |
| 13 | `13_iqc/` | 제품·소재 관리 | 원자재 입고검사(IQC). 입고 검사 결과 등록·이력 관리 |
| 14 | `14_sys_docs/` | 문서 관리 | 시스템 문서 & SOP. 품질·환경·안전·보건 문서 + 작업 SOP 통합 관리 |

### 플레이스홀더 공통 구조

모든 플레이스홀더는 동일한 패턴:
- `개발 예정` 뱃지 + 도구 설명 텍스트
- `global_style.css` 링크 + 테마 동기화 스크립트 포함
- 기능 구현 시 이 파일 전체를 교체

### CTQ/CTP 설계 원칙

- **CTQ** (Critical to Quality): 고객·규격 관점의 핵심 품질 특성 (순도%, Tm℃ 등)
- **CTP** (Critical to Process): 공정 관점의 핵심 파라미터
- 12번 앱(Spec 등록)에서 소재별로 CTQ/CTP 파라미터를 정의
- 정의된 CTQ/CTP는 05번 앱(SQC 차트) 및 COA 생성(07/08번 앱)과 연동 예정

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

6. **구형 변수명 호환**: `global_style.css` 섹션 3-C에 각 앱이 기존에 쓰던 변수명(`--bdr`, `--tx`, `--ink`, `--primary`, `--error` 등)이 alias로 정의되어 있음 — 기존 앱 코드를 수정하지 않아도 동작

---

## 브랜치 전략

- 작업 브랜치: `claude/` 접두사 사용
- PR 머지 대상: `main`

### 최근 작업 브랜치 이력

| 브랜치 | 내용 |
|--------|------|
| `claude/department-sorting-distinction-fHBNk` | `06_lot_schedule` 전체 기능 개발 — 부서 구분 로직·메일 파싱·배치 그룹화·UI 개편·검색 |
| `claude/setup-firebase-project-yydA7` | `06_lot_schedule` Firebase Realtime Database 연동 — 실시간 다중 사용자 동기화 |
