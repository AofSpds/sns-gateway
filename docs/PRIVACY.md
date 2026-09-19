# 로컬 개인정보 경계

현재 앱은 사용자가 선택한 사진 및 연결한 로컬 폴더/앨범을 읽고 앱 내부에 공유용 JPEG 사본을 만든다. 첫 SG-01의 합성사진 전용 설명은 과거 범위다. 외부 서버·사진 스토리지·SNS OAuth·분석/광고 SDK·원격 Push·API 키는 없다.

원본은 읽기 전용이다. 사본은 방향 반영/크기 제한 후 생성하며 원본 EXIF/GPS를 전달하지 않는 경로를 사용한다. 실제 다양한 사진 형식·메타데이터 수락은 실기 시험으로 남는다. iCloud-only를 내려받기 위해 PhotoKit 네트워크 옵션을 켜지 않는다.

Android SQLite/게시함은 noBackupFilesDir, iOS Application Support는 백업 제외 속성을 사용한다. 소스locator와 알림 날짜는 기기 내부 설정/백업 제외 파일에 둔다. 공유 staging은 cache 하위이며 FileProvider는 해당 하위만 읽기 권한으로 제공한다. DB/원본/쓰기 권한을 공유하지 않는다.

보존·삭제는 LIFECYCLE.md의 닫힌 날짜·미확인 공유 보호·7일 유예·삭제 journal 계약을 따른다. native는 canonical 허용 경로와 파일명만 삭제한다. 초기화는 사용자 확인 후 앱 데이터만 처리한다. 동일사진 tombstone과 미확인 이력을 보존해 자동 재공유를 막는다. 초기화/재설치 뒤에는 이력이 없어져 전역 중복 방지를 보장하지 않는다.

Android 기본 release의 INTERNET 권한은 제거한다. iOS ATS는 HTTPS 방화벽이 아니므로 코드상 HTTP 호출 부재와 실기 통신 부재는 다른 검사다. 로컬 앱은 OTA/외부 crash 수집을 사용하지 않는다. 개발의 npm/Metro/CI 네트워크는 배포 앱의 사진 처리와 구분한다.

문구 복사는 사용자 조작으로만 한다. iOS localOnly/5분 만료, Android 민감 clipboard 표시를 사용하되 사용자의 갤러리 원본 백업·제조사 기기간 복사·수신 SNS 앱의 임시 업로드를 제어한다고 주장하지 않는다. SNS 앱에 넘긴 이후의 네트워크·공개는 그 앱이 처리한다.

실제 사진·경로·토큰·원본 로그를 공개 Git/CI에 넣지 않는다. 시험에는 합성 fixture만 사용한다. 실기 백업/메타데이터/권한 수락과 독립 IVA는 별도 미실행이다.
