# 인증 시스템 & 보안 규칙

> Last updated: 2026-05-13

QA Manager 포털의 인증·권한·Firebase 보안 규칙 전체 가이드. `index.html` 하단 IIFE에 인라인된 Firebase Auth 게이트와 RTDB의 `portal_users/` 역할 정보로 admin/user 권한을 결정한다.

---

## 1. Firebase 설정 (index.html 내 하드코딩)

```javascript
var firebaseConfig = {
  apiKey:            'AIzaSyAk9PGqBHxiG9fVwVZZg6ZGBOWaaSAXOBc',
  authDomain:        'qa-manager-9c145.firebaseapp.com',
  databaseURL:       'https://qa-manager-9c145-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId:         'qa-manager-9c145',
  // …
};
var ALLOWED_DOMAIN = '@ltml.co.kr';                     // 도메인 화이트리스트
var ADMIN_EMAILS   = ['jhbaik@ltml.co.kr'];             // DB 미존재 시 fallback admin
```

> **Firebase 클라이언트 API 키는 공개 전제 설계** — 키 자체는 클라이언트 번들에 포함되어 노출됨. 실제 보호는 아래 RTDB 보안 규칙이 담당.
>
> 같은 Firebase 프로젝트(`qa-manager-9c145`)를 06번·10번·15번 앱이 재사용 — 각자 다른 `db.ref('경로')`만 다르게 지정.
> Firebase SDK: `firebase-app-compat` + `firebase-auth-compat` + `firebase-database-compat` v10.12.0 (gstatic CDN)

---

## 2. 인증 흐름 (`onAuthStateChanged` 핸들러)

```
① 미로그인 ──────────────► login.html로 redirect (2초 타임아웃 포함)
② @ltml.co.kr 도메인 아님 ─► "접근 권한 없음" 카드 + 로그아웃 버튼
③ DB에 사용자 항목 없음 ──► 비밀번호 변경 강제 카드 (신규 계정)
④ data.mustChangePw=true ─► 비밀번호 변경 강제 카드 (관리자 생성 계정)
⑤ 정상 인증 완료 ─────────► initPortal(role) 호출 → 탭 렌더링
```

추가 안전장치:
- **2초 로그인 타임아웃**: Firebase Auth 응답이 없으면 login.html로 강제 이동
- **5초 DB 타임아웃**: WebSocket 연결 실패 시 ADMIN_EMAILS 기준 fallback role로 진입
- **이중 발화 방어**: `_portalReady` 플래그로 토큰 갱신 시 `initPortal` 중복 호출 방지

---

## 3. 역할 (Role) 시스템

Firebase RTDB 경로 `portal_users/{uid}`:

```javascript
{
  role:        'admin' | 'user',
  email:       'jhbaik@ltml.co.kr',
  createdAt:   1735000000000,
  mustChangePw: true   // 관리자가 생성한 계정은 첫 로그인 시 비밀번호 변경 강제
}
```

- **admin**: 모든 탭 접근 가능 + 사용자 관리 모달 + 게스트 화면 미리보기 토글
- **user**: `locked: true` 탭은 사이드바에 아예 렌더되지 않음 (DOM 미생성)

### 관리자 전용 — 사용자 관리 모달 (`#umOverlay`)

사이드바 푸터의 `👥 사용자 관리` 버튼으로 열리는 모달. 이메일 일괄 입력 + 임시 비밀번호 + 역할 선택으로 계정 생성.

내부 구현:
- **Secondary Firebase App**(`'PortalUserMgmt'`)을 별도로 초기화 → 현재 관리자 세션 영향 없이 신규 계정 생성
- 생성된 계정은 즉시 signOut → DB에 `mustChangePw: true` 플래그 기록 → 첫 로그인 시 비밀번호 변경 카드 표시

### 관리자 전용 — 게스트 화면 미리보기 (`toggleGuestView`)

`main.js`의 `window.toggleGuestView(guestOn)` 함수로 admin 화면에서 user 시점을 시뮬레이션.
locked 탭 버튼·iframe·그룹 헤더에 `display:none` 토글 → 현재 활성 탭이 locked였다면 첫 비잠금 탭으로 자동 전환.

---

## 4. auth_guard.js — 앱별 직접 URL 접근 차단

각 앱이 iframe 외부에서 직접 URL로 접근될 경우를 대비한 인증 게이트. 앱 HTML `<head>` 최하단에 다음 두 줄을 포함:

```html
<script>window._AG_ADMIN_ONLY = true;</script>   <!-- 또는 false -->
<script src="../../assets/js/auth_guard.js"></script>
```

