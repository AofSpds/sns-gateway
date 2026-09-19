import { dateInstant, validateDraft, validateScan, type SourceScan } from '../domain/lifecycle';
import { validateImportedPhoto, type ImportedPhoto } from '../domain/inbox';
import { database } from './history';
export type DailyDraft = { serviceDate: string; revision: number; ids: string[]; caption: string; archivedAt: number | null };
export async function loadDay(date: string): Promise<DailyDraft> {
  dateInstant(date);
  const row = await (await database()).getFirstAsync<{ head_revision: number; caption: string; asset_ids_json: string; archived_at: number | null }>(
    'SELECT d.*,r.caption,r.asset_ids_json FROM daily_batches d JOIN batch_revisions r ON r.service_date=d.service_date AND r.revision=d.head_revision WHERE d.service_date=?', date);
  const legacyCaption = row ? null : await (await database()).getFirstAsync<{value: string}>("SELECT value FROM local_settings WHERE key='caption'");
  return row ? { serviceDate: date, revision: row.head_revision, ids: JSON.parse(row.asset_ids_json), caption: row.caption, archivedAt: row.archived_at }
    : { serviceDate: date, revision: 0, ids: [], caption: legacyCaption?.value ?? '오늘의 기록입니다.', archivedAt: null };
}
export async function saveDay(draft: DailyDraft): Promise<DailyDraft> {
  validateDraft(draft.serviceDate, draft.ids, draft.caption);
  const db = await database();
  let revision = draft.revision;
  await db.withExclusiveTransactionAsync(async t => {
    const current = await t.getFirstAsync<{ head_revision: number; archived_at: number | null }>('SELECT * FROM daily_batches WHERE service_date=?', draft.serviceDate);
    if ((current?.head_revision ?? 0) !== draft.revision) throw new Error('REVISION_CONFLICT');
    if (current?.archived_at != null) throw new Error('DAY_ARCHIVED');
    for (const id of draft.ids) {
      if (!await t.getFirstAsync('SELECT id FROM inbox_assets WHERE id=? AND NOT EXISTS(SELECT 1 FROM asset_dispositions WHERE asset_id=?)', id, id)) throw new Error('PHOTO_UNAVAILABLE');
    }
    const prior = current ? await t.getFirstAsync<{ asset_ids_json: string; caption: string }>('SELECT * FROM batch_revisions WHERE service_date=? AND revision=?', draft.serviceDate, current.head_revision) : null;
    const json = JSON.stringify(draft.ids);
    if (prior?.asset_ids_json === json && prior.caption === draft.caption) return;
    revision += 1;
    await t.runAsync('INSERT INTO daily_batches VALUES (?,?,?,NULL) ON CONFLICT(service_date) DO UPDATE SET head_revision=excluded.head_revision,updated_at=excluded.updated_at', draft.serviceDate, revision, Date.now());
    await t.runAsync('INSERT INTO batch_revisions VALUES (?,?,?,?,?)', draft.serviceDate, revision, draft.caption, json, Date.now());
  });
  return { ...draft, ids: [...draft.ids], revision };
}
export async function archiveDay(date: string, archived: boolean) {
  dateInstant(date);
  const result = await (await database()).runAsync('UPDATE daily_batches SET archived_at=? WHERE service_date=?', archived ? Date.now() : null, date);
  if (result.changes !== 1) throw new Error('DAY_NOT_SAVED');
}
export async function listDays(): Promise<{ service_date: string; head_revision: number; archived_at: number | null }[]> {
  return (await database()).getAllAsync('SELECT * FROM daily_batches ORDER BY service_date DESC LIMIT 90');
}
export async function acceptScan(scan: SourceScan): Promise<{ baseline: boolean; pending: string[] }> {
  validateScan(scan);
  const db = await database(); let baseline = false;
  await db.withExclusiveTransactionAsync(async t => {
    baseline = !await t.getFirstAsync('SELECT source_id FROM source_snapshots WHERE source_id=?', scan.sourceId);
    const now = Date.now();
    await t.runAsync('INSERT INTO source_snapshots VALUES (?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET label=excluded.label,scanned_at=excluded.scanned_at,present_json=excluded.present_json', scan.sourceId, scan.kind, scan.label, now, now, JSON.stringify(scan.items));
    // Keep all seen identities, including removed/re-added items. Failed imports remain pending.
    for (const key of scan.items) await t.runAsync('INSERT OR IGNORE INTO source_entries VALUES (?,?,?,?,NULL)', scan.sourceId, key, now, baseline ? 'BASELINE' : 'PENDING');
  });
  const pending = await pendingSourceKeys(db, scan.sourceId, scan.items);
  return { baseline, pending };
}
async function pendingSourceKeys(db: Awaited<ReturnType<typeof database>>, sourceId: string, present: string[]) {
  const rows = await db.getAllAsync<{entry_key: string}>(`SELECT e.entry_key FROM source_entries e
    LEFT JOIN source_retry_attempts r ON r.source_id=e.source_id AND r.entry_key=e.entry_key
    WHERE e.source_id=? AND e.state='PENDING' AND e.entry_key IN (SELECT value FROM json_each(?))
    ORDER BY COALESCE(r.last_attempt_order,0),e.first_observed_at,e.entry_key`, sourceId, JSON.stringify(present));
  return rows.map(r => r.entry_key);
}
// Record selection BEFORE native I/O. Even a thrown/interrupted import advances its turn.
export async function claimSourceTurn(scan: SourceScan): Promise<string[]> {
  validateScan(scan); const db = await database(); let keys: string[] = [];
  await db.withExclusiveTransactionAsync(async t => {
    keys = (await pendingSourceKeys(t, scan.sourceId, scan.items)).slice(0, 10);
    const previous = await t.getFirstAsync<{rank: number}>('SELECT COALESCE(MAX(last_attempt_order),0) AS rank FROM source_retry_attempts WHERE source_id=?', scan.sourceId);
    const rank = (previous?.rank ?? 0) + 1;
    if (!Number.isSafeInteger(rank)) throw new Error('RETRY_ORDER_EXHAUSTED');
    for (const key of keys) await t.runAsync(`INSERT INTO source_retry_attempts VALUES (?,?,1,?,?,'STARTED')
      ON CONFLICT(source_id,entry_key) DO UPDATE SET attempt_count=attempt_count+1,last_attempt_order=excluded.last_attempt_order,
      last_attempt_at=excluded.last_attempt_at,outcome='STARTED'`, scan.sourceId, key, rank, Date.now());
  });
  return keys;
}
export async function finishSourceTurn(sourceId: string, keys: string[], outcome: 'SKIPPED' | 'ERROR') {
  await (await database()).withExclusiveTransactionAsync(async t => {
    for (const key of keys) await t.runAsync(`UPDATE source_retry_attempts SET outcome=? WHERE source_id=? AND entry_key=?
      AND EXISTS (SELECT 1 FROM source_entries e WHERE e.source_id=? AND e.entry_key=? AND e.state='PENDING')`, outcome, sourceId, key, sourceId, key);
  });
}
export async function acceptSourceImports(sourceId: string, records: { entryKey: string; photo: ImportedPhoto }[]) {
  for (const record of records) validateImportedPhoto(record.photo);
  await (await database()).withExclusiveTransactionAsync(async t => {
    for (const { entryKey, photo } of records) {
      const pending = await t.getFirstAsync("SELECT 1 FROM source_entries WHERE source_id=? AND entry_key=? AND state='PENDING'", sourceId, entryKey);
      if (!pending) throw new Error('SOURCE_STATE_CONFLICT');
      // Unknown membership date stays unknown even when import succeeds today.
      await t.runAsync("INSERT OR IGNORE INTO inbox_assets VALUES (?,?,?,?,?,NULL,'FIRST_OBSERVED')", photo.id, photo.uri, photo.bytes, photo.width, photo.height);
      await t.runAsync("UPDATE source_entries SET state='IMPORTED',asset_id=? WHERE source_id=? AND entry_key=?", photo.id, sourceId, entryKey);
      await t.runAsync("UPDATE source_retry_attempts SET outcome='IMPORTED' WHERE source_id=? AND entry_key=?", sourceId, entryKey);
    }
  });
}
