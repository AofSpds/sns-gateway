# SNS Gateway

기기 내부의 사진과 문구를 공식 SNS 앱에 전달하는 iPhone/Galaxy 로컬 공유 도우미입니다. 첫 기능은 사진 준비와 오전 9시 알림 후 수동 게시입니다.

## 현재 단계

2026-09-19: 사용자 승인에 따라 MITCHELL이 현재 채널에서 구현을 시작합니다. 이 main 진입점은 초기 문서이며 완성된 앱이나 배포본이 아닙니다. 제품 코드는 `work/sns-gateway-v0.1` 작업 브랜치와 Draft PR에서 관리합니다.

- 운영 저장소: `AofSpds/mitchell`
- 기준 설계: `docs/mobile/LOCAL_SHARING_DESIGN_v1.0_20260919.md` @ `3e159bf790ab3cdd775add73b8aa7cde89bf5577`
- 작업계획: `SNSG-WORK-001` v0.1, 2026-09-19 (작업 브랜치 docs/WORK_PLAN_v0.1.md에 보존)
- 첫 착수: SG-00 기반 구성 + SG-01 합성 사진 발신 공유 시험

## API 키

현재 승인 범위는 OS 공유 API입니다. Meta/OpenAI/Anthropic/Supabase API 키, SNS OAuth, 앱 자체 로그인, 외부 사진 저장소는 필요하지 않으며 구현하지 않습니다. SNS 로그인과 최종 게시 확인은 공식 SNS 앱에서 사용자가 수행합니다. 채팅이나 Git에 비밀번호·토큰·실제 사진을 올리지 마세요.

## 완료 구분

코드 작성, 작성자 검사, Android/iOS 빌드, 실제 기기 설치와 SNS 호환성, IVA 독립검증, 병합, 배포는 별도로 기록합니다. PMO는 NOT_DISPATCHED, 새 SNS Gateway IVA는 NOT_RUN입니다. 기존 bootstrap/web-starter의 PASS는 이 앱의 검증이 아닙니다.
