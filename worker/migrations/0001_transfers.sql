PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS transfers (
 id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, password_hash TEXT,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, upload_expires_at INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','ready','deleting')),
 total_size INTEGER NOT NULL CHECK(total_size BETWEEN 0 AND 2147483648),
 quota_key TEXT NOT NULL, quota_day INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cleanup ON transfers(status, expires_at, upload_expires_at);
CREATE TABLE IF NOT EXISTS files (
 id TEXT PRIMARY KEY, transfer_id TEXT NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
 name TEXT NOT NULL, size INTEGER NOT NULL CHECK(size >= 0), object_key TEXT NOT NULL UNIQUE,
 upload_id TEXT, complete INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS transfer_files ON files(transfer_id);
CREATE TABLE IF NOT EXISTS admission_quotas (
 key TEXT NOT NULL, day INTEGER NOT NULL, bytes INTEGER NOT NULL, count INTEGER NOT NULL,
 PRIMARY KEY(key,day),
 CONSTRAINT quota_exceeded CHECK(bytes >= 0 AND count >= 0 AND ((key = 'global' AND bytes <= 21474836480 AND count <= 200) OR (key != 'global' AND bytes <= 4294967296 AND count <= 10)))
);
CREATE TABLE IF NOT EXISTS storage_budget (
 id INTEGER PRIMARY KEY CHECK(id=1), bytes INTEGER NOT NULL,
 CONSTRAINT quota_exceeded CHECK(bytes BETWEEN 0 AND 42949672960)
);
INSERT INTO storage_budget(id,bytes) VALUES(1,0) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at INTEGER NOT NULL);
