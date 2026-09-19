import { platformBridge, type ManagedFile } from '../../modules/local-platform';
import { HASH, mayPurgeInbox, mayPurgeStaging, type Resolution } from '../domain/lifecycle';
import { database } from '../storage/history';
import { RESET_ROWS } from '../storage/migration3';

type Asset = { id: string; uri: string; decided_at: number | null };
async function resolutions(assetId: string): Promise<Resolution[]> {
  return (await database()).getAllAsync<Resolution>(`SELECT s.state,r.resolved_at AS resolvedAt FROM batch_asset_refs b
    JOIN share_attempts s ON s.batch_id=b.batch_id LEFT JOIN attempt_resolution r ON r.attempt_id=s.id WHERE b.asset_id=?`, assetId);
}
export async function resumeDeletions(): Promise<void> {
  const db = await database();
  // Also retry completed tombstones if an identical photo was brought in again.
  const rows = await db.getAllAsync<{uri: string; asset_id: string | null}>('SELECT uri,asset_id FROM file_deletions');
  for (let i = 0; i < rows.length; i += 100) {
    const group = rows.slice(i, i + 100);
    const removed = await platformBridge().deleteManagedFiles(group.map(r => r.uri));
    if (removed.some(uri => !group.some(row => row.uri === uri))) throw new Error('INVALID_DELETE_RESULT');
    await db.withExclusiveTransactionAsync(async t => {
      for (const uri of removed) {
        await t.runAsync('UPDATE file_deletions SET done_at=? WHERE uri=?', Date.now(), uri);
        const asset = group.find(r => r.uri === uri)?.asset_id;
        if (asset) await t.runAsync("UPDATE asset_dispositions SET state='PURGED' WHERE asset_id=?", asset);
      }
    });
    if (removed.length !== group.length) throw new Error('DELETE_INCOMPLETE');
  }
}
async function queueDeletions(files: {uri: string; assetId: string | null}[]) {
  await (await database()).withExclusiveTransactionAsync(async t => {
    for (const file of files) {
      if (file.assetId) await t.runAsync("INSERT INTO asset_dispositions VALUES (?,'PURGING',?) ON CONFLICT(asset_id) DO UPDATE SET state='PURGING'", file.assetId, Date.now());
      await t.runAsync('INSERT INTO file_deletions VALUES (?,?,?,NULL) ON CONFLICT(uri) DO UPDATE SET done_at=NULL', file.uri, file.assetId, Date.now());
    }
  });
  await resumeDeletions();
}
export async function purgeSelected(ids: string[]): Promise<void> {
  if (!ids.length || ids.length > 10 || new Set(ids).size !== ids.length || ids.some(id => !HASH.test(id))) throw new Error('INVALID_PHOTO_SELECTION');
  const db = await database(); const files = [];
  for (const id of ids) {
    const asset = await db.getFirstAsync<Asset>('SELECT id,uri FROM inbox_assets WHERE id=?', id);
    if (!asset) throw new Error('PHOTO_UNAVAILABLE');
    if (!mayPurgeInbox({ discardedAt: null, days: [], attempts: await resolutions(id) }, Date.now(), true)) throw new Error('UNCONFIRMED_SHARES_PROTECTED');
    files.push({uri: asset.uri, assetId: id});
  }
  // Only inbox copies are manually deleted. Recent staging is protected for the receiver.
  await queueDeletions(files);
}
export async function collectExpired(): Promise<number> {
  const db = await database(); const now = Date.now();
  const assets = await db.getAllAsync<Asset>(`SELECT a.id,a.uri,d.decided_at FROM inbox_assets a LEFT JOIN asset_dispositions d ON d.asset_id=a.id
    WHERE d.state IS NULL OR d.state='DISCARDED'`);
  const selected: {uri: string; assetId: string | null}[] = [];
  for (const asset of assets) {
    const days = await db.getAllAsync<{archivedAt: number | null}>(`SELECT DISTINCT d.archived_at AS archivedAt FROM batch_revisions r
      JOIN daily_batches d ON d.service_date=r.service_date, json_each(r.asset_ids_json) j WHERE j.value=?`, asset.id);
    if (mayPurgeInbox({ discardedAt: asset.decided_at, days, attempts: await resolutions(asset.id) }, now)) selected.push({uri: asset.uri, assetId: asset.id});
  }
  const managed = await platformBridge().managedFiles();
  for (const file of managed.filter((f: ManagedFile) => f.kind === 'STAGING')) {
    const attempts = await db.getAllAsync<Resolution>(`SELECT s.state,r.resolved_at AS resolvedAt FROM batches b
      JOIN share_attempts s ON s.batch_id=b.id LEFT JOIN attempt_resolution r ON r.attempt_id=s.id,
      json_each(b.files_json) j WHERE j.value=?`, file.uri);
    if (mayPurgeStaging(attempts, file.modifiedAt, now)) selected.push({uri: file.uri, assetId: null});
  }
  if (selected.length) await queueDeletions(selected);
  return selected.length;
}
export async function resetPending(): Promise<boolean> {
  return !!await (await database()).getFirstAsync("SELECT value FROM local_settings WHERE key='reset_pending'");
}
export async function resetLocalData(): Promise<void> {
  const db = await database();
  if (!await resetPending()) {
    if (await db.getFirstAsync("SELECT 1 FROM share_attempts WHERE state IN ('REQUESTED','HANDOFF_UNCONFIRMED','SHARE_ERROR') LIMIT 1")) throw new Error('UNCONFIRMED_SHARES_PROTECTED');
    await db.runAsync("INSERT OR REPLACE INTO local_settings VALUES ('reset_pending','1')");
  }
  // Idempotent reset journal survives an interrupted deletion, and never touches originals.
  await platformBridge().setReminder(false, 9, 0);
  await platformBridge().disconnectSource();
  const files = await platformBridge().managedFiles();
  for (let i = 0; i < files.length; i += 100) {
    const group = files.slice(i, i + 100).map(f => f.uri);
    const removed = await platformBridge().deleteManagedFiles(group);
    if (removed.length !== group.length || removed.some(uri => !group.includes(uri))) throw new Error('RESET_INCOMPLETE');
  }
  await db.withExclusiveTransactionAsync(async t => { await t.execAsync(RESET_ROWS); });
}
