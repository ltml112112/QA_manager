# 06. 소자평가 Lot 일정 관리

> Last updated: 2026-05-07
> 폴더: `apps/06_lot_schedule/`
> 대분류: 소자평가 · ID: `lotschedule` · 가드: `_AG_ADMIN_ONLY = false` (user 가능)

---

## 1. 역할 & 범위

합성생산·정제생산/소자이관 부서의 소자평가 이관 일정을 월별 캘린더로 관리하는 도구. 정제생산/소자이관 Lot에 한해 OLED 분석기(01번 앱)를 embed하여 결과를 저장·표시.

---

## 2. 파일 구조

```
apps/06_lot_schedule/
├── index.html   # 레이아웃 shell (캘린더·팝업·모달 DOM)
├── style.css    # 앱 고유 스타일 (캘린더 그리드·Lot 카드·모달·팝업)
└── app.js       # 모든 로직 (Firebase 동기화·메일 파싱·OLED 결과·렌더)
```

---

## 3. 화면 레이아웃

```
[topbar: 📧 메일 일괄 등록 | ✏ 개별 등록 | ‹ 년/월 › | 오늘 | 📋 샘플 | 🔍 조회]
──────────────────────────────────────────────────────────────────
[요약 스트립: 진행 중 N건 | 합성 N | 정제/소자 N | ⚡ 시급 N | 완료 N]
[범례 바: 합성생산 · 정제소자이관 · 시급요청 · 완료  +  완료 표시 토글]
──────────────────────────────────────────────────────────────────
[캘린더 풀 너비: 일 ~ 토  7열 그리드]
  각 셀: 날짜 숫자 + Lot 카드 (최대 3개, 이후 "+N개")
```

- 좌측 사이드바 없음 — 캘린더가 화면 전체 너비 사용
- 세 가지 팝업: 메일 일괄 등록 / 개별 등록 / 날짜·조회 모달

---

## 4. Firebase 데이터 저장

**저장소**: Firebase Realtime Database (`qa-manager-9c145` 프로젝트)
**경로**: `lot_schedule/` (배열) + `oled_results/{lotId}` (별도)
**실시간 동기화**: `DB_REF.on('value', ...)` 리스너 — 다른 사용자 변경 즉시 반영

```
Firebase DB
├── lot_schedule/   ← 일정 데이터 (배열)
│   ├── 0: { id, dept, material, ... }
│   └── ...
└── oled_results/   ← OLED 결과 (Lot별)
    └── {lotId}: { savedAt, ivl, lt }
```

- **`loadItems()`**: `window._cachedItems` 캐시 반환 (동기)
- **`saveItems(items)`**: `DB_REF.set(items)` — 배열 전체 덮어쓰기
- **`setupRealtimeSync()`**: 앱 시작 시 1회 호출 — 최초 연결 시 localStorage 데이터 자동 마이그레이션 후 실시간 구독 시작
- **localStorage** (`qa_lot_schedule_v1`): 마이그레이션 소스로만 사용 (이후 미사용)

> Firebase 표준 listener 패턴은 `docs/architecture/firebase-rtdb.md` 참고. 보안 규칙은 `docs/architecture/auth.md` 6절 참고.

---

## 5. OLED 소자평가 결과 입력 시스템

정제생산/소자이관 Lot에 한해 OLED 분석기(01번 앱)를 embed하여 결과를 저장·표시하는 시스템.

### 결과 저장 구조

```javascript
// Firebase: oled_results/{lotId}
{
  savedAt: 'YYYY-MM-DD',
  ivl: {
    blockLabel: 'REF1-SAMPLE1',      // 선택된 블록 레이블
    ref:    { volt, eff, eqe, cx, cy, mwl },
    sample: { volt, eff, eqe, cx, cy, mwl },
  },
  lt: {
    selectedLevel: 95,               // 대표 LT 레벨 (자동 선택)
    levels: {                        // 측정된 모든 레벨
      95: { refHr, sampleHr, pct },
      94: { refHr, sampleHr, pct },
      // ...
    }
  }
}
```

> 저장 경로: `firebase.database().ref('oled_results')` (별도 경로, lot_schedule와 분리)
> 구 포맷(level/refHr/sampleHr/pct 단일값)도 backward compat으로 지원

