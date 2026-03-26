# 소재 Lot 흐름 & 품질 TREND 분석기 — 구현 계획

> CPL에 국한하지 않고 **모든 소재**의 Lot 계보 추적 + 공정별 SPC TREND를 확인하는 도구.

## 현재 상태
- [x] Step 0: 제목 변경 (PLAN.md · main.js · index.html `<title>`)
- [x] Step 2: 파일 업로드 UI (드롭존·클릭업로드·자동판별·단일파싱·상태표시)
- [x] Step 3: 품질 데이터 파서 (병합셀 fill·컬럼 분류·공정단계 그룹·기준값 연결·레코드 생성)
- [x] Step 4: 흐름도 파서 (단계 헤더·서브컬럼·byOutputLot/byInputLot·lotMeta)
- [x] Step 5: Lot 사이드바 (목록 렌더·역추적↔정추적 토글·검색 필터·클릭 선택)
- [x] Step 6: Mermaid 계보도 (BFS·코드 빌드·선택 노드 강조·50개 제한·SVG 삽입)
- [x] Step 7: SPC 차트 (공정단계 섹션·annotation 관리선·이탈 포인트 강조·클릭 이벤트)
- [x] Step 8: Batch Deep-Dive (차트 클릭→하이라이트·딥다이브 패널·닫기)
- [x] Step 9: 추적 테이블 (연관 Lot 전체·Batch No. 정확 매칭·이탈 셀 강조·요약 뱃지)

---

## 파일 구조
```
apps/05_cpl_quality/
└── index.html   ← 단일 파일 (CSS + HTML + JS 전부)
```

---

## 데이터 구조 (입력 파일 2종)

### 파일 ①: 품질 데이터 (Excel)
| 행 | 내용 |
|----|------|
| 1 | 대분류 (병합셀) — "PH633 합성원재료(TPBC) COA" 등 공정단계명 |
| 2 | 중분류 (병합셀) — 소재코드 |
| 3 | 소분류 — "순도(%)", "Tm(℃)", "1% WL" 등 측정항목명 |
| 4 | 상세헤더 — "Batch No.", "순도(%) ≥99.500%" 등 |
| 5 | **기준 행** — "기준", "USL", "LSL", "UCL", "LCL" 라벨 |
| 6+ | **데이터 행** — 각 Batch 측정값 + 관리기준값(반복) |

- "Batch No." 컬럼이 공정단계별로 여러 개 존재
- 각 측정 컬럼 바로 뒤에 해당 항목의 기준값 컬럼들(USL/LSL/UCL/LCL)이 위치

### 파일 ②: 흐름도 데이터 (Excel)
| 행 | 내용 |
|----|------|
| 1 | "1단계" ~ "6단계" 헤더 |
| 2 | [단계, LOTNUM, 비고, LOTNUM, 품목코드, 품목명, 투입량] × 6 |
| 3+ | 데이터 — 완제품→원료 역추적 관계 |

---

## 구현 단계 (Step-by-Step)

---

### STEP 0 — 제목 변경 (코드 3곳)

- **0-A** `PLAN.md` 제목을 "소재 Lot 흐름 & 품질 TREND 분석기"로 변경
- **0-B** `assets/js/main.js` → `apps` 배열의 `cpl` 항목
  - `label`: `'소재 Lot 이력 & TREND 분석'`
  - `loaderText`: `'소재 Lot 흐름 & 품질 TREND 분석기 로딩 중...'`
- **0-C** `apps/05_cpl_quality/index.html` → `<title>` 태그 변경

---

### STEP 2 — 파일 업로드 UI

- **2-A** HTML: 드롭존 2개 나란히 배치
  - 왼쪽: 품질 데이터 파일 (Excel)
  - 오른쪽: 흐름도 데이터 파일 (Excel)
  - 각각 파일명·크기·상태(로딩중/완료/오류) 표시 영역 포함
