# QA Manager — TODO

전체 코드 리뷰 결과 남은 작업 목록. 우선순위 높은 순.
작업 브랜치: `claude/code-review-efficiency-SNG1s`

---

## 진행 완료 (참고)

- [x] `03_hplc_dsc/index.html` 전체 중복 문서 제거 (2830줄 → 1424줄)
- [x] `main.js` 잠금 토글 데드 코드 제거 (`_toggleLockedVisibility`, `_lockedHidden`, `_UK`)
- [x] `CLAUDE.md` 구버전 정정 (핑크 테마 색상값, 3-파일 구조, 섹션 번호, Step 4)
- [x] `global_style.css` 목차 동기화 + `--portal-text-faint` 정식 정의
- [x] `05_cpl_quality` Mermaid CDN/호출 제거, `#mermaid-viewer` → `#genealogy-viewer`
- [x] `06_lot_schedule` 데드 함수 제거 (`editItem`, `autoDept`)
- [x] `기능설명.md` 잠금 토글 문장 간단화
- [x] `01_oled_ivl_lt/index.html` 다크테마 하드코딩 색상 36군데 → CSS 변수 교체

---

## 🟠 중요 — 성능/안정성

### 1. `05_cpl_quality` 검색·계보 성능 최적화

**파일**: `apps/05_cpl_quality/app.js`

- [ ] 사이드바 Lot 검색 lowercase 캐싱
  - 현재: `renderLotGroups(query)` 실행 시 Lot마다 `lot.toLowerCase()` + `remark.toLowerCase()` 반복 호출
  - 개선: 흐름도 업로드 완료 시점(`parseFlowData` 말미)에 `STATE.lotSearchIndex = { [lot]: 'lot|remark'.toLowerCase() }` 캐싱
  - 검색 시 캐시 lookup만 수행
  - **기대효과**: 수천 Lot 환경에서 키 입력 체감 지연 제거

- [ ] 계보 엣지 중복 방지 `Set` 화
  - 현재: `pushEdge()` 헬퍼가 배열 `.some()` 선형 탐색으로 dedupe
  - 개선: `const edgeSet = new Set()` 도입, key = `${from}→${to}`
  - **기대효과**: O(N) → O(1) 중복 검사, 큰 계보도에서 렌더 시간 단축

- [ ] `collectFullChain` BFS visited 검사
  - 현재: visited 체크 경로가 중첩 배열 탐색 가능성
  - 개선: `Set` 기반 visited로 통일
  - **기대효과**: 복잡한 계보(수십~수백 노드) BFS 안정화

### 2. `06_lot_schedule` Firebase 쓰기 최적화

**파일**: `apps/06_lot_schedule/app.js`

- [ ] `saveItems()` — 전체 배열 덮어쓰기 → 타겟 업데이트
  - 현재: `DB_REF.set(items)` — 한 건 수정·삭제·추가마다 전체 `lot_schedule/` 배열을 통째로 덮어씀
  - 개선: 개별 작업용 헬퍼 추가
    - `addItem(item)` → `DB_REF.child(id).set(item)`
    - `updateItem(id, patch)` → `DB_REF.child(id).update(patch)`
    - `removeItem(id)` → `DB_REF.child(id).remove()`
  - 주의: 현재 스키마가 **배열(index key)** 기반이라 **객체(id key)** 기반으로 마이그레이션 필요
  - **기대효과**: 동시 수정 충돌 방지, 네트워크 트래픽 감소, 실시간 동기화 부하 완화

- [ ] 캘린더 전체 재렌더 최소화
  - 현재: 수정·추가 후 `renderCalendar()`로 전체 DOM 재생성
  - 개선: 변경된 Lot이 속한 셀만 부분 재렌더 (또는 가상 DOM 유사 diff)
  - **기대효과**: 일정 많은 달에서 편집 시 깜빡임·지연 감소

---

## 🟡 앱별 — 코드 품질

### 3. `06_lot_schedule` 폼 검증 + 상태 보존

**파일**: `apps/06_lot_schedule/app.js`

- [ ] 개별 등록 폼 날짜 상호 검증
  - 규칙: `evalStart ≤ evalTarget`, `transferDate ≤ evalStart` (있을 때만)
  - 위치: `fillForm()`/제출 핸들러
  - 에러 시 `.form-input.invalid` + 에러 메시지 표시

- [ ] 조회 중인 년/월 localStorage 저장
  - 키: `qa_lot_schedule_month`
  - 앱 재진입 시 이전 보던 달로 복원
  - **기대효과**: 탭 전환·새로고침 후 월 초기화(`오늘이 속한 달`) 스트레스 제거

### 4. 플레이스홀더 앱 공통화 (04, 07~15)

**파일**: `apps/04_sdc_eval/index.html`, `apps/07_coa_dev/` ~ `apps/15_calibration/` 전부

- [ ] 9개 앱의 `index.html`이 거의 동일한 "개발 예정" 플레이스홀더를 복붙한 상태
- [ ] 공통 스크립트/스타일 중복 확인 후 하나로 통일
  - 동일한 테마 동기화 IIFE
  - 동일한 `.placeholder-hero` 스타일
- [ ] 기능 구현 시점에 어차피 교체될 파일이므로 **낮은 우선순위** — 실제 구현 시 같이 정리

---

## 🟢 경미 — 정돈

### 5. `01_oled_ivl_lt/index.html` 추가 정리 (선택)

- [ ] Chart.js 컨텍스트에서 `getPropertyValue('--tx').trim()||'#e4e8f5'` 같은 fallback 값이 아직 남아 있음
  - 현재는 문제 없지만 구(舊) 테마 잔재
  - 교체 여부는 차트 렌더링 안정성 확인 후 결정

### 6. `02_lgd_eval/index.html` 인라인 CSS 동기화 (GAS 제외 요청이 있었으나 동기화 누락만 메모)

- [ ] 브랜드 테마 변경 시 `global_style.css`와 별도로 **이 파일 인라인 `:root`도 수동 동기화 필요**
  - GAS로 배포되어 상대경로 CSS 참조 불가 — 인라인 유지가 정답
  - **체크리스트**: 브랜드 색상 변경 PR에는 반드시 이 파일도 포함되는지 확인

### 7. 중복 상수/헬퍼 검토 (장기)

- [ ] `apps/*` 여러 앱에서 비슷한 역할의 유틸(`fmtVal`, `normDate`, `escapeHtml` 등) 각자 구현
- [ ] `assets/js/` 하위에 공통 헬퍼 모듈 두는 방안 검토
  - 단, iframe 격리 구조상 단순 `<script>` 로드가 가장 안전 → 별도 `assets/js/util.js` 신규 파일 + 각 앱에서 개별 로드
  - **주의**: 파일 하나 더 로드하는 비용과 중복 제거 이득 저울질 필요

---

## 운영 메모

- 색상 변경은 `global_style.css` 섹션 3-A (포털) / 3-B (앱) 만 수정
- 의미 색상(`.t td.blue/.red/.purple`, `.data-table .cell-ok/ng`)은 **브랜드 테마와 독립 고정값**
- 새 앱 추가 시 `apps/16_xxx/` 규칙 + `main.js` `apps` 배열만 수정 (`index.html`은 건드리지 않음)
- `02_lgd_eval` 는 GAS 배포본이라 상대경로 CSS 불가 → 인라인 유지 (예외)
