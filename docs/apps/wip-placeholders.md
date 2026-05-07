# WIP 플레이스홀더 앱 (04, 07-09, 11-14, 18-20)

> Last updated: 2026-05-07

아래 앱들은 `apps/` 폴더에 간단한 WIP 플레이스홀더 `index.html`을 포함함. 실제 기능 구현 시 해당 파일을 교체하면 됨. `main.js`의 `src` 경로는 변경 불필요.

---

## 1. 플레이스홀더 공통 구조

모든 WIP 플레이스홀더는 동일한 패턴:

- `.wip-label` 뱃지 + `.wip-title` 제목 + `.wip-desc` 설명 텍스트
- `global_style.css` 링크 + 테마 동기화 스크립트 포함
- `main.js`에서 `wip: true` 플래그 → 사이드바 탭에 취소선 표시
- 기능 구현 시 이 파일 전체를 교체하고 `wip: true` 제거

---

## 2. 앱 목록

| 번호 | 폴더 | 대분류 | 설명 |
|------|------|--------|------|
| 04 | `04_sdc_eval/` | 자동화 | SDC 사전심사자료 자동화. LGD 자동화와 동일하게 GAS 기반 구현 예정. GAS 배포 후 `main.js` `sdc` `src`를 GAS URL로 교체 |
| 07 | `07_coa_dev/` | 품질 데이터 | COA 생성 — 개발용. 개발 단계 소재 COA 자동 생성 |
| 08 | `08_coa_prod/` | 품질 데이터 | COA 생성 — 양산용. HPLC·DSC·TGA·소자평가 데이터 기반 고객사 양식 항목 구성 + SQM 데이터 추출·발행 |
| 09 | `09_ext_code/` | 자동화 | 외부코드 관리. 고객사별 외부 코드 ↔ 내부 코드 매핑 |
| 11 | `11_complaint/` | 품질 데이터 | 불량·컴플레인 관리. 05번 앱 Lot 계보와 연동 |
| 12 | `12_spec_ctq/` | 제품·소재 관리 | 제품 Spec & CTQ/CTP. 소재별 규격 + 핵심 파라미터 |
| 13 | `13_iqc/` | 제품·소재 관리 | 원자재 입고검사(IQC). 입고 검사 결과 등록·이력 |
| 14 | `14_sys_docs/` | 문서 관리 | 시스템 문서 & SOP. ECM 클라우드 외부 링크 카드. 외부 링크: `https://ecm.ltml.co.kr/url/?key=4495z1PrhUEkZ9nK` (구현 완료, locked) |
| 18 | `18_hplc_data/` | 측정 데이터 관리 | HPLC 데이터 입력. HPLC 장비 CSV raw 데이터 업로드 → Firebase 누적 저장 |
| 19 | `19_dsc_tga/` | 측정 데이터 관리 | DSC / TGA 데이터 입력. DSC·TGA 장비 raw 데이터 업로드 → Firebase 누적 저장 |
| 20 | `20_lot_flow/` | 측정 데이터 관리 | Lot 흐름도 관리. 흐름도 Excel 업로드 → Firebase 저장 → 측정 데이터와 매칭 |

---

## 3. CTQ/CTP 설계 원칙 (12번 앱 관련)

- **CTQ** (Critical to Quality): 고객·규격 관점의 핵심 품질 특성 (순도%, Tm℃ 등)
- **CTP** (Critical to Process): 공정 관점의 핵심 파라미터
- 12번 앱(Spec 등록)에서 소재별로 CTQ/CTP 파라미터를 정의
- 정의된 CTQ/CTP는 05번 앱(SQC 차트) 및 COA 생성(07/08번 앱)과 연동 예정

---

## 4. 측정 데이터 관리 대분류 (18·19·20번)

### 4-A. 신설 배경

품질 데이터 조회(05번)·대시보드(10번)·COA 생성(07/08번)이 공통적으로 필요로 하는 HPLC·DSC·TGA 측정값과 Lot 계보 데이터를 Firebase에 체계적으로 적재하기 위한 대분류. 자동화(리포트 변환) 그룹과 품질 데이터(조회·분석) 그룹 사이에 위치하여 **입력 → 저장 → 조회** 흐름을 명시적으로 구분함.

### 4-B. 데이터 흐름 설계

```
[18번 HPLC 데이터 입력]  ──┐
[19번 DSC/TGA 데이터 입력] ─┤→  Firebase  →  [05번 품질 데이터 조회]
[20번 Lot 흐름도 관리]    ──┘               [10번 품질 대시보드]
                                            [07/08번 COA 생성]
```

