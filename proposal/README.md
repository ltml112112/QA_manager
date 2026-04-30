# QA Manager Portal — 제안서

전자재료사업부 품질경영팀의 통합 품질 관리 시스템 비전 제안서.
Marp(Markdown 기반) + Mermaid 다이어그램으로 작성되어 git으로 버전 관리됩니다.

---

## 파일 구조

```
proposal/
├── README.md                       # 이 파일 (편집·렌더링 가이드)
├── proposal.md                     # Marp 슬라이드 본문 (12 slides)
├── diagrams/
│   ├── system_dataflow.mmd         # ① 데이터 흐름 한 장 (slide 2)
│   ├── module_map.mmd              # ② 16개 앱 카테고리 맵 (slide 4)
│   ├── roadmap.mmd                 # ③ Phase 1/2/3 Gantt (slide 9)
│   └── (*.png — 렌더 후 생성)
├── mockups/                        # 화면 mockup HTML (실제 포털과 동일 디자인)
│   ├── 10_dashboard.html           # 품질 대시보드 (KPI 5개 + 차트 6개)
│   ├── 05_genealogy.html           # Lot 계보도 + SPC TREND
│   ├── 05_deepdive.html            # Batch Deep-Dive (이탈 분석)
│   ├── 06_lot_schedule.html        # 캘린더 + Lot 카드
│   ├── 06_oled_badge_zoom.html     # OLED 결과 통합 클로즈업 (Case A)
│   └── 15_pn_flow.html             # P/N 공정 Flow 편집기
└── screenshots/                    # mockup → PNG 변환 결과 또는 실제 캡처
    └── (*.png — 렌더 후 생성)
```

> **mockup의 역할** — 실제 포털 데이터를 노출하지 않으면서 "예시" 표시와 함께
> 진짜 디자인(global_style.css 직접 참조)으로 화면을 보여줌. 외부 제출용으로 안전.

---

## ① 빠른 미리보기 — VS Code

가장 빠른 방법:

1. **VS Code Marp 확장** 설치: `marp-team.marp-vscode`
2. `proposal.md` 열기 → 우측 상단 **🔍 미리보기** 아이콘 클릭
3. 다이어그램은 별도 렌더 필요 (아래 ② 참고)

---

## ② Mermaid 다이어그램 → PNG 렌더

`proposal.md`는 다이어그램을 PNG로 임베드하므로, `.mmd` 파일을 PNG로 변환해야 함.

### 방법 A — Mermaid CLI (한 번에)

```bash
# 설치 (Node.js 필요)
npm install -g @mermaid-js/mermaid-cli

# 모든 다이어그램 PNG로 렌더
cd proposal
mmdc -i diagrams/system_dataflow.mmd -o diagrams/system_dataflow.png -w 1600 -H 900 -b transparent
mmdc -i diagrams/module_map.mmd      -o diagrams/module_map.png      -w 1600 -H 900 -b transparent
mmdc -i diagrams/roadmap.mmd         -o diagrams/roadmap.png         -w 1600 -H 900 -b transparent
```

### 방법 B — 온라인 (설치 없이)

1. https://mermaid.live 접속
2. `.mmd` 파일 내용 복사 → 좌측 에디터에 붙여넣기
3. 우측 미리보기 확인 → **Actions → PNG 다운로드**
4. `diagrams/` 폴더에 저장 (파일명 일치 필수)

---

## ③ 최종 PPT/PDF 빌드

```bash
# PNG 렌더가 끝난 상태에서

npm install -g @marp-team/marp-cli

cd proposal

# PDF
marp proposal.md --pdf --allow-local-files -o proposal.pdf

# PPTX (편집 가능한 PowerPoint)
marp proposal.md --pptx --allow-local-files -o proposal.pptx

# HTML (웹 공유용)
marp proposal.md --html --allow-local-files -o proposal.html
```

> `--allow-local-files`는 PNG·screenshot 임베드를 위해 필수.

---

## ④ Mockup → PNG 변환 (스크린샷 만들기)

`mockups/*.html` 6개를 PNG로 변환해서 `screenshots/`에 넣어야 슬라이드에 임베드됨.

