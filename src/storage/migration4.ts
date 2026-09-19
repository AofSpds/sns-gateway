// F001/F002: additive indexes and durable retry order; no old rows are rewritten.
export const MIGRATION_4 = `
BEGIN IMMEDIATE;
CREATE TABLE source_retry_attempts (
 source_id TEXT NOT NULL, entry_key TEXT NOT NULL,
 attempt_count INTEGER NOT NULL CHECK(attempt_count>=1),
 last_attempt_order INTEGER NOT NULL CHECK(last_attempt_order>=1), last_attempt_at INTEGER NOT NULL,
 outcome TEXT NOT NULL CHECK(outcome IN ('STARTED','SKIPPED','ERROR','IMPORTED')),
 PRIMARY KEY(source_id,entry_key),
 FOREIGN KEY(source_id,entry_key) REFERENCES source_entries(source_id,entry_key)
);
CREATE INDEX share_history_cursor ON share_attempts(started_at DESC,id DESC);
CREATE INDEX share_unresolved_cursor ON share_attempts(started_at DESC,id DESC)
 WHERE state IN ('REQUESTED','HANDOFF_UNCONFIRMED','SHARE_ERROR');
UPDATE schema_meta SET version=4;
COMMIT;
`;
