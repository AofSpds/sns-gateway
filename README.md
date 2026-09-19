# SNS Gateway

서버 없는 iPhone/Galaxy 사진 공유 도우미의 **작성자 구현 후보**입니다. 사진·문구·이력은 기기에 두며 로컬 알림 후 사용자가 공식 SNS 앱에서 최종 게시합니다. 실기/SNS 수락·별도 IVA·서명된 배포본의 완료를 뜻하지 않습니다.

## 현재 구현

- 로컬 사진 게시함, 방향을 반영한 JPEG 사본, 해시 중복 방지, 순서·문구·OS 공유.
- Galaxy의 선택 로컬 폴더 / iPhone의 선택 사진 앨범을 연결하고 앱 재개·새로고침 때 신규 항목 확인.
- 최초 목록은 baseline만 기록, 새 소스 사진의 실제 추가일은 추정하지 않고 날짜 확인 후보로 가져오기.
- 한국 시간 날짜별 사진·문구 묶음, 수정 버전 보존, 공유 당시 버전 연결, 날짜 이동·닫기/다시 열기.
- 기본09:00 로컬 알림, 시간 변경·ON/OFF·시험 알림, 늦게 선택한 알림의 날짜 확인.
- 앱 사진 사본/공유 캐시의 안전한 보존·삭제, 500MiB 사본 제한, 삭제 중단 후 재개, 명시적 로컬 초기화.
- SQLite v1→v2→v3 추가 이관, 기존 이력·등록시각·기존 문구 보존.

현재 API는 OS 공유 API입니다. Meta HTTP API·OAuth·Supabase·외부 스토리지·앱 로그인·API 키를 사용하지 않습니다. SNS 로그인과 최종 게시는 공식 앱에서 합니다. 공유 callback은 원격 게시 성공이 아닙니다.

## 중요한 제한

폴더/앨범은 앱을 열거나 새로고침할 때 확인합니다. 백그라운드 상시 감시나 무인 SNS 게시가 아닙니다. 선택 소스1개, 직접 항목 최대2,000개, 회차당 신규10장입니다. iPhone 앨범 연결은 전체 사진 접근이 필요하며 제한 권한에서는 사진 직접 가져오기를 사용합니다. 기기에 없는 iCloud 원본을 자동 다운로드하지 않습니다.

Android 알림은 inexact로 지연될 수 있습니다. 새 Android 알림은 원 예약일, iOS 반복 알림은 OS 전달일을 표시한 뒤 사용자가 날짜를 확인합니다. 전달일을 원 예정일로 속이지 않습니다. 날짜창은 00:00 이상09:00 미만 등록분이며 알림 시간을 바꿔도 따로 유지합니다.

미확인 공유와 열린 날짜가 참조하는 사본은 자동 삭제하지 않습니다. 날짜를 완료/폐기로 닫고 관련 공유가 모두 해결된 후7일이 지나야 자동 정리 대상이 됩니다. 수동 삭제/초기화도 원본은 건드리지 않습니다. 삭제 이력은 같은 사진의 자동 부활을 막습니다. 앱 삭제/초기화 후에는 이전 중복 판단 이력이 없어집니다.

## 개발자 실행

구현은 `work/sns-gateway-v0.1`, Draft PR #1입니다. main은 초기 진입점이며 병합되지 않았습니다.

```sh
npm ci --ignore-scripts
npm run check
npm run bundle
```

정확한 의존성은 잠금 파일, Node는 `.nvmrc`를 사용합니다. Expo Go만으로 실행할 수 없으며 native 모듈이 포함된 빌드가 필요합니다. Release는 JS/리소스를 포함하고 OTA를 사용하지 않습니다. Android 기본 INTERNET 권한은 제거합니다. Metro가 필요한 개발 모드에서만 `SNSG_DEVELOPMENT_NETWORK=1`을 사용합니다.

Android unsigned APK는 서명된 설치본이 아니며 iOS simulator .app은 iPhone IPA가 아닙니다. 코드/JS 검사·네이티브 컴파일·실기 실행·SNS 공유·IVA·배포 결과를 각각 확인합니다. 실제 기기 설치·SNS 전송·공개 게시·개인 서명키 등록은 자동 실행하지 않습니다.

[새 기능·복구 계약](docs/LIFECYCLE.md) · [현재 작업 상태](docs/WORK_PLAN_v0.1.md) · [첫 실행](docs/FIRST_RUN.md) · [API 키](docs/API_KEYS.md) · [실기 시험](docs/DEVICE_COMPATIBILITY.md) · [개인정보](docs/PRIVACY.md)

운영·결정·기억은 `AofSpds/mitchell`이 소유합니다. 작성자 MITCHELL, PMO NOT_DISPATCHED, SNS Gateway IVA NOT_RUN. 기존 bootstrap/web-starter는 변경하지 않습니다.
