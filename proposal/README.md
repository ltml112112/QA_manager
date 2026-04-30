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
│   └── (rendered .png/.svg 파일)   # 렌더 후 자동 생성
└── screenshots/                    # 실제 포털 스크린샷 (수동 캡처)
    ├── 06_lot_schedule.png         # ⓘ 추후 직접 캡처해서 추가
    ├── 05_genealogy.png
    ├── 10_dashboard.png
    └── ...
```

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

## ④ 스크린샷 추가 가이드

`proposal.md`에 실제 포털 화면을 박으면 설득력이 크게 올라감.
다음 스크린샷을 **수동으로 캡처**해 `screenshots/` 폴더에 넣고 슬라이드에 추가하세요:

| 파일명 | 캡처 위치 | 사용할 슬라이드 |
|--------|-----------|-----------------|
| `06_lot_schedule.png` | 06번 앱 캘린더 풀화면 (오늘 모달 열린 상태) | Slide 5 (Case A) |
| `06_oled_badge.png` | 06번 Lot 카드의 📊 결과 배지 확대 | Slide 5 (Case A) |
| `05_genealogy.png` | 05번 Lot 계보도 + SPC 차트 | Slide 5 (Case B) |
| `05_deepdive.png` | 05번 Batch Deep-Dive 패널 | Slide 5 (Case B) |
| `10_dashboard.png` | 10번 대시보드 전체 | Slide 3 |
| `15_pn_flow.png` | 15번 문서 편집기 (P/N 섹션 보이는 상태) | Slide 4 |

캡처 후 `proposal.md`의 해당 슬라이드에 추가:

```markdown
![w:600](./screenshots/06_lot_schedule.png)
```

---

## ⑤ 발표 시나리오 (참고)

각 슬라이드별 권장 발표 시간 (총 ~15분):

| Slide | 주제 | 시간 |
|-------|------|------|
| 1 | 표지 | 30초 |
| 2 | 문제 정의 | 1분 |
| 3 | **비전 한 장 (핵심!)** | 2분 |
| 4 | Phase 1 현황 | 1.5분 |
| 5 | 모듈 맵 | 1분 |
| 6 | 통합 사례 (라이브 데모 권장) | 2분 |
| 7 | Phase 2 (COA) | 2분 |
| 8 | 데이터 시나리오 | 1.5분 |
| 9 | Phase 3 | 1분 |
| 10 | 로드맵 | 1분 |
| 11 | 기대 효과 | 1분 |
| 12 | 다음 결정 | 30초 |

> **추천**: Slide 5 (통합 사례)에서 노트북 화면을 띄워 **실제 포털을 라이브 시연**하면 텍스트 100장보다 강력합니다.

---

## ⑥ 편집·확장 팁

- **수치 업데이트**: Slide 10 기대 효과의 정량 수치는 실제 측정값으로 갱신하면 더 강력
- **고객·임원 버전**: Slide 11 (기술 스택)을 빼고 9 → 12로 바로 점프
- **버전 관리**: `proposal-v2.md`로 fork하지 말고 git branch (`proposal/v2-feedback` 등)로 관리
- **CLAUDE.md와 동기화**: 새 앱이 구현되면 `proposal.md`의 Phase 표시(🟢/🟡/⚪)도 같이 업데이트
