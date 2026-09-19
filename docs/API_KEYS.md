# API 키와 SNS 로그인

현재 제품 모드: LOCAL_SHARE_SPIKE / 첫 구현 묶음 SG-00·SG-01.

**API 키를 등록하지 않습니다.** 이번 승인 범위의 API는 iOS/Android 운영체제의 공유 API이며 Meta HTTP 게시 API가 아닙니다.

| 항목 | 현재 처리 |
|---|---|
| Instagram·Threads 로그인 | 해당 공식 앱에서 사용자가 직접 로그인 |
| Gateway 로그인 | 없음 |
| Meta 앱 ID·App Secret·액세스 토큰 | 사용하지 않음, 입력 화면 없음 |
| Supabase·OpenAI·Anthropic API 키 | 사용하지 않음 |
| GitHub 연결 | 개발용 코드 관리이며 SNS 로그인과 다름 |
| Apple/Android 앱 서명 | 설치·배포 단계의 별도 절차이며 SNS API 키가 아님 |

사진 공유 메뉴를 열면 사용자가 수신 앱과 계정을 직접 확인합니다. Gateway의 SNS 선택은 희망 대상일 뿐 인증 완료나 실제 수신 앱의 관측 증거가 아닙니다. SNS 앱이 사진을 서버로 보내는 행위는 그 앱의 동작이며, Gateway가 별도 중계 서버로 사진을 올리는 것이 아닙니다.

SNS 공식 HTTP API를 통한 자동 게시와 OAuth는 이번 버전에 없습니다. 추후 범위를 바꾸면 공급자별 인증 계약과 비밀정보 저장 위치를 먼저 설계합니다. 지금 미리 키를 발급하거나 채팅·Public Git·앱 코드에 붙여 넣지 마세요.
