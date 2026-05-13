# 용어집 (Glossary)

> Last updated: 2026-05-13 (rev. 정제 Batch 기준 재고)

QA Manager 전반에서 자주 등장하는 약어와 전문 용어 정의.

---

## 품질 관리 용어

### CTQ — Critical to Quality
고객·규격 관점의 핵심 품질 특성. 예: 순도(%), Tm(℃), 색상 좌표(CIEx, CIEy). 12번 앱(Spec & CTQ/CTP)에서 소재별로 정의되며, 05번(SQC)·07/08번(COA) 앱과 연동.

### CTP — Critical to Process
공정 관점의 핵심 파라미터. 공정 변동이 CTQ에 직접 영향을 미치는 인자(반응 온도, 시간, 농도 등). CTQ와 한 쌍으로 관리됨.

### SPC — Statistical Process Control
통계적 공정 관리. 측정값을 시계열 차트로 그리고 관리한계선(UCL/LCL)·규격한계선(USL/LSL)을 표시해 공정 변동을 모니터링. 05번 앱이 이 차트를 렌더.

### SQC — Statistical Quality Control
통계적 품질 관리. SPC와 거의 동의어로 사용되나, SQC는 sampling/검사 관점, SPC는 공정 변동 관점. 05번 앱은 양쪽 의미 모두 포괄.

### IQC — Incoming Quality Control
원자재 입고 검사. 공급자에게 받은 원자재가 spec을 충족하는지 입고 시점에 확인. 13번 앱이 담당 (WIP).

### COA — Certificate of Analysis
분석 성적서. 출하하는 소재 Lot에 대해 시험 결과를 기재한 공식 문서. 07번(개발용) / 08번(양산용) 앱이 자동 생성 예정.

### USL / LSL — Upper / Lower Specification Limit
규격 상한/하한. 고객·내부 spec으로 정의된 합/불합격 경계. SPC 차트에서 주황색 실선으로 표시.

### UCL / LCL — Upper / Lower Control Limit
관리 상한/하한. 공정 변동 통계로부터 산출되는 관리 경계 (보통 ±3σ). SPC 차트에서 빨간색 점선으로 표시. UCL/LCL 이탈 = 공정 이상 신호.

---

## 측정·분석 용어

### IVL — Current(I), Voltage(V), Luminance(L)
OLED 소자 평가에서 전류·전압·휘도 곡선 측정. 기준점은 J=10mA/cm². 추출 지표: 전압(V), 효율(cd/A), EQE(%), CIEx, CIEy, 최대파장(nm). 01번 앱의 핵심.

### LT — Lifetime
OLED 소자 수명. 초기 휘도 대비 N% 까지 떨어지는 데 걸리는 시간(hr). LT95 = 95% 잔존 시간, LT90 = 90% 잔존 시간 등. 01번 앱이 측정·분석.

### EQE — External Quantum Efficiency
외부 양자 효율(%). 주입된 전자 대비 외부로 방출된 광자 비율. OLED 효율 핵심 지표 중 하나.

### HPLC — High-Performance Liquid Chromatography
고성능 액체 크로마토그래피. 화합물의 순도·불순물 함량 측정 장비. 03번 앱은 HPLC 리포트 PDF를 PPTX로 변환, 18번 앱은 raw 데이터를 Firebase에 저장 예정.

### DSC — Differential Scanning Calorimetry
시차 주사 열량계. 시료의 열용량 변화를 측정해 융점(Tm), 결정화 온도, 유리전이 온도 등을 도출. 03번·19번 앱과 연관.

### TGA — Thermogravimetric Analysis
열중량 분석. 가열에 따른 시료 중량 감소 측정 → 분해개시온도(Td5, Td10), 잔류물(%) 도출. 19번 앱이 raw 데이터 저장 예정.

### LC/MS — Liquid Chromatography / Mass Spectrometry
액체 크로마토그래피와 질량 분석기 결합 장비. 분리된 피크의 질량(m/z) 정보까지 획득. 16번 앱이 Agilent LC/MS 리포트 변환.

---

## 데이터 단위 용어

### Lot
소재 생산의 1회 배치 단위. 동일 공정·동일 시점에 생산된 소재의 묶음. Lot 번호로 식별.

### Batch
공정 단위 배치. 합성 1회분, 정제 1회분 등을 의미. **Lot은 출하 단위**, **Batch는 공정 단위**로 구분되며, 한 Lot이 여러 Batch로 구성될 수 있음. 06번 앱의 합성생산 메일 등록에서 같은 Batch No. 행들이 그룹으로 묶임.

### 합성 Batch (Synthesis Batch)
15번 P/N 공정 Flow에서 `pn_flow_docs/{docId}/sections/lots/{lotId}` 한 항목. 한 번의 합성 반응에서 시작되는 단위로, 정제 공정 steps를 거쳐 여러 **정제 Batch**로 분기되어 산출됨. 자체 수량 필드는 없음(2026-05-13 rev.).

### 정제 Batch (Refine Batch)
합성 Batch에 종속된 sub-record. `lot.refines[] = [{ id, name, qty, unit }]`. **재고 추적과 출하 차감의 단위**. 한 합성 Batch에서 여러 정제 Batch가 나올 수 있고, 각 정제 Batch가 다른 출하 Lot에 배정될 수 있음.

### 출하 Lot (Shipment Lot)
고객사로 출하되는 단위. `pn_flow_shipments/{shipId}`에 저장되며 `components[]`에 여러 **정제 Batch**(P/N/S 혼합·멀티 batch)를 N:M으로 묶을 수 있음. 컴포넌트 추가 시 출처 정제 Batch의 `qty`에서 자동 차감. 소프트 삭제(`deleted: true`) 지원 — 복원하면 재고도 같이 회복.

### 잔량 (Refine qty / stock)
정제 Batch의 입력 수량(`refine.qty`)에서 출하된 양을 뺀 현재 가용 재고. 단위는 `mg / g / kg`. **stock = qty − Σ(출하 components.qty)**. 미입력(`null`) 시 재고 배지 미표시. 출하 picker는 `qty`가 입력된 정제 Batch만 노출.

---

## 시스템·기술 용어

### GAS — Google Apps Script
Google 워크스페이스 자동화 스크립트 (JavaScript 기반). 02번 LGD 앱이 GAS로 백엔드 구현. 배포 시 외부 URL 발급 → `main.js`에서 sandbox iframe으로 임베드.

### RTDB — Realtime Database
Firebase Realtime Database. WebSocket 기반 실시간 동기화 NoSQL DB. 06·10·15번 앱이 동일 프로젝트(`qa-manager-9c145`)를 다른 경로로 공유. 표준 연동 패턴은 `docs/architecture/firebase-rtdb.md` 참고.

### ECM — Enterprise Content Management
사내 문서 관리 시스템. 14번 앱은 ECM 클라우드(`https://ecm.ltml.co.kr/...`)로의 외부 링크 카드를 제공.

### SOP — Standard Operating Procedure
표준 작업 지침서. 14번 앱(시스템 문서 & SOP)에서 ECM 링크로 제공.
