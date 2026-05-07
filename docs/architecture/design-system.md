# 디자인 시스템 (`global_style.css`)

> Last updated: 2026-05-07

모든 앱이 공유하는 CSS. 각 앱의 `<head>`에서 아래와 같이 참조:

```html
<link rel="stylesheet" href="../../assets/css/global_style.css">
```

앱별 고유 스타일만 `<style>` 블록에 남기고, 공통 변수·리셋·컴포넌트는 이 파일을 사용.

> **예외 — `02_lgd_eval/index.html`**: 이 앱은 GAS URL로 서빙되어 `global_style.css` 상대경로가 동작하지 않음. 인라인 `:root`·리셋·컴포넌트 CSS는 GAS 단독 실행 fallback으로 **의도적으로 유지**함. **브랜드 테마 변형 시 주의**: `global_style.css`의 색상 변수를 바꿔도 LGD 앱 GAS 화면에는 반영 안 됨. `apps/02_lgd_eval/index.html` 인라인 `:root` 변수도 **반드시 같이 수정**하고 GAS에 재배포해야 함.

---

## 1. 테마 수정 가이드 — 어디를 건드려야 하나

파일은 8개 섹션으로 나뉨. 테마 관련 수정은 **섹션 3** 에서만 이루어짐.

### 1-A. 포털 사이드바 색상 변경 → 섹션 3-A

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

### 1-B. 사이드바 너비

사이드바는 `260px` 고정. 변경 시 `global_style.css`에서 두 곳을 동시에 수정해야 함:

```css
.sidebar    { width: 260px; }   /* 섹션 5-A */
.frame-area { left: 260px; }    /* 섹션 5-F */
```

### 1-C. 앱 콘텐츠 라이트 기본값 변경 → 섹션 3-B

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

### 1-D. 다크 모드 (미구현)

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

### 1-E. 구형 변수명 Aliases → 섹션 3-C

`global_style.css` 섹션 3-C에는 각 앱이 기존에 쓰던 구형 변수명(`--bdr`, `--tx`, `--ink`, `--primary`, `--error`, `--card`, `--panel` 등)이 신형 변수의 alias로 정의되어 있음. 기존 앱 코드를 수정하지 않고도 동작하도록 유지하는 호환 레이어.

---

## 2. 공통 컴포넌트 클래스

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

## 3. 페이지 타이틀 규칙

모든 앱의 페이지 최상단 타이틀은 아래 기준으로 통일:

| 항목 | 값 |
|------|-----|
| font-size | `1.5rem` |
| font-weight | `700` |
| color | `var(--text)` |
| 좌측 세로 바 | `border-left: 4px solid var(--accent); padding-left: 12px` |
| line-height | `1.2` |
| letter-spacing | `-0.02em` |

**시각적 구조:**
```
│ 페이지 타이틀          ← border-left 4px accent 색
  부제목 (선택)          ← 13px, text-muted, padding-left 16px
──────────────────────── ← header 컨테이너 border-bottom (콘텐츠와 분리)
```

**global_style.css에 정의된 공통 클래스:**
- `.page-title` — 페이지 타이틀 (위 스펙 그대로)
- `.page-subtitle` — 부제목 (0.8rem, text-muted, padding-left 16px)
- `.wip-title` — 개발예정 플레이스홀더 타이틀 (`.page-title`과 동일 스펙)

**주의사항:**
- 타이틀 앞에 이모지·SVG 아이콘 로고 **사용하지 않음** — 좌측 세로 바가 시각적 식별자 역할
- `card-header` 내부 아이콘도 불필요 — 텍스트만으로 충분
- 타이틀을 가운데 정렬하지 말 것 — 항상 좌측 정렬
- 앱별 per-file CSS에 직접 스펙을 작성하는 경우 위 값과 동일하게 유지

**앱별 타이틀 CSS 위치:**

| 앱 | 파일 | 선택자 |
|----|------|--------|
| 01 OLED | `index.html` `<style>` | `header h1` |
| 03 HPLC | `index.html` `<style>` | `h1` |
| 07-09, 11-13 WIP | `global_style.css` | `.wip-title` |
| 10 대시보드 | `style.css` | `.dash-title` |
| 14 시스템 문서 | `index.html` `<style>` | `.doc-title` |
| 15 PN Flow | `style.css` | `.pf-app-title` |
| 16 LCMS | `index.html` `<style>` | `.lcms-hdr-text h1` |

---

## 4. 테마 동기화

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
