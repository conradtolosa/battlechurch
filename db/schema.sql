-- Battlechurch save database (Cloudflare D1). Apply with dev/tools/cf_d1.py.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,              -- random player id (guests and Google players)
  google_sub TEXT UNIQUE,           -- Google account id once signed in, else NULL
  email TEXT,
  display_name TEXT,
  photo_url TEXT,
  data TEXT,                        -- the whole save (JSON), same shape the game used with Firebase
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,      -- SHA-256 of the cookie token (the token itself is never stored)
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_player ON sessions(player_id);
CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  player_id TEXT,
  message TEXT,
  stack TEXT,
  url TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS errors_at ON errors(at);
