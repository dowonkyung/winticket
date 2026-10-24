# 윈트티켓 운영 배포

https://winticket.saevit.online — GitHub Pages + Supabase(서울). 관리자: /admin.html. 운영·백업·인증 구조는 [DEPLOYMENT.md](DEPLOYMENT.md)를 참고하세요. 실제 결제·발권 연동은 미구현입니다.

# 윈트티켓

첨부된 메인·예매 페이지 구성과 윈트티켓 로고를 반영한 공연 사이트입니다. 메인의 이미지 스프라이트를 유지하면서 공연 상세·날짜·시간·좌석등급·수량 선택과 관리자 등록을 연결했습니다.

## 자체 Node.js 서버 실행 (선택 사항)

운영 화면은 Supabase에 연결됩니다. 자체 서버를 실행하려면 assets/config.js의 API_BASE를 빈 문자열로 바꾼 뒤 Node.js 24 LTS로 실행합니다. 별도 패키지 설치는 없습니다.

```sh
node server.mjs
```

관리자를 사용하려면 `.env.example`을 `.env`로 복사해 본인의 아이디와 12자 이상의 비밀번호를 설정하고 `node --env-file=.env server.mjs`로 시작합니다. 기본 관리자 비밀번호는 없습니다.

| 화면 | 경로 |
| --- | --- |
| 메인 | `/` |
| 첨부 예매 양식 | `/performance.html?id=nct-wish-2027` |
| 공연 등록·수정 | `/admin.html` |
| 신청 확인·취소 | `/myticket.html` |

공개 저장한 공연은 DB에 보존되어 모든 방문자의 메인 목록·검색·상세에 반영됩니다. 비공개 초안, 이미지 업로드, 회차·등급·가격·수량, 공연 복사, 신청 조회를 지원합니다.

신청은 좌석등급별 수량을 서버에 저장합니다. SVG 구역도와 좌석 배치가 등록된 공연은 별도 팝업에서 지정좌석을 신청합니다. 실제 PG 결제와 유료 티켓 발권은 아직 제공하지 않습니다. 일반 회원은 Supabase Auth 계정을 사용합니다. [좌석 설정 안내](SEATING.md)를 참고하세요.

## 배포

운영 화면은 GitHub Pages, 저장 및 인증 API는 Supabase(서울)에 배포합니다. main 커밋은 기존 Pages 배포를 자동 실행합니다. API 서버 소스는 supabase/functions/winticket-api/, 데이터베이스 스키마는 supabase/schema.sql에 있습니다.

운영 인증·백업 및 선택적인 Docker 자체 서버 구성은 [DEPLOYMENT.md](DEPLOYMENT.md)를 참고하세요.

## 검증

```sh
npm test
```

인증·권한, 동시 재고, 저장·조회·취소·영속성을 검사합니다. DB·업로드·계정 설정은 GitHub에서 제외합니다.

회원 계정 운영 설정은 [MEMBERS.md](MEMBERS.md)를 참고하세요. 네이버 이메일·필수 닉네임 회원가입은 Supabase Auth를 사용하며 메일 발송용 SMTP 연결이 필요합니다.

공연 상세 원본 디자인과 예매 전 주의사항 편집은 [PERFORMANCE.md](PERFORMANCE.md)를 참고하세요.

### 메인 화면 편성
관리 페이지의 **메인 화면 편성**에서 슬라이더·내한공연·오픈예정공연·이 주의 추천공연·윈트티켓 PICK! 추천공연을 각각 설정합니다. 표시 방식을 직접 선택으로 변경하고 공개 공연을 추가한 뒤 위/아래 버튼으로 순서를 조정하고 **메인 화면 저장**을 누릅니다. 같은 공연을 여러 영역에서 선택할 수 있습니다. 기본 구성 유지로 되돌릴 수 있고, 직접 선택에서 목록을 비우면 해당 영역이 비어 있게 표시됩니다. 슬라이더는 최대 20개, 세 탭은 각각 5개, PICK은 40개입니다. 선택한 공연이 비공개로 바뀌면 방문자 화면에서 자동 제외됩니다. Supabase 기존 설치의 변경 SQL은 supabase/homepage.sql입니다.
