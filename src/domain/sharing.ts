export type ShareOutcome = 'REQUESTED' | 'HANDOFF_UNCONFIRMED' | 'CANCELLED_OBSERVED' | 'SHARE_ERROR' | 'USER_MARKED_POSTED' | 'USER_REPORTED_CANCELLED';
export type NativeOutcome = 'HANDOFF_UNCONFIRMED' | 'CANCELLED_OBSERVED';
export type NativeResult = { outcome: NativeOutcome; observedTarget: string | null };
export const labels: Record<ShareOutcome, string> = {
  REQUESTED: '공유 요청 기록됨', HANDOFF_UNCONFIRMED: '공유 시도 · 게시 여부 미확인',
  CANCELLED_OBSERVED: '공유 화면 취소 관측', SHARE_ERROR: '공유 실행 오류 · 게시 여부 미확인',
  USER_MARKED_POSTED: '사용자가 게시 완료로 표시', USER_REPORTED_CANCELLED: '사용자가 취소했다고 표시',
};
export function captionText(value: string): string {
  if (typeof value !== 'string' || value.length > 2200 || /\u0000/.test(value)) throw new Error('INVALID_CAPTION');
  return value;
}
export function validateLocalUris(uris: string[]): void {
  if (uris.length < 1 || uris.length > 10 || new Set(uris).size !== uris.length) throw new Error('INVALID_PHOTO_SELECTION');
  for (const uri of uris) {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'file:' || parsed.hostname || parsed.search || parsed.hash) throw new Error('LOCAL_FILES_ONLY');
  }
}
export function userOutcome(state: ShareOutcome, posted: boolean): ShareOutcome {
  if (state === 'REQUESTED') throw new Error('ATTEMPT_IN_PROGRESS');
  return posted ? 'USER_MARKED_POSTED' : 'USER_REPORTED_CANCELLED';
}
export class SingleFlight {
  private active = false;
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active) throw new Error('ACTION_IN_PROGRESS');
    this.active = true;
    try { return await operation(); } finally { this.active = false; }
  }
}
