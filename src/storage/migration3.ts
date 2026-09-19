// Additive migration. Existing five-column batches and seven-column attempts are preserved.
export const MIGRATION_3 = `
BEGIN IMMEDIATE;
CREATE TABLE source_snapshots (
 source_id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('android_folder','ios_album')),
 label TEXT NOT NULL, baseline_at INTEGER NOT NULL, scanned_at INTEGER NOT NULL,
 present_json TEXT NOT NULL CHECK(json_valid(present_json))
);
CREATE TABLE source_entries (
 source_id TEXT NOT NULL REFERENCES source_snapshots(source_id), entry_key TEXT NOT NULL,
 first_observed_at INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('BASELINE','PENDING','IMPORTED','DISMISSED')),
 asset_id TEXT REFERENCES inbox_assets(id), PRIMARY KEY(source_id,entry_key)
);
CREATE TABLE daily_batches (
 service_date TEXT PRIMARY KEY, head_revision INTEGER NOT NULL CHECK(head_revision>=1),
 updated_at INTEGER NOT NULL, archived_at INTEGER
);
CREATE TABLE batch_revisions (
 service_date TEXT NOT NULL REFERENCES daily_batches(service_date), revision INTEGER NOT NULL,
 caption TEXT NOT NULL CHECK(length(caption)<=2200), asset_ids_json TEXT NOT NULL CHECK(json_valid(asset_ids_json) AND json_array_length(asset_ids_json)<=10),
 created_at INTEGER NOT NULL, PRIMARY KEY(service_date,revision)
);
CREATE TRIGGER revisions_are_immutable BEFORE UPDATE ON batch_revisions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_REVISION'); END;
CREATE TABLE attempt_revisions (
 attempt_id TEXT PRIMARY KEY REFERENCES share_attempts(id), service_date TEXT NOT NULL, revision INTEGER NOT NULL,
 FOREIGN KEY(service_date,revision) REFERENCES batch_revisions(service_date,revision)
);
CREATE TABLE attempt_resolution (attempt_id TEXT PRIMARY KEY REFERENCES share_attempts(id), resolved_at INTEGER NOT NULL);
-- The old records do not contain a completion timestamp. Start retention now, not at their request date.
INSERT INTO attempt_resolution SELECT id,CAST(strftime('%s','now') AS INTEGER)*1000 FROM share_attempts
 WHERE state IN ('USER_MARKED_POSTED','USER_REPORTED_CANCELLED','CANCELLED_OBSERVED');
CREATE TABLE asset_dispositions (
 asset_id TEXT PRIMARY KEY REFERENCES inbox_assets(id), state TEXT NOT NULL CHECK(state IN ('DISCARDED','PURGING','PURGED')), decided_at INTEGER NOT NULL
);
CREATE TABLE file_deletions (
 uri TEXT PRIMARY KEY, asset_id TEXT REFERENCES inbox_assets(id), requested_at INTEGER NOT NULL, done_at INTEGER
);
UPDATE schema_meta SET version=3;
COMMIT;
`;
export const ACTIVE_INBOX_QUERY = `SELECT a.*, EXISTS (
 SELECT 1 FROM batch_asset_refs b JOIN share_attempts s ON s.batch_id=b.batch_id
 WHERE b.asset_id=a.id AND s.intended_target=? AND s.state NOT IN ('CANCELLED_OBSERVED','USER_REPORTED_CANCELLED')
) AS already_shared FROM inbox_assets a
 WHERE NOT EXISTS (SELECT 1 FROM asset_dispositions d WHERE d.asset_id=a.id)
 ORDER BY COALESCE(a.registered_at,0) DESC, a.id`;
export const RESET_ROWS = `
DELETE FROM attempt_revisions; DELETE FROM attempt_resolution; DELETE FROM share_attempts;
DELETE FROM batch_asset_refs; DELETE FROM batches; DELETE FROM batch_revisions; DELETE FROM daily_batches;
DELETE FROM source_entries; DELETE FROM source_snapshots;
DELETE FROM file_deletions; DELETE FROM asset_dispositions; DELETE FROM inbox_assets; DELETE FROM local_settings;
`;
