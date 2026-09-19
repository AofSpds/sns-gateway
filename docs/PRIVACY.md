# 로컬 개인정보 경계 — 첫 공유 시험 후보

현재 후보는 개인 사진을 읽지 않습니다. 앱이 합성 JPEG를 생성하며 사진 접근 권한, SNS 계정 인증, 외부 중계 서버는 없습니다.

- Android의 SQLite는 noBackupFilesDir 하위, iOS는 백업 제외 처리한 Application Support 하위에 저장합니다.
- 공유용 합성 JPEG는 앱 cache 하위 고유 디렉터리에 있습니다. 현재 파일 정리·용량 관리 기능은 없습니다. OS가 cache를 지우면 다시 생성해야 합니다.
- Android FileProvider는 `cache/sns-gateway/share/` 하위만 읽기 권한으로 제공합니다. 일반 저장소·DB·쓰기 권한을 공개하지 않습니다.
- iOS는 공유 URL의 canonical 경로와 JPEG 형식을 확인합니다. clipboard는 사용자 동작으로만 쓰고 localOnly와 5분 만료를 지정합니다.
- Android clipboard는 민감 플래그를 지정하지만 제조사의 기기간 복사 설정까지 제어한다고 보장하지 않습니다.
- 배포용 기본 설정에서 Android INTERNET 권한을 제거하고 OTA 업데이트를 비활성화합니다. iOS ATS 설정은 모든 HTTPS를 차단하는 방화벽이 아닙니다. 앱 코드의 HTTP 호출 부재와 실제 실행시 외부 통신 부재는 다른 시험입니다.
- 개발 중 npm/Metro/CI 네트워크와 합성 시험은 개인 사진을 다루는 배포 앱의 경계와 구분합니다.
- SNS에 공유한 이후 수신 앱의 임시 업로드·저장·공개는 Gateway가 통제하지 않습니다.

시험 상태: 네이티브 코드/설정 정적 검사 및 SQLite fixture와 실기 검사를 구분합니다. 실제 개인정보 사진의 metadata 제거·원본 보존·OS 백업 복구 시험은 아직 수행하지 않았습니다. 이번 합성 사진의 생성이 향후 실제 사진 변환 검증을 대신하지 않습니다.
