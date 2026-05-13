# 15. P/N 공정 Flow 관리

> Last updated: 2026-05-13
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
          name: 'Lot 이름',                  // = 합성 Batch No.
          subName: '부제',
          finalQty: 50.2 | null,           // 합성 산출량 (출하 차감 대상). null=미입력
          unit: 'mg' | 'g' | 'kg',          // 기본 'g'
          refines: [                        // 정제 Batch 잔량 기록 (출하 시스템과 독립)
            { id: 'uid', name: '정제 Batch No.', qty: 12.5 | null, unit: 'g' }
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
          ]
        }
      ]
    }
  ],
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
- 재고량 추적 (Lot별 `finalQty` + 단위) — STAGE 1
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
| 1 | Lot에 `finalQty/unit` 필드 + Lot 카드 재고 배지 (📦) | 구현 완료 (2026-05-13) |
| 2 | `pn_flow_shipments` RTDB + 출하 Lot 생성·배정 모달 (P/N·멀티배치 혼합) + Firebase 보안 규칙 + 재고 자동 차감 + 색상 단계(green/회/주황/빨강) | 구현 완료 (2026-05-13) |
| 3 | drill-down(컴포넌트 → 공정 점프) + Lot측 "출하이력" 역방향 popover + 노란 글로우 하이라이트 | 구현 완료 (2026-05-13) |
| 4 | Excel 출력 — 산출량/재고 행 + 별도 "출하 Lot" 시트 · glossary("출하 Lot/공정 Lot/산출량") | 구현 완료 (2026-05-13) |

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

**Forward (컴포넌트 → 공정)**
- 출하 상세의 컴포넌트 이름 옆 `↗` 버튼 → `APP.jumpToLot(docId, sectionId, lotId)`
- 동작: 모달 닫기 → `STATE.currentId = docId` → `render()` → `scrollIntoView({block:'center'})` → 2.4s 노란 글로우 (`pf-lot-pulse` keyframe)
- 접혀있던 섹션/Lot 자동 펼침 (`collapsedSecs.delete`)
- 원본 Lot 삭제 시 `⚠` 표시 + 점프 버튼 숨김 (snapshot으로 이름만 보존)

**Reverse (Lot → 출하)**
- `lotShipments(lotId)` 헬퍼 — 해당 lot이 포함된 비-삭제 출하 목록 반환
- Lot 헤더에 `🔗 N` 인디고 배지 (출하 N건 있을 때만)
- 클릭 → fixed-positioned popover 표시 (각 출하: 이름·수량·고객·일자)
- 출하 행 클릭 → `APP.jumpToShip(shId)` → 모달 상세 뷰로 직행

**Popover 위치 처리**
- `position: fixed` + JS로 `getBoundingClientRect` 기반 viewport 좌표 세팅 — 부모 `overflow: hidden / auto` 영향 무시
- 우측 클립 방지(`window.innerWidth - 8`까지)
- 클릭 외부·Escape로 자동 닫힘 (`document.click` + keydown 핸들러)

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

### 정제 Batch (refines)

각 Lot(= 합성 Batch)이 정제 공정을 거쳐 산출한 정제 batches의 **잔량**을 기록하는 sub-records. 출하 차감 시스템과 독립 (출하는 여전히 `finalQty` 기준).

- 데이터: `lot.refines[] = [{ id, name, qty, unit }]`
- UI: Lot 카드 body 하단 — 녹색 패널, 행마다 이름 + 수량 + 단위 + 삭제 버튼
- Lot 접힘 상태에서는 "정제 N건"으로 카운트만 노출
- 음수 거부, 빈 값은 `null` 저장
- `cloneLot` 시 refines도 새 id로 복제, `normDoc`에서 RTDB의 object→array 정규화
