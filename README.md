# gakhalmo-back 임시 테스트 프론트

`gakhalmo-back` API 엔드포인트를 시나리오 단위로 눌러서 검증하기 위한 최소 페이지.
디자인은 신경 안 씀. Vite dev proxy 로 CORS 우회.

## 실행

```bash
cd /Users/leesh/Documents/Coding/_gakhalmo/temp-front
npm install
npm run dev
# → http://localhost:5173
```

기본 타겟은 `https://api.dev.gakhalmo.klr.kr`.
prod 로 붙이려면 서버 기동 시 환경변수로:

```bash
TEMP_FRONT_API_BASE=https://api.gakhalmo.klr.kr npm run dev
```

## 시나리오 구성

| 섹션 | 검증 포인트 |
| --- | --- |
| A. Auth | 회원가입 → 로그인(토큰 저장) → /me → refresh → Google OAuth 리디렉션 |
| B. Regions | 자동완성 검색, 단건 조회. 결과 칩 클릭 시 C/D/F 섹션의 region_id 에 자동 반영 |
| C. Meeting Create | 로그인 상태에서 오프라인/온라인 모임 개설. 성공 시 id 가 D/E 섹션으로 전파 |
| D. Meeting List | offset/limit/mode/region/goal/status/날짜 필터, host/participant 기준 목록, 상세 |
| E. Participants | join → (호스트 재로그인) approve/reject / leave 플로우 |
| F. Series | 정기 모임 시리즈 CRUD. 생성 후 id 가 C 섹션 series_id 로 자동 반영 |
| G. Users | 비인증 CRUD (스키마/페이지네이션/업데이트 검증용) |

## 동작 메모

- access/refresh token 은 `localStorage` 에 저장. 401 → refresh → 1회 재시도.
- 모든 API 호출은 `/api/...` 경로로 나가고, vite 가 `api.dev.gakhalmo.klr.kr` 으로 프록시.
- Google OAuth 는 새 탭에서 top-level navigation 으로 열어 CORS 회피.
