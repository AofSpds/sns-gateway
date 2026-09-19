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
test('settings explicitly say reminders and real photos are not yet implemented', () => { const ui = read('app/GatewayApp.tsx'); assert.match(ui, /아직 알림을 등록하지 않습니다/); assert.match(ui, /API 키 등록 불필요/); });
