# 10. 품질 대시보드

> Last updated: 2026-05-07
> 폴더: `apps/10_quality_dashboard/`
> 대분류: 품질 데이터 · ID: `dashboard` · 가드: `_AG_ADMIN_ONLY = true`

---

## 1. 역할 & 범위

소자평가 Lot 추적 + OLED 분석 결과의 실시간 KPI 대시보드. 평가 Trend, 소재 순위, 리드타임 통계, LT 효율 분포를 시각화.

---

## 2. 파일 구조

```
apps/10_quality_dashboard/
├── index.html   # 5개 KPI 카드 + 6개 차트 섹션 + 필터바 + 진행 중 소재 목록 + 최신 결과 테이블 (8.3 KB)
├── app.js       # Firebase 실시간 동기화, Chart.js 렌더링, 필터, KPI 계산 (38 KB)
└── style.css    # 대시보드 그리드 (5열 KPI, 2열 차트), 자동완성 드롭다운 (14 KB)
```

---

## 3. Firebase 경로

```javascript
db.ref('lot_schedule')   // 06번 앱과 공유
db.ref('oled_results')   // 06번 앱과 공유
```

> Firebase 표준 listener 패턴은 `docs/architecture/firebase-rtdb.md` 참고.

---

## 4. KPI & 차트 (총 13개)

- 당기 평가 수 (vs. 전기 대비 %)
- 진행 중 소재 수
- 평균 리드타임 (일)
- 시급 요청 비율 (%)
- 결과 등록 비율 (%)
- 평가 Trend 차트 (월/분기/연 단위 선택)
- Top 8 소재 (누적 Lot 수, 소재 필터 미적용)
- LT 레벨 분포 (99~90 히스토그램)
- LT % 분포 (7구간 히스토그램)
- IVL 효율 비율 분포
- LT 절대값 Trend (REF vs SAMPLE 시계열)
- 진행 중 소재 목록 (D+N 기준 정렬)
- 최신 결과 테이블 (10행)

---

## 5. 필터

- 소재 (자동완성, 상위 50개)
- 월 범위 (month 모드만)
- LT 레벨 (LT Absolute Trend 차트용)
- 기간 토글 (월/분기/연)
