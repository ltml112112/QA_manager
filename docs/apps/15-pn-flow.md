# 15. P/N 공정 Flow 관리

> Last updated: 2026-05-14 (rev. 휴지통 — 문서/공정 soft-delete, 출하 완전삭제)
> 폴더: `apps/15_pn_flow/`
> 대분류: 공정 이력 관리 · ID: `pn_flow` · 가드: `_AG_ADMIN_ONLY = true`

---

## 1. 역할 & 범위

드래그앤드롭 시각 Flow 빌더. P/N 소재 합성·정제 공정을 문서화. 섹션 → Lot → 단계 계층 구조로 구성. 프로세스 타입별 템플릿, 상태 추적, Excel 출력, Undo/Redo.

---

## 2. 파일 구조

```
apps/15_pn_flow/
├── index.html   # 이중 뷰 (문서 목록 + 편집기), Firebase CRUD, Sortable.js 드래그드롭 (4.7 KB)
├── app.js       # 데이터 모델, CRUD, Undo/Redo 스택, XLSX 내보내기, 실시간 동기화 (46 KB)
└── style.css    # 목록 그리드, 편집기 레이아웃 (사이드바 드로워), 프로세스 타입별 색상 (26 KB)
```

---

## 3. Firebase 경로

```javascript
db.ref('pn_flow_docs')       // 공정 문서 (P/N/S 섹션 + Lot + Step)
db.ref('pn_flow_shipments')  // 출하 Lot (여러 공정 Lot의 N:M 조합)
```

> Firebase 표준 listener 패턴은 `docs/architecture/firebase-rtdb.md` 참고.
> 두 경로 모두 `@ltml.co.kr` 인증 필요 — 보안 규칙은 `docs/architecture/auth.md` 6절.

---

## 4. 데이터 모델 (문서)

```javascript
{
  id: 'uid',
  title: 'P/N Type 재료 공정',
  material: 'LT-PHM295',
  author: '작성자명',
  date: 'YYYY-MM-DD',
  sections: [
    {
      id: 'uid',
      type: 'P' | 'N' | 'S',  // P Type (blue) / N Type (purple) / Single (amber)
      lots: [
        {
          id: 'uid',
          name: '합성 Batch No.',
          subName: '부제',
          refines: [                        // 정제 Batch — 재고·출하 단위 (출하 차감 대상)
            { id: 'uid', name: '정제 Batch No.', qty: 12.5 | null, unit: 'mg'|'g'|'kg' }
          ],
          steps: [
            {
              id: 'uid',
              type: 'react' | 'solid' | 'wet' | 'subl' | 'collect',
              detail: '상세 내용',
              tag: 'pass' | 'fail' | 'pending' | null,
              location: '충주' | '용인' | '',  // subl 타입만
              date: 'YYYY-MM-DD',
              operator: '담당자명'
            }
          ],
          deletedSteps: [                   // 소프트 삭제된 step 보관 (STAGE 6)
            // steps[] 와 동일 스키마 + deletedAt, deletedBy
          ]
        }
      ]
    }
  ],
  deleted: false,                            // 소프트 삭제 (STAGE 6) — 휴지통 표시
  deletedAt, deletedBy,                      // 삭제 시점 메타
  updatedAt: timestamp,
  updatedBy: 'user@email.com'
}
```

---

## 5. 프로세스 타입 템플릿

- **react** — 반응 (DMA, MeOH/H2O, 결정화)
- **solid** — 결정화 (칩 템플릿 제공)
- **wet** — Wet 정제 (Si, Column, DCB, CF, MC/Hex, Act/Hex, EA/Hex, Tol/Act/Hex, 결정화, 재결정, 고운)
- **subl** — 승화정제 (위치 선택: 충주/용인, 단계 추적)
- **collect** — 여액 취합

---

## 6. 주요 기능