### 팝업 흐름

```
📊 결과 입력 버튼 클릭 (buildDetailCard 내)
  → openResultPopup(lotId, item)
  → resultPopupOverlay 열림
  → iframe src = './apps/01_oled_ivl_lt/index.html?embed=1'
  → 사용자: CSV 업로드 → ANALYZE → 이 Lot에 결과 저장
  → postMessage({ type:'oledResult', ivl, lt })
  → 06번 앱 message 핸들러: saveResult(lotId, data)
  → closeResultPopup() → renderCalendar() → refreshModal()
```

### 결과 배지 (dc-result-badge)

결과가 저장된 Lot의 `buildDetailCard()` 하단에 표시되는 주황색 배지.

**레이아웃**: 열(column) 단위 표 형태
```
📊 소자평가 결과                    상세▾  ✕
┌──────────┬──────────┬──────────┐
│  LT95★  │   LT94   │   LT90   │  ← 레벨명 행 (선택:검정굵게 / 나머지:주황)
│  100%   │   88%    │   92%    │  ← % 행    (선택:검정굵게 / 나머지:주황)
└──────────┴──────────┴──────────┘
2025-03-15
```

- 선택 레벨(★): `dc-rb-lv-sel` / `dc-rb-pct-sel` — `var(--text)` 검정 굵게
- 비선택 레벨: `dc-rb-lv-dim` / `dc-rb-pct-dim` — `#fb923c` 주황
- 클릭 시 `openResultDetail()` 호출

### 결과 상세보기 모달 (openResultDetail)

테이블 구조: Block(고정) | IVL 6컬럼 | LT 레벨 N컬럼

**주황 테두리 규칙**:

| 영역 | 테두리 |
|------|--------|
| IVL 섹션 외곽 (좌·우·상·하) | 3px 주황 (`rd-ivl-l/r/t/b`) |
| 선택 LT★ 열 전체 | 3px 주황 박스 (`rd-th-lt-sel`, `rd-lt-sel-cell`, `rd-lt-sel-bot`) |
| 나머지 셀 | `var(--border)` 기본색 |

---

## 6. 아이템 데이터 스키마

```javascript
{
  id:           string,          // genId() — Date.now().toString(36) + random
  dept:         string,          // '합성생산' | '정제생산/소자이관'
  material:     string,          // 재료명 (예: PG1088)
  lot:          string,          // Lot 번호
  request:      string,          // 요청사항
  transferDate: 'YYYY-MM-DD',    // 샘플 이관일 (필수)
  evalStart:    'YYYY-MM-DD',    // 소자평가 시작일 (선택)
  evalTarget:   'YYYY-MM-DD',    // 소자평가 완료 요청일 (선택)
  urgent:       boolean,         // 시급 요청 여부
  completed:    boolean,         // 소자평가 완료 여부
  completedAt:  'YYYY-MM-DD'|null,
  createdAt:    'YYYY-MM-DD',
}
```

---

## 7. 캘린더 셀 표시 규칙

| 부서 | 기준 | 표시 조건 |
|------|------|----------|
| 합성생산 | `transferDate` | 이관 당일 셀에만 표시 |
| 정제생산/소자이관 | `transferDate` ~ 완료 | 이관일부터 완료일(또는 오늘)까지 모든 셀에 표시 |

- 셀당 최대 3개 카드, 초과 시 `+N개` 더보기 클릭 → 날짜 모달
- D+N 뱃지: 이관일 기준 경과일 (7일 이상이면 빨간색)

---

## 8. 날짜 클릭 / 조회 모달 (공통)

- **고정 크기**: `min(960px, 100vw-40px)` × `min(82vh, 860px)` — Lot 수에 무관
- **오늘 클릭**: 합성생산 오늘 이관 + 정제소자 전체 미완료 2컬럼
- **과거/미래 날짜 클릭**: 해당 날 기준 활성 항목 2컬럼
- **조회(🔍) 버튼**: 동일 모달에 검색 바 추가 표시 — 품명·Lot·요청사항·부서·비고 통합 검색, Enter 지원
- **2컬럼 레이아웃**: 합성생산(왼쪽) | 정제/소자이관(오른쪽), 한 종류만 있으면 단일 컬럼

---

## 9. 팝업 3종

