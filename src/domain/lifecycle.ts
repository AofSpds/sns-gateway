import { dayWindow } from './planning.ts';
import { captionText } from './sharing.ts';

export const RETENTION_MS = 7 * 86_400_000;
export const STORAGE_LIMIT = 524_288_000;
export const HASH = /^[a-f0-9]{64}$/;
export type SourceScan = { sourceId: string; kind: 'android_folder' | 'ios_album'; label: string; items: string[] };
export function validateScan(scan: SourceScan): void {
  if (!HASH.test(scan.sourceId) || !['android_folder', 'ios_album'].includes(scan.kind)
    || typeof scan.label !== 'string' || scan.label.length > 300 || scan.items.length > 2000
    || scan.items.some(id => !HASH.test(id)) || new Set(scan.items).size !== scan.items.length) throw new Error('INVALID_SOURCE_SCAN');
}
export function dateInstant(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_SERVICE_DATE');
  const n = Date.parse(date + 'T00:00:00+09:00');
  if (!Number.isSafeInteger(n) || n < 0 || dayWindow(n).serviceDate !== date) throw new Error('INVALID_SERVICE_DATE');
  return n;
}
export function shiftDate(date: string, days: number): string {
  if (!Number.isInteger(days) || Math.abs(days) > 366) throw new Error('INVALID_DATE_SHIFT');
  return dayWindow(dateInstant(date) + days * 86_400_000).serviceDate;
}
export function validateDraft(date: string, ids: string[], caption: string): void {
  dateInstant(date); captionText(caption);
  if (ids.length > 10 || new Set(ids).size !== ids.length || ids.some(id => !HASH.test(id))) throw new Error('INVALID_PHOTO_SELECTION');
}
export function validateReminderContext(value: { token: string; serviceDate: string; basis: string } | null) {
  if (!value) return null;
  dateInstant(value.serviceDate);
  if (!value.token || value.token.length > 150 || !['SCHEDULED_DATE', 'DELIVERY_DATE'].includes(value.basis)) throw new Error('INVALID_REMINDER_CONTEXT');
  return value;
}
export type Resolution = { state: string; resolvedAt: number | null };
export function isResolved(attempt: Resolution): boolean {
  return ['USER_MARKED_POSTED', 'USER_REPORTED_CANCELLED', 'CANCELLED_OBSERVED'].includes(attempt.state);
}
export type RetentionFact = {
  discardedAt: number | null;
  days: { archivedAt: number | null }[];
  attempts: Resolution[];
};
export function mayPurgeInbox(fact: RetentionFact, now: number, explicitlySelected = false): boolean {
  if (!Number.isSafeInteger(now) || now < 0 || fact.attempts.some(a => !isResolved(a))) return false;
  if (explicitlySelected) return true; // Caller must show a destructive confirmation first.
  const old = (at: number | null) => at !== null && Number.isSafeInteger(at) && at >= 0 && at <= now - RETENTION_MS;
  if (fact.attempts.some(a => !old(a.resolvedAt))) return false;
  if (fact.days.some(d => !old(d.archivedAt))) return false;
  return old(fact.discardedAt) || fact.days.length > 0;
}
export function mayPurgeStaging(attempts: Resolution[], modifiedAt: number, now: number): boolean {
  return Number.isSafeInteger(modifiedAt) && modifiedAt >= 0 && modifiedAt <= now - RETENTION_MS
    && attempts.every(a => isResolved(a) && a.resolvedAt !== null && a.resolvedAt >= 0 && a.resolvedAt <= now - RETENTION_MS);
}
