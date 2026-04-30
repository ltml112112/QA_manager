---
marp: true
theme: default
paginate: true
size: 16:9
header: 'QA Manager Portal — 통합 품질 관리 시스템'
footer: '전자재료사업부 품질경영팀 · jhbaik@ltml.co.kr'
style: |
  section {
    font-family: 'Inter', 'Noto Sans KR', sans-serif;
    background: #fdf5f6;
    color: #1e1a1b;
  }
  h1 {
    color: #be0039;
    border-left: 6px solid #be0039;
    padding-left: 16px;
  }
  h2 {
    color: #be0039;
    border-bottom: 2px solid #e8d0d4;
    padding-bottom: 8px;
  }
  strong { color: #be0039; }
  table {
    font-size: 0.75em;
  }
  th {
    background: #f5eaec;
    color: #be0039;
  }
  .lead { font-size: 1.1em; color: #6b7280; }
  .done { color: #10b981; font-weight: 700; }
  .wip  { color: #f59e0b; font-weight: 700; }
  .next { color: #9ca3af; font-weight: 700; }
  .small { font-size: 0.75em; color: #6b7280; }
  .center { text-align: center; }
  .columns { display: flex; gap: 24px; }
  .columns > div { flex: 1; }
  blockquote {
    border-left: 4px solid #be0039;
    background: #fff;
    padding: 12px 16px;
    color: #1e1a1b;
  }
---

<!-- _class: lead -->
<!-- _paginate: false -->

# QA Manager Portal
## 전자재료사업부 품질경영팀 통합 품질 관리 시스템

<br>

**Phase 1 → Phase 2 → Phase 3 로드맵 제안**

<br>
<br>

<div class="small">
2026.04 · 품질경영팀 · jhbaik@ltml.co.kr
</div>

---

## 1. 왜 만드는가 — 현재 업무의 단절

지금 품질 데이터·평가 결과·Lot 이력이 **각자 다른 도구에 흩어져 있음**:

| 영역 | 현재 도구 | 문제점 |
|------|-----------|--------|
| 소자평가 결과 | 이메일 + 엑셀 첨부 | 누락·재집계 빈번, 검색 불가 |
| Lot 이관 일정 | 카카오톡 + 메일 표 | 부서 간 요청 추적 어려움 |
| Lot 계보 추적 | 사내 Lot 관리 ERP에 의존 | TREND 분석과 연계 불가 |
| SQC TREND | 엑셀 별도 관리 | 이상치 발생 시 원인 역추적 안 됨 |
| COA 발행 | 수기 작성 + PDF 변환 | 발행 시간 ↑, 휴먼 에러 |
| 사전심사 자료 (LGD/SDC) | 시트 매크로 | 양식 변경 시 수동 대응 |

> **결과** — 같은 Lot의 정보가 5~6개 도구를 거쳐 통합되어야만 출하 의사결정 가능.
> 통합 허브가 필요한 이유.

---

## 2. 비전 한 장 — Quality Data Hub

<!-- 다이어그램: diagrams/system_dataflow.mmd 의 렌더링 결과를 여기에 삽입 -->

![w:1100](./diagrams/system_dataflow.png)

<div class="small center">

**입력**(원자재·합성·정제) → **측정**(소자평가·HPLC/DSC) → **분석**(SQC·TREND·KPI) → **출력**(COA·사전심사) — 전 흐름이 한 시스템 안에서 연결됩니다.

</div>

---

## 3. 현재 모습 — Phase 1 (구현 완료 ≈60%)

<div class="columns">
<div>

### <span class="done">● 운영 중인 핵심 모듈</span>

- **소자평가 Lot 일정** (06)
  - Firebase 실시간 동기화
  - 메일 일괄 등록 · 검색 · 완료 추적
- **OLED IVL & LT 분석기** (01)
  - CSV 8개 자동 매칭 · 비교 테이블
  - **06번에 결과 직접 저장** (embed mode)
- **Lot 추적관리 & SQC** (05)
  - 흐름도 + 품질 데이터 → 계보·TREND
  - Batch Deep-Dive · Excel 계보 복사
- **품질 대시보드** (10)
  - 5 KPI · 6 차트 · 실시간 동기화

</div>
<div>

### <span class="done">● 자동화 도구 모음</span>

- **HPLC/DSC Report 자동화** (03)
  - PDF → PPTX 슬라이드 변환
- **LGD 사전심사자료 자동화** (02)
  - GAS · 7개 파일 일괄 발행
- **LC/MS Report 변환기** (16)
  - Agilent PDF 양식 자동 가공
- **P/N 공정 Flow 관리** (15)
  - 드래그앤드롭 · Undo · Excel 출력
- **시스템 문서 & SOP** (14)
  - ECM 통합 진입점

</div>
</div>

<div class="small center">

총 16개 탭 중 **9개 운영 중** · Cloudflare Pages + Firebase Realtime DB

</div>

---

## 4. 모듈 맵 — 카테고리별 현황

![w:1100](./diagrams/module_map.png)

<div class="small center">

🟢 구현 완료 (9) · 🟡 개발 중 (1) · ⚪ 개발 예정 (6)

</div>

---

## 5. 핵심 통합 사례 — "이미 작동하고 있는 통합"

<div class="columns">
<div>

### Case A · 평가 흐름 통합 (01 ↔ 06)

1. 정제팀이 Lot 이관 일정 등록 (06)
2. 평가 담당자가 CSV 분석 (01, embed)
3. **"이 Lot에 결과 저장"** 클릭
4. Firebase에 결과 저장 → 06번 카드에 배지 자동 표시
5. 10번 대시보드에 KPI 자동 반영

→ **이미 데이터가 한 흐름으로 흐르고 있음**

</div>
<div>

### Case B · 계보 + TREND 통합 (05)

1. 흐름도 Excel 업로드 → 모든 Lot 계보 자동 구성
2. 품질 Excel 업로드 → 같은 Batch No. 매칭
3. SQC 차트에서 이탈 포인트 클릭
4. Batch Deep-Dive → 전 공정 측정값 즉시 확인
5. 계보 클립보드 복사 → Excel rowspan 그대로 붙여넣기

→ **이상치 발생 → 원인 역추적이 1분 안에 가능**

</div>
</div>

---

## 6. Phase 2 — COA 자동 발행 (다음 6개월 목표)

<div class="columns">
<div>

### 출하 COA의 "단일 진실 공급원"

현재 흩어져 있는 데이터를 **하나의 발행 엔진**으로 묶음:

```
입력 데이터:
├─ 소자평가 결과 (oled_results)
├─ 소재 Spec & CTQ (App 12, NEW)
├─ Batch별 측정값 (App 05)
├─ 외부 코드 매핑 (App 09, NEW)
└─ 원자재 IQC 이력 (App 13, NEW)

         ↓ COA Engine ↓

출력:
├─ COA 양산용 (App 08)  ── 고객 발송
└─ COA 개발용 (App 07)  ── 내부 검토
```

</div>
<div>

### 선결 조건 — 데이터 표준화

<span class="next">●</span> **App 12 — 제품 Spec & CTQ/CTP**
- 소재별 규격·핵심 품질/공정 파라미터
- COA 항목·SPC 관리 한계의 단일 정의

<span class="next">●</span> **App 13 — 원자재 IQC**
- 입고 검사 결과를 Lot 계보 시작점으로 등록

<span class="next">●</span> **App 09 — 외부코드 관리**
- 고객사별 외부 코드 ↔ 내부 코드 매핑
- COA 발행 시 고객 코드 자동 치환

→ Phase 2 완료 시점 = **첫 자동 COA 발행 가능 시점**

</div>
</div>

---

## 7. 데이터 통합 시나리오 — Lot xxxx 출하까지

```
Day 1   원자재 입고
        → App 13 (IQC) — Lot 시작점 등록
                                                                
Day 3   합성 / 정제 진행
        → App 15 (P/N Flow) — 공정 단계 기록
        → App 03 (HPLC/DSC) — 분석 PDF → PPTX
                                                                
Day 7   정제완료 → 소자평가 의뢰
        → App 06 (Lot 일정) — 이관 등록
        → App 01 (OLED 분석) — 결과 입력
                                                                
Day 9   품질 데이터 종합
        → App 05 (Lot 추적 + SQC) — 계보·TREND 검증
        → App 10 (대시보드) — KPI 자동 반영
                                                                
Day 10  출하 가능성 판정
        → App 12 (Spec/CTQ) — 자동 비교
        → App 08 (COA 양산) — PDF 자동 발행
        → App 09 (외부코드) — 고객 코드 변환
```

> **목표: 입고 → 출하 COA 발행까지의 모든 흔적이 한 시스템에 남는다.**

---

## 8. Phase 3 — 실시간 Trend & 역추적 허브

<div class="columns">
<div>

### 컴플레인 → 원인 역추적

<span class="next">●</span> **App 11 — 컴플레인 관리**
- 고객 컴플레인 등록 시 Lot 번호로 시작
- App 05 계보를 따라 합성·정제 단계까지 자동 역추적
- 이탈 측정값 / 변경된 공정 단계 자동 표시

### 실시간 SPC 알림

- App 10 대시보드에서 관리도 이탈 발생 시
- Slack / 메일 알림 → **사후 대응 → 사전 예방**으로 전환

</div>
<div>

### 사전심사 자동화 확장

<span class="wip">●</span> **App 04 — SDC 사전심사**
- LGD(02번)와 동일 패턴으로 GAS 기반 발행
- 양식·증빙 자료 통합

### 데이터 표준화 효과

CTQ/CTP가 정의되면 자동 연쇄:
- App 05 SQC 관리한계 자동 적용
- App 07/08 COA 항목 자동 구성
- App 10 KPI 정의 자동 반영
- App 13 IQC 판정 기준 자동 적용

→ **한 번 정의된 규격이 모든 모듈에 흐른다**

</div>
</div>

---

## 9. 로드맵

![w:1100](./diagrams/roadmap.png)

<div class="small center">

각 Phase는 **이전 Phase의 데이터 위에 쌓임** — 하나하나가 독립적으로 가치를 내면서, 다음 단계의 기반이 됨.

</div>

---

## 10. 기대 효과

<div class="columns">
<div>

### 정량 효과 (예측)

| 항목 | 현재 | Phase 2 | Phase 3 |
|------|------|---------|---------|
| COA 발행 시간 | 30분/건 | <span class="done">3분/건</span> | <span class="done">3분/건</span> |
| Lot 이력 추적 | 1~2시간 | <span class="done">1분</span> | <span class="done">1분</span> |
| 평가 결과 누락 | 월 3~5건 | <span class="done">0건</span> | <span class="done">0건</span> |
| 컴플레인 원인 추적 | 1~2일 | 1~2일 | <span class="done">10분</span> |
| 사전심사 자료 작성 | 1~2시간 | <span class="done">5분</span> | <span class="done">5분</span> |

</div>
<div>

### 정성 효과

- **데이터 신뢰성** — 한 번 입력한 데이터가 모든 곳에 흐름
- **추적성 (Traceability)** — 출하 후 어떤 컴플레인이 와도 원인 즉시 확인
- **의사결정 속도** — KPI/SQC 실시간 → 사후 대응 → 사전 예방
- **속인성 제거** — 담당자 부재에도 자료 발행·이력 조회 가능
- **확장성** — 새 도구 추가 시 `apps[]` 한 줄 + 폴더 하나로 끝

</div>
</div>

---

## 11. 기술 스택 — 단순함이 곧 지속가능성

<div class="columns">
<div>

### 인프라

- **호스팅**: Cloudflare Pages (정적, 무상)
- **인증**: Firebase Auth (Email/Pw, @ltml.co.kr 도메인)
- **DB**: Firebase Realtime Database
- **자동화**: Google Apps Script (LGD/SDC)
- **연산**: 100% 클라이언트 사이드 (개인정보 외부 미전송)

### 보안

- 도메인 화이트리스트 (@ltml.co.kr 만 가능)
- 역할 분리 (admin / user)
- 직접 URL 접근 차단 (auth_guard.js 이중 방어)
- 관리자만 계정 생성 가능 (회원가입 비활성화)

</div>
<div>

### 운영 비용 — 거의 0원

- Cloudflare Pages: 무료 플랜으로 충분
- Firebase: Spark 플랜(무료) 한도 내
- GAS: Google Workspace에 포함

### 유지보수성

- **새 도구 추가**: `apps/` 폴더 하나 + `main.js` 한 줄
- **테마 변경**: `global_style.css` 변수만 수정
- **모든 코드가 Git 관리**: `claude/...` 브랜치 → main PR
- **CLAUDE.md** — 코드베이스 자체 문서화

</div>
</div>

---

## 12. 다음 결정 사항

### 즉시 결정이 필요한 항목

1. **Phase 2 우선순위** — App 12(Spec/CTQ) 먼저? App 13(IQC) 먼저?
   - 추천: **App 12 → App 08(COA 양산) → App 13 → App 07(COA 개발)**
   - 이유: COA 발행이 가장 큰 효용 → CTQ 정의가 그 선결 조건

2. **CTQ/CTP 표준화 워크숍** — 소재별 규격을 누가·언제 정의?
   - 품질팀 단독? 합성/정제팀 합동?
   - 1차 대상 소재 5종 선정

3. **승인·범위** — Phase 2 개발 기간 / 책임자 / 검수 일정

<br>

> **요청드립니다** — 위 우선순위 검토 + Phase 2 킥오프 일정 확정.

---

<!-- _paginate: false -->

# 감사합니다

<br>

**문의** · 백종환 · jhbaik@ltml.co.kr · 031-330-1032

<br>
<br>

<div class="small center">

QA Manager Portal · 전자재료사업부 품질경영팀
GitHub: ltml112112/QA_manager · 2026.04
</div>
