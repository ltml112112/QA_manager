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
          name: 'Lot 이름',
          subName: '부제',
          finalQty: 50.2 | null,           // 최종 산출량 (출하 가능 재고). null=미입력
          unit: 'mg' | 'g' | 'kg',          // 기본 'g'
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
| 3 | drill-down(컴포넌트 클릭 → 해당 공정 점프) + Lot측 "출하이력" 역방향 링크 | 예정 |
| 4 | Excel 출력 컬럼 확장 + glossary("출하 Lot") | 예정 |

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
