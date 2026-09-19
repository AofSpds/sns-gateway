# 기기·SNS 공유 호환성

SG-01의 핵심 완료 조건은 실제 수신 앱에서 관측하는 것입니다. native 컴파일이나 Node 시험을 아래 결과로 대체하지 않습니다.

| OS | 수신 SNS | 기종/OS/앱 버전 | JPEG 1장 | JPEG 3장/순서 | 문구 | 취소/재진입 | 실제 공개 게시 |
|---|---|---|---|---|---|---|---|
| iOS | Instagram | 미확인 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| iOS | Threads | 미확인 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Android/Galaxy | Instagram | 미확인 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| Android/Galaxy | Threads | 미확인 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |

개인사진 대신 앱에서 생성한 번호 표시 합성 JPEG만 사용합니다. 기기 설치·SNS로 전달·공개 게시의 권한은 별개입니다. SNS 전송도 실제 외부효과가 있으므로 승인 없이 자동 수행하지 않습니다.

일반 공유 메뉴는 특정 SNS의 지원 보장이 아닙니다. 희망 대상과 실제 관측 대상을 구분합니다. Android 현재 bridge는 대상/취소를 확정하지 않아 observedTarget=null, 결과는 미확인입니다. iOS도 OS activity 성공은 원격 게시 성공이 아닙니다.

각 시험에는 exact source commit, build 식별자, 기종·OS·SNS 앱 버전, 시간, 사진 수, 문구 수신, 터치 단계, 취소/앱 부재/저장공간 부족/공유 중 중단의 관측을 기록합니다. API 키는 요구하지 않습니다.
