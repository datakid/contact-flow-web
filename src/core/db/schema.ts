export const SCHEMA_VERSION = 1;

export const PRAGMAS = [
  "PRAGMA journal_mode=TRUNCATE",
  "PRAGMA synchronous=NORMAL",
  "PRAGMA cache_size=-65536",
  "PRAGMA temp_store=MEMORY",
  "PRAGMA foreign_keys=OFF"
];

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS contacts(
    rowid INTEGER PRIMARY KEY,
    id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    name_fold TEXT NOT NULL DEFAULT '',
    name_phonetic TEXT NOT NULL DEFAULT '',
    sort_key TEXT NOT NULL DEFAULT '',
    first_letter TEXT NOT NULL DEFAULT '#',
    company TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    starred INTEGER NOT NULL DEFAULT 0,
    phone_count INTEGER NOT NULL DEFAULT 0,
    import_batch TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS phones(contact_rowid INTEGER, position INTEGER, value TEXT, digits TEXT, digits_rev TEXT, e164 TEXT, label TEXT)`,
  `CREATE TABLE IF NOT EXISTS emails(contact_rowid INTEGER, position INTEGER, value TEXT, value_lower TEXT, label TEXT)`,
  `CREATE TABLE IF NOT EXISTS aliases(contact_rowid INTEGER, position INTEGER, value TEXT, value_fold TEXT)`,
  `CREATE TABLE IF NOT EXISTS groups(id INTEGER PRIMARY KEY, name TEXT UNIQUE, color TEXT, created_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS contact_groups(contact_rowid INTEGER, group_id INTEGER, PRIMARY KEY(contact_rowid, group_id))`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(search_text, tokenize='trigram remove_diacritics 1', content='', contentless_delete=1)`,
  `CREATE TABLE IF NOT EXISTS history(id TEXT PRIMARY KEY, created_at INTEGER, kind TEXT, label TEXT, affected INTEGER, payload BLOB)`,
  `CREATE TABLE IF NOT EXISTS mapping_presets(id TEXT PRIMARY KEY, name TEXT, signature TEXT, mapping TEXT, created_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_sort_key ON contacts(sort_key)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON contacts(updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_starred_sort ON contacts(starred, sort_key)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_name_phonetic ON contacts(name_phonetic)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_import_batch ON contacts(import_batch)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_phone_count ON contacts(phone_count)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_company_sort ON contacts(company, sort_key)`,
  `CREATE INDEX IF NOT EXISTS idx_phones_digits ON phones(digits)`,
  `CREATE INDEX IF NOT EXISTS idx_phones_digits_rev ON phones(digits_rev)`,
  `CREATE INDEX IF NOT EXISTS idx_phones_e164 ON phones(e164)`,
  `CREATE INDEX IF NOT EXISTS idx_phones_contact ON phones(contact_rowid)`,
  `CREATE INDEX IF NOT EXISTS idx_emails_lower ON emails(value_lower)`,
  `CREATE INDEX IF NOT EXISTS idx_emails_contact ON emails(contact_rowid)`,
  `CREATE INDEX IF NOT EXISTS idx_aliases_fold ON aliases(value_fold)`,
  `CREATE INDEX IF NOT EXISTS idx_aliases_contact ON aliases(contact_rowid)`,
  `CREATE INDEX IF NOT EXISTS idx_contact_groups_group ON contact_groups(group_id)`
];

export const STAGE_SCHEMA = [
  `DROP TABLE IF EXISTS import_stage`,
  `CREATE TABLE import_stage(
    seq INTEGER PRIMARY KEY,
    source INTEGER NOT NULL,
    contact_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    name_fold TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    phones TEXT NOT NULL DEFAULT '[]',
    emails TEXT NOT NULL DEFAULT '[]',
    aliases TEXT NOT NULL DEFAULT '[]',
    groups TEXT NOT NULL DEFAULT '[]',
    category TEXT NOT NULL DEFAULT 'new',
    match_rowid INTEGER,
    candidates TEXT NOT NULL DEFAULT '[]',
    reformatted INTEGER NOT NULL DEFAULT 0,
    included INTEGER NOT NULL DEFAULT 1,
    merged_into INTEGER,
    invalid_reason TEXT NOT NULL DEFAULT ''
  )`,
  `DROP TABLE IF EXISTS import_keys`,
  `CREATE TABLE import_keys(key TEXT, seq INTEGER)`,
  `CREATE INDEX idx_stage_keys ON import_keys(key)`,
  `CREATE INDEX idx_stage_category ON import_stage(category)`,
  `CREATE INDEX idx_stage_contact_id ON import_stage(contact_id)`
];
