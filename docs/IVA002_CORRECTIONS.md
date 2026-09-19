# IVA-002 교정 범위와 표적 검사

2026-09-19 / Writer MITCHELL / AUTHOR_CORRECTION, 독립 재검증 아님.

원 결과는 AofSpds/mitchell@5133d5fe9af59b8ed06e7bf7bedba29108c10c79의
`docs/execution/SNS_GATEWAY_IVA_RESULT_002_20260919.md` v1.0.1이다.
기존 후보 cf6967ce920793a72f88da746af4d0a317e61ed8의 FAIL과 MERGE/RELEASE HOLD를 보존한다.

| Finding | 교정 |
|---|---|
| F001 | source_retry_attempts의 영속 시도 순서·횟수·시각·결과. native 호출 전 차례를 기록하고 아직 시도하지 않았거나 가장 오래 전에 시도한 pending부터 최대10개 선택. SKIPPED/ERROR/STARTED도 다음 정상 후보를 막지 않음. 실제 성공만 IMPORTED. |
| F002 | UNRESOLVED/ALL 필터, started_at+id 내림차순 keyset cursor, 페이지당100개와 다음 cursor. 이력 UI에서 모든 미확인·오류 및 이전 이력 조회 가능. 보호 조건/사용자 진술/원격 게시 미확인을 그대로 유지. |
| F003 | Android inbox의 엄격한 UUID.tmp 식별과 IMPORT_TEMP inventory/용량. 쓰기·rename·삭제를 in-process lock과 active 등록으로 보호. 중단 후 남은 비활성 임시파일은1시간 유예 후 정리하며 명시적 초기화에는 포함. 정상/실패 finally 정리, 원본·임의 경로 삭제 금지. |
| F004 | Kotlin android.system.Os(API21+)와 Swift Foundation 오류 분류로 확정된 ENOENT만 부재로 인정. 열거·metadata 오류는 전파, 불완전한 inventory로 용량/삭제/초기화 성공 판정 금지. 삭제 receipt 중복 거부, DB-known URI도 journal에 보존, 최종 완전 inventory가 비어야 reset 완료. |

MIGRATION_4는 부가 retry 테이블/이력 index만 추가한다. v1/v2/v3 기록과 FIRST_OBSERVED/null 등록시각은 보존한다.
중단된 임시 파일의1시간 유예는 공유 캐시7일 유예와 다르다. active writer·미확인 공유·최근 staging 보호를 완화하지 않는다.
미등록/손상 orphan JPEG는 임시파일로 위장해 지우지 않는다. 엄격한 관리 디렉터리의 예상 밖 entry/권한 오류는 정리를 중단시키며 임의로 재귀 삭제하지 않는다.
실기 파일 보호·공유 동작·메타데이터·알림은 별도 NOT_RUN이다.

## 표적 검사

```sh
node --experimental-vm-modules --experimental-strip-types --test tests/iva002-corrections.test.mjs tests/lifecycle.test.mjs
swiftc modules/local-platform/ios/LocalManagedFiles.swift tests/native/ManagedFileRegressions.swift -o /tmp/snsg-iva002-file-guards
# 비특권 사용자와 빈 테스트 HOME에서 실행. 기존 사용자 앱 데이터가 있는 디렉터리에서는 중단한다.
/tmp/snsg-iva002-file-guards
kotlinc modules/local-platform/android/src/main/java/expo/modules/localplatform/LocalManagedFiles.kt tests/native/kotlin/*.kt -include-runtime -d /tmp/snsg-iva002-file-guards.jar
java -jar /tmp/snsg-iva002-file-guards.jar
```

Kotlin Context의 저장 디렉터리와 android.system.Os는 fixture shim이다. Os shim은 실제 JVM File/NIO 실패를 errno로 매핑한다. 실제 Android Os 런타임은 실기 시험이 아니며 Android 빌드에서 API 적합성을 확인한다. 기존 minSdk24는 변경하지 않는다. Swift는 Foundation 파일 API와 unlink를 직접 실행한다.
권한실패 fixture는 root 실행을 거부한다. Linux의 격리 사용자 및 macOS CI 실행과 실제 폰 수락을 구분한다.
F001 실패선두10+정상11번째/throw/정상화, F002 100/101 및 미확인205개·같은시각 cursor·이관,
F003 임시파일과 쓰기중단/용량/active/초기화, F004 열거·metadata·unlink 실패·journal/접근회복을 검사한다.

## 외부 공식 API 보조 확인

요구사항은 IVA 원문을 따른다. 아래는 구현에 사용하는 API의 오류 계약 보조 근거이며 새 제품 요구가 아니다.

- Android android.system.Os: lstat/unlink/rename (API21+, ErrnoException/ENOENT 구분). https://developer.android.com/reference/android/system/Os
- Android java.io.File.listFiles: 빈 배열과 null 실패 구분. https://developer.android.com/reference/java/io/File#listFiles()
- Apple FileManager.attributesOfItem(atPath:): throws 기반 속성 조회. https://developer.apple.com/documentation/foundation/filemanager/attributesofitem(atpath:)

개인사진·원본로그·키를 Git에 저장하지 않는다. 새 서버/OAuth/PMO/페어 검증자를 추가하지 않는다.
