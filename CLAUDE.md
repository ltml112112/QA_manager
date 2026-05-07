# QA Manager — 전자재료사업부 품질경영팀 포털

> Last updated: 2026-05-07

전자재료사업부 품질경영팀이 사용하는 업무 자동화 포털. 사이드바는 8개 대분류로 구성되며, 탭 추가/삭제는 `main.js`의 `apps` 배열만 수정하면 됨.

---

## ⚠️ 작업 전 필독 (Critical Rules)

1. **`main.js` iframe lazy-load 단순화 금지** — 20개 iframe 동시 부팅 throttle 방지용. `iframe.dataset.src` + `if (isFirst) iframe.src` 분리 구조와 `switchTab()`의 `ensureIframeLoaded(id)` 호출은 절대 단순화하지 말 것. 자세히는 `@docs/architecture/iframe-loading.md`
2. **RTDB 신규 앱은 반드시 `QA_whenAuthReady` 패턴** — 직접 `onAuthStateChanged` + `.on('value')` 사용 금지. errorCb 미등록 시 silent death + 빈 화면 영구 고착 발생. `@docs/architecture/firebase-rtdb.md`
3. **`global_style.css` `:root` 변수 변경 시 02번 LGD 앱 인라인도 동기화 필수** — GAS URL 서빙으로 상대경로 안 먹음. 양쪽 동시 수정 + GAS 재배포. `@docs/architecture/design-system.md`
4. **IVL 결과 색상(blue/red/purple) 하드코딩 유지** — 의미 있는 분석 결과 색상이므로 CSS 변수로 변경 금지. `@docs/apps/01-oled.md` 6절
5. **03번 앱(HPLC/DSC)에 Firebase 저장 기능 추가 금지** — 리포트 PDF→PPTX 변환만 담당. 측정값 저장은 18·19번(미구현) 담당. `@docs/apps/03-hplc-dsc.md`
6. **아이콘은 `'·'` middle dot 고정** — 이모지 사용 안 함. 페이지 타이틀은 좌측 세로 바 패턴(`.page-title`).
7. **새 RTDB 경로 추가 시 Firebase 보안 규칙 동시 추가** — default deny이므로 콘솔 Rules 탭에 도메인 패턴 추가 안 하면 PERMISSION_DENIED. `@docs/architecture/auth.md` 6절

---

## 현재 활성 작업 (2026-05 기준)

- 18·19·20번 측정 데이터 관리 앱 설계 진행 (Firebase 스키마 확정 단계). `@docs/apps/wip-placeholders.md` 4절
- 05번 앱 Firebase 연동 개편 대기 (20번 구현 후 진행)

> **전체 미결 작업·향후 STAGE 계획**: `@TODO.md` 참고 (성능·통신 표준화·리팩토링·측정 앱 구현·운영 강화)

---

## 앱 목록

| 대분류 | id | 탭 이름 | 상태 | 상세 문서 |
|--------|-----|---------|------|----------|
| **소자평가** | `oled` | OLED IVL & LT 분석 | 구현 완료 | `@docs/apps/01-oled.md` |
| | `lotschedule` | 소자평가 Lot 일정 관리 | 구현 완료 | `@docs/apps/06-lot-schedule.md` |
| **자동화** | `hplc` | HPLC/DSC Report 자동화 | 구현 완료 (locked) | `@docs/apps/03-hplc-dsc.md` |
| | `lgd` | LGD 사전심사자료 자동화 | 구현 완료 (locked, GAS) | `@docs/apps/02-lgd.md` |
| | `sdc` | SDC 사전심사자료 자동화 | 링크만 (locked) | `@docs/apps/wip-placeholders.md` |
| | `ext_code` | 외부코드 관리 (고객사별) | 개발 예정 (locked, wip) | `@docs/apps/wip-placeholders.md` |
| | `lcms` | LC/MS Report 변환기 | 구현 완료 (locked) | `@docs/apps/16-lcms.md` |
| **측정 데이터 관리** | `hplc_data` | HPLC 데이터 입력 | 개발 예정 (locked, wip) | `@docs/apps/wip-placeholders.md` |
| | `dsc_tga` | DSC / TGA 데이터 입력 | 개발 예정 (locked, wip) | `@docs/apps/wip-placeholders.md` |
| | `lot_flow` | Lot 흐름도 관리 | 개발 예정 (locked, wip) | `@docs/apps/wip-placeholders.md` |
| **품질 데이터** | `cpl` | Lot 추적관리 & SQC | 구현 완료 (locked) | `@docs/apps/05-cpl-quality.md` |
| | `dashboard` | 품질 대시보드 | 구현 완료 (locked) | `@docs/apps/10-quality-dashboard.md` |
| | `complaint` | 불량·컴플레인 관리 | 개발 예정 (locked, wip) | `@docs/apps/wip-placeholders.md` |
| | `coa_dev` | COA 생성 — 개발용 | 개발 예정 (locked, wip) | `@docs/apps/wip-placeholders.md` |
| | `coa_prod` | COA 생성 — 양산용 | 개발 예정 (locked, wip) | `@docs/apps/wip-placeholders.md` |
| **공정 이력 관리** | `pn_flow` | P/N 공정 Flow 관리 | 구현 완료 (locked) | `@docs/apps/15-pn-flow.md` |
| **제품·소재 관리** | `spec_ctq` | 제품 Spec & CTQ/CTP | 개발 예정 (locked, wip) | `@docs/apps/wip-placeholders.md` |
| | `iqc` | 원자재 입고검사 (IQC) | 개발 예정 (locked, wip) | `@docs/apps/wip-placeholders.md` |
| **문서 관리** | `sys_docs` | 시스템 문서 & SOP | 구현 완료 (locked, ECM 링크) | `@docs/apps/wip-placeholders.md` |
| **로드맵** | `roadmap` | 포털 개발 로드맵 | 구현 완료 (locked) | — |

