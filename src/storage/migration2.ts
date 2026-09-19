// Add inbox support without deleting SG-01 history. Foreign keys are restored and checked by the caller.
export const MIGRATION_2 = `
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;
CREATE TABLE batches_next (
 id TEXT PRIMARY KEY, caption TEXT NOT NULL CHECK(length(caption)<=2200),
 files_json TEXT NOT NULL CHECK(json_valid(files_json)), created_at INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('SYNTHETIC_FIXTURE','LOCAL_INBOX'))
);
INSERT INTO batches_next SELECT * FROM batches;
DROP TABLE batches;
ALTER TABLE batches_next RENAME TO batches;
CREATE TABLE inbox_assets (
 id TEXT PRIMARY KEY CHECK(length(id)=64), uri TEXT NOT NULL UNIQUE,
 bytes INTEGER NOT NULL CHECK(bytes BETWEEN 3 AND 10485760),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 2048), height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 2048),
 registered_at INTEGER, basis TEXT NOT NULL CHECK(basis IN ('APP_REGISTERED','FIRST_OBSERVED')),
 CHECK((basis='APP_REGISTERED' AND registered_at IS NOT NULL) OR (basis='FIRST_OBSERVED' AND registered_at IS NULL))
);
CREATE TABLE batch_asset_refs (
 batch_id TEXT NOT NULL REFERENCES batches(id), asset_id TEXT NOT NULL REFERENCES inbox_assets(id),
 position INTEGER NOT NULL, PRIMARY KEY(batch_id, asset_id), UNIQUE(batch_id, position)
);
CREATE TABLE local_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
UPDATE schema_meta SET version=2;
COMMIT;
PRAGMA foreign_keys = ON;
`;
export const INBOX_QUERY = `SELECT a.*, EXISTS (
 SELECT 1 FROM batch_asset_refs b JOIN share_attempts s ON s.batch_id=b.batch_id
 WHERE b.asset_id=a.id AND s.intended_target=? AND s.state NOT IN ('CANCELLED_OBSERVED','USER_REPORTED_CANCELLED')
) AS already_shared FROM inbox_assets a ORDER BY COALESCE(a.registered_at,0) DESC, a.id`;
