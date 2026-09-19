export const SCHEMA = `
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL);
INSERT INTO schema_meta(version) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM schema_meta);
CREATE TABLE IF NOT EXISTS batches (
 id TEXT PRIMARY KEY, caption TEXT NOT NULL CHECK(length(caption)<=2200),
 files_json TEXT NOT NULL CHECK(json_valid(files_json)), created_at INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind='SYNTHETIC_FIXTURE')
);
CREATE TABLE IF NOT EXISTS share_attempts (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES batches(id),
 intended_target TEXT NOT NULL CHECK(intended_target IN ('instagram','threads')),
 observed_target TEXT, started_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('REQUESTED','HANDOFF_UNCONFIRMED','CANCELLED_OBSERVED','SHARE_ERROR','USER_MARKED_POSTED','USER_REPORTED_CANCELLED')),
 evidence TEXT NOT NULL CHECK(evidence IN ('LOCAL_REQUEST','OS_SIGNAL','USER_REPORTED','RECOVERED_UNKNOWN'))
);
CREATE INDEX IF NOT EXISTS attempts_latest ON share_attempts(started_at DESC);
COMMIT;
`;
export const RECOVER_INTERRUPTED = `UPDATE share_attempts SET state='HANDOFF_UNCONFIRMED', evidence='RECOVERED_UNKNOWN' WHERE state='REQUESTED'`;
