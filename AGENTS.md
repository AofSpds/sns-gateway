# SNS Gateway 작업 계약

PROJECT = MITCHELL / PRODUCT = sns-gateway
현재 작성자 = MITCHELL. PMO NOT_DISPATCHED. IVA는 작성자가 아닌 별도 검증자. 다른 Persona 미설치.

읽기: README → docs/WORK_PLAN_v0.1.md → docs/execution의 최신 보고서. 운영의 현재·결정·기억은 AofSpds/mitchell이 소유한다.

서버·외부 사진 저장소·SNS HTTP API·OAuth·앱 로그인·API 키를 추가하지 않는다. v0.1은 기기 내부 사진 준비, 로컬 알림 후 OS 공유와 최종 수동 게시다. 첫 후보는 SG-00/SG-01 합성 사진 공유 시험이며 전체 v0.1 완성품이 아니다.

현재 사용자 지시로 코드·시험·작업 브랜치·Draft PR을 이 채널에서 직접 수행한다. 기기 설치·실사진 전송·SNS 게시·Apple 계정·서명키·스토어·병합·배포는 묵시적으로 포함하지 않는다.

새 의존성은 공식 SDK 지원 조합으로 확인하고 잠금 파일을 유지한다. 실제 키·사진·원본 로그·대화 전문·개인 서명키를 Public Git/CI에 저장하지 않는다. 합성 fixture만 사용한다. OS 공유 callback을 원격 게시 성공으로 표시하지 않는다.

기초검사 → 완료보고 → exact head/tree → 별도 IVA 순서. JS/SQL 검사와 native compile, 실기 설치, SNS 호환성을 구분한다. 실패를 숨기거나 미실행을 PASS로 바꾸지 않는다. 이미 유효한 성공 증거를 전역 재실행하지 않는다.

제품 코드는 work/sns-gateway-v0.1에서 작업한다. bootstrap/web-starter는 변경하지 않는다. 쓰기 전 head 확인, 직렬 commit, readback. force-push 금지. Windows 사용자 경로를 하드코딩하지 않는다.
