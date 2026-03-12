# 품질경영팀 포털 — 디자인 시스템 (Theme Guide)

## 기본 원칙

- **기본 테마**: 다크 모드 (dark)
- **토글**: `index.html` 우측 상단 🌙/☀️ 버튼으로 전환
- **저장**: `localStorage.qa_theme` ('dark' | 'light') — 새로고침 후에도 유지
- **동기화**: 부모 → 자식 iframe에 `postMessage({ type: 'setTheme', theme })`로 전달

---

## 색상 팔레트

### 다크 모드 (기본)

| 역할 | 변수 | 값 |
|------|------|----|
| 페이지 배경 | `--bg` | `#0f1117` |
| 카드/패널 | `--surface / --card / --panel` | `#1a1f2e` |
| 보조 배경 | `--surface2 / --bg-secondary` | `#222840` |
| 테두리 | `--border / --bdr / --line` | `#2e3554` |
| 강조색 | `--accent / --acc / --primary` | `#4f6ef7` |
| 강조 hover | `--accent-hover` | `#6b83ff` |
| 본문 텍스트 | `--text / --tx / --ink` | `#e4e8f5` |
| 보조 텍스트 | `--text-muted / --tx2 / --ink2 / --text-secondary` | `#7b84a8` |
| 성공/초록 | `--success / --green` | `#34d399` |
| 오류/빨강 | `--error / --red` | `#f87171` |
| 경고/노랑 | `--warning / --amber` | `#fbbf24` |

### 라이트 모드

| 역할 | 변수 | 값 |
|------|------|----|
| 페이지 배경 | `--bg` | `#f4f6fb` |
| 카드/패널 | `--surface / --card / --panel` | `#ffffff` |
| 보조 배경 | `--surface2 / --bg-secondary` | `#eef0f7` |
| 테두리 | `--border / --bdr / --line` | `#d1d5e8` |
| 강조색 | (동일) | `#4f6ef7` |
| 본문 텍스트 | `--text / --tx / --ink` | `#1a1f3e` |
| 보조 텍스트 | `--text-muted / --tx2 / --ink2` | `#6b7280` |
| 성공/초록 | `--success / --green` | `#10b981` |
| 오류/빨강 | `--error / --red` | `#ef4444` |

---

## 폰트 시스템

| 용도 | 패밀리 | 사용 위치 |
|------|--------|-----------|
| UI 전반 | `'Inter', 'Noto Sans KR', sans-serif` | 모든 페이지 body |
| 데이터/코드 | `'JetBrains Mono', Consolas, monospace` | ivl_lt 데이터 테이블, HPLC 코드 영역, LGD 로그 |

---

## 파일별 CSS 변수 명칭 대응

각 페이지는 고유한 CSS 변수명을 사용하나, 값은 동일한 팔레트로 통일되어 있음.

| 역할 | index.html | ivl_lt.html | HPLC/DSC | LGD_Index.html |
|------|-----------|-------------|----------|----------------|
| 배경 | `--bg` | `--bg` | `--bg` | `--bg` |
| 카드 | `--surface` | `--card` | `--panel`, `--surface` | `--bg-secondary` |
| 테두리 | `--border` | `--bdr` | `--line` | `--border` |
| 강조 | `--accent` | `--acc` | `--accent` | `--primary` |
| 본문 | `--text` | `--tx` | `--ink` | `--text` |
| 보조 | `--text-muted` | `--tx2` | `--ink2` | `--text-secondary` |

---

## 테마 동기화 구조

```
index.html (부모)
│  localStorage.qa_theme 읽기/쓰기
│  document.documentElement.dataset.theme = 'dark' | 'light'
│
├── iframe: 1_OLED_IVL_LT/ivl_lt.html  (동일 origin)
│     postMessage 수신 → dataset.theme 적용 + localStorage 저장
│
├── iframe: GAS URL (LGD_Index.html)    (cross origin)
│     postMessage 수신 → dataset.theme 적용
│     ※ localStorage는 GAS origin 별도 — 새로고침 시 portal 재연결 후 재적용
│
└── iframe: 3. HPLC_DSC_report-main/index.html  (동일 origin)
      postMessage 수신 → dataset.theme 적용 + localStorage 저장
```

---

## 테마 전환 구현 패턴

### 부모 (index.html)
```javascript
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('qa_theme', theme);
  document.querySelectorAll('iframe').forEach(f => {
    try { f.contentWindow.postMessage({ type: 'setTheme', theme }, '*'); } catch(e) {}
  });
}
```

### 자식 iframe (각 페이지 공통)
```javascript
(function(){
  function applyTheme(theme){
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('qa_theme', theme);
  }
  applyTheme(localStorage.getItem('qa_theme') || 'dark');
  window.addEventListener('message', function(e){
    if(e.data && e.data.type === 'setTheme') applyTheme(e.data.theme);
  });
})();
```

---

## LGD 파일 수정 시 주의사항

`LGD_Index.html`은 Google Apps Script(GAS)에서 서빙됨.
로컬 파일 수정 후 GAS 편집기에서 `LGD_Index.html` 코드를 교체하고 **새 버전으로 재배포**해야 반영됨.

```
로컬 수정 → GAS 편집기 열기 → HTML 파일 내용 교체 → 배포 > 새 버전 배포
```

---

## 색상 코딩 (IVL 비교 테이블)

| 범위 | 색상 | CSS |
|------|------|-----|
| ±5% 이내 | 파란색 (정상) | `--acc / --accent` |
| ±5% 초과 | 빨간색 (이상) | `--red / --error` |
| 105% 초과 | 보라색 (우수) | `#b388ff` |

## 데이터셋 색상 (IVL 차트)

| 슬롯 | 색상 |
|------|------|
| REF_IVL1 | `#4a9eff` |
| REF_IVL2 | `#a855f7` |
| SAMPLE_IVL1 | `#ef4444` |
| SAMPLE_IVL2 | `#f59e0b` |

---

## TODO (수정 필요 항목)

### ~~[BUG] ivl_lt.html — CSS 렌더링 깨짐~~ ✅ 완료
- **증상**: `@import url(...)` 이 화면에 텍스트로 그대로 출력됨. `<style>` 태그 내부에 `@import`가 제대로 삽입되지 않고 태그 밖으로 빠져나온 것으로 추정
- **원인**: Python 문자열 치환 시 `<style>` 태그와 `:root{` 사이에 `@import` 삽입 로직 오류
- **수정 방법**: `ivl_lt.html`의 `<style>` 태그 바로 다음 줄에 `@import url(...)` 이 위치하는지 확인 후 올바른 위치로 이동

### ~~[BUG] index.html — 테마 토글 시 상단 탭바도 같이 바뀌는 문제~~ ✅ 완료
- **증상**: 다크/라이트 전환 시 `<html data-theme>` 변경으로 인해 상단 탭바(topbar)도 색상이 바뀜
- **요구사항**: 탭바는 항상 다크 유지, **iframe 내 콘텐츠만** 라이트/다크 전환
- **수정 방법**:
  - `index.html`에서 `html[data-theme]` 대신 `.frame-area` 또는 각 iframe에만 테마 적용
  - `applyTheme()`에서 `document.documentElement.dataset.theme` 변경 제거
  - 대신 postMessage로 iframe에만 테마 전달하고, localStorage에만 저장
  - 토글 버튼 아이콘(🌙/☀️)은 유지
