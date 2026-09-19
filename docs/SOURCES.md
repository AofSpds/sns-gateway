# 구현 근거

문서 확인일 2026-09-19. 공식 문서는 API 계약 근거이며 실제 기기/SNS 호환성 증거는 아닙니다.

- 기준: MITCHELL 운영 Git `3e159bf790ab3cdd775add73b8aa7cde89bf5577`, `docs/mobile/LOCAL_SHARING_DESIGN_v1.0_20260919.md`.
- 작업계획: 사용자 승인 SNSG-WORK-001 v0.1; 이 저장소의 WORK_PLAN_v0.1.md는 명시적 실행 요약.
- Expo SDK 지원 조합: https://docs.expo.dev/versions/latest/ — SDK 57 / React Native 0.86 / React 19.2.3 / Node 22.13+ / Android SDK36 / iOS16.4+ / Xcode26.4+.
- Native module 및 autolinking: https://docs.expo.dev/modules/module-api/ / https://docs.expo.dev/modules/autolinking/ .
- 로컬 SQLite: https://docs.expo.dev/versions/latest/sdk/sqlite/ .
- 공유 SDK의 단일 URI 경계: https://docs.expo.dev/versions/latest/sdk/sharing/ . 다중 파일 전달은 직접 native bridge로 분리.
- iOS 공유: https://developer.apple.com/documentation/uikit/uiactivityviewcontroller .
- Android 공유: https://developer.android.com/training/sharing/send .

정확한 설치 버전은 package-lock.json과 CI 산출물 DEPENDENCIES.txt를 기준으로 합니다. 최초 Expo install --check가 지적한 TypeScript 권장버전 ~6.0.3을 실제 설치 의존성에 반영했습니다. 문서의 latest를 다음 실행의 자동 업그레이드 지시로 해석하지 않습니다.


## 소스·날짜·보존 후속 구현 확인 / 2026-09-19

- Android SAF와 지속 URI 권한: https://developer.android.com/training/data-storage/shared/documents-files
- PhotoKit 앨범 조회: https://developer.apple.com/documentation/photokit/fetching-assets
- PhotoKit networkAccessAllowed: https://developer.apple.com/documentation/photos/phimagerequestoptions/isnetworkaccessallowed
- UNNotification.date는 전달일: https://developer.apple.com/documentation/usernotifications/unnotification/date
- 알림 응답: https://developer.apple.com/documentation/usernotifications/unnotificationresponse
- Expo AppDelegateSubscriber 등록: https://docs.expo.dev/modules/appdelegate-subscribers/

원 API 지원과 제품 실기 수락을 구분한다. iOS 반복 알림의 전달일을 원 예약일로 치환하지 않으며 UI에서 날짜를 확인한다. CI의 Swift Foundation fixture는 실제 삭제 허용경로 코드를 시험하지만 PhotoKit/UIKit 기기 동작 시험은 아니다.
