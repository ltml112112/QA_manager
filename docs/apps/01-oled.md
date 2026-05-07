# 01. OLED IVL & LT 분석기

> Last updated: 2026-05-07
> 폴더: `apps/01_oled_ivl_lt/`
> 대분류: 소자평가 · ID: `oled` · 가드: `_AG_ADMIN_ONLY = false` (user 가능)

---

## 1. 역할 & 범위

- CSV 파일 드래그앤드롭 업로드 (최대 8개)
- 파일명 패턴으로 슬롯 자동 매칭
- REF/SAMPLE 비교 테이블 (4개 주요 조합 + 4개 추가 조합)
- LT 수명 곡선 차트, 스펙트럼 차트
- 요약 선택 및 클립보드 복사
- IndexedDB 임시저장 (최대 10개 세션)

### 하지 말 것

- IVL 결과 색상(blue/red/purple)을 CSS 변수로 변경 금지 (의미 있는 분석 결과 색상으로 하드코딩 유지)
- JS가 `className`으로 직접 참조하는 클래스명 변경 금지

---

## 2. 파일 슬롯 구조

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

---

## 3. 분석 기준

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

---

## 4. 주요 전역 변수

```javascript
fm = {}         // 파일 맵 {슬롯키: File 객체}
pd = {}         // 파싱된 데이터 {슬롯키: [[행데이터]]}
lastIvl = {}    // 최근 분석 IVL 결과
lastLtLv = {}   // 최근 분석 LT 레벨
sumSel = { ivl: -1, lt: -1, ivlRec: -1, ltRec: -1 }  // 요약 선택 상태
ivlDP = 1       // 소수점 자리수 (0, 1, 2)
ltMode = 'low'  // 'low' 또는 'high'
```

---

## 5. JS가 동적으로 생성하는 클래스명 (절대 이름 변경 금지)

JS 코드가 `className`으로 직접 참조하는 클래스들. 이름을 바꾸면 표시가 깨짐:

`r1` `r2` `ev` `bh` `blue` `red` `purple` `ivl-d` `lt-sum` `sel-tag` `ok`

---

## 6. IVL 결과 색상 — 브랜드 테마와 독립 고정값

`.t td.blue`, `.t td.red`, `.t td.purple` 및 `global_style.css`의 `.data-table td.cell-ok/ng`는 **의미 있는 분석 결과 색상**이므로 브랜드 테마 변경에 따라가면 안 됨. 하드코딩 고정값 유지:

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

## 7. Embed 모드 — 06번 앱에서 iframe으로 호출될 때

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
