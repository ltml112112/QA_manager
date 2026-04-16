# QA Manager — TODO

미결 작업 목록. 우선순위 높은 순.

---

## 🔴 치명 — 보안

### 1. Firebase Realtime Database 보안 규칙 설정

**위치**: Firebase 콘솔 (`qa-manager-9c145` 프로젝트 → Realtime Database → 규칙)

**현상**
- 현재 테스트 모드 (`.read/.write: true`) — Firebase URL을 아는 누구나 `lot_schedule`, `oled_results` 경로 읽기/쓰기/삭제 가능
- Firebase API 키 자체는 공개용이라 노출은 정상. 실제 위험은 보안 규칙 미설정.

**조치안 (권장)**

```json
{
  "rules": {
    ".read":  "auth != null",
    ".write": "auth != null"
  }
}
```

→ `apps/06_lot_schedule/app.js:24` 직후에 익명 로그인 추가:

```javascript
firebase.auth().signInAnonymously().catch(function(e){ console.error(e); });
```

→ `index.html` 에 `firebase-auth-compat.js` SDK 추가

**영향 범위**: `06_lot_schedule`만 Firebase 사용 중. 규칙 변경 시 이 앱만 검증하면 됨.

---

## 🟡 개선 — 성능

### 2. `06_lot_schedule` 캘린더 전체 재렌더 최소화

**파일**: `apps/06_lot_schedule/app.js`

- 한 건 수정·완료처리·삭제마다 `renderCalendar()` 전체 DOM 재생성
- Firebase `on('value')` 리스너도 전체 `renderCalendar()` 트리거 (line 151, 160)
- 개선: 변경된 Lot 셀만 부분 재렌더 (`renderCell(dateStr)` 헬퍼 신설)

**우선순위 낮음**: 데이터 규모 커지면 착수.

---

### 3. 메일 붙여넣기 HTML 주입 처리

**파일**: `apps/06_lot_schedule/app.js:1910`

```javascript
var div = document.createElement('div');
div.innerHTML = html;  // 클립보드 HTML 직접 주입
```

**개선 방향**: `DOMParser` 사용으로 교체

```javascript
var doc = new DOMParser().parseFromString(html, 'text/html');
var table = doc.querySelector('table');
```

**우선순위 낮음**: 사내 포털 + 자기 클립보드 붙여넣기 구조라 현실 위협 낮음.

---

## 🟢 경미 — 코드 품질

### 4. `01_oled_ivl_lt` 차트 fallback 색상 정리

**파일**: `apps/01_oled_ivl_lt/index.html`

- `getPropertyValue('--tx').trim() || '#e4e8f5'` 형태 fallback 잔존
- `--tx` → `--text` 로 통일, fallback을 `#1e1a1b`로 교체 (또는 제거)

**우선순위 낮음**: 동작 영향 없음. 테마 대변경 시 같이 처리.

---

### 5. `02_lgd_eval` 인라인 CSS 동기화

**파일**: `apps/02_lgd_eval/index.html`

- GAS 배포 구조라 `global_style.css` 상대경로 불가 → 인라인 `:root` 유지 중
- 브랜드 색상 변경 PR 시 이 파일도 반드시 같이 수정 후 GAS 재배포

---

## 운영 메모

- 색상 변경은 `global_style.css` 섹션 3-A (포털) / 3-B (앱) 만 수정
- 의미 색상(`.t td.blue/.red/.purple`, `.data-table .cell-ok/ng`)은 브랜드 테마와 독립 고정값
- 새 앱 추가 시 `apps/16_xxx/` 규칙 + `main.js` `apps` 배열만 수정 (`index.html` 건드리지 않음)
- Firebase DB URL·API 키 평문 노출 — 정상. 보안은 Security Rules 로 담보.
