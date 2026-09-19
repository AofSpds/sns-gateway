import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateInstant, shiftDate, validateDraft, validateScan, validateReminderContext, mayPurgeInbox, mayPurgeStaging, RETENTION_MS } from '../src/domain/lifecycle.ts';
import { harness, asset } from './helpers/runtime.mjs';
const a='a'.repeat(64), b='b'.repeat(64), key='c'.repeat(64), sourceId='d'.repeat(64);
const day='2026-09-19', now=Date.parse('2026-09-19T12:00:00Z'), old=now-RETENTION_MS-1;
const resolved={state:'USER_MARKED_POSTED',resolvedAt:old};
const fact={discardedAt:null,days:[{archivedAt:old}],attempts:[resolved]};

test('invalid calendar date cannot roll silently into another month',()=>{for(const d of ['2026-02-29','2026-09-31','bad','2026-9-19'])assert.throws(()=>dateInstant(d));});
test('day navigation handles leap day and year boundary',()=>{assert.equal(shiftDate('2024-03-01',-1),'2024-02-29');assert.equal(shiftDate('2026-12-31',1),'2027-01-01');});
test('reminder keeps the old date, not the date of reopening',()=>{const n={token:'fixture',serviceDate:'2026-09-18',basis:'DELIVERY_DATE'};assert.deepEqual(validateReminderContext(n),n);assert.throws(()=>validateReminderContext({...n,basis:'ASSUMED_TODAY'}));});
test('empty draft allowed, duplicate or oversized selection rejected',()=>{validateDraft(day,[],'');assert.throws(()=>validateDraft(day,[a,a],''));assert.throws(()=>validateDraft(day,[a],'\0'));});
test('source snapshot must be bounded and complete identity list',()=>{validateScan({sourceId,kind:'ios_album',label:'fixture',items:[a]});for(const items of [[a,a],['bad'],Array(2001).fill(a)])assert.throws(()=>validateScan({sourceId,kind:'ios_album',label:'f',items}));});
test('only old closed days and resolved shares are automatically purged',()=>assert.equal(mayPurgeInbox(fact,now),true));
for(const state of ['REQUESTED','HANDOFF_UNCONFIRMED','SHARE_ERROR'])test(`protect ${state} even from selected-copy deletion`,()=>{assert.equal(mayPurgeInbox({...fact,attempts:[{state,resolvedAt:null}]},now,true),false);});
test('open day and newly closed day protect photos',()=>{for(const at of [null,now])assert.equal(mayPurgeInbox({...fact,days:[{archivedAt:at}]},now),false);});
test('unshared orphan and unknown old completion time protect photos',()=>{assert.equal(mayPurgeInbox({discardedAt:null,days:[],attempts:[]},now),false);assert.equal(mayPurgeInbox({...fact,attempts:[{state:'USER_MARKED_POSTED',resolvedAt:null}]},now),false);});
test('one unresolved provider protects a multi-target photo',()=>assert.equal(mayPurgeInbox({...fact,attempts:[resolved,{state:'HANDOFF_UNCONFIRMED',resolvedAt:null}]},now),false));
test('recent receiver staging is not removed',()=>{assert.equal(mayPurgeStaging([resolved],now,now),false);assert.equal(mayPurgeStaging([resolved],old,now),true);assert.equal(mayPurgeStaging([{state:'HANDOFF_UNCONFIRMED',resolvedAt:old}],old,now),false);});

