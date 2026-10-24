# 윈트티켓 회원 계정 / 메일 발송 설정

구현: Supabase Auth 이메일·비밀번호 가입, @naver.com 이메일 제한, 닉네임 필수(한글·영문·숫자·밑줄 2~16자), 이메일 확인, 로그인·로그아웃·비밀번호 재설정, 계정별 마이티켓. 닉네임은 표시 이름이며 중복 사용이 가능합니다. 네이버 OAuth 로그인이 아니며 윈트티켓용 비밀번호를 따로 사용합니다.

## 현재 남은 운영 설정

메일 발송 서비스가 연결되지 않았습니다. 일반 방문자 가입 확인·비밀번호 재설정 메일은 SMTP 연결 후 사용할 수 있습니다. 이메일 인증을 끄거나 사용자를 강제 인증 처리하지 마세요.

### 1. 메일 발송 서비스 준비

Resend 등 SMTP를 지원하는 발송 서비스에 가입하고 보유 도메인(saevit.online 또는 별도 발송용 하위 도메인)을 등록합니다. 서비스에서 제시하는 SPF/DKIM 등 DNS 레코드를 도메인 DNS에 추가하고 도메인 인증을 완료하세요. 해당 서비스의 현재 요금·발송 한도는 가입 전에 확인하세요.

Resend를 사용하는 경우 공식 안내: https://resend.com/docs/send-with-supabase-smtp
SMTP 서버 smtp.resend.com / 포트 465 / 사용자명 resend / 비밀번호는 Resend API Key입니다. From 주소는 서비스에서 인증을 완료한 도메인으로 정합니다(예: no-reply@saevit.online). 네이버 이메일은 수신자 주소이므로 발신 계정이 네이버일 필요는 없습니다.

### 2. Supabase SMTP 연결

https://supabase.com/dashboard/project/ahchwkcszyphbmppctbt/auth/smtp

Authentication → Emails → SMTP Settings에서 Custom SMTP를 켜고 제공받은 Host, Port, Username, Password, 발신 이메일, 발신 이름(윈트티켓)을 저장합니다. API Key/SMTP 비밀번호는 Supabase 대시보드에 직접 입력하고 채팅·GitHub·공개 JS에는 넣지 마세요. 실제 계정 생성과 DNS·SMTP 자격증명 입력은 운영자가 진행합니다.

공식 문서: https://supabase.com/docs/guides/auth/auth-smtp

### 3. 인증 URL / 비밀번호 설정

https://supabase.com/dashboard/project/ahchwkcszyphbmppctbt/auth/url-configuration

- Site URL: https://winticket.saevit.online/login.html
- Redirect URLs: https://winticket.saevit.online/login.html
- Email provider / Confirm email: 활성화 유지
- Email provider / Minimum password length: 10 이상 권장(화면은 10~128자)
- 임의 외부 도메인이나 ** 와일드카드는 추가하지 않습니다.

현재 브라우저 대시보드 세션이 로그인되어 있지 않아 위 운영 설정은 자동 변경하지 못했습니다. 서버 함수와 DB 연동은 커넥터로 배포했습니다.

### 4. 실제 메일 검증

운영자가 소유한 네이버 이메일로 https://winticket.saevit.online/login.html?mode=signup 에서 가입합니다. 받은 확인 링크의 복귀 주소가 운영 사이트인지 확인하고 로그인하세요. 스팸함도 확인합니다. 같은 계정으로 다른 기기에서 마이티켓이 일치하는지, 비밀번호 찾기 메일과 재설정이 되는지 확인하세요. 메일 발송 설정이 없으면 일반 방문자에게 발송이 거절되는 것이 Supabase 기본 동작입니다.

## 접근 권한 / 기존 데이터

- 새 예매 신청은 이메일 인증을 마친 회원에게만 허용합니다.
- 기존 비회원 신청은 원래 브라우저에서 계속 조회·취소할 수 있습니다. 타인의 신청이 계정에 섞이지 않도록 로그인 시 자동 이관하지 않습니다.
- 관리자 로그인은 기존 별도 계정을 사용하며 일반 회원에게 관리자 권한이 생기지 않습니다.
- 이메일·닉네임 검증은 auth.users 트리거에서도 시행하여 직접 Auth API 호출로 우회할 수 없습니다.
- 서버는 Auth getUser와 auth.sessions의 사용자 일치를 확인하고, 검증한 사용자 UUID로 예매 소유자를 결정합니다. 클라이언트가 owner나 권한을 지정할 수 없습니다.
- 브라우저에는 공개 publishable key만 제공합니다. service_role 키는 Edge Function 내부에서만 사용합니다.
- 회원 토큰은 기존 정적 사이트 구조에 맞춰 브라우저 localStorage에 보관합니다. 로그아웃은 Auth 세션을 폐기하고 로컬 토큰을 삭제합니다.
- 회원용 파생 세션 해시는 브라우저에 반환하지 않으며 원본 JWT의 만료 시간을 넘지 않습니다. 비공개 SQL 함수는 auth 스키마 조회를 위해 제한적으로 SECURITY DEFINER를 사용하고, 서비스 역할에만 실행을 허용합니다.

## 새 환경 설치

Supabase DB에 schema.sql 후 member-schema.sql을 한 번 적용하고 winticket-api를 배포합니다. assets/config.js의 AUTH_URL/AUTH_KEY/API_BASE는 해당 프로젝트의 공개 설정으로 교체합니다. Node 단독 서버 모드의 기존 관리자·비회원 흐름은 유지되며, 회원 운영 기능은 Supabase 운영 구성을 대상으로 합니다.

검증: 기존 서버 테스트 14개, 실제 운영 Auth를 통한 임시 회원 2개의 로그인·소유자 분리·다른 로그인 세션 조회·타 회원 취소 차단·관리자 접근 차단·비회원 새 예매 차단·로그아웃 후 JWT 거부·토큰 갱신을 확인했습니다. 임시 회원과 검증용 공연/신청은 검증 후 삭제했습니다. 실제 이메일 송수신은 SMTP 설정 후 운영자가 확인해야 합니다.
