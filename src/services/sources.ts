import { platformBridge } from '../../modules/local-platform';
import { acceptScan, acceptSourceImports } from '../storage/lifecycle';
import { validateScan, type SourceScan } from '../domain/lifecycle';
export type SourceStatus = { scan: SourceScan; pending: number; imported: number; skipped: number; baseline: boolean };
export async function syncSource(): Promise<SourceStatus | null> {
  const scan = await platformBridge().scanSource();
  if (!scan) return null;
  validateScan(scan);
  const result = await acceptScan(scan);
  if (result.baseline || !result.pending.length) return { scan, pending: result.pending.length, imported: 0, skipped: 0, baseline: result.baseline };
  const keys = result.pending.slice(0, 10);
  const imported = await platformBridge().importSource(scan.sourceId, keys);
  if (new Set(imported.records.map(r => r.entryKey)).size !== imported.records.length
    || imported.records.some(r => !keys.includes(r.entryKey))) throw new Error('INVALID_SOURCE_RESPONSE');
  await acceptSourceImports(scan.sourceId, imported.records);
  return { scan, pending: result.pending.length - imported.records.length, imported: imported.records.length, skipped: imported.skipped, baseline: false };
}
export async function connectSource(): Promise<SourceStatus | null> {
  const scan = await platformBridge().connectSource();
  if (!scan) return null;
  const result = await acceptScan(scan);
  // A newly selected source always starts with a fresh baseline, never a bulk import.
  return { scan, pending: result.pending.length, imported: 0, skipped: 0, baseline: result.baseline };
}