test('exact saveDay appends immutable revisions and rejects stale writers',async()=>{
 const h=await harness('src/storage/lifecycle.ts');asset(h.sql,a);asset(h.sql,b);
 const first=await h.api.saveDay({serviceDate:day,revision:0,ids:[a],caption:'first',archivedAt:null});
 const second=await h.api.saveDay({...first,ids:[b,a],caption:'second'});
 assert.equal(second.revision,2);assert.equal((await h.api.saveDay(second)).revision,2);
 assert.equal(h.sql.prepare('SELECT caption FROM batch_revisions WHERE revision=1').get().caption,'first');
 await assert.rejects(h.api.saveDay({...first,caption:'stale'}),/REVISION_CONFLICT/);
 assert.throws(()=>h.sql.exec("UPDATE batch_revisions SET caption='overwrite'"),/IMMUTABLE/);h.close();
});
test('archived day cannot be changed until explicitly reopened',async()=>{
 const h=await harness('src/storage/lifecycle.ts');asset(h.sql);
 const d=await h.api.saveDay({serviceDate:day,revision:0,ids:[a],caption:'first',archivedAt:null});await h.api.archiveDay(day,true);
 await assert.rejects(h.api.saveDay({...d,caption:'changed'}),/DAY_ARCHIVED/);await h.api.archiveDay(day,false);assert.equal((await h.api.saveDay({...d,caption:'changed'})).revision,2);h.close();
});
test('each date owns its own selection and caption',async()=>{
 const h=await harness('src/storage/lifecycle.ts');asset(h.sql,a);asset(h.sql,b);
 await h.api.saveDay({serviceDate:day,revision:0,ids:[a],caption:'19',archivedAt:null});
 await h.api.saveDay({serviceDate:'2026-09-20',revision:0,ids:[b],caption:'20',archivedAt:null});
 assert.deepEqual((await h.api.loadDay(day)).ids,[a]);assert.equal((await h.api.loadDay(day)).caption,'19');h.close();
});
test('purged asset cannot be reintroduced through a new draft',async()=>{
 const h=await harness('src/storage/lifecycle.ts');asset(h.sql);h.sql.prepare('INSERT INTO asset_dispositions VALUES (?,?,?)').run(a,'PURGED',now);
 await assert.rejects(h.api.saveDay({serviceDate:day,revision:0,ids:[a],caption:'x',archivedAt:null}),/PHOTO_UNAVAILABLE/);assert.equal(h.sql.prepare('SELECT count(*) AS n FROM daily_batches').get().n,0);h.close();
});
test('initial source baseline and remove/re-add never import historical items',async()=>{
 const h=await harness('src/storage/lifecycle.ts');const scan={sourceId,kind:'android_folder',label:'fixture',items:[a]};
 assert.deepEqual(await h.api.acceptScan(scan),{baseline:true,pending:[]});
 await h.api.acceptScan({...scan,items:[]});assert.deepEqual(await h.api.acceptScan(scan),{baseline:false,pending:[]});
 const changed=await h.api.acceptScan({...scan,items:[a,b]});assert.deepEqual(changed.pending,[b]);h.close();
});
test('failed import remains pending and invalid snapshots do not advance known state',async()=>{
 const h=await harness('src/storage/lifecycle.ts');const scan={sourceId,kind:'ios_album',label:'fixture',items:[]};
 await h.api.acceptScan(scan);await h.api.acceptScan({...scan,items:[key]});
 await assert.rejects(h.api.acceptScan({...scan,items:[key,key]}),/INVALID_SOURCE_SCAN/);
 assert.deepEqual((await h.api.acceptScan({...scan,items:[key]})).pending,[key]);h.close();
});
test('source import keeps unknown membership date and commits photo plus item together',async()=>{
 const h=await harness('src/storage/lifecycle.ts');const scan={sourceId,kind:'ios_album',label:'fixture',items:[]};await h.api.acceptScan(scan);await h.api.acceptScan({...scan,items:[key]});
 const p={id:a,uri:`file:///fixture/inbox/${a}.jpg`,bytes:1000,width:400,height:400};
 await h.api.acceptSourceImports(sourceId,[{entryKey:key,photo:p}]);
 assert.equal(h.sql.prepare('SELECT registered_at FROM inbox_assets').get().registered_at,null);
 assert.equal(h.sql.prepare('SELECT basis FROM inbox_assets').get().basis,'FIRST_OBSERVED');
 assert.deepEqual((await h.api.acceptScan({...scan,items:[key]})).pending,[]);h.close();
});
test('duplicate source content does not rewrite an earlier app registration date',async()=>{
 const h=await harness('src/storage/lifecycle.ts');const photo=asset(h.sql);const time=h.sql.prepare('SELECT registered_at FROM inbox_assets').get().registered_at;
 const scan={sourceId,kind:'android_folder',label:'fixture',items:[]};await h.api.acceptScan(scan);await h.api.acceptScan({...scan,items:[key]});await h.api.acceptSourceImports(sourceId,[{entryKey:key,photo}]);
 assert.equal(h.sql.prepare('SELECT registered_at FROM inbox_assets').get().registered_at,time);h.close();
});
test('share history validates exact immutable daily revision before handoff record',async()=>{
 const h=await harness('src/storage/history.ts');asset(h.sql);
 h.sql.prepare('INSERT INTO daily_batches VALUES (?,?,?,NULL)').run(day,1,now);
 h.sql.prepare('INSERT INTO batch_revisions VALUES (?,?,?,?,?)').run(day,1,'snapshot',JSON.stringify([a]),now);
 await h.api.recordRequest('attempt','instagram',['file:///stage/0.jpg'],'snapshot',[a],{serviceDate:day,revision:1});
 assert.equal((await h.api.listHistory())[0].service_date,day);
 await assert.rejects(h.api.recordRequest('bad','threads',['file:///stage/0.jpg'],'changed',[a],{serviceDate:day,revision:1}),/SNAPSHOT_CONFLICT/);
 assert.equal(h.sql.prepare('SELECT count(*) AS n FROM batches').get().n,1);h.close();
});
test('delete journal survives file failure and suppresses photo resurrection',async()=>{
 let fail=true;const h=await harness('src/services/maintenance.ts',{deleteManagedFiles:async uris=>fail?[]:uris});const photo=asset(h.sql);
 await assert.rejects(h.api.purgeSelected([a]),/DELETE_INCOMPLETE/);
 assert.equal(h.sql.prepare('SELECT state FROM asset_dispositions').get().state,'PURGING');
 fail=false;await h.api.resumeDeletions();assert.equal(h.sql.prepare('SELECT state FROM asset_dispositions').get().state,'PURGED');
 assert.ok(h.sql.prepare('SELECT done_at FROM file_deletions WHERE uri=?').get(photo.uri).done_at);h.close();
});
test('reset blocks unknown shares; reset journal resumes after deletion failure',async()=>{
 let fail=true;const calls=[];const h=await harness('src/services/maintenance.ts',{
  setReminder:async enabled=>{calls.push(['reminder',enabled]);},disconnectSource:async()=>{calls.push(['disconnect']);},
  managedFiles:async()=>[{uri:`file:///fixture/inbox/${a}.jpg`,kind:'INBOX',bytes:1000,modifiedAt:now}],deleteManagedFiles:async uris=>fail?[]:uris,
 });asset(h.sql);
 h.sql.prepare('INSERT INTO batches VALUES (?,?,?,?,?)').run('b','x','[]',now,'LOCAL_INBOX');h.sql.prepare('INSERT INTO share_attempts VALUES (?,?,?,?,?,?,?)').run('s','b','instagram',null,now,'HANDOFF_UNCONFIRMED','OS_SIGNAL');
 await assert.rejects(h.api.resetLocalData(),/UNCONFIRMED/);assert.equal(calls.length,0);
 h.sql.exec("UPDATE share_attempts SET state='USER_REPORTED_CANCELLED'");await assert.rejects(h.api.resetLocalData(),/RESET_INCOMPLETE/);assert.equal(await h.api.resetPending(),true);
 fail=false;await h.api.resetLocalData();assert.equal(await h.api.resetPending(),false);assert.equal(h.sql.prepare('SELECT count(*) AS n FROM inbox_assets').get().n,0);assert.equal(h.sql.prepare('SELECT version FROM schema_meta').get().version,3);h.close();
});

