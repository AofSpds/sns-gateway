# 첫 실행 — 개발자 검토용 공유 시험 후보

이 단계는 설치·배포 완료본이 아닙니다. 일반 사진 가져오기나 오전 9시 알림이 구현된 것으로 사용하지 마세요.

## 코드 실행

구현은 `work/sns-gateway-v0.1` 브랜치에 있습니다. main에는 초기 README만 있습니다.

```sh
git clone --branch work/sns-gateway-v0.1 https://github.com/AofSpds/sns-gateway.git
cd sns-gateway
npm ci
npm run check
npm run bundle
```

`.nvmrc`의 Node 버전과 `package-lock.json`을 사용합니다. native bridge가 필요하므로 Expo Go에서는 이 앱의 기능이 동작하지 않습니다.

개발자 로컬 native 실행에는 해당 플랫폼의 SDK가 필요합니다. 개발 PC와 Metro 연결을 허용하는 개발 빌드는 `SNSG_DEVELOPMENT_NETWORK=1`을 설정한 뒤 생성합니다. 앱의 기본 설정은 외부 통신이 필요하지 않은 후보입니다. CI의 Android release 빌드는 서명 없이 JS/리소스를 묶는 컴파일 검사이고, iOS simulator 빌드는 iPhone에 설치할 수 있는 IPA가 아닙니다.

## 시험 화면

1. 사진 탭에서 합성 JPEG 1장 또는 3장을 만듭니다. 개인 사진 권한은 요청하지 않습니다.
2. 그림의 번호와 순서를 확인하고 시험용 문구를 입력합니다.
3. 희망 SNS를 고른 뒤 공유 시험을 실행합니다. 실제 수신 앱은 OS 공유 메뉴에서 선택합니다.
4. SNS 앱에 전달하기 전에 시험 허용을 확인합니다. SNS 앱은 최종 게시 전에도 이미지를 전송할 수 있습니다. 공개 게시 시험은 별도 승인된 합성 사진에만 합니다.
5. Gateway의 이력은 공유 시도입니다. 최종 게시 여부는 필요하면 사용자가 표시합니다.

문구가 자동으로 넘어가지 않는 앱에서는 문구 복사 기능을 명시적으로 사용합니다. 실제 기기별 수신 사진 수·순서·문구는 DEVICE_COMPATIBILITY.md에 관측 결과를 적기 전까지 미시험입니다.

## 아직 없는 기능

사용자 사진 가져오기, 지정 폴더/앨범 연결, 알림 권한 요청과 9시 알림 등록, 자동 보존기간 정리. 오늘 화면의 다음 9시 값은 계산값일 뿐 알림 등록 결과가 아닙니다.
