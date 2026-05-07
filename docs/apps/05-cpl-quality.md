# 05. 소재 Lot 이력 & TREND 분석

> Last updated: 2026-05-07
> 폴더: `apps/05_cpl_quality/`
> 대분류: 품질 데이터 · ID: `cpl` · 가드: `_AG_ADMIN_ONLY = true`

---

## 1. 역할 & 범위

모든 소재의 Lot 계보 추적 + 공정별 SPC TREND를 확인하는 도구.

> **현재 상태**: Firebase와 무연결. 흐름도 Excel + 품질 Excel을 그때그때 파일로 업로드해서 브라우저에서만 보는 방식. 20번(Lot 흐름도 관리) 앱이 구현되면 05번이 Firebase에서 직접 읽도록 개편 예정.

---

## 2. 파일 구조

```
apps/05_cpl_quality/
├── index.html   # 레이아웃 shell (업로드 바·사이드바·카드 컨테이너)
├── style.css    # 앱 고유 스타일 (계보 플로우·SPC 차트·Deep-Dive)
└── app.js       # 모든 로직 (Excel 파싱·계보 레이아웃·SPC 렌더·검색)
```

> `index.html`은 shell만 담당하고, 스타일과 로직은 외부 파일로 분리되어 있음.
> `global_style.css`는 `index.html`에서 `../../assets/css/global_style.css`로 참조.

---

## 3. CDN 라이브러리

```html
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3"></script>
```

> 계보도는 자체 SVG 절대좌표 레이아웃으로 그려짐 (Mermaid 미사용).

---

## 4. 화면 레이아웃

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

---

## 5. 입력 파일 2종

### 파일 ①: 흐름도 데이터 (Excel) — 드롭존 왼쪽

| 행 | 내용 |
|----|------|
| 1 | "1단계" ~ "N단계" 헤더 (병합셀) |
| 2 | 단계별 서브컬럼: `LOTNUM`, `비고 LOTNUM`, `품목코드`, `품목명`, `투입량` |
| 3+ | 데이터 — 완제품→원료 역추적 관계 |

- **LOTNUM**: 각 단계의 주 Lot 번호
- **비고 LOTNUM**: 해당 Lot의 비고용 Lot 번호 (있을 때만 사이드바·계보도에 남색으로 표시)
- 컬럼 감지: 첫 번째 LOT 계열 컬럼 → `mainLotCol`, 두 번째 또는 "비고" 포함 컬럼 → `remarkLotCol`

### 파일 ②: 품질 데이터 (Excel) — 드롭존 오른쪽

| 행 | 내용 |
|----|------|
| 1 | 대분류 (병합셀) — 공정단계명 ("PH633 합성원재료(TPBC) COA" 등) |
| 2 | 중분류 (병합셀) — 소재코드 |
| 3 | 소분류 — 측정항목명 ("순도(%)", "Tm(℃)" 등) |
| 4 | 상세헤더 — "Batch No.", 항목별 규격 표기 |
| 5 | **기준 행** — "기준", "USL", "LSL", "UCL", "LCL" 라벨 |
| 6+ | **데이터 행** — Batch별 측정값 + 기준값(반복) |

---

## 6. 전역 STATE 구조

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

---

## 7. 주요 함수 목록

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

---

## 8. 사이드바 동작 규칙

- **단계 필터 탭**: 검색창 아래에 `전체 | 완제품 | 정제1차품 | ...` 버튼 표시. 단계가 1개면 숨김
- **그룹 기본 상태**: 첫 번째 그룹(완제품)만 펼침, 나머지 접힘
- **검색 범위**: Lot번호 + 비고 LOTNUM 모두 검색됨 (`matchLot` 함수)
- **정렬**: 전 단계 내림차순 (`localeCompare` 역순)
- **비고 표시**: `lotMeta[lot].remark` 있을 때만 남색(`#4a7fc1`)으로 Lot번호 옆에 표시

---

## 9. 계보도(Genealogy Flow) 동작 규칙

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

---

## 10. 파일 자동판별 로직 (`detectFileType`)

- 첫 15행 전체 텍스트에서 `USL` / `LSL` / `BATCH NO` 키워드 → **품질 파일**
- 첫 3행에서 `단계` 키워드 → **흐름도 파일**
- 두 조건 모두 해당 시 품질 우선, 미검출 시 드롭존 슬롯(slotHint) fallback

---

## 11. SPC 차트 색상 규칙

| 선 | 색상 | 스타일 |
|----|------|--------|
| UCL / LCL | `#ef4444` 빨간색 | 점선 `[6,3]` |
| USL / LSL | `#f59e0b` 주황색 | 실선 |
| 이탈 포인트 | `#ef4444` 빨간색 | 포인트 색상 |
| 정상 포인트 | `#4a9eff` 파란색 | 포인트 색상 |

---

## 12. Batch Deep-Dive 패널

- SPC 차트 포인트 클릭 시 활성화
- 위치: 품질 데이터 추적 요약 아래, SPC 차트 위
- 수치 표시: `fmtVal()` 적용 — 소수 3자리, 후행 0 제거
- 표시 항목: 측정항목, 측정값, USL, LSL, UCL, LCL, 판정(OK/NG)
