import type { Client } from '@libsql/client/web';

let migrated = false;

export async function ensureSchemaMigrated(db: Client): Promise<void> {
  if (migrated) return;
  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS spotlight_campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        platform TEXT NOT NULL DEFAULT 'shopee',
        placement TEXT NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT DEFAULT '',
        cta_text TEXT DEFAULT 'Săn Deal Ngay',
        image_url TEXT NOT NULL,
        target_url TEXT NOT NULL,
        badge_text TEXT DEFAULT 'HOT',
        priority INTEGER DEFAULT 10,
        trigger_page INTEGER DEFAULT 4,
        cooldown_hours INTEGER DEFAULT 12,
        is_active INTEGER DEFAULT 1,
        clicks_total INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS spotlight_clicks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER NOT NULL,
        placement TEXT NOT NULL,
        ref_slug TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (campaign_id) REFERENCES spotlight_campaigns(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT DEFAULT '',
        detail TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS daily_metrics (
        metric_date TEXT PRIMARY KEY,
        views_count INTEGER NOT NULL DEFAULT 0,
        new_chapters INTEGER NOT NULL DEFAULT 0,
        new_comments INTEGER NOT NULL DEFAULT 0,
        new_users INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_seed TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
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
      )`,
      `CREATE TABLE IF NOT EXISTS comment_likes (
        comment_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (comment_id, user_id),
        FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS user_bookmarks (
        user_id INTEGER NOT NULL,
        comic_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, comic_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
      )`,
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
      )`,
      `CREATE TABLE IF NOT EXISTS genres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        comic_count INTEGER DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_comments_chapter ON comments(comic_id, chapter_id, parent_id, created_at DESC)`,
      `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('aff_smart_redirect_enabled', '1')`,
      `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('aff_cooldown_hours', '6')`,
      `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('aff_daily_cap', '2')`,
      `INSERT OR IGNORE INTO site_settings (key, value) VALUES ('aff_trigger_chance', '40')`
    ];

    statements.push(`CREATE INDEX IF NOT EXISTS idx_spotlight_campaigns_active 
        ON spotlight_campaigns(is_active, placement, priority DESC);
      CREATE INDEX IF NOT EXISTS idx_spotlight_clicks_campaign_date 
        ON spotlight_clicks(campaign_id, created_at DESC);`);
    await db.batch(statements, 'write');
    migrated = true;
  } catch (err) {
    console.error('Migration warning:', err);
  }
}