- **2-B** JS: `dragover` → 드롭존 테두리 강조, `dragleave` → 원복
- **2-C** JS: `drop` 이벤트 → `e.dataTransfer.files[0]` 추출
- **2-D** JS: 드롭존 클릭 → `<input type="file" accept=".xlsx,.xls">` 트리거
- **2-E** JS: 파일 자동판별 함수 `detectFileType(workbook)`
  - 행 5에 "USL"/"LSL" 키워드 있으면 → 품질 파일
  - 행 1에 "1단계" 키워드 있으면 → 흐름도 파일
  - 둘 다 아니면 → 오류 메시지 표시
- **2-F** JS: `ArrayBuffer` 읽기 → `XLSX.read()` → 단 1회만 파싱
  - 파싱 결과를 전역 변수에 저장 (재파싱 방지)
- **2-G** JS: 상태 UI 업데이트 함수 `setUploadStatus(slot, state, filename)`
  - `state`: `'idle'` / `'loading'` / `'ok'` / `'error'`

---

### STEP 3 — 품질 데이터 파서

- **3-A** 워크북에서 첫 번째 시트 추출, `XLSX.utils.sheet_to_json({header:1, defval:''})` 로 2D 배열 변환
- **3-B** 병합셀 forward-fill
  - `ws['!merges']` 배열 순회
  - 각 merge 범위의 첫 셀 값을 범위 내 빈 셀에 채워 넣기
  - 행 방향, 열 방향 모두 처리
- **3-C** 헤더 행 추출
  - `rows[0]` = 대분류 (공정단계)
  - `rows[1]` = 중분류 (소재코드)
  - `rows[2]` = 소분류 (측정항목)
  - `rows[3]` = 상세헤더
  - `rows[4]` = 기준 행
- **3-D** "기준" 행에서 컬럼 역할 분류 함수 `classifyColumns(row4, row5)`
  - 컬럼별로 `{role: 'batchNo' | 'value' | 'USL' | 'LSL' | 'UCL' | 'LCL' | 'ignore'}` 반환
  - "Batch No." 포함 → `'batchNo'`
  - 기준 행에 "USL" → `'USL'`, "LSL" → `'LSL'` 등
  - 그 외 측정값 → `'value'`
- **3-E** "Batch No." 컬럼 위치로 공정단계 그룹 경계 파악
  - batchNo 컬럼 인덱스 목록 수집 → 각 그룹의 시작~끝 컬럼 범위 결정
  - 각 그룹에 대분류(공정단계명) 연결
- **3-F** 각 value 컬럼에 인접 기준값 컬럼 연결
  - 오른쪽으로 forward scan → 첫 번째 USL/LSL/UCL/LCL 컬럼 인덱스 저장
  - `valueCols[colIdx] = {USLcol, LSLcol, UCLcol, LCLcol}`
- **3-G** 데이터 행 파싱 (`rows[5]` 이후)
  - 각 공정단계 그룹의 batchNo 컬럼 값으로 Batch 식별
  - 각 value 컬럼에서 측정값 + 기준값 추출
  - 결과 레코드: `{stage, batchNo, itemLabel, value, USL, LSL, UCL, LCL}`
  - 전역 `qualityRecords` 배열에 저장
- **3-H** 파싱 완료 후 `onQualityReady()` 콜백 호출 (Step 7 차트 렌더 트리거)

---

### STEP 4 — 흐름도 파서

- **4-A** 워크북에서 시트 추출, 2D 배열 변환
- **4-B** 행 0(1단계~6단계) 스캔 → 각 단계의 시작 컬럼 인덱스 목록 수집
- **4-C** 행 1 스캔 → 각 단계 내 서브컬럼 구조 파악
  - `{lotNumCol, remarkCol, itemCodeCol, itemNameCol, inputAmtCol}` (단계별 오프셋)
- **4-D** 데이터 행(2행~) 순회
  - 각 단계의 LOTNUM 값 추출
  - 완제품 Lot(높은 단계) → 원료 Lot(낮은 단계) 관계 구축
  - `byOutputLot[완제품Lot].push(원료Lot)`
