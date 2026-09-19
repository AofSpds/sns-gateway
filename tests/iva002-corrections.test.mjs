import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness, asset } from './helpers/runtime.mjs';
const hex = n => n.toString(16).padStart(64,'0');
const photo = n => ({id:hex(n),uri:`file:///fixture/inbox/${hex(n)}.jpg`,bytes:1000,width:400,height:400});
const scan = items => ({sourceId:hex(1000),kind:'android_folder',label:'fixture',items});
function history(sql, id, time, state='HANDOFF_UNCONFIRMED') {
  sql.prepare('INSERT INTO batches VALUES (?,?,?,?,?)').run(id,'old caption','[]',time,'SYNTHETIC_FIXTURE');
  sql.prepare('INSERT INTO share_attempts VALUES (?,?,?,?,?,?,?)').run(id,id,'instagram',null,time,state,'OS_SIGNAL');
}

test('F001: ten permanent failures cannot starve the eleventh healthy photo', async () => {
  let items=[]; const calls=[];
  const h=await harness('src/services/sources.ts',{
    scanSource:async()=>scan(items), importSource:async(_id,keys)=>{calls.push([...keys]);return {records:keys.includes(hex(11))?[{entryKey:hex(11),photo:photo(11)}]:[],skipped:keys.length-(keys.includes(hex(11))?1:0)};},
  });
  await h.api.syncSource();items=Array.from({length:11},(_,i)=>hex(i+1));
  await h.api.syncSource();await h.api.syncSource();
  assert.equal(calls[0].includes(hex(11)),false);assert.equal(calls[1].includes(hex(11)),true);
  assert.equal(h.sql.prepare("SELECT COUNT(*) AS n FROM source_entries WHERE state='PENDING'").get().n,10);
  assert.equal(h.sql.prepare('SELECT basis FROM inbox_assets').get().basis,'FIRST_OBSERVED');
  assert.equal(h.sql.prepare('SELECT registered_at FROM inbox_assets').get().registered_at,null);
  assert.equal(h.sql.prepare("SELECT COUNT(*) AS n FROM source_retry_attempts WHERE outcome='SKIPPED'").get().n,10);
  h.close();
});
test('F001: thrown native calls keep failure state yet advance the next persisted turn', async()=>{
  let items=[];let fail=true;const calls=[];
  const h=await harness('src/services/sources.ts',{scanSource:async()=>scan(items),importSource:async(_id,keys)=>{calls.push(keys);if(fail)throw new Error('fixture I/O');return {records:keys.map(k=>({entryKey:k,photo:photo(parseInt(k,16))})),skipped:0};}});
  await h.api.syncSource();items=Array.from({length:11},(_,i)=>hex(i+1));
  await assert.rejects(h.api.syncSource(),/fixture I\/O/);
  assert.equal(h.sql.prepare("SELECT COUNT(*) AS n FROM source_retry_attempts WHERE outcome='ERROR'").get().n,10);
  fail=false;await h.api.syncSource();assert.ok(calls[1].includes(hex(11)));
  await h.api.syncSource();assert.equal(h.sql.prepare("SELECT COUNT(*) AS n FROM source_entries WHERE state='PENDING'").get().n,0);h.close();
});
test('F001: partial failures recover without losing baseline identities or rewriting app dates',async()=>{
  let items=[hex(100)];let recover=false;
  const h=await harness('src/services/sources.ts',{scanSource:async()=>scan(items),importSource:async(_id,keys)=>({records:keys.filter(k=>recover||k===hex(2)).map(k=>({entryKey:k,photo:photo(parseInt(k,16))})),skipped:keys.filter(k=>!recover&&k!==hex(2)).length})});
  const existing=asset(h.sql,hex(2));const registered=h.sql.prepare('SELECT registered_at FROM inbox_assets WHERE id=?').get(existing.id).registered_at;
  await h.api.syncSource();items=[hex(100),hex(1),hex(2)];await h.api.syncSource();
  recover=true;items=[hex(1),hex(2)];await h.api.syncSource();items.push(hex(100));await h.api.syncSource();
  assert.equal(h.sql.prepare('SELECT state FROM source_entries WHERE entry_key=?').get(hex(100)).state,'BASELINE');
  assert.equal(h.sql.prepare('SELECT registered_at FROM inbox_assets WHERE id=?').get(hex(2)).registered_at,registered);
  assert.equal(h.sql.prepare('SELECT attempt_count FROM source_retry_attempts WHERE entry_key=?').get(hex(1)).attempt_count,2);h.close();
});
test('F001: v3 pending rows survive v4 migration and an interrupted STARTED selection rotates',async()=>{
  const h=await harness('src/storage/lifecycle.ts',{},3);const items=Array.from({length:11},(_,i)=>hex(i+1));
  h.sql.prepare('INSERT INTO source_snapshots VALUES (?,?,?,?,?,?)').run(hex(1000),'android_folder','old',1,1,JSON.stringify(items));
  for(const key of items)h.sql.prepare('INSERT INTO source_entries VALUES (?,?,?,?,NULL)').run(hex(1000),key,1,'PENDING');
  await h.api.claimSourceTurn(scan(items));const next=await h.api.claimSourceTurn(scan(items));
  assert.equal(h.sql.prepare('SELECT version FROM schema_meta').get().version,4);assert.ok(next.includes(hex(11)));
  assert.equal(h.sql.prepare("SELECT COUNT(*) AS n FROM source_entries WHERE state='PENDING'").get().n,11);h.close();
});

