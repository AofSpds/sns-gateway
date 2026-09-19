# SNS Gateway

기기 내부에서 사진과 문구를 준비하여 공식 SNS 앱으로 전달하는 iPhone/Galaxy 공유 도우미입니다. **현재 작업 브랜치의 코드는 SG-00/SG-01 합성 사진 공유 시험 후보이며 전체 v0.1 완성품이 아닙니다.**

## API 키는 등록하지 않습니다

현재 사용하는 API는 iOS/Android OS 공유 API입니다. Meta HTTP 게시 API, OAuth, Supabase, 외부 사진 저장소, 앱 자체 로그인은 없습니다. Instagram·Threads 로그인과 최종 게시는 해당 공식 앱에서 사용자가 합니다. 비밀번호·액세스 토큰·개인 서명키를 채팅이나 Git에 보내지 마세요.

## 현재 구현

- 오늘·사진·이력·설정의 기본 화면과 미검증 SNS 목록
- 기기에서 합성 JPEG 1장/3장 생성, 미리보기, 문구 입력·복사
- iOS UIActivityViewController / Android ACTION_SEND·ACTION_SEND_MULTIPLE bridge
- 공유 시도·OS 신호·사용자 완료 표시를 구분하는 SQLite 이력과 중단 복구
- KST 날짜창·다음 9시·중복 선정·단일 실행 기반 로직
- 잠금 파일, 48개 Node/SQLite/정적 계약 시험, SDK 호환성·JS 번들·native 빌드 CI

## 아직 없는 기능

실제 사진 가져오기, 지정 폴더/앨범 연결, 알림 권한 요청 및 9시 알림 등록, 사진 보존·용량 관리, 실기 SNS 호환성 확인. 다음 9시를 계산한 표시는 OS 알림 예약이 아닙니다. 공유 화면의 callback도 원격 게시 성공이 아닙니다.

## 개발자 시작

구현은 `work/sns-gateway-v0.1`, Draft PR #1에 있습니다. main은 초기 README 상태입니다.

```sh
npm ci
npm run check
npm run bundle
```

Node 기준은 .nvmrc, 정확한 버전은 package-lock.json입니다. native 모듈을 포함한 빌드가 필요하므로 Expo Go는 지원하지 않습니다. 기본 Android release 설정은 INTERNET 권한을 제외합니다. Metro 개발 연결이 필요할 때만 SNSG_DEVELOPMENT_NETWORK=1로 native 프로젝트를 생성합니다.

Android unsigned release는 그대로 배포하는 서명된 APK가 아니며, iOS simulator .app은 iPhone용 IPA가 아닙니다. 기기 설치·SNS 전송·공개 게시·병합·배포는 별도 단계입니다.

[실행 요약](docs/WORK_PLAN_v0.1.md) · [API 키](docs/API_KEYS.md) · [첫 실행](docs/FIRST_RUN.md) · [빌드 범위](docs/BUILD_MATRIX.md) · [기기 시험](docs/DEVICE_COMPATIBILITY.md) · [개인정보](docs/PRIVACY.md) · [복구](docs/RECOVERY.md) · [출처](docs/SOURCES.md)

운영/결정/완료보고는 AofSpds/mitchell이 소유합니다. 기준 설계는 `3e159bf790ab3cdd775add73b8aa7cde89bf5577`의 `docs/mobile/LOCAL_SHARING_DESIGN_v1.0_20260919.md`입니다. 현재 작성자는 MITCHELL이며 PMO NOT_DISPATCHED, SNS Gateway IVA NOT_RUN입니다. 기존 bootstrap/web-starter는 변경하지 않습니다.
