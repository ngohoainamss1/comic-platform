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
    await db.execute(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_seed TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comic_id INTEGER NOT NULL,
        chapter_id INTEGER DEFAULT NULL,
        user_id INTEGER NOT NULL,
        parent_id INTEGER DEFAULT NULL,
        reply_to_name TEXT DEFAULT NULL,
        content TEXT NOT NULL DEFAULT '',
        meme_url TEXT DEFAULT NULL,
        likes_count INTEGER NOT NULL DEFAULT 0,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS comment_likes (
        comment_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (comment_id, user_id),
        FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS user_bookmarks (
        user_id INTEGER NOT NULL,
        comic_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, comic_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS user_history (
        user_id INTEGER NOT NULL,
        comic_id INTEGER NOT NULL,
        chapter_id INTEGER NOT NULL,
        chapter_number REAL NOT NULL,
        progress INTEGER DEFAULT 0,
        total_pages INTEGER DEFAULT 0,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, comic_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
        FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
      )`
    );
    await db.execute(
      `CREATE TABLE IF NOT EXISTS genres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        comic_count INTEGER DEFAULT 0
      )`
    );
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_comments_chapter ON comments(comic_id, chapter_id, parent_id, created_at DESC)`
    );

    try { await db.execute('ALTER TABLE comics ADD COLUMN is_featured INTEGER DEFAULT 0'); } catch {}
    try { await db.execute('ALTER TABLE comics ADD COLUMN is_hidden INTEGER DEFAULT 0'); } catch {}
    try { await db.execute('ALTER TABLE comics ADD COLUMN translator TEXT DEFAULT ""'); } catch {}
    try { await db.execute('ALTER TABLE comics ADD COLUMN likes_count INTEGER DEFAULT 0'); } catch {}
    try { await db.execute('ALTER TABLE genres ADD COLUMN description TEXT DEFAULT ""'); } catch {}
    try { await db.execute('ALTER TABLE genres ADD COLUMN comic_count INTEGER DEFAULT 0'); } catch {}

    await db.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('site_name', 'VinaHentai')");
    await db.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('announcement_enabled', '0')");
    await db.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('announcement_text', '')");
    await db.execute("INSERT OR IGNORE INTO site_settings (key, value) VALUES ('maintenance_mode', '0')");

    // Seed some popular genre descriptions
    await db.execute(`UPDATE genres SET description = 'Nhân vật bước vào hành trình phiêu lưu, chiến đấu kịch tính kết hợp khám phá thế giới fantasy, dị giới.' WHERE slug = 'hanh-dong'`);
    await db.execute(`UPDATE genres SET description = 'Tác phẩm dành riêng cho độc giả trưởng thành, nội dung nhạy cảm.' WHERE slug = 'ngon-tinh'`);
    await db.execute(`UPDATE genres SET description = 'Biểu cảm nhân vật khi đạt cực khoái mạnh liệt: mắt đảo, lưỡi thè, mặt đỏ, nước dãi chảy ra.' WHERE slug = 'ahegao' OR slug = 'adult'`);

    migrated = true;
  } catch (err) {
    console.error('Migration warning:', err);
  }
}
