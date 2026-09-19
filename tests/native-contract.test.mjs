// Static guardrails only. These checks do not substitute for native/device tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('Android exposes only shared cache files', () => {
  const xml = read('modules/local-platform/android/src/main/res/xml/snsgateway_paths.xml');
  assert.match(xml, /path="sns-gateway\/share\/"/); assert.doesNotMatch(xml, /root-path|external-path|files-path/);
  const native = read('modules/local-platform/android/src/main/java/expo/modules/localplatform/LocalPlatformModule.kt');
  assert.match(native, /canonicalFile/); assert.match(native, /FLAG_GRANT_READ_URI_PERMISSION/); assert.doesNotMatch(native, /FLAG_GRANT_WRITE_URI_PERMISSION/);
});
test('iOS excludes private history from backup and limits clipboard sync', () => { const native = read('modules/local-platform/ios/LocalPlatformModule.swift'); assert.match(native, /isExcludedFromBackup = true/); assert.match(native, /localOnly: true/); assert.match(native, /resolvingSymlinksInPath/); });
test('runtime bridge does not call a web API', () => { for (const path of ['src/services/share.ts', 'modules/local-platform/index.ts']) assert.doesNotMatch(read(path), /fetch\(|axios|supabase|access_token|client_secret/); });
test('UI separates device-unverified reminders, keyless sharing and folder limitations', () => { const ui = read('app/GatewayApp.tsx'); assert.match(ui, /API 키 등록 불필요/); assert.match(ui, /지정 폴더\/앨범 자동 연동/); assert.match(ui, /알림 전달이나 SNS 공개 시각을 보장하지 않습니다/); });
test('iOS imports local PHAssets without item-provider download and re-encodes copies', () => { const p = read('modules/local-platform/ios/LocalPhotos.swift'); assert.match(p, /isNetworkAccessAllowed = false/); assert.match(p, /UIGraphicsImageRenderer/); assert.match(p, /isExcludedFromBackup = true/); assert.doesNotMatch(p, /loadFileRepresentation|loadDataRepresentation|PHAssetChangeRequest/); });
test('Android rejects cloud document authorities and writes only private copies', () => { const p = read('modules/local-platform/android/src/main/java/expo/modules/localplatform/LocalPhotos.kt'); assert.match(p, /LOCAL_PROVIDER_REQUIRED/); assert.match(p, /noBackupFilesDir/); assert.match(p, /ImageDecoder/); assert.doesNotMatch(p, /openOutputStream|deleteDocument|HttpClient/); });
test('reminder receivers never share photos or launch a screen in the background', () => { const p = read('modules/local-platform/android/src/main/java/expo/modules/localplatform/LocalReminders.kt'); assert.match(p, /setAndAllowWhileIdle/); assert.match(p, /PendingIntent.getActivity/); assert.doesNotMatch(p, /startActivity\(|shareFiles|setFullScreenIntent|setExact/); const ios = read('modules/local-platform/ios/LocalReminders.swift'); assert.match(ios, /Asia\/Seoul/); assert.match(ios, /repeats: true/); assert.match(ios, /getPendingNotificationRequests/); });