test('F002: the unresolved 101st record remains reachable and user resolution permits reset',async()=>{
  const h=await harness('src/storage/history.ts',{setReminder:async()=>{},disconnectSource:async()=>{},managedFiles:async()=>[],deleteManagedFiles:async uris=>uris});
  history(h.sql,'old',1);for(let i=0;i<100;i++)history(h.sql,`new-${i}`,i+2,'USER_MARKED_POSTED');
  const all=await h.api.listHistoryPage();assert.equal(all.rows.length,100);assert.ok(all.next);
  const older=await h.api.listHistoryPage({cursor:all.next});assert.equal(older.rows[0].id,'old');
  const pending=await h.api.listHistoryPage({filter:'UNRESOLVED'});assert.equal(pending.rows[0].id,'old');
  const maintenance=await h.load('src/services/maintenance.ts');await assert.rejects(maintenance.resetLocalData(),/UNCONFIRMED/);
  await h.api.markUserOutcome(pending.rows[0],false);await maintenance.resetLocalData();assert.equal(await maintenance.resetPending(),false);h.close();
});
test('F002: 205 unresolved rows with identical timestamps traverse without loss or duplication',async()=>{
  const h=await harness('src/storage/history.ts');const expected=[];
  for(let i=0;i<205;i++){const id=`s-${String(i).padStart(3,'0')}`;expected.push(id);history(h.sql,id,10);}
  let cursor=null;const found=[];do{const page=await h.api.listHistoryPage({filter:'UNRESOLVED',cursor});found.push(...page.rows.map(r=>r.id));cursor=page.next;}while(cursor);
  assert.deepEqual(found,expected.sort().reverse());assert.equal(new Set(found).size,205);h.close();
});
test('F002: migrated v1 history remains accessible at the 100/101 boundary',async()=>{
  const h=await harness('src/storage/history.ts',{},1);for(let i=0;i<101;i++)history(h.sql,`legacy-${String(i).padStart(3,'0')}`,10,i%2?'USER_MARKED_POSTED':'HANDOFF_UNCONFIRMED');
  const first=await h.api.listHistoryPage();const last=await h.api.listHistoryPage({cursor:first.next});assert.equal(first.rows.length,100);assert.equal(last.rows.length,1);
  assert.equal((await h.api.listHistoryPage({filter:'UNRESOLVED'})).total,51);assert.equal(h.sql.prepare('SELECT version FROM schema_meta').get().version,4);h.close();
});
test('F002: cursor does not skip older rows when a preceding unresolved row is resolved',async()=>{
  const h=await harness('src/storage/history.ts');for(let i=0;i<102;i++)history(h.sql,String(i).padStart(3,'0'),100);
  const first=await h.api.listHistoryPage({filter:'UNRESOLVED'});await h.api.markUserOutcome(first.rows[0],true);
  const next=await h.api.listHistoryPage({filter:'UNRESOLVED',cursor:first.next});assert.deepEqual(next.rows.map(r=>r.id),['001','000']);
  for(const options of [{limit:0},{limit:101},{filter:'PUBLISHED'},{cursor:{startedAt:NaN,id:'x'}},{cursor:{startedAt:0,id:''}}])await assert.rejects(h.api.listHistoryPage(options),/INVALID_HISTORY_CURSOR/);h.close();
});
test('F002 UI exposes the unresolved filter and real cursor-driven older-record action',()=>{
  const s=readFileSync('app/GatewayApp.tsx','utf8');assert.ok(s.includes('미확인·오류 이력 모두 보기'));assert.ok(s.includes('이전 기록 더 보기'));
  assert.ok(s.includes('refreshHistory(true)'));assert.ok(s.includes("refreshHistory(false,'UNRESOLVED')"));assert.ok(s.includes('cursor: append ? historyCursorRef.current : null'));
});