- 문서 목록 (그리드 카드)
- 드래그앤드롭 재정렬 (섹션, Lot, 단계, 교차 Lot 이동)
- Undo/Redo (Ctrl+Z / Cmd+Z, 20개 상태 기억)
- 상태 추적 (각 단계: pass/fail/pending)
- 재고량 추적 (정제 Batch 단위 — 합성 Batch는 헤더만, 수량은 정제 단계에서)
- Excel 출력 (2개 시트: 메타 + 공정 다이어그램, 색상 칠하기)
- 인쇄 최적화 (토폴로지 유지, 색상 유지)
- 실시간 Firebase 동기화 (conflict resolution 포함)
- Seed 문서 (예제 SEED_ID, 버전 관리)

---

## 7. CSS 프리픽스

`.pf-` (pn_flow)

---

## 8. 재고·출하 로드맵

| STAGE | 산출물 | 상태 |
|-------|--------|------|
| 1 | Lot(합성)에 `finalQty/unit` 필드 + 카드 재고 배지 | (deprecated — STAGE 5에서 제거) |
| 2 | `pn_flow_shipments` RTDB + 출하 Lot 생성·배정 모달 + Firebase 보안 규칙 + 재고 자동 차감 | 구현 완료 (2026-05-13) |
| 3 | drill-down(컴포넌트 → 공정 점프) + 역방향 출하이력 popover + 노란 글로우 | 구현 완료 (2026-05-13) |
| 4 | Excel 출력 — 정제 잔량 행 + "출하 Lot" 시트 · glossary | 구현 완료 (2026-05-13) |
| 5 | **정제 Batch 기준 재고로 피벗** — 합성 Lot의 `finalQty/unit` 제거, 재고·이력·출하 모두 refines 단위로 이동. 공정 접기 상태에서도 정제 Batch는 항상 노출 | 구현 완료 (2026-05-13) |
| 6 | **휴지통 (soft-delete)** — 문서·공정(step) 삭제 시 휴지통으로 이동. 출하 삭제된 항목에도 완전삭제 버튼. 복원 / 완전삭제 분리 | 구현 완료 (2026-05-14) |

### STAGE 1 — 재고 데이터 모델

- `lot.finalQty: number | null` — 마지막 공정 후 산출량. `null` = 미입력(배지 숨김)
- `lot.unit: 'mg' | 'g' | 'kg'` — 기본 `'g'`
- 음수 입력은 mutator(`APP.updateLotQty`)에서 거부
- 헬퍼 `lotStock(lot)` → `{stock, finalQty, unit, hasQty, consumed, ratio}` 반환
- `cloneLot`은 `finalQty/unit` 같이 복제
- 부분 갱신 `renderLotStock(lid)` — 수량 입력 중 full render 시 input blur 방지용

### STAGE 2 — 출하 Lot 데이터 모델

`pn_flow_shipments/{shipId}`:

```javascript
{
  id: 'uid',
  shipName: 'SHIP-2026-05-13',
  customer: 'LGD',
  date: 'YYYY-MM-DD',
  note: '',
  components: [                           // N:M — P/N·멀티배치 혼합 가능
    {
      docId, sectionId, lotId,            // 원본 참조 (drill-down은 STAGE 3)
      qty: 20.0,
      unit: 'g',                          // component 추가 시점 lot.unit 스냅샷
      lotNameSnapshot: 'P-MI18-TOL',      // 원본 Lot 이름/타입 변경·삭제 대비
      sectionTypeSnapshot: 'P',
      docTitleSnapshot: '...',
      materialSnapshot: 'LT-PHM295'
    }
  ],
  deleted: false,                          // 소프트 삭제 (복원 가능, 재고 복구)
  createdAt, createdBy,
  updatedAt, updatedBy
}
```

#### 재고 차감 로직

