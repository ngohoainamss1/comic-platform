CREATE TABLE IF NOT EXISTS authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    alt_titles TEXT DEFAULT '',
    description TEXT DEFAULT '',
    cover_file_id TEXT DEFAULT '',
    cover_gh_path TEXT DEFAULT '',
    status TEXT DEFAULT 'ongoing',
    author_id INTEGER DEFAULT NULL,
    is_featured INTEGER DEFAULT 0,
    is_hidden INTEGER DEFAULT 0,
    views_day INTEGER DEFAULT 0,
    views_week INTEGER DEFAULT 0,
    views_month INTEGER DEFAULT 0,
    views_total INTEGER DEFAULT 0,
    rating_avg REAL DEFAULT 5.0,
    rating_count INTEGER DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS comic_genres (
    comic_id INTEGER NOT NULL,
    genre_id INTEGER NOT NULL,
    PRIMARY KEY (comic_id, genre_id),
    FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comic_id INTEGER NOT NULL,
    chapter_number REAL NOT NULL,
    title TEXT DEFAULT '',
    views INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comic_id, chapter_number),
    FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chapter_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL,
    page_index INTEGER NOT NULL,
    tg_file_id TEXT NOT NULL,
    gh_fallback_path TEXT DEFAULT '',
    width INTEGER DEFAULT 1080,
    height INTEGER DEFAULT 1400,
    format TEXT DEFAULT 'avif',
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    feed_url TEXT NOT NULL,
    adapter_type TEXT DEFAULT 'rss',
    is_active INTEGER DEFAULT 1,
    last_synced_at DATETIME
);

CREATE TABLE IF NOT EXISTS sync_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL,
    comic_slug TEXT NOT NULL,
    chapter_number REAL NOT NULL,
    source_chapter_url TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    error_log TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES sync_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comic_watchlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comic_id INTEGER NOT NULL UNIQUE,
    source_id INTEGER NOT NULL,
    source_comic_url TEXT NOT NULL,
    last_known_chapter REAL DEFAULT 0,
    avg_release_hours REAL DEFAULT 168,
    check_interval_mins INTEGER DEFAULT 60,
    priority INTEGER DEFAULT 5,
    next_check_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_checked_at DATETIME,
    last_new_chapter_at DATETIME,
    consecutive_errors INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES sync_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chapter_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comic_id INTEGER NOT NULL,
    chapter_id INTEGER DEFAULT NULL,
    reason TEXT NOT NULL,
    detail TEXT DEFAULT '',
    status TEXT DEFAULT 'open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_comics_updated ON comics(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_comics_author ON comics(author_id);
CREATE INDEX IF NOT EXISTS idx_comics_top_day ON comics(views_day DESC);
CREATE INDEX IF NOT EXISTS idx_comics_top_week ON comics(views_week DESC);
CREATE INDEX IF NOT EXISTS idx_comics_top_month ON comics(views_month DESC);
CREATE INDEX IF NOT EXISTS idx_chapters_comic ON chapters(comic_id, chapter_number DESC);
CREATE INDEX IF NOT EXISTS idx_pages_chapter ON chapter_pages(chapter_id, page_index ASC);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_watchlist_due ON comic_watchlists(status, next_check_at ASC, priority DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status ON chapter_reports(status, created_at DESC);

INSERT OR IGNORE INTO genres (slug, name) VALUES
('hanh-dong', 'Hành Động'), ('chuyen-sinh', 'Chuyển Sinh'), ('ngon-tinh', 'Ngôn Tình'),
('hoc-duong', 'Học Đường'), ('kinh-di', 'Kinh Dị'), ('manhwa', 'Manhwa'),
('manga', 'Manga'), ('manhua', 'Manhua'), ('dam-my', 'Đam Mỹ'),
('bach-hop', 'Bách Hợp'), ('trinh-tham', 'Trinh Thám'), ('hai-huoc', 'Hài Hước'),
('phieu-luu', 'Phiêu Lưu'), ('gia-tuong', 'Giả Tưởng'), ('doi-thuong', 'Đời Thường'),
('the-thao', 'Thể Thao'), ('vo-thuat', 'Võ Thuật'), ('co-dai', 'Cổ Đại'),
('he-thong', 'Hệ Thống'), ('trong-sinh', 'Trọng Sinh'), ('hau-cung', 'Hậu Cung'),
('one-shot', 'One Shot');

INSERT OR IGNORE INTO site_settings (key, value) VALUES
('site_name', 'VinaReader'),
('announcement_enabled', '0'),
('announcement_text', ''),
('maintenance_mode', '0');

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_seed TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
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
);

CREATE TABLE IF NOT EXISTS comment_likes (
    comment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (comment_id, user_id),
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_chapter ON comments(comic_id, chapter_id, parent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_bookmarks (
    user_id INTEGER NOT NULL,
    comic_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, comic_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_history (
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
);
