> 이 문서는 f5dfbe9 후보의 기록입니다. 이후 소스연결·날짜/revision·삭제 구현과 제한은 [LIFECYCLE.md](LIFECYCLE.md)를 따릅니다. 과거 미구현 표기를 최신 상태로 오인하지 마세요.

# 로컬 게시함·알림 구현 기록 / 2026-09-19

작성자 MITCHELL. 승인된 SNSG-WORK-001의 SG-00/01 이후 독립 구현 범위를 진행한다. 현재는 LOCAL_INBOX_REMINDER_CANDIDATE이며 전체 v0.1 완성이 아니다. 실제 코드 변경과 자동 검사·native 빌드·기기 사용은 별도로 보고한다.

## 사용자 흐름

사진 탭에서 로컬 사진 선택 → 준비된 JPEG 사본을 SQLite 게시함에 등록 → 사진 순서/문구 확인 → OS 공유 메뉴 → 공식 SNS 앱에서 최종 게시. 설정에서 사용자가 알림 권한을 허용하고 매일 알림을 활성화한다. 초기값은09:00 KST이며 알림 본문은 고정 안내다. 사진 개수를 확인하지 않고 준비 완료라고 알리지 않는다.

## 데이터와 복구

원본은 읽기만 한다. 준비 사본의 SHA-256을 ID로 사용한다. 재인코딩 결과가 같은 경우 등록시각을 유지한다. 시각적으로 같은 모든 사진의 동일성을 보장하지 않는다. import 중 파일 저장 이후 DB 등록이 중단되면 다음 시작 때 사본을 복구하되 등록시각은 null/FIRST_OBSERVED로 기록해 오늘 대상으로 자동 승격하지 않는다. 공유 직전 immutable cache 사본을 생성한다. 수신 앱이 읽기 전에 삭제하지 않는다.

이전 schema1의 batches/share_attempts를 schema2로 보존하며 foreign_key_check를 수행한다. 새 inbox_assets/batch_asset_refs/local_settings가 추가된다. 공유 실패/미확인 항목을 자동 재시도하지 않는다. 의도한 SNS와 실제 수신 앱은 다를 수 있고 callback이 없으면 결과는 미확인이다. 사용자 완료 표시는 USER_REPORTED다.

## OS 구현

Android: ACTION_OPEN_DOCUMENT/EXTRA_LOCAL_ONLY와 content authority allowlist. ImageDecoder의 downsample 후 JPEG 재인코딩. noBackupFilesDir 게시함과 제한된 FileProvider 공유 경로. 알림은 setAndAllowWhileIdle을 사용한 inexact 요청으로 별도 exact-alarm 권한을 요구하지 않는다. POST_NOTIFICATIONS 거부와 채널 차단은 상태로 표시한다. 재부팅/시간대/패키지 갱신/foreground에서 예약을 복구한다. 백그라운드에서 SNS Activity를 시작하지 않는다.

iOS: PHPicker에서 허용된 PHAsset identifier를 얻어 PhotoKit networkAccessAllowed=false로 이미지를 요청한다. 클라우드 원본을 앱이 자동 다운로드하지 않는다. UIImageRenderer→JPEG 사본과 백업 제외 AppSupport 폴더. UNCalendarNotificationTrigger 반복 알림은 Asia/Seoul로 등록하고 pending request를 조회한다. 사진 선택/알림/공유는 실기 확인이 필요하다.

## 검사와 남은 범위

로컬 Node/SQLite/정적 계약 시험은68개. 정적 문자열 검사가 native 기능 동작 증거는 아니다. 정확한 최종 CI와 빌드 판정은 별도 완료보고에서 고정한다. 본문 작성 시 컴파일 완료를 선결론 내리지 않는다.

남음: 지정 폴더/앨범 지속 동기화, 로컬 보존/삭제 관리(공유 캐시 포함), batch-day revision과 자정 이후 오래된 알림 선택, 실제 iPhone/Galaxy 권한/메타데이터/알림/SNS 시험. 현재 입력은 사용자가 가져온 사진이며 외부 폴더 자동 감시 완료가 아니다. iOS에서 전체 사진 권한을 요구하도록 우회하지 않으며 접근 가능한 사진만 처리한다. 모든 SNS·다중 사진·문구 호환성은 NOT_RUN이다.

## 공식 API 확인 범위

- Expo Modules module API: https://docs.expo.dev/modules/module-api/
- Android 문서 선택: https://developer.android.com/training/data-storage/shared/documents-files
- Android 알람: https://developer.android.com/develop/background-work/services/alarms/schedule
- Apple PhotoKit: https://developer.apple.com/documentation/photokit/phimagerequestoptions/isnetworkaccessallowed
- Apple 로컬 알림: https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app

이 URL들은 구현 근거이며 계정/앱 심사 또는 실제 기기 PASS를 의미하지 않는다. API 키와 서버는 추가하지 않았다.