- `lotConsumed(lotId, lotUnit)` — 모든 비-삭제 shipment의 components 중 `lotId` 일치 항목 qty를 `lotUnit`으로 정규화 후 합산
- `lotStock(lot)` — `finalQty − consumed` (음수면 0으로 clamp)
- 단위 환산: `UNIT_TO_G = { mg: 0.001, g: 1, kg: 1000 }`, `convertQty(qty, from, to)` 헬퍼
- 출하 추가/수정/삭제 시 즉시 모든 Lot 카드의 재고 배지가 partial 갱신됨 (`renderLotStock` × N)

#### 재고 배지 색상 단계

| 잔여 비율 | tier 클래스 | 색상 |
|-----------|-------------|------|
| `stock > 50%` | `pf-stock-full` | 녹색 |
| `20% ≤ stock ≤ 50%` | `pf-stock-mid` | 흰색(중성) |
| `0 < stock < 20%` | `pf-stock-low` | 주황 |
| `stock = 0` | `pf-stock-empty` | 빨강 |

#### 입력 검증

- 컴포넌트 추가/수정 시 `qty ≤ 가용재고` 검증 (자기 자신 제외)
- 가용 초과 시 alert + 입력 거부
- 음수·NaN 거부
- 소프트 삭제(`deleted: true`)로 출하 Lot 제거 → 재고 자동 복원

#### Firebase 보안 규칙

`pn_flow_shipments` 경로는 `@ltml.co.kr` 인증 필요 (default deny). 콘솔 Rules 탭에 추가 안 하면 PERMISSION_DENIED. JSON 블록은 `docs/architecture/auth.md` 6절.

### STAGE 3 — 양방향 네비게이션

**Forward (컴포넌트·picker → 공정 미리보기)**
- 출하 상세의 컴포넌트·picker 행 정제 Batch 옆 `↗` 버튼 → `APP.openProcessPopup(docId, sectionId, lotId, refineId)`
- 동작: 우상단에 `#pf-proc-popup` 띄움 — 출하 모달은 **닫히지 않음** (공정·잔량을 동시에 확인하기 위함)
- 팝업 내용: Lot 이름·Type 헤더, 소재·문서 메타, 정제 Batch 잔량(📦 배지), 공정 단계(read-only)
- `refineId`가 전달되면 해당 정제 행이 `pf-proc-refine-hi`(노랑 강조)로 표시
- 닫기: 우상단 `✕`, Esc, 팝업 외부 클릭, 출하 모달 닫기 시
- 원본 Lot 삭제 시 `⚠` 표시 + 버튼 숨김 (snapshot으로 이름만 보존), 팝업 열린 상태에서 원본 삭제되면 자동 닫힘

**Reverse (Lot → 출하)**
- `lotShipments(lotId)` 헬퍼 — 해당 lot이 포함된 비-삭제 출하 목록 반환
- Lot 헤더에 `🔗 N` 인디고 배지 (출하 N건 있을 때만)
- 클릭 → fixed-positioned popover 표시 (각 출하: 이름·수량·고객·일자)
- 출하 행 클릭 → `APP.jumpToShip(shId)` → 모달 상세 뷰로 직행

**Popover/팝업 위치 처리**
- 히스토리 popover: `position: fixed` + JS로 `getBoundingClientRect` 기반 viewport 좌표 세팅
- 공정 미리보기 팝업: `position: fixed; top: 80px; right: 24px` 고정 + `z-index: 1200`(출하 모달 1000 위)
- 클릭 외부·Escape로 자동 닫힘 (`document.click` + keydown 핸들러), 팝업 컨테이너는 `onclick="event.stopPropagation()"`로 내부 클릭 보존

### STAGE 4 — Excel 출력 확장

`exportXlsx()`가 다음 3개 시트를 생성하도록 확장:

1. **문서정보** (기존 그대로)
2. **공정도** — Lot 이름 행 바로 아래에 **산출량/재고/출하** 표시 행 추가
   - `finalQty`가 입력된 Lot이 하나라도 있을 때만 행 생성
   - 색상: 녹(>50%) / 회(20–50%) / 노랑(<20%) / 빨강(0)
