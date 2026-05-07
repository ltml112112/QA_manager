# 03. HPLC/DSC Report 자동생성

> Last updated: 2026-05-07
> 폴더: `apps/03_hplc_dsc/`
> 대분류: 자동화 · ID: `hplc` · 가드: `_AG_ADMIN_ONLY = true`

---

## 1. 역할 & 범위

HPLC·DSC 통합 분석 PDF에서 그래프 영역을 자동 크롭해 PPTX 슬라이드로 변환하는 도구. 단일 HTML 파일에 CSS·HTML·JS 전부 포함.

### ⚠️ 하지 말 것 — 데이터 저장 기능 추가 금지

이 앱은 **열안정성 테스트 또는 회수 재료에 대한 Report PDF를 크롭해 PPTX로 변환하는 도구**일 뿐이다.
측정값을 Firebase에 저장하거나 품질 대시보드와 연동하는 기능은 없으며, **앞으로도 추가하지 않는다**.

> HPLC 순도·Imp peak·DSC Tm 등 공정 분석 측정값의 Firebase 저장·대시보드 연동은 별도 앱(18·19번, 미구현)에서 담당할 예정이다. 03번 앱을 수정해서 데이터 저장 기능을 붙이지 말 것.

---

## 2. 주요 흐름

1. PDF 업로드 → `pdf.js`로 페이지 파싱 (`buildPageMap()`)
2. 페이지 유형 자동 판별 — 가로(landscape)=DSC, 세로(portrait)=HPLC
3. HPLC: 상단 메타 테이블 추출 → 그래프 영역 크롭
4. DSC: 그래프 영역 크롭 (슬라이더로 확대/여백 미세조정)
5. `pptxgenjs`로 슬라이드 병합 → HPLC + DSC 1개 PPTX 다운로드

---

## 3. CDN 라이브러리

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js"></script>
```

`pptxgenjs` CDN 로드 실패 시 `cdnjs` fallback 자동 시도(`loadPptxFallback()`).

---

## 4. 주요 함수

| 함수 | 역할 |
|------|------|
| `buildPageMap()` | PDF 페이지 순회 → 각 페이지 유형(hplc/dsc) 판별 |
| `getPageType(page)` | 페이지 종횡비로 유형 결정 |
| `extractHplcMeta(page)` | HPLC 상단 메타 테이블 OCR/좌표 추출 |
| `processHplcPage(p)` / `processDscPage(p)` | 크롭 수행 |
| `computeDscCrop()` | DSC 그래프 영역 좌표 계산 |
| `renderPage(p, scale)` | 페이지를 canvas로 렌더 |
| `cropB64(canvas, box)` | canvas 부분 → base64 PNG |
| `drawB64(b64)` | 미리보기 썸네일 그리기 |
| `buildPptx(items)` | 최종 PPTX 병합 생성 |
| `addSumBoxToChart(slide, ...)` | HPLC 슬라이드 요약 박스 추가 |

---

## 5. DSC 슬라이드 테두리

DSC 이미지는 `addImage()` 후 별도 `addShape(rect)`로 오버레이 테두리를 그림
(`pptxgenjs`의 `addImage`가 `line` 옵션을 지원하지 않아 rect 오버레이 방식 사용).
