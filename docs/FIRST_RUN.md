# 첫 실행 — 개발자 검토 후보

작업 브랜치의 기능은 로컬 게시함·지정 폴더/앨범·날짜 묶음·알림·공유·보존 관리다. 실제 기기/SNS 수락과 서명된 배포본이 준비됐다는 뜻은 아니다.

```sh
git clone --branch work/sns-gateway-v0.1 https://github.com/AofSpds/sns-gateway.git
cd sns-gateway
npm ci --ignore-scripts
npm run check
npm run bundle
```

native bridge가 있어 Expo Go는 지원하지 않는다. Android SDK/JDK 또는 macOS/Xcode 빌드 환경은 별도다. 기존 Bootstrap을 이번 앱이 자동 변경하지 않는다. 개발용 Metro 연결은 SNSG_DEVELOPMENT_NETWORK=1로 생성한 개발 빌드에 한한다. release 후보에는 JS를 포함하며 앱 데이터용 서버는 없다.

승인된 설치 후 합성 사진 시험→사진 직접 가져오기→날짜별 묶음 저장→OS 공유 순서로 확인한다. SNS에 전달하는 것도 외부효과이므로 먼저 승인된 합성 사진만 사용한다. 실제 공개 게시 없이 작성 화면과 취소까지만 확인할 수 있다.

설정에서 로컬 폴더 또는 사진 앨범1개를 선택할 수 있다. 첫 연결의 기존 사진은 기준 목록으로만 기록한다. 그 뒤 소스에 합성 사진을 추가하고 앱을 다시 열거나 '새 사진 확인'을 누른다. 소스에서 가져온 사진은 날짜 확인 후 수동 포함한다. 폴더 추가시각을 자동으로 안다고 가정하지 않는다.

오늘 화면에서 기준 날짜와 버전을 확인한다. 문구 수정 후 저장한다. 알림tap은 표시 날짜를 확인하고 연다. iOS 전달일과 원 예정일은 다를 수 있다. 사진 순서/문구/계정은 수신 SNS 앱에서 다시 확인하고 최종 게시를 수행한다. 공유 callback만으로 성공 표시하지 않는다.

날짜를 완료/폐기로 닫으면 조건 충족 후7일 뒤 앱 사본이 정리될 수 있다. 미확인 이력이 있으면 보호한다. 수동 삭제/전체 초기화에는 되돌릴 수 없다는 확인이 있으며 원본은 건드리지 않는다.

API 키·비밀번호·개인 서명키를 채팅/Git/CI에 넣지 않는다. unsigned Android APK는 서명된 설치본이 아니며 iOS simulator .app은 iPhone IPA가 아니다. 실제 기기 결과는 DEVICE_COMPATIBILITY.md에 기록하고 미실행을 PASS로 바꾸지 않는다.