3. **출하 Lot** *(NEW)* — 이 문서의 공정 Lot이 포함된 비-삭제 출하만 추출
   - 컬럼: 출하명·고객·일자·메모·Type·Lot·수량·단위·문서
   - 같은 출하의 첫 컴포넌트 행에만 출하 메타데이터 채우고, 나머지 행은 컴포넌트만
   - 컴포넌트 정렬: P → N → S → 기타, 이름 asc.
   - 다른 문서의 컴포넌트는 시트에서 제외 (해당 문서 기준 export)
   - 매칭되는 출하가 없으면 시트 자체를 생략

### 부가 UX 개선

- **공정 전체 접기/펼치기** 버튼 (topbar): 문서 내 **모든 Lot의 공정**(개별 Lot 헤더 ▼/▶와 동일)을 일괄 토글. `STATE.collapsedLots` Set 조작. 라벨은 현재 상태에 따라 "▶ 공정 전체 펼치기" ↔ "▼ 공정 전체 접기" 자동 변경
- **새 Lot 기본 이름 제거**: `+ Lot 추가` 시 빈 이름으로 생성 (placeholder만 표시)
- **출하 관리 문서별 필터 / 그룹 보기** (`STATE.ship.filterDocId`):
  - **문서 안에서** 📦 출하 관리 클릭 → 자동으로 그 문서를 touch하는 출하만 표시 (필터 배너 + "✕ 전체 보기" 버튼)
  - **목록(밖)에서** 📦 출하 관리 클릭 → 필터 없이 **문서별 그룹**으로 한 번에 표시. 그룹 헤더(=`material · title`) 클릭 시 그 문서 필터로 좁히기. 여러 문서를 touch하는 혼합 출하는 각 그룹에 모두 노출되며 `🔗N` 마커로 표시
  - 컴포넌트가 없는 출하는 "미할당" 그룹에 모임
  - 그룹은 material(소재 코드) 알파순 정렬
- **출하 picker 한 출하 = 한 문서 정책**:
  - picker는 출하의 doc context(첫 컴포넌트 docId > `filterDocId`)와 같은 문서의 정제 Batch만 표시. 다른 문서 재고는 숨김
  - 상단에 잠금 안내 노출 — 컴포넌트가 있으면 🔒 lock(`pf-pick-notice-locked`), 없으면 필터 표시
- **0g 구성 허용** (placeholder 모드):
  - 정제 Batch에 `qty`가 입력되지 않아도 picker에 노출 ("미입력" 배지)
  - 사용수량 `0` 또는 양수 입력 시 추가 가능 — 음수만 거부
  - `addShipComponentsBatch` / `updateShipCompQty`: `refine.qty` 미입력이거나 `qty=0`이면 stock 검증 스킵
  - 재고 0인 정제 Batch도 입력 활성화 (그래도 0 초과 입력 시 검증으로 거부)
- **Cascade delete & 고아 컴포넌트 정리**:
  - `deleteRefine/Lot/Section/Doc` 시 출하 component 참조 검사 — 있으면 confirm 후 자동 cascade clean (`cleanRefineComponentsFromShipments`)
  - 출하 자체는 유지 (component만 제거), 빈 출하는 사용자가 수동 처리
  - 출하 목록 toolbar에 "🧹 고아 정리 (N)" 버튼 — 원본이 삭제된 component 일괄 정리 (legacy data 마이그레이션용). 0이면 숨김
  - 헬퍼: `shipsContainingRefines(refineIds)`, `findOrphanComponents()`, `cleanRefineComponentsFromShipments(refineIds)`, `confirmCascadeDelete(refineIds, label)`

### STAGE 5 — 정제 Batch 기준 재고 (현재 구조)

