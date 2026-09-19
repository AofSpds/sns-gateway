import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA, RECOVER_INTERRUPTED } from '../src/storage/schema.ts';
function fixture() { const db = new DatabaseSync(':memory:'); db.exec(SCHEMA); return db; }
function batch(db, id) { db.prepare('INSERT INTO batches VALUES (?,?,?,?,?)').run(id, 'fixture', '["file:///fixture.jpg"]', 1, 'SYNTHETIC_FIXTURE'); }
function attempt(db, id, batchId, target, state = 'REQUESTED') { db.prepare('INSERT INTO share_attempts VALUES (?,?,?,?,?,?,?)').run(id, batchId, target, null, 1, state, 'LOCAL_REQUEST'); }
test('migration is repeatable without dropping data', () => { const db = fixture(); batch(db, 'b'); db.exec(SCHEMA); assert.equal(db.prepare('SELECT count(*) AS n FROM batches').get().n, 1); db.close(); });
test('orphan attempt rejected', () => { const db = fixture(); assert.throws(() => attempt(db, 'a', 'missing', 'instagram')); db.close(); });
test('duplicate attempt cannot create second share record', () => { const db = fixture(); batch(db, 'b'); attempt(db, 'a', 'b', 'instagram'); assert.throws(() => attempt(db, 'a', 'b', 'instagram')); db.close(); });
test('interrupted handoff recovered as unknown, not published or failed', () => { const db = fixture(); batch(db, 'b'); attempt(db, 'a', 'b', 'instagram'); db.exec(RECOVER_INTERRUPTED); assert.deepEqual({ ...db.prepare('SELECT state,evidence FROM share_attempts').get() }, { state: 'HANDOFF_UNCONFIRMED', evidence: 'RECOVERED_UNKNOWN' }); db.close(); });
test('one provider cancellation does not change another provider', () => { const db = fixture(); batch(db, 'b'); attempt(db, 'a', 'b', 'instagram', 'USER_MARKED_POSTED'); attempt(db, 't', 'b', 'threads', 'CANCELLED_OBSERVED'); db.exec(RECOVER_INTERRUPTED); assert.equal(db.prepare("SELECT state FROM share_attempts WHERE id='a'").get().state, 'USER_MARKED_POSTED'); db.close(); });
test('remote PUBLISHED is not a valid local-share state', () => { const db = fixture(); batch(db, 'b'); assert.throws(() => attempt(db, 'a', 'b', 'instagram', 'PUBLISHED')); db.close(); });
test('invalid JSON and real-photo modes are rejected by spike schema', () => { const db = fixture(); assert.throws(() => db.prepare('INSERT INTO batches VALUES (?,?,?,?,?)').run('b', 'x', 'invalid', 1, 'SYNTHETIC_FIXTURE')); assert.throws(() => db.prepare('INSERT INTO batches VALUES (?,?,?,?,?)').run('b', 'x', '[]', 1, 'REAL_PHOTO')); db.close(); });
