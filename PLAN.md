# CPL 통합 품질 & 이력 관리 시스템 — 구현 계획

## 현재 상태
- [x] Step 1: `apps/05_cpl_quality/index.html` 뼈대 생성 + `main.js` 탭 등록 (push 완료)
- [ ] Step 2~9: JS 로직 미구현 (빈 상태)

---

## 파일 구조
```
apps/05_cpl_quality/
└── index.html   ← 단일 파일 (CSS + HTML + JS 전부)
```

---

## 데이터 구조

### 파일 1: 품질 데이터 (Excel)
| 행 | 내용 |
|----|------|
| 1 | 대분류 (병합셀) — "PH633 합성원재료(TPBC) COA" 등 공정단계 |
| 2 | 중분류 (병합셀) — 소재코드 |
| 3 | 소분류 — "순도(%)", "Tm(℃)", "1% WL" 등 측정항목명 |
| 4 | 상세헤더 — "Batch No.", "순도(%) ≥99.500%" 등 |
| 5 | **기준 행** — "기준", "USL", "LSL", "UCL", "LCL" 라벨 |
| 6+ | **데이터 행** — 각 Batch의 측정값 + 관리기준값(반복) |

- "Batch No." 컬럼이 공정단계별로 여러 개 존재
- 관리기준값(USL/LSL/UCL/LCL)은 데이터 행 오른쪽에 반복 기재
- 각 측정 컬럼 바로 뒤에 해당 항목의 기준값 컬럼들이 위치

### 파일 2: 흐름도 데이터 (Excel)
| 행 | 내용 |
|----|------|
| 1 | "1단계" ~ "6단계" 헤더 |
| 2 | [단계, LOTNUM, 비고, LOTNUM, 품목코드, 품목명, 투입량] × 6 |
| 3+ | 데이터 — 완제품→원료 역추적 관계 |

---

## 구현할 기능 9가지

### Step 2: 파일 업로드
- 드래그&드롭 + 클릭 업로드
- XLSX 1회만 파싱 (기존 프로토타입 2회 파싱 버그 제거)
- 파일 내용 자동 판별 (품질 vs 흐름도)

### Step 3: 품질 데이터 파서
- 병합셀 전방 채우기
- "기준" 행 자동 탐지 → USL/LSL/UCL/LCL 컬럼 위치 파악
- "Batch No." 컬럼 탐지 → 공정단계별 구조 분리
- 각 측정 컬럼에 기준값 연결 (forward scan 방식)

### Step 4: 흐름도 파서
- 양방향 맵 구축
  - `byOutputLot`: 완제품 → 원료 (역추적)
  - `byInputLot`: 원료 → 완제품 (정추적)
- Lot 메타데이터 저장 (품목코드, 품목명)

### Step 5: Lot 사이드바 + 검색
- 완제품/원료 Lot 목록
- 역추적 ↔ 정추적 토글
- 검색창 + 자동완성 (부분 매칭)

### Step 6: Mermaid Genealogy Flow
- Lot 선택 → 전체 계보 트리 생성
- BFS 탐색으로 연결 Lot 수집
- 선택 Lot 노드 강조 (빨간색)

### Step 7: SPC 차트
- 공정단계별 섹션으로 그룹화
- 측정항목별 Line Chart
- 관리선: UCL/LCL = 빨간 점선, USL/LSL = 주황 실선 (chartjs-plugin-annotation)
- 기준 이탈 포인트 빨간색 강조

### Step 8: Batch Deep-Dive
- 차트 포인트 클릭 → 해당 Batch 전 공정 데이터 표시
- 모든 SPC 차트에서 해당 Batch 포인트 하이라이트 (빨간 테두리 + 큰 원)
- 연관 Lot 전체 품질 데이터 요약

### Step 9: 추적 테이블
- 선택 Lot + 연관 Lot의 측정값 표시
- `row.includes()` 대신 Batch No. 컬럼 인덱스로 정확 매칭
- 기준 이탈 셀 빨간 배경

---

## CDN 라이브러리
```html
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
```

---

## 구현 순서 (한 번에 Step 2~9 전체 작성)
1. 파일 업로드 모듈
2. 품질 데이터 파서 (병합셀 처리, 기준행 탐지, 측정값 추출)
3. 흐름도 파서 (양방향 맵)
4. 사이드바 + 검색
5. Mermaid 계보도
6. SPC 차트 (annotation 포함)
7. Batch Deep-Dive
8. 추적 테이블
9. 커밋 & 푸시
