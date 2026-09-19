export type ProviderId = 'instagram' | 'threads';
export const providers = [
  { id: 'instagram', name: 'Instagram', mode: 'SHARE_HANDOFF', compatibility: 'NOT_RUN' },
  { id: 'threads', name: 'Threads', mode: 'SHARE_HANDOFF', compatibility: 'NOT_RUN' },
] as const;
export function isProvider(value: string): value is ProviderId {
  return providers.some(provider => provider.id === value);
}
