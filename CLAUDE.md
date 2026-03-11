# QA Manager - 전자재료사업부 품질경영팀 포털

## 프로젝트 개요

전자재료사업부 품질경영팀이 사용하는 업무 자동화 포털. 두 가지 주요 도구로 구성됨:
1. **OLED IVL & LT 분석기** - OLED 소재 측정 CSV 데이터를 분석·시각화
2. **LGD 사전심사 자동화** - Google Apps Script 기반 PDF/Excel 문서 자동 생성

---

## 파일 구조

```
QA_manager/
├── index.html                      # 포털 메인 (탭 내비게이션 허브)
├── LT소재 로고(영문).jpg            # 헤더 로고 이미지
├── 1_OLED_IVL_LT/
│   └── ivl_lt.html                 # OLED IVL & LT 분석기 (독립 실행 가능)
└── 2_LGD_사전심사/
    ├── LGD_Index.html              # LGD 사전심사 자동화 UI (GAS 클라이언트)
    └── LGD_Code.gs                 # Google Apps Script 백엔드
```

---

## 핵심 아키텍처

### index.html - 포털 허브
- `ivl_lt.html` 전체를 **base64로 인코딩하여 내장** 후 Blob URL로 iframe에 로드
- `LGD_Index.html`은 Google Apps Script 배포 URL을 직접 iframe으로 로드
- 탭 전환은 CSS `.active` 클래스 토글 방식 (URL 라우팅 없음)

> ⚠️ **중요**: `ivl_lt.html`을 수정한 후에는 반드시 base64 재인코딩하여 `index.html`의 `b64` 변수를 업데이트해야 화면에 반영됨

```bash
# ivl_lt.html 수정 후 index.html 업데이트 방법
python3 -c "
import base64, re
with open('1_OLED_IVL_LT/ivl_lt.html', 'rb') as f:
    content = f.read()
new_b64 = base64.b64encode(content).decode('ascii')
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()
new_html = re.sub(r'(var b64 = \")[A-Za-z0-9+/=]+(\";)', r'\g<1>' + new_b64 + r'\g<2>', html)
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(new_html)
print('Done')
"
```

---

## 1. OLED IVL & LT 분석기 (`ivl_lt.html`)

### 기능 요약
- CSV 파일 드래그앤드롭 업로드 (최대 8개)
- 파일명 패턴으로 슬롯 자동 매칭
- REF/SAMPLE 비교 테이블 (4개 주요 조합 + 4개 추가 조합)
- LT 수명 곡선 차트, 스펙트럼 차트
- 요약 선택 및 클립보드 복사
- IndexedDB 임시저장 (최대 10개 세션)

### 파일 슬롯 구조
| 슬롯 키 | 역할 |
|---------|------|
| `REF_IVL1`, `REF_IVL2` | 기준 IVL 데이터 |
| `SAMPLE_IVL1`, `SAMPLE_IVL2` | 시료 IVL 데이터 |
| `REF_LT1`, `REF_LT2` | 기준 수명 데이터 |
| `SAMPLE_LT1`, `SAMPLE_LT2` | 시료 수명 데이터 |

### 파일명 인식 규칙
- `REF_` 또는 `SAMPLE_` 로 시작 (대소문자 무관)
- `IVL` 또는 `LT` (또는 한글 `수명`) 포함
- 숫자 `1` 또는 `2` 포함
- 예시: `REF_IVL1_sample.csv`, `SAMPLE_LT2_run3.csv`

### 분석 기준
- **측정 기준점**: J=10mA/cm² 행 (CSV 5번째 컬럼 기준으로 가장 가까운 값 탐색)
- **추출 지표**: 전압(V), 효율(cd/A), EQE(%), CIEx, CIEy, 최대파장(nm)
- **LT Low 모드**: LT95, LT94, LT93, LT92, LT91, LT90
- **LT High 모드**: LT99, LT98, LT97, LT96

### 색상 코딩 (비교 테이블)
| 범위 | 색상 | 의미 |
|------|------|------|
| ±5% 이내 | 파란색 | 정상 |
| ±5% 초과 | 빨간색 | 이상 |
| 105% 초과 | 보라색 | 우수 |

### 자동 요약 선택 로직
1. REF1-SAMPLE1 조합의 비율이 모두 97.5~102.5% 범위이고 파장 차이 ±2nm 이내이면 해당 조합 선택
2. 조건 미충족 시 4가지 조합 중 평균 편차가 가장 작은 조합 선택
3. LT: 양쪽 모두 ≥100hr인 레벨 중 가장 높은 레벨, 퍼센트는 가장 낮은 값 선택