### ① 메일 일괄 등록 팝업

이메일에서 표를 복사(Ctrl+C → Ctrl+V) 하거나 드래그 드롭으로 붙여 넣으면 행 파싱 → 미리보기 → 일괄 등록.

**표 종류 자동 판별 로직:**
- 붙여넣은 텍스트(HTML + plain)에 `"합성생산팀 충주 이관내역"` 문구 포함 → **합성생산 표**
- 없으면 → **정제생산/소자이관 표**

**합성생산 표 미리보기 특이사항:**
- 같은 Batch No. 행들이 그룹으로 묶임
- 그룹 첫 번째 행에만 체크박스 표시 (배치당 1건 등록)
- 체크박스 클릭 또는 행 클릭(비편집 모드) → 같은 배치 전체 행에 주황 외곽선 표시
- 우측 상단 `✏ 수정` 버튼: 편집 모드 토글 (입력 필드 활성화)
- 등록 시 배치 헤드 행만 처리 → 배치당 1건

**헤더 컬럼 키워드 매핑 (`MAIL_COL_ROLES`):**

| 역할 | 인식 키워드 |
|------|-----------|
| `date` | 날짜, 일자, 이관일자 |
| `material` | 품명, 품목명, 품목명품목코드 |
| `lot` | lot번호, lot, batchno |
| `weight` | 중량, 무게 |
| `recipient` | 수령인 |
| `comment` | 비고 |
| `batchNo` | 승화정제batchno, 승화정제batch |
| `synthHist` | 합성이력 |
| `prodDate` | 생산일자 |

### ② 개별 등록 팝업

topbar의 `✏ 개별 등록` 버튼 클릭 시 중앙 모달로 열림.
수정 버튼 클릭 시에도 자동 열림. 등록/취소 시 자동 닫힘.

필드: 부서(라디오) · 재료명(자동완성) · Lot번호 · 요청사항 · 샘플이관일* · 소자평가시작일 · 완료요청일 · ⚡ 시급

### ③ 날짜·조회 모달

위 8절 참고.

---

## 10. 주요 함수 목록

| 함수 | 역할 |
|------|------|
| `loadItems()` / `saveItems(items)` | Firebase 캐시 반환 / Firebase 저장 (전체 덮어쓰기) |
| `loadResult(lotId)` / `saveResult(lotId, data)` | OLED 결과 로드 / Firebase 저장 (`oled_results/`) |
| `deleteResult(lotId)` | OLED 결과 삭제 |
| `openResultPopup(lotId, item)` | OLED 결과 입력 팝업 (iframe `?embed=1`) |
| `closeResultPopup()` | 결과 입력 팝업 닫기 + iframe src 초기화 |
| `openResultDetail(lotId, item, result)` | 결과 상세보기 모달 렌더링 |
| `closeResultDetail()` | 결과 상세보기 모달 닫기 |
| `setupRealtimeSync()` | Firebase 실시간 리스너 시작 — localStorage 마이그레이션 포함 |
| `genId()` | 고유 ID 생성 |
| `calcDN(transferDate, asOf)` | 이관일 기준 D+N 계산 |
| `renderCalendar()` | 달력 전체 재렌더 |
| `renderSummary(items)` | 요약 스트립 칩 렌더 |
| `openModal(dateStr)` | 날짜 클릭 모달 오픈 |
| `openFilterModal(filter)` | 요약 칩 클릭 필터 모달 |
| `openSearchModal()` | 조회 버튼 → 검색 모드 모달 |
| `runModalSearch()` | 검색 실행 및 결과 렌더 |
| `openIndivPopup()` / `closeIndivPopup()` | 개별 등록 팝업 |
| `openMailPopup()` / `closeMailPopup()` | 메일 일괄 등록 팝업 |
| `renderBodyTwoCols(bodyEl, items, asOf)` | 모달 2컬럼 렌더 |
| `buildDetailCard(item, asOf)` | 모달 디테일 카드 DOM 생성 |
| `fillForm(item)` | 수정 폼 채우기 + 팝업 열기 |
| `resetForm()` | 폼 초기화 |
| `editInModal(itemId, cardEl)` | 모달 내 인라인 수정 |
| `markComplete(id)` / `markUncomplete(id)` | 완료 처리/취소 |
| `deleteItem(id)` | 아이템 삭제 |
| `refreshModal()` | 현재 모달 상태 그대로 재렌더 |
| `processMailData(html, plain)` | 메일 파싱 진입점 |
| `detectTableType(isSynthSource)` | 합성/정제 표 판별 |
| `detectMailHeader(grid)` | 헤더 행 감지 |
| `extractMailRows(grid, headerInfo, tableType)` | 데이터 행 추출 |
| `renderMailPreview(rows, tableType)` | 미리보기 테이블 렌더 |
| `normDate(s)` | 날짜 문자열 정규화 |
| `htmlTableToGrid(table)` / `tsvToGrid(plain)` | HTML·TSV → 2D 배열 |

