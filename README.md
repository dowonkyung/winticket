# 윈트티켓

제공된 멜론 티켓 저장본의 메인 페이지를 바탕으로 만든 윈트티켓 사이트입니다. 첨부 SVG 로고를 그대로 사용합니다.

## 실행

정적 웹사이트이므로 빌드나 패키지 설치가 필요 없습니다.

```sh
python -m http.server 4173
```

브라우저에서 `http://localhost:4173`에 접속합니다.

## 구현 범위

- 원본 메인 구성, 공연 포스터, 추천 공연 탭, 티켓오픈소식, 랭킹, 추천 목록
- 메인 배너 이전/다음 및 자동 재생/정지
- 페이지에 포함된 공연의 검색 및 상세 안내
- 데스크톱과 모바일 레이아웃
- 실제 회원가입, 예매, 결제는 미구현이며 준비 중 안내를 표시합니다.

원본의 로그인·결제 연결과 추적 스크립트는 포함하지 않습니다. 원본에 저장된 공연 내용은 시안용이며 실시간 데이터가 아닙니다. 다른 사업자의 회사정보·사업자번호·보증 및 수상 인증은 윈트티켓에 적용하지 않았습니다.

## 배포와 도메인

GitHub Pages의 Settings → Pages → Build and deployment에서 `Deploy from a branch`, `main`, `/ (root)`를 선택합니다. 커스텀 도메인은 `winticket.saevit.online`이며 루트 `CNAME` 파일에 반영되어 있습니다.

DNS 관리 화면에 다음 레코드를 추가합니다.

| 유형 | 이름 | 대상 |
| --- | --- | --- |
| CNAME | winticket | dowonkyung.github.io |

HTTPS 인증서 발급이 완료되면 Pages에서 Enforce HTTPS를 켭니다. DNS 연결과 Pages 활성화 상태는 별도로 확인해야 합니다. Pages를 활성화하면 기존 커스텀 도메인 값이 적용될 수 있으므로 도메인 연결 전 임시 미리보기는 로컬 서버를 사용합니다.

## 파일

- `index.html`: 메인 페이지
- `assets/reference.css`: 원본 스타일과 로컬 이미지 경로
- `assets/winticket.css`: 브랜드·반응형 스타일
- `assets/winticket.js`: 독립적인 메인 페이지 상호작용
- `assets/logo.svg`: 제공된 윈트티켓 로고 원본

