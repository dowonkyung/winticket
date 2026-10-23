# 윈트티켓 운영 안내

운영 구조는 GitHub Pages + Supabase입니다. 화면은 GitHub의 main 브랜치에서 배포되고, 공연·예매 데이터와 관리자 인증은 서울 리전 Supabase의 winticket-api Edge Function 및 PostgreSQL에서 처리합니다. 이미지 업로드는 Supabase Storage의 winticket 버킷에 저장됩니다.

- 사이트: https://winticket.saevit.online
- 관리자: https://winticket.saevit.online/admin.html
- Supabase 프로젝트: ahchwkcszyphbmppctbt (서울)
- 화면 API 설정: assets/config.js
- 서버 소스: supabase/functions/winticket-api/
- DB 재현용 스키마: supabase/schema.sql (빈 프로젝트 전용, 기존 DB에서 재실행 금지)

## 관리자와 데이터 접근

관리자 계정의 초기 비밀번호는 GitHub에 저장하지 않고 별도 비공개 파일로 전달합니다. 로그인 후 ‘관리자 비밀번호 변경’에서 변경할 수 있습니다. 비밀번호 변경 시 다른 관리자 세션을 폐기합니다. 운영 계정은 bcrypt 해시로 보관하고 로그인은 IP별 15분 10회로 제한합니다.

API는 임의의 256비트 세션 토큰으로 방문자를 구분하고 DB에는 토큰 해시만 저장합니다. 세션 토큰은 브라우저 localStorage에 저장되며, 방문자 30일·관리자 8시간 후 만료됩니다. 게스트 신청내역은 해당 브라우저와 도메인에 귀속되어 저장소를 지우거나 다른 기기를 사용하면 복구할 수 없습니다. 회원 계정과 이메일 복구는 아직 제공하지 않습니다.

모든 wt_ 테이블의 RLS를 활성화하고 anon/authenticated 직접 접근과 gateway RPC 실행을 차단했습니다. 서버의 service_role만 RPC를 실행하며, 함수 내부에서 방문자 소유권과 관리자 권한을 검사합니다. service_role 키는 Supabase 런타임 기본 비밀변수로만 사용하고 정적 사이트에 포함하지 않습니다. Supabase Auth 대신 기존 관리자 아이디 로그인 방식을 유지했습니다.

공연 행을 잠근 단일 트랜잭션으로 수량과 1인 한도를 확인하여 초과 신청을 방지합니다. 실제 결제·PG 연동·발권·지정좌석 배정은 제공하지 않습니다. 등록된 참고 공연의 일정과 수량은 운영자가 실제 판매 전에 확인해야 합니다.

## 배포와 백업

화면 변경을 main에 커밋하면 기존 GitHub Pages 배포가 자동 실행됩니다. CNAME은 winticket.saevit.online이며 DNS는 GitHub Pages를 유지합니다. Edge Function 변경은 Supabase에 별도로 배포해야 합니다. verify_jwt=false는 함수 자체의 세션 인증을 사용하기 위한 설정이며 관리자·개인 정보 경로는 인증 없이 실행되지 않습니다. SQL 함수는 SECURITY INVOKER이며 service_role에만 EXECUTE를 허용합니다.

DB는 Supabase 대시보드의 백업/내보내기로 보관하고 Storage 파일은 별도로 백업하세요. 무료 플랜의 사용량·자동 일시정지 정책은 계정 대시보드에서 확인하세요. GitHub는 소스와 화면만 보관하므로 예매 데이터 백업을 대신하지 않습니다.

## 동작 검증

로컬 SQLite 회귀 테스트: npm test. 운영 API 통합 검증: scripts/cloud-smoke.mjs. 통합 검증은 WINTICKET_TEST_CREDENTIALS 및 WINTICKET_TEST_RESULT 절대경로를 지정하여 명시적으로 실행합니다. 전용 검증 공연을 생성하므로 운영자가 테스트 생성 ID를 확인하고 검증 후 제거해야 합니다.