- **4-E** `byInputLot` 역방향 맵 구축
  - `byOutputLot` 순회 → `byInputLot[원료Lot].push(완제품Lot)`
- **4-F** `lotMeta` 맵 구축
  - `lotMeta[lotNum] = {itemCode, itemName}`
- **4-G** 파싱 완료 후 `onFlowReady()` 콜백 호출 (Step 5 사이드바 렌더 트리거)

---

### STEP 5 — Lot 사이드바

- **5-A** HTML: 사이드바 구조
  ```
  [검색 입력창]
  [역추적 버튼] [정추적 버튼]
  [Lot 목록 스크롤 영역]
  ```
- **5-B** JS: `onFlowReady()` 호출 시 전체 Lot 목록 렌더링
  - `byOutputLot`의 키(완제품 Lot) 목록 정렬 → 각각 `<div class="lot-item">` 생성
  - 각 항목에 `lotMeta`에서 품목명 표시
- **5-C** JS: 역추적/정추적 토글 버튼
  - `traceDir = 'backward'` (완제품→원료) 또는 `'forward'` (원료→완제품)
  - 방향 전환 시 Lot 목록 소스 변경 (`byOutputLot` 키 vs `byInputLot` 키) 후 재렌더
- **5-D** JS: 검색창 `input` 이벤트
  - `query` 소문자 변환, Lot명 또는 품목명에 부분 매칭
  - 매칭 안 되는 항목 `display:none`
- **5-E** JS: Lot 클릭 핸들러
  - `selectedLot` 전역 변수 설정
  - 클릭된 항목에 `.selected` 클래스 부여 (이전 선택 해제)
  - `renderGenealogy(selectedLot)` 호출 (Step 6)
  - `renderTrackingTable(selectedLot)` 호출 (Step 9)

---

### STEP 6 — Mermaid 계보도

- **6-A** BFS 탐색 함수 `collectRelatedLots(startLot, dir)`
  - `dir = 'backward'`이면 `byOutputLot` 사용, `'forward'`이면 `byInputLot` 사용
  - 큐에 `startLot` 넣고 → 연결 Lot 꺼내 큐에 추가 → 방문 체크로 무한루프 방지
  - 반환: `{nodes: Set<lotNum>, edges: [{from, to}]}`
- **6-B** Mermaid 코드 빌더 `buildMermaidCode(nodes, edges, selectedLot)`
  - `flowchart TD` 헤더
  - 각 노드: `id["Lot명\n품목명"]` 형태
  - 각 엣지: `A --> B`
  - 최대 노드 수 제한(50개)으로 과도한 그래프 방지 + 경고 메시지
- **6-C** 선택 Lot 노드 빨간 강조
  - `style selectedId fill:#ef4444,color:#fff,stroke:#c00`
- **6-D** `mermaid.render('genealogy-svg', code)` 호출
  - Promise 기반 → `.then(svg => container.innerHTML = svg.svg)`
  - 이전 SVG 제거 후 삽입
- **6-E** 계보도 영역 위에 현재 선택 Lot명 + 방향 표시 라벨

---

### STEP 7 — SPC 차트

- **7-A** `onQualityReady()` 시 `qualityRecords`를 공정단계별로 그룹화
  - `stageGroups = {stage이름: [레코드, ...]}` 맵 생성
- **7-B** 각 공정단계 내에서 측정항목별로 재그룹화
  - `itemGroups = {itemLabel: [레코드, ...]}` 맵 생성
- **7-C** Chart.js 데이터셋 구성 (측정항목당 차트 1개)
  - `labels`: BatchNo 목록
  - `datasets[0]`: 측정값 라인
  - 이탈 포인트(value > USL or value < LSL)는 `pointBackgroundColor` 빨간색
- **7-D** `chartjs-plugin-annotation`으로 UCL/LCL 라인 추가
  - `type: 'line'`, `borderColor: '#ef4444'`, `borderDash: [6,3]`
