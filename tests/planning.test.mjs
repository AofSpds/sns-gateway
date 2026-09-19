import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareInventory, dayWindow, nextReminder, selectToday, validateTime } from '../src/domain/planning.ts';
const now = Date.parse('2026-09-19T00:20:00Z');
const candidate = (id, at, extra = {}) => ({ id, registeredAt: Date.parse(at), timestampBasis: 'APP_REGISTERED', state: 'READY', alreadyShared: false, ...extra });
test('KST service date and original 9 AM cutoff survive late opening', () => {
  assert.deepEqual(dayWindow(now), { serviceDate: '2026-09-19', start: Date.parse('2026-09-18T15:00:00Z'), cutoff: Date.parse('2026-09-19T00:00:00Z') });
});
for (const [time, included] of [['2026-09-18T14:59:59Z', false], ['2026-09-18T15:00:00Z', true], ['2026-09-18T23:59:59.999Z', true], ['2026-09-19T00:00:00Z', false], ['2026-09-19T01:00:00Z', false]]) {
  test('registration boundary ' + time, () => assert.equal(selectToday([candidate('a', time)], now).eligible.length === 1, included));
}
test('unknown folder timestamp requires user confirmation, never uses file mtime', () => {
  const result = selectToday([candidate('a', '2026-09-18T22:00:00Z', { timestampBasis: 'FIRST_OBSERVED' })], now);
  assert.equal(result.eligible.length, 0); assert.equal(result.needsDateConfirmation.length, 1);
});
test('missing registration is not silently included', () => assert.equal(selectToday([candidate('a', '', { registeredAt: null })], now).needsDateConfirmation.length, 1));
test('previously shared photos are not automatically selected', () => assert.equal(selectToday([candidate('a', '2026-09-18T22:00:00Z', { alreadyShared: true })], now).eligible.length, 0));
test('invalid image not selected', () => assert.equal(selectToday([candidate('a', '2026-09-18T22:00:00Z', { state: 'INVALID_MEDIA' })], now).eligible.length, 0));
test('duplicate IDs rejected rather than merging conflicting registration dates', () => assert.throws(() => selectToday([candidate('a', ''), candidate('a', '')], now), /DUPLICATE/));
test('too many photos are not silently dropped', () => { const result = selectToday(Array.from({ length: 11 }, (_, i) => candidate(String(i), '2026-09-18T22:00:00Z')), now); assert.equal(result.eligible.length, 11); assert.equal(result.requiresSelection, true); });
test('first folder connection baselines all pre-existing photos', () => assert.deepEqual(compareInventory([], ['a', 'b'], false), { baselineOnly: true, newlyObserved: [], snapshot: ['a', 'b'] }));
test('later folder observations compare complete snapshots', () => assert.deepEqual(compareInventory(['a'], ['a', 'b', 'b'], true), { baselineOnly: false, newlyObserved: ['b'], snapshot: ['a', 'b'] }));
test('next reminder rolls over after cutoff', () => assert.equal(nextReminder(now), Date.parse('2026-09-20T00:00:00Z')));
test('next reminder before cutoff stays today', () => assert.equal(nextReminder(Date.parse('2026-09-18T23:59:59Z')), Date.parse('2026-09-19T00:00:00Z')));
for (const pair of [[24, 0], [-1, 0], [9, 60], [1.2, 0], [9, NaN]]) test('invalid time ' + pair, () => assert.throws(() => validateTime(...pair)));
test('invalid instant rejected', () => assert.throws(() => dayWindow(NaN)));
test('invalid photo limit rejected', () => assert.throws(() => selectToday([], now, 0)));
