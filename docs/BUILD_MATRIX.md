# 빌드 범위와 재현 기준

## 고정한 앱 의존성

Expo 57.0.24 / React Native 0.86.3 / React 19.2.3 / expo-dev-client 57.0.19 / expo-sqlite 57.0.3 / TypeScript 6.0.3. 전체 전이 의존성은 package-lock.json에 고정합니다.

작성자 Node 환경은 22.16.0입니다. 최초 Expo SDK 호환성 검사가 TypeScript 5.9.3을 거부하여 6.0.3으로 교정했습니다. 검사를 비활성화하거나 결과를 PASS로 덮어쓰지 않았습니다.

## 구분

| 실행 | 목적 | 뜻하지 않는 것 |
|---|---|---|
| npm run check | lint/typecheck/Node·SQLite·정적 계약 시험 (현재 개수는 완료보고) | native 코드 컴파일·실제 기기 통과 |
| expo install --check | 설치된 SDK의 의존성 호환성 검사 | SNS 앱 수신 호환성 |
| npm run bundle | Android/iOS JS·asset 번들 생성 | 폰 설치 성공 |
| Android assembleRelease | unsigned release 컴파일, JS 번들 포함, INTERNET 권한 검사 | 서명된 배포 APK·갤럭시 설치·실행 |
| iOS simulator Release | macOS/Xcode unsigned simulator .app 컴파일 | iPhone 서명·프로비저닝·IPA·App Store 배포 |

Android 빌드는 JDK17과 CI runner Android SDK를 사용합니다. iOS는 runner의 Xcode 버전을 로그로 남깁니다. 컴파일 실제 결과는 운영 저장소 AofSpds/mitchell의 완료보고가 소유합니다. 표에 항목이 있다고 성공한 것은 아닙니다.

## 개발 서버와 구분

개발 모드는 Metro를 사용합니다. 기본 설정은 Android INTERNET 권한을 차단하므로 개발 연결이 필요할 때만 SNSG_DEVELOPMENT_NETWORK=1로 native 프로젝트를 생성합니다. release 후보는 JavaScript/리소스를 번들에 포함하고 OTA 업데이트를 사용하지 않습니다. 사용자 PC에서 임의로 prebuild --clean이나 설치를 실행하지 않습니다.

개인 서명키·프로비저닝·실제 사진은 CI/Git에 넣지 않습니다. 빌드 산출물은 검토 후보이며 자동 설치·자동 릴리스되지 않습니다.