---

## 11. CSS 클래스 구조

| 클래스 | 설명 |
|--------|------|
| `.app-layout` | 전체 flex 컨테이너 (캘린더 풀 너비) |
| `.cal-main` | 캘린더 메인 영역 |
| `.cal-topbar` | 상단 버튼 바 |
| `.cal-body` | 캘린더 그리드 스크롤 영역 |
| `.cal-dow-row` / `.cal-grid` | 요일 헤더 / 날짜 그리드 |
| `.cal-cell` | 날짜 셀 |
| `.lot-card.dept-synth` | 합성생산 카드 (빨간색 좌측 바) |
| `.lot-card.dept-refine` | 정제/소자이관 카드 (보라색 좌측 바) |
| `.lot-card.is-urgent` | 시급 카드 (점선 테두리) |
| `.lot-card.is-done` | 완료 카드 (취소선, 투명도) |
| `.dn-badge.dn-normal / .dn-alert / .dn-done` | D+N 뱃지 |
| `.summary-strip` / `.sum-chip` | 요약 스트립 |
| `.modal-overlay` / `.modal-box` | 날짜·조회 모달 (고정 크기) |
| `.modal-search-bar` | 검색 모드 전용 검색 바 |
| `.modal-box.search-mode` | 검색 바 표시 토글 |
| `.modal-2col` / `.modal-col` | 2컬럼 레이아웃 |
| `.detail-card` | 모달 내 아이템 카드 |
| `.indiv-popup-overlay` / `.indiv-popup` | 개별 등록 팝업 |
| `.mail-popup-overlay` / `.mail-popup` | 메일 일괄 등록 팝업 |
| `.mail-preview-table` | 메일 파싱 미리보기 테이블 |
| `.batch-row` | 합성생산 배치 그룹 행 |
| `.batch-active` | 배치 체크 상태 (주황 외곽선) |
| `.batch-pos-first` / `.batch-pos-last` | 배치 그룹 첫/마지막 행 (외곽선 제어) |
| `.mp-edit-btn.active` | 미리보기 수정 모드 버튼 상태 |
| `.result-popup-overlay` / `.result-popup` | OLED 결과 입력 팝업 (iframe 포함) |
| `.result-detail-overlay` / `.result-detail-modal` | OLED 결과 상세보기 모달 |
| `.dc-result-badge` | 결과 저장된 Lot의 요약 배지 (표 형태) |
| `.dc-rb-col` / `.dc-rb-col.is-sel` | 배지 LT 열 / 선택 열 배경 강조 |
| `.dc-rb-lv-sel` / `.dc-rb-lv-dim` | 배지 레벨명 (선택:검정 / 비선택:주황) |
| `.dc-rb-pct-sel` / `.dc-rb-pct-dim` | 배지 % (선택:검정 / 비선택:주황) |
| `.rd-table` / `.rd-table-wrap` | 결과 상세 테이블 / 스크롤 래퍼 |
| `.rd-th-lt-sel` / `.rd-lt-sel-cell` / `.rd-lt-sel-bot` | 선택 LT★ 열 주황 박스 테두리 |
| `.rd-ivl-l/r/t/b` | IVL 섹션 외곽 주황 테두리 (각 방향) |

---

## 12. 다른 앱과의 연동

- **01번 OLED 분석기**: `?embed=1` iframe 호출 + postMessage `{ type: 'oledResult', ivl, lt }` 수신 → Firebase `oled_results/` 저장
- **10번 품질 대시보드**: 동일 Firebase 경로(`lot_schedule`, `oled_results`) 읽음