> **상태 표기**: `locked` = 일반 사용자에게 미노출(관리자만 접근), `wip` = 개발 중 플레이스홀더(취소선 + 흐린 색).
> 약어(CTQ/CTP/IVL/LT/SPC/COA 등)는 `@docs/guides/glossary.md` 참고.

---

## 파일 구조

```
QA_manager/
├── CLAUDE.md                        # (이 파일) 슬림 지도
├── docs/                            # 상세 문서
│   ├── architecture/                # auth, firebase-rtdb, iframe-loading, design-system
│   ├── apps/                        # 앱별 상세 (01-16, wip-placeholders)
│   └── guides/                      # new-app-checklist, glossary
├── index.html                       # 포털 허브 (shell + Firebase Auth + 사용자 관리 모달)
├── login.html                       # 로그인 페이지
├── _headers                         # Cloudflare Pages 캐시 정책
├── assets/
│   ├── img/lt_logo.jpg              # 포털 사이드바 로고
│   ├── css/global_style.css         # 전체 디자인 시스템
│   └── js/
│       ├── main.js                  # 탭·iframe 동적 렌더링 + 역할 기반 탭 제어
│       ├── auth_guard.js            # 앱별 직접 URL 접근 차단
│       └── firebase-config.js       # QA_initFirebase + QA_whenAuthReady
└── apps/
    ├── 01_oled_ivl_lt/              # OLED IVL & LT 분석기 [소자평가]
    ├── 02_lgd_eval/                 # LGD 사전심사자료 (GAS) [자동화]
    ├── 03_hplc_dsc/                 # HPLC/DSC Report PPTX 변환 [자동화]
    ├── 04_sdc_eval/                 # SDC 사전심사 (링크) [자동화]
    ├── 05_cpl_quality/              # Lot 이력 & TREND [품질 데이터]
    ├── 06_lot_schedule/             # 소자평가 Lot 일정 [소자평가]
    ├── 07_coa_dev/                  # COA 개발용 (WIP)
    ├── 08_coa_prod/                 # COA 양산용 (WIP)
    ├── 09_ext_code/                 # 외부코드 (WIP)
    ├── 10_quality_dashboard/        # 품질 대시보드 [품질 데이터]
    ├── 11_complaint/                # 불량·컴플레인 (WIP)
    ├── 12_spec_ctq/                 # Spec & CTQ/CTP (WIP)
    ├── 13_iqc/                      # IQC (WIP)
    ├── 14_sys_docs/                 # 시스템 문서 & SOP (ECM 링크)
    ├── 15_pn_flow/                  # P/N 공정 Flow [공정 이력 관리]
    ├── 16_lcms_converter/           # LC/MS 변환기 [자동화]
    ├── 17_roadmap/                  # 포털 개발 로드맵 [로드맵]
    ├── 18_hplc_data/                # HPLC 데이터 입력 (WIP)
    ├── 19_dsc_tga/                  # DSC/TGA 데이터 입력 (WIP)
    └── 20_lot_flow/                 # Lot 흐름도 관리 (WIP)
```

---

## 핵심 아키텍처 요약

### 인증 시스템
Firebase Auth(Email/Password) + RTDB `portal_users/{uid}` 역할 정보로 admin/user 결정. `@ltml.co.kr` 도메인 화이트리스트, 2초 로그인 타임아웃, 5초 DB 타임아웃 fallback. admin 전용 사용자 관리 모달은 secondary Firebase app으로 격리. RTDB 보안 규칙은 도메인 제한이 이미 활성화된 상태(`portal_users`는 본인+admin만 접근).
**상세**: `@docs/architecture/auth.md`

