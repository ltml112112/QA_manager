# iframe Lazy-Load & 앱 레지스트리

> Last updated: 2026-05-07

`main.js`의 `apps` 배열이 포털 전체 탭 구성을 정의하고, `renderApps()`/`switchTab()`가 iframe lazy-load로 20개 앱 동시 Firebase 부팅 throttle을 막는다.

---

## 1. ⚠️ Critical: iframe lazy-load 메커니즘 단순화 금지

`main.js`의 `renderApps()`는 모든 iframe을 만들지만 **첫 활성 탭만 src를 즉시 부여**, 나머지는 `iframe.dataset.src`에 보관. `switchTab()` 호출 시 `ensureIframeLoaded(id)`가 처음 클릭된 iframe에만 src를 설정 → **동시 Firebase 인스턴스 1~2개로 제한**.

이 메커니즘 깨뜨리면 20+개 iframe 동시 부팅으로 listen throttle 재발 (Race B). `main.js` 수정 시 다음 두 곳 동시에 신경 쓸 것:

```javascript
// renderApps() 내부
iframe.dataset.src = app.src;
if (isFirst) iframe.src = app.src;

// switchTab() 마지막
ensureIframeLoaded(id);
```

부수 효과: `locked` iframe은 클릭되지 않으면 src가 영영 미설정 → DOM에 URL은 있지만 실제 페이지는 미로드 (보안상 더 좋음).

> "왜 복잡하지?" 하면서 단순화하면 안 됨. Race B 역사는 `docs/architecture/firebase-rtdb.md` 1절 참고.

---

## 2. apps 배열 스키마

`main.js` 최상단:

```javascript
var apps = [
  {
    id:         'oled',                             // 탭 식별자 (고유해야 함)
    group:      '소자평가',                          // 사이드바 대분류 헤더 (자동 그룹핑)
    label:      'OLED IVL & LT 분석',               // 탭 버튼에 표시되는 이름
    icon:       '·',                                // 탭 버튼 앞 dot (이모지 사용 안 함)
    badge:      null,                               // 뱃지 텍스트 (없으면 null, 예: 'NEW' / 'GAS')
    src:        './apps/01_oled_ivl_lt/index.html', // iframe src (상대경로 or 외부 URL)
    loaderText: 'OLED IVL & LT 분석 로딩 중...',    // 로딩 오버레이 텍스트
    // sandbox: '...',                              // 외부 URL(GAS) 앱에만 추가 — 아래 설명 참고
    // locked:  true,                               // user 역할에서 사이드바 미렌더 (admin만 표시)
    // wip:     true,                               // .tab-wip 스타일 적용 (취소선 + 흐린 색)
  },
  // ... 나머지 앱
];
```

> **아이콘 규칙**: 이모지 대신 `'·'` (middle dot) 고정 사용. CSS `.tab-btn` 스타일에서 통일된 도트로 표현됨.

### 필드 요약

| 필드 | 필수 | 설명 |
|------|------|------|
| `id` | ✓ | 고유 식별자. 탭 버튼 / iframe DOM ID로 사용됨 |
| `group` | ✓ | 사이드바 대분류 헤더. 같은 group끼리 자동 묶임. 그룹 내 모든 앱이 locked이고 사용자가 admin이 아니면 헤더도 자동 숨김 |
| `label` | ✓ | 사이드바에 표시할 한글 이름 |
| `icon` | ✓ | 항상 `'·'` 고정 |
| `badge` | ✓ | 없으면 `null`. 있으면 강조 색 라운드 박스로 라벨 옆 표시 |
| `src` | ✓ | iframe URL (상대경로 권장, 외부 URL이면 `sandbox` 같이 지정) |
| `loaderText` | ✓ | iframe 로딩 동안 표시되는 메시지 |
| `sandbox` | – | GAS 등 외부 URL 앱에만 사용 (아래 표 참고) |
| `locked` | – | `true`이면 user 역할에서 DOM 미생성. admin은 그대로 표시되며 `data-locked="true"` 속성 부여 (게스트 미리보기 토글용) |
| `wip` | – | `true`이면 사이드바 탭에 `.tab-wip` 클래스 적용 — 취소선 + 흐린 색으로 "개발 중" 표시. WIP 페이지 자체는 별개의 placeholder HTML |

---

## 3. `renderApps(role)` 동작

- `role === 'admin'`: 모든 탭(`locked` 포함) 렌더, `data-locked` 표시로 게스트 토글 가능
- `role === 'user'`: `locked: true` 탭은 **DOM 자체를 생성하지 않음** (F12 개발자 도구로도 URL 노출 차단)
- 그룹 내 전체가 `locked`이고 user 역할이면 `tab-group-header`도 생성하지 않음
- 화살표 키(↑/↓)로 탭 키보드 내비게이션 자동 활성화 (`initPortal` 내부)

---

## 4. `window.toggleGuestView(guestOn)` — 관리자 전용

admin이 user 시점을 시뮬레이션하기 위한 토글. `index.html` 사이드바 푸터의 "게스트 화면 미리보기" 버튼이 호출.
locked 탭/iframe/그룹 헤더에 `display:none` 적용 → 현재 활성 탭이 locked였다면 첫 비잠금 탭으로 자동 전환.

---

## 5. `sandbox` 필드 — 외부 URL(GAS) 앱 전용

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

---

## 6. index.html — Shell + Auth

`index.html`은 ① 사이드바·콘텐츠 영역 컨테이너, ② Firebase Auth 게이트, ③ 사용자 관리 모달의 세 가지 역할을 함. 탭 버튼과 iframe은 **`main.js`가 런타임에 동적 생성** (인증 통과 후 호출):

```html
<div id="auth-gate">…</div>           <!-- 인증 확인 중 오버레이 (성공 시 제거됨) -->
<div class="sidebar">
  <nav class="tab-nav" role="tablist" aria-label="앱 목록">
    <!-- main.js가 탭 버튼 삽입 -->
  </nav>
  <div class="sidebar-footer">…</div> <!-- 사용자 정보·역할 뱃지·로그아웃·관리자 도구 -->
</div>
<div class="frame-area"><!-- main.js가 iframe 래퍼 삽입 --></div>
<script src="./assets/js/main.js"></script>
```

탭을 추가/수정할 때 `index.html`은 **건드리지 않음** — `main.js`의 `apps` 배열만 수정.
