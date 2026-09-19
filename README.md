# SNS Gateway

서버 없는 iPhone/Galaxy 사진 공유 도우미의 **개발 후보**입니다. 사진·문구·이력은 기기에 보관하고, 로컬 알림을 받은 사용자가 OS 공유 메뉴에서 SNS를 골라 최종 게시합니다. 완전 무인 자동게시 앱이 아닙니다.

## API 키는 필요 없습니다

현재 API는 iOS/Android OS 공유 API입니다. Meta HTTP API·OAuth·Supabase·외부 사진 저장소·앱 자체 로그인은 사용하지 않습니다. Instagram/Threads 로그인과 최종 게시는 공식 SNS 앱에서 합니다. 비밀번호·API 키·개인 서명키를 채팅이나 Git에 올리지 마세요.

## 작업 브랜치의 구현 범위

- 오늘·사진·이력·설정 화면과 합성 JPEG 1장/3장 공유 시험.
- 사용자가 선택한 로컬 사진을 비공개 게시함에 JPEG 사본으로 가져오기. 원본 수정/삭제 없음.
- 최대 변2048 픽셀, 사본10MiB, 게시함500MiB 제한; 해시 기반 중복 등록 방지.
- 사진 순서·수동 선택·문구 저장/복사·단일/다중 파일 공유.
- KST 당일00:00~09:00 등록분 선정. 중단 복구로 발견한 사본은 날짜 미확인으로 남김.
- SQLite v1→v2 비파괴 이력 이관, 대상별 공유 시도와 사용자 완료 표시 구분.
- iOS 반복 캘린더 알림 / Android inexact AlarmManager, 사용자 동의 후 활성화·해제·시험 알림.

Android의 알림은 지연될 수 있습니다. OS 요청 기록, 실제 알림 전달, SNS 공개는 별개입니다. 알림 시간 변경은 알림만 바꾸며 사진 날짜창은09:00로 유지합니다. 자동 선택은 과거 공유 시도를 보수적으로 제외하고 수동 재공유는 명시적 선택으로만 합니다.

iOS는 PhotoKit의 networkAccessAllowed=false로 기기에 준비된 사진만 읽습니다. 제한 권한 또는 기기에 없는 원본은 건너뜁니다. Android는 로컬 문서 공급자만 허용합니다. 시스템 선택기나 수신 SNS의 자체 네트워크 동작까지 통제한다고 주장하지 않습니다.

## 아직 완료되지 않은 것

지정 폴더/앨범 지속 연동(SG-04), 자동 보존/삭제·완전한 용량 관리, 날짜별 묶음 revision, 기기별 사진/알림/SNS 호환성, 독립 IVA, 병합·배포. 빌드 성공은 실기 성공이 아닙니다. 전체 v0.1 완료로 표시하지 않습니다.

## 개발자 검토

구현은 `work/sns-gateway-v0.1`, Draft PR #1에 있습니다. main은 초기 진입점입니다.

```sh
npm ci --ignore-scripts
npm run check
npm run bundle
```

버전은 package-lock.json과 .nvmrc를 따릅니다. native 모듈이 있어 Expo Go만으로 실행하지 않습니다. Android release에는 INTERNET 권한을 넣지 않습니다. Metro 개발용 연결이 필요할 때만 SNSG_DEVELOPMENT_NETWORK=1을 사용합니다. Release 후보는 JS/리소스를 포함하고 OTA 업데이트는 끕니다.

Android unsigned release APK는 설치 서명을 완료한 APK가 아닙니다. iOS simulator .app은 iPhone용 IPA가 아닙니다. 기기 설치/서명과 실제 SNS 전달/공개 게시를 자동 수행하지 않습니다.

[작업계획](docs/WORK_PLAN_v0.1.md) · [현재 구현과 시험 한계](docs/INBOX_REMINDERS.md) · [API 키](docs/API_KEYS.md) · [기기 시험](docs/DEVICE_COMPATIBILITY.md)

운영 정책·기억은 AofSpds/mitchell이 소유합니다. 현재 작성자 MITCHELL, PMO NOT_DISPATCHED, SNS Gateway IVA NOT_RUN. bootstrap/web-starter는 변경하지 않습니다. 과거 SG-00/01 문서의 합성 사진 한정 설명은 해당 시점 기록이며 현재 범위는 이 README와 완료보고를 따릅니다.
