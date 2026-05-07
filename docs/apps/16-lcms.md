# 16. LC/MS Report 변환기

> Last updated: 2026-05-07
> 폴더: `apps/16_lcms_converter/`
> 대분류: 자동화 · ID: `lcms` · 가드: `_AG_ADMIN_ONLY = true`

---

## 1. 역할 & 범위

Agilent LC/MS **Single Injection Report** PDF의 2페이지 MSD 테이블을 사용자가 가공한 형식으로 자동 변환하는 도구. 단일 HTML 파일에 CSS·HTML·JS 전부 포함.

### 기능 요약

- PDF + Excel 다중 업로드 (한 드롭존에 혼합)
- 확장자 제외 **파일명이 같은 쌍**을 자동 매칭 (예: `LT-PHM220_0409.pdf` ↔ `LT-PHM220_0409.xlsx`)
- 매칭된 쌍만 일괄 변환 → 1쌍이면 PDF 단독 다운로드, 2쌍 이상이면 ZIP 다운로드
- 모든 처리는 브라우저 내(서버 전송 없음)

---

## 2. 입력 형식

**PDF**: Agilent Single Injection Report (2페이지 이상). 2페이지 MSD 테이블 영역이 변환 대상.

**Excel** (1번째 시트): A=`#`, B=`m/z`, C=`Abundance` 컬럼 순서. 그룹 사이에 `# / m/z / Abundance` 헤더 행을 두면 다중 피크 처리됨.

```
A     B       C
#     m/z     Abundance      ← 그룹 헤더
37    665.4   32.3
38    666.5   62
...
#     m/z     Abundance      ← 다음 그룹
21    889.5   39.2
```

---

## 3. 컬럼 변환

```
RT / Type / Width / Area / Height / Area% / Name   →   RT / Type / m/z / Abun(%)
```

기존 컬럼 영역을 흰 사각형으로 덮은 뒤 새 헤더와 그룹별 데이터 행을 같은 좌표에 다시 그림. 그룹 첫 행에만 RT·Type 표시, 이하 행은 m/z·Abun만 표시.

---

## 4. 좌표 템플릿 (`TMPL`) — Agilent 양식 고정값

Agilent Single Injection Report의 2페이지 레이아웃은 보고서마다 동일한 고정 양식 → 좌표를 상수로 박아둠.

| 키 | 값 | 의미 |
|----|----|------|
| `headerY` | 505.58 | 헤더 행 baseline (PDF 좌표 = 아래에서부터) |
| `firstDataY` | 484.68 | 첫 데이터 행 baseline |
| `rowSpacing` | 20.2 | 새 테이블 행 간격 |
| `groupGap` | 43.9 | 그룹 사이 간격 |
| `xRT, xType` | 69.4, 114.9 | RT·Type 컬럼 좌측 x |
| `xMzRight, xAbRight` | 166.8, 206.8 | m/z·Abun 컬럼 우측 정렬 기준 x |
| `xHdrRT, xHdrType, xHdrMz, xHdrAb` | 62.4, 110.4, 147.1, 182.4 | 헤더 좌측 x |
| `coverLeft, coverRightMargin` | 55, 73 | 흰 사각형 가림판 좌·우 여백 |

> 양식이 다른 보고서에는 동작하지 않음. Agilent 보고서 양식이 바뀌면 이 상수들을 새 좌표로 갱신해야 함.

---

## 5. CDN 라이브러리

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
```

---

## 6. 처리 흐름

1. 드롭존에 PDF·Excel 혼합 업로드 → 확장자 기준 `pdfMap` / `xlMap`으로 분리.
2. 같은 basename을 가진 항목끼리 매칭 → `pairs` 배열.
3. 매칭된 각 쌍에 대해 `processPair()`:
   - PDF 원본을 두 개의 `Uint8Array`로 복제 (PDF.js는 ArrayBuffer를 transfer하므로 pdf-lib용 별도 사본 필요).
   - PDF.js로 2페이지 텍스트 좌표를 읽어 `headerY` 아래 130pt 범위 내에서 `\d+\.\d{3}` 패턴(체류시간) + 2글자 대문자 패턴(Type)을 묶음 단위로 추출.
   - SheetJS로 Excel 1번째 시트를 `header:1` 모드로 읽어 `parseGroups()`로 그룹화.
   - pdf-lib으로 2페이지 기존 테이블 영역(`headerY+13` ~ `lastY-14` 높이)을 흰 사각형으로 덮음.
   - 새 헤더(Helvetica Bold) + 그룹별 데이터 행(Helvetica Regular) 다시 그림. m/z는 `toFixed(1)`, Abundance는 정수면 정수, 아니면 그대로 표시.
4. `JSZip`에 `_수정본.pdf` 이름으로 추가.
5. 1쌍이면 PDF 직접 다운로드, 2쌍 이상이면 `LCMS_수정본_YYYYMMDD_HHMM.zip`으로 압축 다운로드.

---

## 7. 주요 함수

| 함수 | 역할 |
|------|------|
| `parseGroups(data)` | Excel 행 배열 → 그룹별 `{mz, abun}` 배열 |
| `extractRTValues(pdfBuf)` | PDF.js로 2페이지 RT·Type 추출 |
| `processPair(pdfFile, xlFile)` | 1쌍 처리 진입점 — 변형 PDF Uint8Array 반환 |
| `runAll()` | 매칭된 모든 쌍 변환 + ZIP/PDF 다운로드 |
| `rebuild()` | 매칭 테이블 + 실행 버튼 활성/비활성 갱신 |