모든 앱이 동일한 Firebase 프로젝트(`qa-manager-9c145`)를 사용하며 각자 다른 `db.ref()` 경로에 저장함:

| 앱 | Firebase 경로 (예정) | 비고 |
|----|---------------------|------|
| 18번 HPLC | `measurement_hplc/` | Lot별 순도·불순물 피크 데이터 |
| 19번 DSC/TGA | `measurement_dsc_tga/` | Lot별 Tm·분해온도 데이터 |
| 20번 흐름도 | `lot_flow/` | 완제품→원료 계보 관계 |

> **05번 앱 현재 상태**: 흐름도 Excel + 품질 Excel을 그때그때 파일로 업로드해서 브라우저에서만 보는 방식. Firebase와 무연결 상태임. 20번 흐름도 관리 앱이 구현되면 05번이 Firebase에서 직접 읽도록 개편 예정.

### 4-C. 18번 — HPLC 데이터 입력 (`apps/18_hplc_data/`)

**역할**: HPLC 장비에서 추출한 CSV raw 데이터를 Lot번호와 매핑하여 Firebase에 누적 저장.

**구현 시 고려사항**:
- HPLC CSV 파일의 Lot번호 위치 (파일명 vs. 파일 내부)를 먼저 확인 후 파싱 로직 설계
- 다른 인원이 HPLC CSV 파싱 HTML을 별도 개발 중 — 해당 코드와 Firebase 저장 스키마를 통일해야 함
- 기존에 엑셀에 누적된 히스토리 데이터를 일괄 임포트할 수 있는 migration 기능도 포함 예정

**예정 Firebase 스키마**:

```javascript
// measurement_hplc/{lotId}/{timestamp}
{
  lotId:      'LT-PHM295-240801',
  measuredAt: 'YYYY-MM-DD',
  purity:     99.5,           // 순도 (%)
  impPeaks:   [               // 불순물 피크 목록
    { rt: 12.34, area: 0.12, name: 'Imp-A' },
    // ...
  ],
  operator:   '홍길동',
  rawFile:    'LT-PHM295_0801.csv',  // 원본 파일명 참고용
}
```

### 4-D. 19번 — DSC / TGA 데이터 입력 (`apps/19_dsc_tga/`)

**역할**: DSC·TGA 장비에서 추출한 raw 데이터를 Lot번호와 매핑하여 Firebase에 누적 저장.

**구현 시 고려사항**:
- DSC와 TGA는 장비·파일 포맷이 다를 수 있음 → 탭 또는 토글로 분리해서 입력받는 구조 권장
- 측정값 종류: DSC → Tm (융점, ℃), TGA → 분해개시온도 (Td, ℃), 잔류물(%)

**예정 Firebase 스키마**:

```javascript
// measurement_dsc_tga/{lotId}/{timestamp}
{
  lotId:      'LT-PHM295-240801',
  measuredAt: 'YYYY-MM-DD',
  dsc: {
    tm:       285.3,   // 융점 (℃)
  },
  tga: {
    td5:      320.1,   // 5% 분해온도 (℃)
    td10:     340.5,   // 10% 분해온도 (℃)
    residue:  0.3,     // 800℃ 잔류물 (%)
  },
  operator:   '홍길동',
}
```

### 4-E. 20번 — Lot 흐름도 관리 (`apps/20_lot_flow/`)

**역할**: Lot 계보(흐름도) 데이터를 Excel에서 업로드하거나 직접 관리하여 Firebase에 저장. 현재 05번 앱이 세션마다 파일을 업로드해서 임시로 보는 방식을 대체하여, **한 번 업로드하면 모든 앱에서 공유**되는 영구 저장소 역할.

**구현 방향 (A안 — 파일 업로드 방식)**:
- 현재 05번 앱의 흐름도 Excel 파싱 로직 재사용
- 업로드 시 Firebase `lot_flow/` 경로에 저장
- 이후 05번·10번·07/08번이 파일 없이 Firebase에서 직접 조회

**예정 Firebase 스키마**:

```javascript
// lot_flow/{uploadId}
{
  uploadedAt:  'YYYY-MM-DD',
  uploadedBy:  'user@ltml.co.kr',
  fileName:    '흐름도_240801.xlsx',
  stageLabels: ['1단계', '2단계', '3단계'],
  relations: [
    // 완제품 → 원료 관계 목록
    { outputLot: 'LT-PHM295-240801', inputLot: 'LT-PHM295-RAW-001', stage: 2 },
    // ...
  ],
  lotMeta: {
    'LT-PHM295-240801': { itemCode: 'PHM295', itemName: '재료명', remark: null },
    // ...
  }
}
```
