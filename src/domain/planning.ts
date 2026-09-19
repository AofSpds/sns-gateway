const DAY = 86_400_000;
const KST = 9 * 3_600_000;
export const ZONE = 'Asia/Seoul';
export type Candidate = { id: string; registeredAt: number | null; timestampBasis: 'APP_REGISTERED' | 'FIRST_OBSERVED'; state: 'READY' | 'INVALID_MEDIA'; alreadyShared: boolean };
export function validateTime(hour: number, minute: number): void {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error('INVALID_LOCAL_TIME');
}
export function dayWindow(now: number, hour = 9, minute = 0) {
  validateTime(hour, minute);
  if (!Number.isSafeInteger(now) || now < 0 || now > 253_402_000_000_000) throw new Error('INVALID_INSTANT');
  const start = Math.floor((now + KST) / DAY) * DAY - KST;
  return { serviceDate: new Date(start + KST).toISOString().slice(0, 10), start, cutoff: start + (hour * 60 + minute) * 60_000 };
}
export function nextReminder(now: number, hour = 9, minute = 0): number {
  const { cutoff } = dayWindow(now, hour, minute);
  return now < cutoff ? cutoff : cutoff + DAY;
}
export function selectToday(candidates: Candidate[], now: number, limit = 10) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('INVALID_LIMIT');
  const window = dayWindow(now);
  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (!candidate.id || unique.has(candidate.id)) throw new Error('DUPLICATE_ASSET_ID');
    unique.set(candidate.id, candidate);
  }
  const selectable = candidates.filter(asset => asset.state === 'READY' && !asset.alreadyShared);
  const needsDateConfirmation = selectable.filter(asset => asset.timestampBasis !== 'APP_REGISTERED' || asset.registeredAt === null);
  const eligible = selectable.filter(asset => asset.timestampBasis === 'APP_REGISTERED' && asset.registeredAt !== null && Number.isSafeInteger(asset.registeredAt) && asset.registeredAt >= window.start && asset.registeredAt < window.cutoff);
  // Never silently truncate a user's photos or automatically split into posts.
  return { ...window, eligible, needsDateConfirmation, requiresSelection: eligible.length > limit };
}
export function compareInventory(previousIds: string[], currentIds: string[], hasBaseline: boolean) {
  const known = new Set(previousIds);
  const unique = [...new Set(currentIds)];
  return { baselineOnly: !hasBaseline, newlyObserved: hasBaseline ? unique.filter(id => !known.has(id)) : [], snapshot: unique };
}
