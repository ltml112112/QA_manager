# 02. LGD 사전심사자료 자동화 (GAS)

> Last updated: 2026-05-07
> 폴더: `apps/02_lgd_eval/`
> 대분류: 자동화 · ID: `lgd` · 가드: 없음 (GAS 외부 URL — Google이 인증 처리)

---

## 1. 역할 & 범위

LGD 사전심사 제출용 자료 7개 파일을 Google Sheets 템플릿에서 자동 생성·다운로드.

### 하지 말 것

- `apps/02_lgd_eval/index.html`의 인라인 `:root`·리셋·컴포넌트 CSS는 GAS 단독 실행 fallback. 삭제 금지.
- 브랜드 테마 변경 시 `global_style.css`만 수정하면 안 됨 — 인라인 `:root` 변수도 같이 수정 + GAS 재배포 필수.

---

## 2. 구조

- **프론트엔드**: `index.html` (HTML 폼 + `google.script.run` API 호출)
- **백엔드**: `code.gs` (Google Apps Script)
- **템플릿**: Google Sheets (ID: `1kh2oBZYKXaadIJoZQJ5OPYZHlwZftiFpuIT45v2SjTk`)
- **탭 `src`**: GAS 배포 URL (외부 URL 직접 참조, 로컬 파일 아님)
- **iframe sandbox**: `allow-scripts allow-forms allow-same-origin allow-popups allow-downloads` — `main.js` `lgd` 항목에 설정됨

---

## 3. 생성 파일 목록 (7개)

| 파일 | 유형 |
|------|------|
| MSDS.pdf | PDF |
| 경고표지.pdf | PDF |
| 구성제품확인서.pdf | PDF |
| 작업공정별관리요령.pdf | PDF |
| 비공개물질확인서.pdf | PDF |
| MSDS.xlsx | Excel |
| Checksheet.xlsx (비공개물질) | Excel |

---

## 4. 파일명 규칙 (클라이언트 측)

- 모든 파일에 `LT소재_` 접두사 추가
- 비공개물질 관련 파일에 버전 문자열 추가: `(25.8월 Ver)`
- 구성제품확인서에서 말미 숫자 제거

> 버전 문자열 변경 시 `apps/02_lgd_eval/index.html`의 `PRIVATE_SUBSTANCE_VER` 상수 수정

---

## 5. GAS 백엔드 처리 흐름

1. 템플릿 스프레드시트 복사 (임시)
2. `[[플레이스홀더]]` 형식으로 값 치환 (작성일, 제품명, 색상, 상품명1~3)
3. "설정" 시트에서 출력 구성 읽기
4. PDF는 `UrlFetchApp.fetchAll()`로 병렬 생성
5. Excel은 개별/묶음 구분하여 병렬 내보내기
6. base64 인코딩 후 클라이언트로 반환
7. 임시 파일 삭제 (finally 블록)

---

## 6. "설정" 시트 컬럼 구조

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

## 7. GAS 배포 URL 변경 시

`assets/js/main.js`의 `apps` 배열에서 `lgd` 항목의 `src` 값을 새 URL로 교체:

```javascript
{ id: 'lgd', src: 'https://script.google.com/macros/s/새배포URL/exec', ... }
```

`code.gs` 수정 시 Google Apps Script 편집기에서 배포(새 버전)해야 반영됨.