- **7-E** USL/LSL 라인 추가
  - `borderColor: '#f59e0b'`, `borderDash: []` (실선)
- **7-F** 공정단계별 섹션 카드 렌더링
  - 섹션 헤더: 공정단계명 (`<div class="card-title">`)
  - 섹션 내 측정항목별 `<canvas>` 태그 생성 후 Chart 인스턴스 생성
  - 생성된 Chart 인스턴스를 `chartInstances[]` 배열에 저장 (Step 8에서 참조)
- **7-G** 차트 재렌더 시 이전 Chart 인스턴스 `destroy()` 후 재생성 (메모리 누수 방지)
- **7-H** 각 차트에 `onClick` 핸들러 등록 → `handleChartClick(chart, event)` 연결

---

### STEP 8 — Batch Deep-Dive

- **8-A** `handleChartClick(chart, event)`
  - `chart.getElementsAtEventForMode(event, 'nearest', {intersect:true})` 로 클릭 포인트 탐지
  - 클릭된 데이터 인덱스 → `labels[index]` → `clickedBatchNo` 추출
  - `selectedBatch = clickedBatchNo` 전역 설정
- **8-B** 딥다이브 패널 렌더링 `renderDeepDive(batchNo)`
  - `qualityRecords`에서 `batchNo` 일치 레코드 필터
  - 공정단계별로 묶어서 테이블 표시
  - 이탈 항목 빨간 강조
- **8-C** 모든 SPC 차트 일괄 하이라이트 `highlightBatch(batchNo)`
  - `chartInstances` 순회
  - 해당 BatchNo 인덱스 찾아서 `pointRadius`, `pointBorderColor`, `pointBorderWidth` 갱신
  - `chart.update('none')` (애니메이션 없이 즉시 갱신)
- **8-D** 딥다이브 패널 닫기 버튼 → `selectedBatch = null`, 하이라이트 초기화

---

### STEP 9 — 추적 테이블

- **9-A** `renderTrackingTable(selectedLot)` 함수
  - BFS로 수집한 연관 Lot 목록 확정 (`collectRelatedLots` 재활용)
  - 대상 Lot 목록 = `[selectedLot, ...relatedLots]`
- **9-B** 각 대상 Lot에서 품질 레코드 조회
  - `qualityRecords`에서 `batchNo` 컬럼 인덱스 기반 정확 매칭
  - (`row.includes()`가 아닌 batchNo 컬럼 인덱스 직접 비교)
- **9-C** 테이블 HTML 생성
  - 컬럼: Lot명 | 품목명 | 공정단계 | 측정항목 | 측정값 | USL | LSL | UCL | LCL | 판정
  - 판정: OK / NG (USL/LSL 기준)
- **9-D** 이탈 셀 스타일
  - 이탈 행의 측정값 셀: `background: #ef444430`, `color: #ef4444`, `font-weight: 600`
- **9-E** 테이블 상단에 요약 뱃지 표시
  - 전체 항목 수, 이탈 항목 수, 이탈율(%)

---

## CDN 라이브러리 (이미 index.html에 포함됨)
```html
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
```

---

## 구현 순서 요약

| Step | 작업 | 파일 |
|------|------|------|
| 0 | 제목 변경 | PLAN.md, main.js, index.html |
| 2 | 파일 업로드 UI (2-A~2-G) | index.html |
| 3 | 품질 데이터 파서 (3-A~3-H) | index.html |
| 4 | 흐름도 파서 (4-A~4-G) | index.html |
| 5 | Lot 사이드바 (5-A~5-E) | index.html |
| 6 | Mermaid 계보도 (6-A~6-E) | index.html |
| 7 | SPC 차트 (7-A~7-H) | index.html |
| 8 | Batch Deep-Dive (8-A~8-D) | index.html |
| 9 | 추적 테이블 (9-A~9-E) | index.html |