### 방법 A — Chrome 직접 캡처 (가장 간단)

1. `mockups/10_dashboard.html` 더블클릭 → 브라우저에서 열림
2. **Cmd+Shift+P** (또는 Ctrl+Shift+P) → "Capture full size screenshot" 선택
3. PNG 다운로드됨 → `proposal/screenshots/10_dashboard.png` 로 이름 변경
4. 나머지 5개 mockup 동일 반복

### 방법 B — Headless Chrome (한 번에 자동화)

```bash
cd proposal/mockups

# 각 mockup을 PNG로 변환 (Chrome 설치돼 있어야 함)
for f in *.html; do
  google-chrome --headless --disable-gpu --no-sandbox \
    --window-size=1600,1000 \
    --screenshot="../screenshots/${f%.html}.png" \
    "file://$(pwd)/$f"
done
```

> 각 mockup 우측 상단의 "예시 / MOCKUP" 노란 배너는 의도된 표시.
> 발표/제안서에서 "**실제 운영 화면 예시 (mockup)**"로 명시.

### Mockup 매핑 표

| Mockup HTML | 슬라이드 위치 | 보여주는 것 |
|-------------|---------------|-------------|
| `10_dashboard.html` | Slide 3 (Phase 1) | KPI 5개 + 차트 6개 + 진행 중 + 최신 결과 |
| `05_genealogy.html` | Slide 6 (Case B) | Lot 계보 + SPC TREND 한 화면 |
| `05_deepdive.html` | Slide 6 (Case B) | 이탈 → 측정값 상세 → 원인 분석 |
| `06_lot_schedule.html` | Slide 6 (Case A) | 캘린더 + 부서별 Lot 카드 |
| `06_oled_badge_zoom.html` | Slide 6 (Case A) | 01↔06 통합 흐름 클로즈업 |
| `15_pn_flow.html` | Slide 4 (모듈 맵) | 드래그앤드롭 공정 빌더 |

### 본인이 실제 화면 캡처로 교체하고 싶다면

본인 운영 데이터를 직접 보여주고 싶으면 같은 파일명으로 `screenshots/`에 저장하면 됨.
민감 정보(고객사·실제 Lot 번호) 마스킹은 본인이 처리.

---

## ⑤ 발표 시나리오 (참고)

각 슬라이드별 권장 발표 시간 (총 ~17분):

| Slide | 주제 | 시간 |
|-------|------|------|
| 1 | 표지 | 30초 |
| 2 | 문제 정의 | 1분 |
| 3 | **비전 한 장 (핵심!)** | 2분 |
| 4 | Phase 1 현황 (텍스트) | 1분 |
| 5 | 모듈 맵 | 1분 |
| 6 | **Phase 1 운영 화면 갤러리** | 1.5분 |
| 7 | 통합 사례 (글) | 1분 |
| 8 | **통합 사례 — 화면 (라이브 데모 권장)** | 2분 |
| 9 | Phase 2 (COA) | 2분 |
| 10 | 데이터 시나리오 | 1.5분 |
| 11 | Phase 3 | 1분 |
| 14 | 다음 결정 | 30초 |

> **추천**: Slide 8 (통합 사례 화면)에서 노트북 화면을 띄워 **실제 포털을 라이브 시연**하면 텍스트 100장보다 강력합니다.

---

## ⑥ 편집·확장 팁

- **수치 업데이트**: Slide 12 기대 효과의 정량 수치는 실제 측정값으로 갱신하면 더 강력
- **고객·임원 버전**: Slide 13 (기술 스택)을 빼고 12 → 14로 바로 점프
- **버전 관리**: `proposal-v2.md`로 fork하지 말고 git branch (`proposal/v2-feedback` 등)로 관리
- **CLAUDE.md와 동기화**: 새 앱이 구현되면 `proposal.md`의 Phase 표시(🟢/🟡/⚪)도 같이 업데이트
- **mockup 수정**: 데이터가 너무 가짜처럼 보이면 `mockups/*.html`을 직접 편집해서 더 그럴듯한 값으로 바꾸기
