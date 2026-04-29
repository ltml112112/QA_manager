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

## 🔵 신규 — 품질 데이터 표준화 (`05_cpl_quality` → 12·10·11번 연계)

### 6. 품질 데이터 입력·연계 구조 재설계

**배경**
- 현재 `05_cpl_quality`는 매번 흐름도·품질 Excel 두 파일을 재업로드해야 분석 가능
- 품질 Excel 스키마가 컬럼 위치(Row1~4)로 묵시적 정의 — "순도(%)"·"Tm(℃)" 같은 텍스트 라벨이 키 → 양식 흔들리면 깨짐
- 12번 앱(Spec & CTQ/CTP)이 비어 있어 "무엇이 CTQ인지" 데이터에 표시 안 됨
- 흐름↔품질 링크가 `batchNo` ↔ `lot` 문자열 일치에 의존
- 누적 데이터 없음 → 시간축 분석·제품 간 비교 불가

---

#### 6-1. CTQ/CTP 마스터 + 표준 데이터 모델 (가성비 최고)

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

---

#### 6-2. Firebase 누적 저장 (06번 앱 패턴 재사용)

- `db.ref('quality_measurements')` 단일 경로에 모든 제품·Lot 측정값 누적
- 업로드 = 병합 모드 — 같은 `lotId+paramCode` 는 덮어쓰고 신규만 추가
- 자동으로 열리는 분석:
  - 시간축 SPC (월/분기 드리프트)
  - Cpk / Cp 트렌드
  - 제품군 간 벤치마크
  - 11번(컴플레인) 발생 시 해당 Lot 측정값 즉시 조회

---

#### 6-3. 업로드 표준화 — 두 옵션 (A → B 단계적)

| | A. 매핑 프로파일 | B. 표준 템플릿 강제 |
|---|---|---|
| 방식 | 첫 업로드 시 컬럼 → `paramCode` 매핑을 사용자가 1회 지정·저장. 다음 업로드부터 자동 적용 | 모든 제품이 동일 Excel 양식 사용 |
| 입력 부담 | 낮음 | 높음 (현장 양식 변경 필요) |
| 안정성 | 중 | 높음 |

→ A 부터 시작하고, 안정되면 B 로 수렴.

---

#### 6-4. 시각화 — 표준화·누적 후 열리는 것들

1. **계보도 컬러 오버레이** — 각 Lot 노드를 OK(파랑)/Warning(주황)/NG(빨강) 자동 채색. 클릭 시 어느 항목이 이탈인지 표시
2. **CTQ 백트레이스** — 완제품 Spec OUT → 계보 backward 로 각 단계 측정값 자동 표시 → 원인 단계 자동 하이라이트
3. **공정×항목 히트맵** — 행=공정단계, 열=측정항목, 셀=Cpk 색상. 약점 공정·항목이 한눈에
4. **원료↔완제품 상관 산점도** — 계보 매칭으로 자동 페어링 → "원료 순도 0.1% 변화 시 완제품 효율은?" 정량화
5. **드리프트 알람** — UCL 이탈 외에도 Western Electric Rules (7점 연속 추세 등) 자동 체크
6. **제품 비교 대시보드** (10번 앱 연동) — 같은 `paramCode` 를 가진 모든 제품의 Cpk 비교 표

---

#### 6-5. 권장 1차 스코프 (작은 단위로 가치 확인)

1. 12번 앱에 `MaterialSpec` 마스터 등록 UI (Firebase 저장)
2. 05번 앱 품질 업로드 → 컬럼 → `paramCode` 매핑 프로파일 저장
3. 측정값을 Firebase 에 누적 저장
4. 계보도에 OK/NG 컬러 오버레이 + CTQ 백트레이스 1개만 우선

이 4개만으로 "양식 흔들려도 동작 + 제품 누적 분석 + 원인 자동 추적" 확보.

**핵심 트레이드오프**: 표준화 = "마스터 등록 1회 부담" 의 대가로 분석 가치가 기하급수적으로 늘어남. 마스터를 누가/언제 채울지가 실패 포인트.

**연계 앱**: `05_cpl_quality` (소비) · `12_spec_ctq` (마스터) · `10_quality_dashboard` (집계) · `11_complaint` (조회)

---

## 운영 메모

- 색상 변경은 `global_style.css` 섹션 3-A (포털) / 3-B (앱) 만 수정
- 의미 색상(`.t td.blue/.red/.purple`, `.data-table .cell-ok/ng`)은 브랜드 테마와 독립 고정값
- 새 앱 추가 시 `apps/16_xxx/` 규칙 + `main.js` `apps` 배열만 수정 (`index.html` 건드리지 않음)
- Firebase DB URL·API 키 평문 노출 — 정상. 보안은 Security Rules 로 담보.
