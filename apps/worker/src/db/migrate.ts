import type { Client } from '@libsql/client/web';

let migrated = false;

export async function ensureSchemaMigrated(db: Client): Promise<void> {
  if (migrated) return;
  try {
    await db.execute(
      `CREATE TABLE IF NOT EXISTS chapter_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comic_id INTEGER NOT NULL,
        chapter_id INTEGER DEFAULT NULL,
        reason TEXT NOT NULL,
        detail TEXT DEFAULT '',
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    );
    try { await db.execute('ALTER TABLE comics ADD COLUMN is_featured INTEGER DEFAULT 0'); } catch {}
    try { await db.execute('ALTER TABLE comics ADD COLUMN is_hidden INTEGER DEFAULT 0'); } catch {}
    await db.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('site_name', 'VinaReader')");
    await db.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('announcement_enabled', '0')");
    await db.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('announcement_text', '')");
    await db.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('maintenance_mode', '0')");
    migrated = true;
  } catch (err) {
    console.error('Migration warning:', err);
  }
}
