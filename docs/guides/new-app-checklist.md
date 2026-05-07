# 새 도구 추가 가이드 (Step-by-Step)

> Last updated: 2026-05-07

현재 앱 폴더는 `01~20`번까지 생성되어 있음. **21번째 이후 도구를 추가할 때** 이 순서를 따르면 됨.

---

## Step 1 — 폴더 및 파일 생성

`apps/` 아래에 번호와 이름을 붙인 폴더를 만들고 `index.html`을 생성:

```
apps/
└── 21_새도구이름/
    └── index.html
```

> 폴더명 규칙: `숫자두자리_영문이름` (예: `21_chemical_db`)

---

## Step 2 — index.html 기본 뼈대 작성

아래 구조를 복사해서 시작. **반드시 폰트 link + `global_style.css` 링크를 포함**:

```html
<!DOCTYPE html>
<html lang="ko">
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
      도구 제목
    </div>
    <!-- 콘텐츠 -->
  </div>

</div>
</body>
</html>
```

> **테마**: 라이트 단일. 다크 모드 미사용 — `data-theme` 속성·테마 동기화 IIFE 추가하지 말 것.

**핵심 주의사항:**

- `global_style.css`에서 이미 제공하는 CSS(`:root` 변수, `* reset`, `body` 기본 스타일, `.card`, `.btn`, `.form-input` 등)는 `<style>`에 **다시 쓰지 말 것** — 중복
- 앱 고유 레이아웃과 특수 컴포넌트만 `<style>`에 추가
- 페이지 타이틀 작성 시 좌측 세로 바 패턴(`.page-title`) 따를 것 — `docs/architecture/design-system.md` 3절 참고
- 아이콘은 `'·'` middle dot 고정 — 이모지 사용 금지

---

## Step 3 — main.js의 apps 배열에 등록

`assets/js/main.js` 파일 최상단 `apps` 배열에 항목 추가:

```javascript
var apps = [
  // ... 기존 항목들 ...
  {
    id:         '새도구아이디',              // 영문 고유값 (다른 id와 중복 불가)
    group:      '대분류',                    // 사이드바 대분류 헤더
    label:      '새 도구 이름',              // 탭 버튼에 표시할 한글 이름
    icon:       '·',                        // 항상 middle dot — 이모지 사용 안 함
    badge:      null,                       // 뱃지 없으면 null, 있으면 예: 'NEW' 또는 'GAS'
    src:        './apps/21_새도구이름/index.html', // 상대경로 (또는 GAS 배포 URL)
    loaderText: '새 도구 로딩 중...',        // 로딩 오버레이 메시지
  },
];
```

> **이것만 하면 끝.** `index.html`은 수정할 필요 없음. 저장 후 배포하면 탭이 자동으로 나타남.

apps 배열 필드 전체 스키마는 `docs/architecture/iframe-loading.md` 2절 참고.

---

## Step 4 — auth_guard.js 추가 (선택, admin only 앱)

admin 전용 앱이거나 직접 URL 접근을 막고 싶으면 `<head>` 최하단에 추가:

```html
<script>window._AG_ADMIN_ONLY = true;</script>   <!-- 또는 false -->
<script src="../../assets/js/auth_guard.js"></script>
```

자세한 동작은 `docs/architecture/auth.md` 4절 참고.

---

## Step 5 — Firebase RTDB 사용 시 (필수 패턴)

새 앱이 Firebase RTDB를 쓰면 **반드시** `docs/architecture/firebase-rtdb.md` 표준 패턴 전체 적용:

- [ ] `QA_whenAuthReady(cb)` 로 sync 시작 (직접 `onAuthStateChanged` 사용 금지)
- [ ] `.on('value', success, errorCb)` — errorCb 필수 등록
- [ ] backoff 재부착 (500ms → 1s → 2s → 4s → 8s)
- [ ] 로딩 오버레이 + 30초 stuck UI
- [ ] **Firebase 콘솔에서 보안 규칙 동시 추가** — 새 RTDB 경로는 default deny이므로 규칙 추가 안 하면 PERMISSION_DENIED. 자세한 내용은 `docs/architecture/auth.md` 6절 참고.

---

## Step 6 — 확인 체크리스트

- [ ] `apps/21_xxx/index.html` 존재하는가?
- [ ] `<html lang="ko">` 로 시작하는가? (`data-theme` 속성 없음 — 라이트 단일 테마)
- [ ] `<link rel="preconnect">` 2개 + Google Fonts `<link>` 포함되어 있는가?
- [ ] `<link rel="stylesheet" href="../../assets/css/global_style.css">` 포함되어 있는가?
- [ ] 페이지 타이틀이 좌측 세로 바 패턴(`.page-title`)을 따르는가?
- [ ] 아이콘은 `'·'` middle dot인가? (이모지 금지)
- [ ] `main.js`의 `apps` 배열에 올바른 `src` 경로로 등록했는가?
- [ ] `id`가 기존 앱들과 겹치지 않는가? (사용 중: `oled`, `lotschedule`, `hplc`, `lgd`, `sdc`, `coa_dev`, `coa_prod`, `ext_code`, `lcms`, `hplc_data`, `dsc_tga`, `lot_flow`, `cpl`, `dashboard`, `complaint`, `pn_flow`, `spec_ctq`, `iqc`, `sys_docs`, `roadmap`)
- [ ] GAS 외부 URL 앱이라면 `sandbox` 필드를 추가했는가?
- [ ] **Firebase RTDB를 쓰는 앱이라면** Step 5 체크리스트 전체 적용했는가?
- [ ] **Firebase RTDB 새 경로 추가 시 Firebase 콘솔 보안 규칙도 동시 추가했는가?**
- [ ] `CLAUDE.md` 앱 목록 표에 행을 추가했는가?
- [ ] `docs/apps/{번호}-{이름}.md` 신규 작성했는가?
