# SNSG-WORK-001 v0.1 — 실행 기준 요약

2026-09-19 / Writer MITCHELL / 사용자 실행 승인 반영.
원 작업계획서는 이 대화에 제공한 SNS_GATEWAY_WORK_PLAN_DRAFT_v0.1_20260919.md이며, 이 파일은 그 실행 요약이다. 상세 설계 원천: AofSpds/mitchell@3e159bf790ab3cdd775add73b8aa7cde89bf5577, docs/mobile/LOCAL_SHARING_DESIGN_v1.0_20260919.md.

## 승인 범위

iPhone/Galaxy 공통 SNS Gateway. 외부 서버/Storage 없음. 최종 게시 수동. SNS OAuth/API 키 대신 OS 공유 API 사용. MITCHELL이 현재 채널에서 직접 구현. PMO NOT_DISPATCHED, IVA NOT_RUN. 새 계정·키·기기 설치·공개 게시·병합·배포는 별도 경계다.

## 후속 구현 현행화 — SNSG-LIFECYCLE-001

사용자가 남은 구현을 진행하도록 지시했다. 현재 MITCHELL이 SG-04 소스연결, SG-05 날짜/revision, SG-06 오래된 알림, SG-03/08 보존·삭제·용량 관리 코드를 추가한다. 기존 실행 범위의 확장이며 서버·API 키·계정·서명·실기·병합·배포 권한은 확대하지 않는다.

아래 표는 첫 코드 후보의 역사적 범위다. 최신 기능 계약은 README와 LIFECYCLE.md, 실제 검사결과는 운영 저장소의 SNS_GATEWAY_LIFECYCLE_COMPLETION_20260919.md를 따른다. 기존 단위시험 PASS를 실기/SNS/IVA 완료로 승격하지 않는다.

## 최초 단계 표

| ID | 작업 | 첫 코드 후보의 범위 |
|---|---|---|
| SG-00 | 저장소·버전·앱 골격·CI | 구현 및 검사 대상 |
| SG-01 | 합성 JPEG 1장/3장 발신 공유 | Kotlin/Swift bridge와 시험 화면; 실기 미확인 |
| SG-02 | 오늘/사진/이력/설정·Provider | 기본 화면과 NOT_RUN registry만 선행 |
| SG-03 | SQLite·게시함·사본 | 합성 사진 이력만 선행; 실제 사진 import는 후속 |
| SG-04 | Galaxy 폴더/iPhone 앨범 | 미구현. 신규 발견 순수 비교 함수만 선행 |
| SG-05 | 날짜·선정·묶음 | 날짜 경계·선정 순수 로직만 선행 |
| SG-06 | 9시 로컬 알림 | 미구현. 다음 시각 계산은 알림 등록이 아님 |
| SG-07 | 실제 SNS 공유 호환성 | 첫 bridge 시험 후 대상별 실기 확인 필요 |
| SG-08 | 이력·복구·개인정보 | 공유 미확인/사용자 진술 구분의 기반 |
| SG-09 | 통합·native 빌드·실기 | 각 결과를 분리해 보고 |
| SG-10 | 완료보고·exact 후보·IVA 패킷 | 첫 묶음 종료 시 작성 |
| SG-11 | 별도 IVA | NOT_RUN 유지; 작성자 자기검증 금지 |
| SG-12 | 승인된 pilot/merge/deploy | 미수행 |

## 계약

사진은 원본을 건드리지 않고 로컬에서 준비한다. 기본 시간대 Asia/Seoul, 날짜창 00:00 이상 09:00 미만 등록분. 외부 소스 처음 발견시각을 실제 폴더 추가시각으로 단정하지 않는다. 최초 폴더 연결은 기존 목록의 baseline만 만들고 전체 사진을 자동 선택하지 않는다. 기본 최대 10장은 앱 제안 상한이며 SNS 지원 한도가 아니다.

공유 시도는 REQUESTED → HANDOFF_UNCONFIRMED, 관측된 취소·실행 오류를 구분한다. 사용자 완료 표시는 USER_REPORTED다. remote PUBLISHED나 post ID를 만들지 않는다. double tap은 단일 실행, 앱 중단은 미확인 복구, 자동 재공유 없음.

9시는 OS 알림 시각이며 무인 게시가 아니다. 개인 사진·계정·폴더 권한을 먼저 요구하지 않는다. 실제 기기가 없는 동안 순수 로직/DB/코드/빌드는 진행하되 실기 호환성을 PASS로 표시하지 않는다.

## 검사 및 Git

npm ci → lint → typecheck → Node 단위/SQLite 시험 → JS bundle → Android unsigned release/iOS unsigned simulator build. native 빌드는 실기 실행이 아니다. 첫 공유 시험은 합성 사진만 사용한다. 제품 main은 초기 문서이며 작업 브랜치와 Draft PR의 exact candidate를 검사한다.