## 선택 사항: 자체 Node.js 서버 운영

Docker/SQLite는 별도 서버에서 실행하는 대안으로 남겨두었습니다. 이 모드에서는 assets/config.js의 API_BASE를 빈 문자열로 바꿔야 브라우저가 자체 /api를 호출합니다. 아래 내용은 자체 서버에만 적용됩니다.

## 로컬 실행과 관리자 최초 설정

Node.js 24 LTS이 필요합니다. 별도 패키지 설치는 없습니다.

1. `.env.example`을 `.env`로 복사합니다.
2. `WINTICKET_ADMIN_USERNAME`에 3~64자 영문·숫자·`_`·`-`·`.`으로 된 아이디를, `WINTICKET_ADMIN_PASSWORD`에 12자 이상의 본인 비밀번호를 설정합니다. 고정 기본 계정은 없습니다.
3. 시작합니다.

```sh
node --env-file=.env server.mjs
```

| 화면 | 주소 |
| --- | --- |
| 메인 | `http://127.0.0.1:4173/` |
| 첨부 예매 양식 | `http://127.0.0.1:4173/performance.html?id=nct-wish-2027` |
| 관리자 | `http://127.0.0.1:4173/admin.html` |
| 신청 확인·취소 | `http://127.0.0.1:4173/myticket.html` |

브라우저 주소와 `.env`의 `WINTICKET_ORIGIN`이 같아야 합니다. 포트를 바꿀 때 이 값도 변경합니다. 최초 관리자 생성 후 비밀번호는 솔트가 적용된 scrypt 해시로 저장됩니다. 이후 서버를 다시 실행해도 환경변수의 비밀번호로 기존 비밀번호를 덮어쓰지 않습니다.

## 공연 추가와 수정

1. 관리자 화면에서 로그인하고 **새 공연 등록**을 누릅니다. 기존 공연은 **복사해서 등록**할 수 있습니다.
2. 기본 정보, 포스터, 회차, 좌석등급별 가격·수량, 작품설명과 공지를 작성합니다. 이미지는 PNG/JPEG/WebP, 각 5MB까지 지원합니다.
3. **사이트에 공개**를 해제하고 저장하면 비공개 초안으로 보존됩니다. **페이지 보기**로 동일한 예매 양식에서 확인할 수 있습니다.
4. 공개 저장하면 모든 방문자의 메인 목록·검색·상세 화면에 반영됩니다. 방문자가 페이지를 다시 불러오면 최신 정보를 봅니다.

회차·등급이 없으면 신청 버튼이 비활성화됩니다. 오픈 일시를 비우면 즉시 신청할 수 있고, 설정하면 한국시간 기준으로 해당 시각부터 신청을 허용합니다. 시작된 회차는 신청할 수 없습니다.

신청이 있는 회차의 일정·등급은 삭제하거나 변경할 수 없고, 이미 신청된 수량 아래로 공급 수량을 줄일 수 없습니다. 수정 충돌을 감지해 다른 창의 최신 변경을 덮어쓰지 않습니다. 비공개로 전환하면 신규 신청은 중단되며 기존 신청 내역은 보존됩니다.

## Docker와 도메인 연결

준비물은 Docker Compose를 실행할 서버, 공인 IP, 공개 80/443 포트, `saevit.online` DNS 수정 권한입니다.