### 주요 전역 변수
```javascript
fm = {}         // 파일 맵 {슬롯키: File 객체}
pd = {}         // 파싱된 데이터 {슬롯키: [[행데이터]]}
lastIvl = {}    // 최근 분석 IVL 결과
lastLtLv = {}   // 최근 분석 LT 레벨
sumSel = { ivl: -1, lt: -1, ivlRec: -1, ltRec: -1 }  // 요약 선택 상태
ivlDP = 1       // 소수점 자리수 (0, 1, 2)
ltMode = 'low'  // 'low' 또는 'high'
```

### 데이터셋 색상
```javascript
REF_IVL1:    #4a9eff  (파란색)
REF_IVL2:    #a855f7  (보라색)
SAMPLE_IVL1: #ef4444  (빨간색)
SAMPLE_IVL2: #f59e0b  (주황색)
```

---

## 2. LGD 사전심사 자동화

### 구조
- **프론트엔드**: `LGD_Index.html` (HTML 폼 + `google.script.run` API 호출)
- **백엔드**: `LGD_Code.gs` (Google Apps Script)
- **템플릿**: Google Sheets (ID: `1kh2oBZYKXaadIJoZQJ5OPYZHlwZftiFpuIT45v2SjTk`)

### 생성 파일 목록 (7개)
| 파일 | 유형 |
|------|------|
| MSDS.pdf | PDF |
| 경고표지.pdf | PDF |
| 구성제품확인서.pdf | PDF |
| 작업공정별관리요령.pdf | PDF |
| 비공개물질확인서.pdf | PDF |
| MSDS.xlsx | Excel |
| Checksheet.xlsx (비공개물질) | Excel |

### 파일명 규칙 (클라이언트 측)
- 모든 파일에 `LT소재_` 접두사 추가
- 비공개물질 관련 파일에 버전 문자열 추가: `(25.8월 Ver)`
- 구성제품확인서에서 말미 숫자 제거

> 버전 문자열 변경 시 `LGD_Index.html`의 `PRIVATE_SUBSTANCE_VER` 상수 수정

### GAS 백엔드 처리 흐름
1. 템플릿 스프레드시트 복사 (임시)
2. `[[플레이스홀더]]` 형식으로 값 치환 (작성일, 제품명, 색상, 상품명1~3)
3. "설정" 시트에서 출력 구성 읽기
4. PDF는 `UrlFetchApp.fetchAll()`로 병렬 생성
5. Excel은 개별/묶음 구분하여 병렬 내보내기
6. base64 인코딩 후 클라이언트로 반환
7. 임시 파일 삭제 (finally 블록)

### "설정" 시트 컬럼 구조
| 컬럼 | 내용 |
|------|------|
| 0 | 시트이름 |
| 1 | 유형 (PDF / XLSX단일 / XLSX묶음) |
| 2 | 방향 (가로 = 가로, 그 외 = 세로) |
| 3 | 확대축소 (기본/너비맞춤/높이맞춤/페이지맞춤) |
| 4~7 | 여백 (상/하/좌/우) |
| 8 | 수평정렬 (가운데/왼쪽/오른쪽) |
| 9 | 수직정렬 (위/중간/아래) |
| 10 | 구성제품그룹 (0=전체, 1/2/3=상품명 수 기준 필터) |

---

## 포털 UI (`index.html`)

### 디자인 시스템 (CSS 변수)
```css
--bg:         #0f1117  /* 전체 배경 */
--surface:    #1a1f2e  /* 상단바, 카드 */
--border:     #2e3554  /* 테두리 */
--accent:     #4f6ef7  /* 강조색 (파란보라) */
--text:       #e4e8f5  /* 본문 텍스트 */
--text-muted: #7b84a8  /* 보조 텍스트 */
--success:    #34d399  /* 성공 (초록) */
```

### 탭 전환 방식
```javascript
function switchTab(id, btn) {
  // 모든 탭/프레임에서 active 제거
  // 선택한 탭/프레임에 active 추가
}
```
- 기본 탭: `ivl` (OLED IVL & LT 분석기)
- iframe `src`는 JS에서 Blob URL로 동적 주입

---

## 개발 시 주의사항

1. **`ivl_lt.html` 수정 후 반드시 base64 재인코딩** → 위 Python 스크립트 사용
2. **로고 이미지 경로**: `index.html`에서는 `LT소재 로고(영문).jpg` (루트 기준), `ivl_lt.html`에서 직접 열 경우 `../LT소재 로고(영문).jpg`
3. **LGD_Code.gs 수정 시**: Google Apps Script 편집기에서 배포(새 버전)해야 반영됨
4. **GAS 배포 URL**: `LGD_Index.html`은 `index.html`에서 iframe `src`로 하드코딩됨 — URL 변경 시 `index.html` 수정 필요
5. **파일명에 한글·공백 포함** (`LT소재 로고(영문).jpg`) — 경로 처리 시 주의

---

## 브랜치 전략

- 작업 브랜치: `claude/` 접두사 사용
- PR 머지 대상: `main`