합성 Batch(=Lot) 단위 재고 추적이 실제 워크플로(여러 정제 batch가 합성에서 나옴)와 맞지 않아 정제 Batch 기준으로 피벗.

**제거된 것**
- `lot.finalQty`, `lot.unit` 필드 (스키마에서 삭제)
- Lot 헤더의 산출량 입력 행, 📦 재고 배지, 🔗 출하이력 배지
- `lotStock / lotConsumed / lotShipments` 헬퍼
- `APP.updateLotQty / updateLotUnit` mutator

**대체된 것**
- `refineStock(refine)` → `{stock, qty, unit, hasQty, consumed, ratio}`
- `refineConsumed(refineId, refineUnit)` — 비-삭제 출하의 components 합산
- `refineShipments(refineId)` — 역방향 lookup
- 출하 component 스키마: `refineId, refineNameSnapshot` 추가
- 정제 Batch 행마다 📦 재고 배지 + 🔗 출하이력 popover
- 출하 picker 그리드: Type / 정제 Batch / 합성 Batch / 소재 / 문서 / 현재고 / 사용수량

**UX**
- 정제 Batch 영역은 **공정 접힘 여부와 무관하게 항상 노출** — 사용자가 잔량을 항상 확인 가능
- 컴포넌트 ↗ 점프 → 부모 Lot 카드 노란 글로우 + 해당 정제 Batch 행도 따로 하이라이트 (`pf-refine-pulse`)
- 구 데이터(`refineId` 없는 component)는 "(구 데이터)" 표시 + 점프 가능하지만 잔량 검증 스킵

### STAGE 6 — 휴지통 (soft-delete)

기존 hard-delete 가 실수 한 번에 데이터를 잃게 했음. 문서·공정 step·출하 모두 휴지통 패턴으로 통일.

**문서 휴지통** (`pn_flow_docs/{docId}` 에 `deleted: true` 플래그)
- `APP.deleteDoc` — 소프트 삭제 (refine cascade 검사 없음; 데이터 유지로 출하 component 영향 없음)
- `APP.restoreDoc` — `deleted` 플래그 제거
- `APP.purgeDoc` — 실제 RTDB 노드 제거 (이때만 cascade 확인)
- 목록 하단 `<details>` `#pf-doc-trash` 에 삭제된 문서 표시 + 복원/완전삭제 버튼
- `renderList()` 가 `!d.deleted` 로 필터

**공정(step) 휴지통** (`lot.deletedSteps[]` 분리 배열)
- 기존 step iteration 코드 무수정. `deleteStep` 이 step 객체를 `lot.steps` 에서 `lot.deletedSteps` 로 이동 (deletedAt/deletedBy 부여)
- `APP.restoreStep` — 역방향 이동 (단, 원래 위치 미보존 — 끝에 push, 사용자가 드래그로 재배치)
- `APP.purgeStep` — `lot.deletedSteps` 에서 제거
- 편집기 하단 `#pf-step-trash` 에 섹션/Lot 별 그룹화하여 표시 (`renderStepTrash()`)
- `normDoc` 이 `l.deletedSteps` 를 배열로 강제

**출하 완전삭제**
- 기존 `deleted: true` soft-delete 옆에 `APP.purgeShip` 추가
- "삭제된 출하" `<details>` 의 "복원" 옆에 "완전 삭제" 버튼 (`pf-ship-purge-btn`)
- `delete STATE.shipments[shId]; SHIP_DB.child(shId).remove();`

**CSS**
- `.pf-trash` — 공통 collapsible 컨테이너 (회색 배경)
- `.pf-trash-restore` (초록) / `.pf-trash-purge` (빨강) — 공통 버튼
- `.pf-trash-group` — 공정 휴지통 섹션/Lot 그룹 (`.pf-trash-group-sec.pf-sec-P|N|S` 색상)
- `.pf-trash-step` — 개별 step 카드 + `.pf-trash-step-detail`
