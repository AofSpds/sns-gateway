import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionText, labels, SingleFlight, userOutcome, validateLocalUris } from '../src/domain/sharing.ts';
import { providers, isProvider } from '../src/gateway/providers.ts';
test('providers are unverified share handoffs, never authenticated', () => {
  assert.equal(providers.length, 2); for (const p of providers) { assert.equal(p.compatibility, 'NOT_RUN'); assert.equal(p.mode, 'SHARE_HANDOFF'); }
});
test('unknown providers are not accepted', () => { assert.equal(isProvider('instagram'), true); assert.equal(isProvider('fake'), false); });
test('normal local files allowed', () => assert.doesNotThrow(() => validateLocalUris(['file:///local/a.jpg', 'file:///local/b.jpg'])));
for (const uri of ['https://example.test/a.jpg', 'file://external/a.jpg', 'file:///a.jpg?token=x', 'file:///a.jpg#x', 'content://another/app']) test('reject unapproved JS URI: ' + uri, () => assert.throws(() => validateLocalUris([uri])));
test('empty/duplicate photos rejected', () => { assert.throws(() => validateLocalUris([])); assert.throws(() => validateLocalUris(['file:///a.jpg', 'file:///a.jpg'])); });
test('caption has a bounded size and no null characters', () => { assert.equal(captionText('hello'), 'hello'); assert.throws(() => captionText('x'.repeat(2201))); assert.throws(() => captionText('a\0b')); });
test('user completion is explicitly user reported', () => { assert.equal(userOutcome('HANDOFF_UNCONFIRMED', true), 'USER_MARKED_POSTED'); assert.equal(userOutcome('HANDOFF_UNCONFIRMED', false), 'USER_REPORTED_CANCELLED'); assert.match(labels.HANDOFF_UNCONFIRMED, /미확인/); });
test('in-flight attempt cannot be marked complete', () => assert.throws(() => userOutcome('REQUESTED', true)));
test('duplicate taps execute only one operation', async () => {
  const flight = new SingleFlight(); let release; let calls = 0;
  const first = flight.run(() => { calls++; return new Promise(resolve => { release = resolve; }); });
  await assert.rejects(flight.run(async () => { calls++; }), /ACTION_IN_PROGRESS/);
  release('done'); assert.equal(await first, 'done'); assert.equal(calls, 1);
  await flight.run(async () => { calls++; }); assert.equal(calls, 2);
});
test('a rejected operation releases the mutex', async () => { const flight = new SingleFlight(); await assert.rejects(flight.run(async () => { throw new Error('fixture'); })); assert.equal(await flight.run(async () => 42), 42); });