test('old global caption stays available as the initial daily template',async()=>{
 const h=await harness('src/storage/lifecycle.ts');h.sql.prepare("INSERT INTO local_settings VALUES ('caption',?)").run('preserved template');
 assert.equal((await h.api.loadDay(day)).caption,'preserved template');h.close();
});
test('unconfirmed handoff is not a resolved attempt; user resolution is atomic',async()=>{
 const h=await harness('src/storage/history.ts');await h.api.recordRequest('s','instagram',['file:///stage/0.jpg'],'x');
 await h.api.recordNativeResult('s',{outcome:'HANDOFF_UNCONFIRMED',observedTarget:null});
 assert.equal(h.sql.prepare('SELECT count(*) AS n FROM attempt_resolution').get().n,0);
 h.sql.exec("CREATE TRIGGER fixture_fail_resolution BEFORE INSERT ON attempt_resolution BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
 await assert.rejects(h.api.markUserOutcome((await h.api.listHistory())[0],true),/fixture failure/);
 assert.equal((await h.api.listHistory())[0].state,'HANDOFF_UNCONFIRMED');
 h.sql.exec('DROP TRIGGER fixture_fail_resolution');await h.api.markUserOutcome((await h.api.listHistory())[0],true);
 assert.ok(h.sql.prepare('SELECT resolved_at FROM attempt_resolution').get().resolved_at);h.close();
});
