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
db.ref('pn_flow_docs')
```

> Firebase 표준 listener 패턴은 `docs/architecture/firebase-rtdb.md` 참고.

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
| 2 | `pn_flow_shipments` RTDB + 출하 Lot 생성·배정 모달 (P/N·멀티배치 혼합) + Firebase 보안 규칙 | 예정 |
| 3 | 출하 Lot 관리 화면 + drill-down(컴포넌트 클릭 → 해당 공정 점프) + Lot측 "출하이력" 역방향 링크 | 예정 |
| 4 | Excel 출력 컬럼 확장 + glossary("출하 Lot") | 예정 |

### STAGE 1 — 재고 데이터 모델

- `lot.finalQty: number | null` — 마지막 공정 후 산출량. `null` = 미입력(배지 숨김)
- `lot.unit: 'mg' | 'g' | 'kg'` — 기본 `'g'`
- 음수 입력은 mutator(`APP.updateLotQty`)에서 거부
- 헬퍼 `lotStock(lot)` → `{stock, finalQty, unit, hasQty}` 반환. STAGE 2에서 `stock = finalQty − Σ(출하 components)`로 계산 로직만 확장 (시그니처 유지)
- `cloneLot`은 `finalQty/unit` 같이 복제
- 부분 갱신 `renderLotStock(lid)` — 수량 입력 중 full render 시 input blur 방지용