1. 서버에 저장소를 내려받아 `.env`에 본인의 관리자 계정을 설정합니다.
2. `winticket`의 기존 `CNAME → dowonkyung.github.io`를 제거하고 `A → 서버 공인 IPv4`로 변경합니다. 같은 이름에 CNAME과 A를 함께 두지 않습니다. IPv6를 사용하지 않으면 이전 AAAA 레코드도 제거합니다.
3. 아래 명령으로 시작합니다.

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail 100 app proxy
```

Compose는 Node 서버와 Caddy HTTPS 프록시를 시작합니다. `Caddyfile`의 도메인을 받아 내부 앱으로 전달합니다. Compose의 `environment`에서 HTTPS 운영 주소와 데이터 경로를 지정하므로 로컬 `.env`의 주소 값을 덮어씁니다.

운영 확인:

- `/healthz`가 `{"ok":true}`를 반환하는지 확인합니다.
- 관리자 로그인과 비공개 저장을 확인한 뒤 테스트 공연을 공개합니다.
- 다른 브라우저에서 공개 공연을 보고 신청·취소와 잔여 수량을 확인합니다.

하나의 앱 인스턴스와 하나의 영속 디스크에서 운영하는 구조입니다. 여러 앱에 로컬 SQLite를 각각 배치하면 재고가 분리되므로 복제 운영하지 않습니다. 이 작업에서는 실제 서버·TLS 발급·DNS 변경을 실행하지 않았습니다.

## 데이터 보존과 비밀번호 변경

- 공연·관리자 해시·세션·예매 신청: `/app/data/winticket.sqlite`와 WAL 파일
- 업로드 이미지: `/app/data/uploads/`
- Compose 영속 볼륨: `winticket_data`

앱을 정지한 상태에서 DB와 업로드를 함께 백업합니다. `docker compose down`은 데이터 볼륨을 보존하지만 `down -v`는 삭제하므로 사용하지 마세요. DB·환경변수·세션·백업을 공개 저장소에 올리지 않습니다. `seed.json`은 DB가 비어 있을 때만 읽으며 이후 코드 배포로 기존 DB를 덮어쓰지 않습니다.

비밀번호 변경은 `.env`에 새 값을 넣고 실행합니다. 해당 관리자의 기존 로그인 세션도 해제됩니다.

```sh
node --env-file=.env scripts/admin-password.mjs
```

Docker에서는 최신 `.env`가 있는 서버에서 다음을 실행합니다.

```sh
docker compose run --rm app node scripts/admin-password.mjs
```

## 범위와 초기 데이터

구현: 관리자 인증, 공연 등록·수정·복사·비공개 저장, 이미지 업로드, 공유 공연 목록, 날짜·시간·좌석등급·수량 선택, 예매 신청 저장, 자기 브라우저의 신청 조회·취소, 관리자 조회, 동시 수량 검증.

미구현: 일반 회원 계정, 본인인증, PG 결제, 지정 좌석 배치·발권, 배송, 이메일/SMS 알림. 신청은 결제 완료나 유료 티켓 발급을 의미하지 않습니다. 매수 제한은 비회원 브라우저 세션 기준입니다. 비회원 세션은 최대 30일, 관리자 로그인은 8시간 유효하며 쿠키 삭제·세션 종료 시 비회원 내역 접근이 사라질 수 있습니다.

NCT WISH의 일정·가격·이미지는 첨부 원본을 보여 주는 초기 예시입니다. 초기 좌석 수량은 실제 공연장 재고가 아닌 테스트용 수량입니다. 실제 운영 전에 관리자가 공연·공개 상태·수량을 검토해야 합니다. 원본에 가격·회차가 없는 공연은 준비 중으로 표시합니다.

## 검증

```sh
npm test
```

권한·CSRF, 입력값·업로드, 공연 등록·공개, 예매 오픈, 동시 초과 신청 방지, 매수 제한, 소유자별 조회·취소, 재고 복구, 신청 보호, 수정 충돌, 재시작 영속성, 로그아웃 검사를 포함합니다.

개발 환경에서 Node 서버와 브라우저 흐름은 검증했습니다. 현재 작업 환경에는 Docker가 없어 컨테이너 빌드·Compose 기동·실제 HTTPS 발급은 검증하지 않았습니다.

참고: [Node 24 SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html), [Compose 환경변수](https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/), [Caddy reverse proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy).