### Firebase RTDB 표준 패턴
모든 앱이 동일 프로젝트(`qa-manager-9c145`)를 다른 `db.ref('경로')`로 공유. 새 앱은 `QA_whenAuthReady(cb)` + `.on('value', success, errorCb)` + backoff 재부착(500ms→8s) + 30초 stuck UI 필수. 직접 `onAuthStateChanged` 사용 금지.
**상세**: `@docs/architecture/firebase-rtdb.md`

### iframe Lazy-Load
`main.js`의 `renderApps()`는 모든 iframe DOM을 만들지만 첫 활성 탭만 src 즉시 부여, 나머지는 `iframe.dataset.src`에 보관. `switchTab()` 시점에 `ensureIframeLoaded(id)`로 src 부여 → 20개 동시 Firebase 부팅 throttle 차단. `apps` 배열 스키마도 여기 참고.
**상세**: `@docs/architecture/iframe-loading.md`

### 디자인 시스템
`global_style.css` 8개 섹션. 사이드바 색상은 `--portal-*` 변수(섹션 3-A), 앱 콘텐츠는 `--bg/--surface/--accent` 등(섹션 3-B). **라이트 단일 테마** — 다크 모드 미사용. 페이지 타이틀은 좌측 세로 바 패턴(`.page-title`). 02번 LGD 앱만 GAS 서빙 fallback으로 인라인 CSS 유지.
**상세**: `@docs/architecture/design-system.md`

---

## 호스팅 & 배포

- **호스팅**: Cloudflare Pages 정적 호스팅 — 상대경로 직접 참조 방식
- **캐시 정책** (`_headers`): HTML은 `Cache-Control: no-store`, 그 외는 `no-cache` — 코드 변경 즉시 반영
- **앱 수정 후**: 파일 저장 → 배포만 하면 바로 반영됨 (base64 재인코딩 불필요)
- **로고**: `./assets/img/lt_logo.jpg` (포털·로그인 공통)
- **02번 GAS 백엔드 수정 시**: Google Apps Script 편집기에서 배포(새 버전)해야 반영됨

---

## 브랜치 전략

- 작업 브랜치: `claude/` 접두사 사용
- PR 머지 대상: `main`

### 최근 작업 브랜치 이력

| 브랜치 | 내용 |
|--------|------|
| `claude/refactor-claude-docs-bzqXb` | CLAUDE.md를 슬림 지도(~15KB) + `docs/` 분할 구조로 리팩토링. 보안 규칙 정정, Critical Rules 박스, Glossary 추가 |
| `claude/fix-firebase-data-loading-YJgdV` | Firebase RTDB 첫 진입 데이터 로딩 race + 다중 iframe 동시 부팅 throttle 수정 — `main.js` lazy-load + `QA_whenAuthReady` + error cb 재부착 + 로딩 오버레이 + 30s stuck UI (#129) |
| `claude/department-sorting-distinction-fHBNk` | `06_lot_schedule` 전체 기능 개발 — 부서 구분 로직·메일 파싱·배치 그룹화·UI 개편·검색 |
| `claude/setup-firebase-project-yydA7` | `06_lot_schedule` Firebase Realtime Database 연동 — 실시간 다중 사용자 동기화 |

---

## 문서 maintenance 규칙

### 새 앱 추가 시

1. `assets/js/main.js` `apps` 배열 등록 — 스키마는 `@docs/architecture/iframe-loading.md` 2절
2. 이 파일(`CLAUDE.md`) 앱 목록 표에 행 추가 + 상세 문서 링크
3. `docs/apps/{번호}-{이름}.md` 신규 작성 (양식: 역할/범위 → 파일구조 → 데이터 스키마 → 함수 → CSS → 다른 앱과의 연동)
4. 해당 앱이 RTDB 사용 시 → Firebase 콘솔에서 보안 규칙 추가 + `@docs/architecture/auth.md` 6절 표 업데이트
5. 새 앱 작성 step-by-step은 `@docs/guides/new-app-checklist.md`

### 색상/디자인 토큰 변경 시

1. `assets/css/global_style.css` 수정
2. `apps/02_lgd_eval/index.html` 인라인 `:root` 변수 동시 수정 + GAS 재배포
3. `@docs/architecture/design-system.md` 업데이트

### Firebase 보안 규칙 변경 시

1. Firebase 콘솔 → RTDB → Rules 탭 수정 + Publish
2. `@docs/architecture/auth.md` 6절 JSON 블록 동기화

### 새 약어/기술 용어 도입 시

1. `@docs/guides/glossary.md`에 정의 추가

---

## 추가 참고 — 도구별 공통 사항

- **CSS 중복 방지**: `:root` 변수, reset, `body` 기본 스타일, `.card`, `.btn`, `.form-input` 등은 `global_style.css`가 제공. 앱 `<style>`에 다시 쓰지 말 것 (02번 LGD 예외).
- **구형 변수명 호환**: `global_style.css` 섹션 3-C에 `--bdr`, `--tx`, `--ink`, `--primary`, `--error` 등 alias 정의 — 기존 앱 코드 수정 없이 동작.
