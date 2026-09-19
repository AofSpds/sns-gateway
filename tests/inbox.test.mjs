import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { validateImportedPhoto, selectIds, movePhoto } from '../src/domain/inbox.ts';
import { SCHEMA, RECOVER_INTERRUPTED } from '../src/storage/schema.ts';
import { MIGRATION_2, INBOX_QUERY } from '../src/storage/migration2.ts';
const a = 'a'.repeat(64), b = 'b'.repeat(64);
const photo = { id: a, uri: `file:///private/inbox/${a}.jpg`, width: 1200, height: 1600, bytes: 20480 };
function db2() { const db = new DatabaseSync(':memory:'); db.exec(SCHEMA); db.exec(MIGRATION_2); return db; }
function asset(db, id, time=10, basis='APP_REGISTERED') { db.prepare('INSERT INTO inbox_assets VALUES (?,?,?,?,?,?,?)').run(id, `file:///inbox/${id}.jpg`, 1000, 400, 400, time, basis); }
function share(db, id, provider='instagram') { db.prepare('INSERT INTO batches VALUES (?,?,?,?,?)').run(id, 'caption snapshot', '[]', 100, 'LOCAL_INBOX'); db.prepare('INSERT INTO batch_asset_refs VALUES (?,?,?)').run(id, a, 0); db.prepare('INSERT INTO share_attempts VALUES (?,?,?,?,?,?,?)').run(id, id, provider, null, 100, 'HANDOFF_UNCONFIRMED', 'OS_SIGNAL'); }
test('valid local JPEG descriptor accepted', () => assert.doesNotThrow(() => validateImportedPhoto(photo)));
for (const change of [{id:'bad'}, {uri:'https://example.test/photo.jpg'}, {uri:`file:///inbox/${b}.jpg`}, {bytes:0}, {bytes:10485761}, {width:2049}, {height:-1}]) test('reject invalid photo '+JSON.stringify(change), () => assert.throws(() => validateImportedPhoto({...photo,...change})));
test('selected ids snapshot is independent', () => { const ids=[a,b]; const copy=selectIds(ids); ids.reverse(); assert.deepEqual(copy,[a,b]); });
test('cannot silently exceed ten or duplicate selection', () => { assert.throws(()=>selectIds([])); assert.throws(()=>selectIds([a,a])); assert.throws(()=>selectIds(Array(11).fill(a))); });
test('photo ordering does not mutate original', () => { const ids=[a,b]; assert.deepEqual(movePhoto(ids,1,-1),[b,a]); assert.deepEqual(ids,[a,b]); assert.deepEqual(movePhoto(ids,0,-1),ids); });
test('v1 migration preserves historical share and foreign keys', () => {
 const db=new DatabaseSync(':memory:'); db.exec(SCHEMA);
 db.prepare('INSERT INTO batches VALUES (?,?,?,?,?)').run('old','old caption','[]',1,'SYNTHETIC_FIXTURE');
 db.prepare('INSERT INTO share_attempts VALUES (?,?,?,?,?,?,?)').run('old','old','instagram',null,1,'USER_MARKED_POSTED','USER_REPORTED');
 db.exec(MIGRATION_2); assert.equal(db.prepare('SELECT version FROM schema_meta').get().version,2);
 assert.equal(db.prepare('SELECT caption FROM batches').get().caption,'old caption');
 assert.equal(db.prepare('SELECT state FROM share_attempts').get().state,'USER_MARKED_POSTED');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
 assert.throws(()=>db.prepare('INSERT INTO batch_asset_refs VALUES (?,?,?)').run('missing',a,0)); db.close();
});
test('recovery does not assign a false registration date', () => { const db=db2(); asset(db,a,null,'FIRST_OBSERVED'); const row=db.prepare('SELECT registered_at,basis FROM inbox_assets').get(); assert.equal(row.registered_at,null); assert.equal(row.basis,'FIRST_OBSERVED'); assert.throws(()=>asset(db,b,100,'FIRST_OBSERVED')); db.close(); });
test('duplicate import does not reset registration date', () => { const db=db2(); asset(db,a,100); db.prepare('INSERT OR IGNORE INTO inbox_assets VALUES (?,?,?,?,?,?,?)').run(a,`file:///inbox/${a}.jpg`,1000,400,400,200,'APP_REGISTERED'); assert.equal(db.prepare('SELECT registered_at FROM inbox_assets').get().registered_at,100); db.close(); });
test('unknown Instagram handoff suppresses auto-selection only for that intended target', () => { const db=db2(); asset(db,a); share(db,'s'); assert.equal(db.prepare(INBOX_QUERY).get('instagram').already_shared,1); assert.equal(db.prepare(INBOX_QUERY).get('threads').already_shared,0); db.close(); });
test('explicit cancellation permits re-selection; callback is never remote success', () => { const db=db2(); asset(db,a); share(db,'s'); db.exec("UPDATE share_attempts SET state='USER_REPORTED_CANCELLED',evidence='USER_REPORTED'"); assert.equal(db.prepare(INBOX_QUERY).get('instagram').already_shared,0); assert.throws(()=>db.exec("UPDATE share_attempts SET state='PUBLISHED'")); db.close(); });
test('interrupted inbox share retains unknown status and photo links', () => { const db=db2(); asset(db,a); share(db,'s'); db.exec("UPDATE share_attempts SET state='REQUESTED'"); db.exec(RECOVER_INTERRUPTED); assert.equal(db.prepare(INBOX_QUERY).get('instagram').already_shared,1); assert.equal(db.prepare('SELECT count(*) AS n FROM batch_asset_refs').get().n,1); db.close(); });