**동작 규칙**:
- **포털 iframe 내부에서 동일 origin이면 즉시 비활성화** (포털이 이미 인증 처리함 → 중복 SDK 로드 방지)
- 직접 URL 접근(`window.top === window.self`)일 때만 활성화
- Firebase SDK가 없으면 동적 주입 (`app-compat` → `auth-compat` → `database-compat`)
- named app `'_guard'`로 초기화 → 다른 앱의 default firebase.app()과 충돌 없음
- 1.5초 인증 타임아웃 → login.html로 redirect, 5초 권한 체크 타임아웃

**앱별 가드 설정** (`window._AG_ADMIN_ONLY` 값):

| 앱 | 가드 모드 | 비고 |
|----|---|---|
| 01 oled_ivl_lt | `false` (user 가능) | 일반 사용자 접근 가능 |
| 02 lgd_eval | (가드 없음) | GAS 외부 URL — Google이 인증 처리 |
| 03 hplc_dsc | `true` (admin only) | |
| 04 sdc_eval | `true` | |
| 05 cpl_quality | `true` | |
| 06 lot_schedule | `false` (user 가능) | 일반 사용자 접근 가능 (사이드바 등록은 admin만) |
| 07–09, 11–13 | `true` | WIP placeholder |
| 10 quality_dashboard | `true` | |
| 14 sys_docs | `true` | |
| 15 pn_flow | `true` | |
| 16 lcms_converter | `true` | |
| 18 hplc_data | `true` | WIP placeholder |
| 19 dsc_tga | `true` | WIP placeholder |
| 20 lot_flow | `true` | WIP placeholder |

> **참고**: `main.js`의 `locked: true`는 사이드바 렌더링 단계(포털 안에서) 권한 제어, `auth_guard.js`의 `_AG_ADMIN_ONLY`는 직접 URL 접근(포털 밖에서) 권한 제어 — 이중 방어.

---

## 5. login.html

- **`login.html`**: Firebase Email/Password 로그인 페이지. 이미 인증된 상태라면 자동으로 `index.html`로 redirect.
- 회원가입(self-signup)은 비활성화. 계정은 관리자가 사용자 관리 모달에서만 생성 가능.

---

## 6. Firebase RTDB 보안 규칙 (현재 적용 중)

> **중요**: 도메인 제한이 이미 활성화된 상태. 과거 "테스트 모드(.read/.write: true)" 설명은 무효.

```json
{
  "rules": {
    "lot_schedule":         { ".read": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)", ".write": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)" },
    "oled_results":         { ".read": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)", ".write": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)" },
    "pn_flow_docs":         { ".read": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)", ".write": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)" },
    "pn_flow_shipments":    { ".read": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)", ".write": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)" },
    "measurement_hplc":     { ".read": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)", ".write": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)" },
    "measurement_dsc_tga":  { ".read": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)", ".write": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)" },
    "lot_flow":             { ".read": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)", ".write": "auth != null && auth.token.email.matches(/.*@ltml\\.co\\.kr$/)" },
    "portal_users": {
      ".read":  "auth != null && root.child('portal_users').child(auth.uid).child('role').val() === 'admin'",
      "$uid": {
        ".read":  "auth != null && (auth.uid === $uid || root.child('portal_users').child(auth.uid).child('role').val() === 'admin')",
        ".write": "auth != null && (auth.uid === $uid || root.child('portal_users').child(auth.uid).child('role').val() === 'admin')"
      }
    }
  }
}
```

### 설계 원칙

- **Default deny**: 위 명시 경로 외에는 읽기/쓰기 모두 차단됨 (Firebase RTDB 기본 동작).
- **도메인 제한**: 모든 데이터 경로는 `@ltml.co.kr` 이메일로 인증된 사용자만 접근.
- **portal_users 관리자 전용**: 사용자 본인 노드만 읽기/쓰기 가능, 관리자는 전체 접근.
- **클라이언트 API 키 노출 전제**: 키가 공개되어도 위 규칙이 데이터 보호.

### 현재 미적용된 강화책

다음은 고려 가능하나 아직 적용 안 됨:

- **`.validate` 데이터 스키마 검증** — 각 필드 타입·길이 제약 (예: `lotId`가 string이고 1~100자 등)
- **`email_verified` 체크** — 이메일 인증된 사용자만 쓰기 허용 (`auth.token.email_verified === true`)
- **쓰기 frequency limit** — Firebase RTDB 자체 기능은 없음. Cloud Functions로 우회 필요.

### 새 RTDB 경로 추가 시 — 보안 규칙 동시 추가 필수

신규 앱(예: 18·19·20번)이 새 경로를 쓰면 **Firebase 콘솔에서 보안 규칙도 동시에 추가**해야 함. 안 그러면 default deny로 모든 요청이 PERMISSION_DENIED 받음.

체크리스트:
1. 앱 코드에 `db.ref('new_path')` 추가
2. Firebase 콘솔 → RTDB → Rules 탭에서 `"new_path": { ".read": "...", ".write": "..." }` 추가
3. Publish 후 앱에서 실제 listener 부착 동작 확인
