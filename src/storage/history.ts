import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { platformBridge } from '../../modules/local-platform';
import { SCHEMA, RECOVER_INTERRUPTED } from './schema';
import { MIGRATION_2 } from './migration2';
import { selectIds } from '../domain/inbox';
import { captionText, userOutcome, type NativeResult, type ShareOutcome } from '../domain/sharing';
import { isProvider, type ProviderId } from '../gateway/providers';
export type HistoryRow = { id: string; intended_target: ProviderId; observed_target: string | null; state: ShareOutcome; evidence: string; started_at: number };
let open: Promise<SQLiteDatabase> | undefined;
export async function database() {
  if (!open) {
    open = (async () => {
      const directory = await platformBridge().storageDirectory();
      const db = await openDatabaseAsync('gateway.db', {}, directory);
      const version = await db.getFirstAsync<{ version: number }>("SELECT 1 AS version FROM sqlite_master WHERE name='schema_meta'");
      if (version) {
        const schema = await db.getFirstAsync<{ version: number }>('SELECT version FROM schema_meta');
        if (schema?.version !== 1 && schema?.version !== 2) { await db.closeAsync(); throw new Error('DATABASE_VERSION_UNSUPPORTED'); }
      }
      await db.execAsync(SCHEMA);
      const current = await db.getFirstAsync<{ version: number }>('SELECT version FROM schema_meta');
      if (current?.version === 1) {
        try { await db.execAsync(MIGRATION_2); }
        catch { await db.execAsync('ROLLBACK;').catch(() => undefined); await db.execAsync('PRAGMA foreign_keys=ON;'); await db.closeAsync(); throw new Error('MIGRATION_FAILED'); }
      }
      const violations = await db.getAllAsync('PRAGMA foreign_key_check');
      if (violations.length) { await db.closeAsync(); throw new Error('DATABASE_INTEGRITY_ERROR'); }
      await db.execAsync(RECOVER_INTERRUPTED);
      return db;
    })();
    open.catch(() => { open = undefined; });
  }
  return open;
}
export async function listHistory(): Promise<HistoryRow[]> {
  return (await database()).getAllAsync<HistoryRow>('SELECT * FROM share_attempts ORDER BY started_at DESC LIMIT 100');
}
export async function recordRequest(id: string, provider: ProviderId, uris: string[], caption: string, assetIds?: string[]) {
  if (!isProvider(provider)) throw new Error('UNKNOWN_PROVIDER');
  captionText(caption);
  if (assetIds) selectIds(assetIds);
  const db = await database();
  await db.withExclusiveTransactionAsync(async transaction => {
    await transaction.runAsync('INSERT INTO batches VALUES (?,?,?,?,?)', id, caption, JSON.stringify(uris), Date.now(), assetIds ? 'LOCAL_INBOX' : 'SYNTHETIC_FIXTURE');
    if (assetIds) for (const [position, assetId] of assetIds.entries()) {
      await transaction.runAsync('INSERT INTO batch_asset_refs VALUES (?,?,?)', id, assetId, position);
    }
    await transaction.runAsync('INSERT INTO share_attempts VALUES (?,?,?,?,?,?,?)', id, id, provider, null, Date.now(), 'REQUESTED', 'LOCAL_REQUEST');
  });
}
export async function recordNativeResult(id: string, result: NativeResult) {
  if (!['HANDOFF_UNCONFIRMED', 'CANCELLED_OBSERVED'].includes(result.outcome)) throw new Error('INVALID_OS_RESULT');
  const changed = await (await database()).runAsync("UPDATE share_attempts SET state=?,observed_target=?,evidence='OS_SIGNAL' WHERE id=? AND state='REQUESTED'", result.outcome, result.observedTarget, id);
  if (changed.changes !== 1) throw new Error('HISTORY_STATE_CONFLICT');
}
export async function recordError(id: string) {
  await (await database()).runAsync("UPDATE share_attempts SET state='SHARE_ERROR',evidence='LOCAL_REQUEST' WHERE id=? AND state='REQUESTED'", id);
}
export async function markUserOutcome(row: HistoryRow, posted: boolean) {
  const state = userOutcome(row.state, posted);
  const changed = await (await database()).runAsync("UPDATE share_attempts SET state=?,evidence='USER_REPORTED' WHERE id=? AND state=?", state, row.id, row.state);
  if (changed.changes !== 1) throw new Error('HISTORY_STATE_CONFLICT');
}