test('F003: only old inactive import temps are expired; recent/active temps and receiver staging remain',async()=>{
  const now=Date.now();const files=[
    {uri:'file:///fixture/inbox/old.tmp',kind:'IMPORT_TEMP',bytes:100,modifiedAt:now-3_600_001,active:false},
    {uri:'file:///fixture/inbox/recent.tmp',kind:'IMPORT_TEMP',bytes:100,modifiedAt:now,active:false},
    {uri:'file:///fixture/inbox/active.tmp',kind:'IMPORT_TEMP',bytes:100,modifiedAt:now-3_600_001,active:true},
    {uri:'file:///fixture/stage/0.jpg',kind:'STAGING',bytes:100,modifiedAt:now},
  ];const deleted=[];const h=await harness('src/services/maintenance.ts',{managedFiles:async()=>files,deleteManagedFiles:async uris=>{deleted.push(...uris);return uris;}});
  assert.equal(await h.api.collectExpired(),1);assert.deepEqual(deleted,[files[0].uri]);h.close();
});
test('F003: reset includes temp copies and verifies empty managed inventory before clearing DB',async()=>{
  let files=[{uri:'file:///fixture/inbox/uuid.tmp',kind:'IMPORT_TEMP',bytes:100,modifiedAt:Date.now(),active:false}];const deleted=[];
  const h=await harness('src/services/maintenance.ts',{setReminder:async()=>{},disconnectSource:async()=>{},managedFiles:async()=>files,deleteManagedFiles:async uris=>{deleted.push(...uris);files=files.filter(f=>!uris.includes(f.uri));return uris;}});asset(h.sql);
  await h.api.resetLocalData();assert.ok(deleted.includes('file:///fixture/inbox/uuid.tmp'));
  assert.ok(deleted.includes(`file:///fixture/inbox/${'a'.repeat(64)}.jpg`));assert.equal(files.length,0);assert.equal(await h.api.resetPending(),false);h.close();
});
test('F003: reset never deletes a registered active import',async()=>{
  let deletes=0;const h=await harness('src/services/maintenance.ts',{setReminder:async()=>{},disconnectSource:async()=>{},managedFiles:async()=>[{uri:'file:///fixture/active.tmp',kind:'IMPORT_TEMP',bytes:1,modifiedAt:Date.now(),active:true}],deleteManagedFiles:async()=>{deletes++;return[];}});asset(h.sql);
  await assert.rejects(h.api.resetLocalData(),/IMPORT_IN_PROGRESS/);assert.equal(deletes,0);assert.equal(await h.api.resetPending(),true);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM inbox_assets').get().n,1);h.close();
});
test('F004: initial inventory I/O failure preserves reset journal and all DB rows; restored access resumes',async()=>{
  let unavailable=true;let files=[];const h=await harness('src/services/maintenance.ts',{setReminder:async()=>{},disconnectSource:async()=>{},managedFiles:async()=>{if(unavailable)throw new Error('EACCES fixture');return files;},deleteManagedFiles:async uris=>{files=files.filter(f=>!uris.includes(f.uri));return uris;}});
  const a=asset(h.sql);files=[{uri:a.uri,kind:'INBOX',bytes:1000,modifiedAt:Date.now()}];
  await assert.rejects(h.api.resetLocalData(),/EACCES/);assert.equal(await h.api.resetPending(),true);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM inbox_assets').get().n,1);
  unavailable=false;await h.api.resetLocalData();assert.equal(files.length,0);assert.equal(await h.api.resetPending(),false);h.close();
});
test('F004: an erroneous empty inventory still cannot bypass DB-known path deletion',async()=>{
  const h=await harness('src/services/maintenance.ts',{setReminder:async()=>{},disconnectSource:async()=>{},managedFiles:async()=>[],deleteManagedFiles:async()=>{throw new Error('EACCES fixture');}});asset(h.sql);
  await assert.rejects(h.api.resetLocalData(),/EACCES/);assert.equal(await h.api.resetPending(),true);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM inbox_assets').get().n,1);assert.equal(h.sql.prepare('SELECT done_at FROM file_deletions').get().done_at,null);h.close();
});
test('F004: final inventory error or remaining file cannot falsely complete a reset',async()=>{
  for(const mode of ['throw','remaining']){
    let inventoryCalls=0;let repaired=false;const item={uri:'file:///fixture/left.tmp',kind:'IMPORT_TEMP',bytes:100,modifiedAt:0};
    const h=await harness('src/services/maintenance.ts',{setReminder:async()=>{},disconnectSource:async()=>{},managedFiles:async()=>{inventoryCalls++;if(repaired)return[];if(inventoryCalls>1&&mode==='throw')throw new Error('EIO fixture');return[item];},deleteManagedFiles:async uris=>uris});asset(h.sql);
    await assert.rejects(h.api.resetLocalData(),mode==='throw'?/EIO/:/RESET_INCOMPLETE/);assert.equal(await h.api.resetPending(),true);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM inbox_assets').get().n,1);
    repaired=true;await h.api.resetLocalData();assert.equal(await h.api.resetPending(),false);h.close();
  }
});
test('F004: partial or duplicated deletion receipts never mark an untouched photo PURGED',async()=>{
  const h=await harness('src/services/maintenance.ts',{deleteManagedFiles:async uris=>[uris[0],uris[0]]});asset(h.sql,hex(1));asset(h.sql,hex(2));
  await assert.rejects(h.api.purgeSelected([hex(1),hex(2)]),/INVALID_DELETE_RESULT/);
  assert.equal(h.sql.prepare("SELECT COUNT(*) AS n FROM asset_dispositions WHERE state='PURGED'").get().n,0);assert.equal(h.sql.prepare('SELECT COUNT(*) AS n FROM file_deletions WHERE done_at IS NOT NULL').get().n,0);h.close();
});
