CREATE TABLE IF NOT EXISTS reciters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_norm TEXT NOT NULL,
  country TEXT,
  avatar TEXT,
  hero_image TEXT,
  official_site TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reciters_norm ON reciters(name_norm);

CREATE TABLE IF NOT EXISTS recitations (
  id TEXT PRIMARY KEY,
  reciter_id TEXT REFERENCES reciters(id),
  reciter_norm TEXT NOT NULL,
  surah_number INTEGER,
  surah TEXT,
  year INTEGER,
  collection TEXT,
  mosque TEXT,
  occasion TEXT,
  recording_date TEXT,
  title TEXT,
  rare INTEGER NOT NULL DEFAULT 0,
  canonical_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recitations_canonical ON recitations(canonical_key);
CREATE INDEX IF NOT EXISTS idx_recitations_reciter ON recitations(reciter_norm);
CREATE INDEX IF NOT EXISTS idx_recitations_surah ON recitations(surah_number);
CREATE INDEX IF NOT EXISTS idx_recitations_year ON recitations(year);

CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  recitation_id TEXT NOT NULL REFERENCES recitations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_url TEXT,
  audio_url TEXT,
  video_url TEXT,
  embed_url TEXT,
  thumbnail TEXT,
  title TEXT,
  quality_label TEXT,
  bitrate INTEGER,
  codec TEXT,
  sample_rate INTEGER,
  channels INTEGER,
  duration INTEGER,
  file_size INTEGER,
  original INTEGER NOT NULL DEFAULT 0,
  restored INTEGER NOT NULL DEFAULT 0,
  remastered INTEGER NOT NULL DEFAULT 0,
  corrected INTEGER NOT NULL DEFAULT 0,
  refined INTEGER NOT NULL DEFAULT 0,
  partial INTEGER NOT NULL DEFAULT 0,
  downloadable INTEGER NOT NULL DEFAULT 1,
  quality_score INTEGER NOT NULL DEFAULT 0,
  discovered_from TEXT,
  original_source TEXT,
  archived_from TEXT,
  uploader TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.5,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_variants_recitation ON variants(recitation_id);
CREATE INDEX IF NOT EXISTS idx_variants_provider ON variants(provider);
CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_audio ON variants(recitation_id,audio_url) WHERE audio_url IS NOT NULL AND audio_url <> '';

CREATE TABLE IF NOT EXISTS sources_seen (
  url TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  status TEXT NOT NULL,
  snapshot_url TEXT,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_host ON sources_seen(host);

CREATE VIRTUAL TABLE IF NOT EXISTS recitations_fts USING fts5(id UNINDEXED,text,tokenize='unicode61 remove_diacritics 2');
