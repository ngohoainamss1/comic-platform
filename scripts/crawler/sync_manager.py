# scripts/crawler/sync_manager.py
import os
import re
import time
import shutil
import tempfile
import argparse
import threading
from datetime import datetime, timezone
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
import httpx
import libsql_client
from slugify import slugify
from dotenv import load_dotenv

os.environ.setdefault("VIPS_CONCURRENCY", "1")

try:
    from curl_cffi import requests as curl_requests, CurlHttpVersion
except ImportError:
    curl_requests = None
    CurlHttpVersion = None

from scripts.pipeline.slicer import pack_and_compress_chapter_images
from scripts.pipeline.branding import apply_chapter_branding
from scripts.pipeline.compressor import compress_to_avif
from scripts.pipeline.uploader import (
    upload_to_telegram,
    upload_to_github_backup,
    upload_batch_to_telegram,
    upload_batch_to_github_backup,
)
from scripts.crawler.adapters.standard import StandardHtmlRssAdapter, SourceBlockedError

load_dotenv()

TURSO_URL = os.getenv("TURSO_DATABASE_URL", "").replace("libsql://", "https://")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "")
TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN", "")
TG_CHANNEL_ID = os.getenv("TG_STORAGE_CHANNEL_ID", "")
TG_ADMIN_ID = os.getenv("TG_ADMIN_CHAT_ID", "")
GH_TOKEN = os.getenv("GH_TOKEN", "")
GH_BACKUP_REPO = os.getenv("GH_BACKUP_REPO", "")
CRAWLER_COOKIE = os.getenv("CRAWLER_COOKIE", "").strip()
CRAWLER_PROXY = os.getenv("CRAWLER_PROXY", "").strip()
TEMP_DIR = os.path.join(tempfile.gettempdir(), "comic_ingest_work")

CHAPTER_WORKERS = int(os.getenv("CRAWLER_CHAPTER_WORKERS", "6"))
IMAGE_WORKERS = int(os.getenv("CRAWLER_IMAGE_WORKERS", "6"))
BATCH_LIMIT = int(os.getenv("CRAWLER_BATCH_LIMIT", "60"))
WATCHLIST_SCAN_LIMIT = int(os.getenv("CRAWLER_WATCHLIST_LIMIT", "35"))
MAX_RUNTIME_SECONDS = int(os.getenv("CRAWLER_MAX_RUNTIME_SECONDS", "1140"))
AVIF_MAX_WIDTH = int(os.getenv("AVIF_MAX_WIDTH", "1440"))
AVIF_QUALITY = int(os.getenv("AVIF_QUALITY", "80"))
AVIF_EFFORT = int(os.getenv("AVIF_EFFORT", "1"))
SLICE_TARGET_HEIGHT = int(os.getenv("SLICE_TARGET_HEIGHT", "3600"))
SLICE_MAX_HEIGHT = int(os.getenv("SLICE_MAX_HEIGHT", "4200"))
STRIP_SOURCE_WATERMARKS = os.getenv("STRIP_SOURCE_WATERMARKS", "1").strip() != "0"
BRAND_ENABLE_BANNERS = os.getenv("BRAND_ENABLE_BANNERS", "1").strip() != "0"

_DB_LOCK = threading.Lock()
_TG_LOCK = threading.Lock()
_STATE_LOCK = threading.Lock()
_TLS = threading.local()


class ImageNotFoundError(RuntimeError):
    pass


class HostCircuitBreaker:
    """Ngắt cầu dao cho từng tên miền nếu bị chặn (403/429/503/Cloudflare) liên tiếp."""

    def __init__(self, threshold: int = 3):
        self.threshold = threshold
        self._lock = threading.Lock()
        self._counts: dict[str, int] = defaultdict(int)
        self._tripped: dict[str, str] = {}

    def is_open(self, url_or_host: str) -> bool:
        host = urlparse(url_or_host).netloc.lower() if "://" in url_or_host else url_or_host.lower()
        with self._lock:
            return host in self._tripped

    def record_success(self, url_or_host: str):
        host = urlparse(url_or_host).netloc.lower() if "://" in url_or_host else url_or_host.lower()
        with self._lock:
            self._counts[host] = 0

    def record_block(self, url_or_host: str, reason: str) -> bool:
        host = urlparse(url_or_host).netloc.lower() if "://" in url_or_host else url_or_host.lower()
        with self._lock:
            self._counts[host] += 1
            if self._counts[host] >= self.threshold and host not in self._tripped:
                self._tripped[host] = reason
                return True
            return False

    def tripped_hosts(self) -> dict[str, str]:
        with self._lock:
            return dict(self._tripped)


def _is_dns_error(err: Exception) -> bool:
    msg = str(err).lower()
    return any(
        tok in msg
        for tok in (
            "could not resolve host",
            "name or service not known",
            "nodename nor servname",
            "getaddrinfo failed",
            "temporary failure in name resolution",
        )
    )


def _parse_utc_ts(raw: str | None) -> float | None:
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        if "T" not in s:
            s = s.replace(" ", "T")
        if not s.endswith("Z") and "+" not in s:
            s += "+00:00"
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def _get_curl_session():
    if curl_requests is None:
        return None
    sess = getattr(_TLS, "curl_session", None)
    if sess is None:
        sess = curl_requests.Session()
        _TLS.curl_session = sess
    return sess


_IMG_HTTPX = httpx.Client(
    timeout=30.0,
    follow_redirects=True,
    proxy=CRAWLER_PROXY or None,
    limits=httpx.Limits(max_connections=48, max_keepalive_connections=24),
)


def get_db():
    return libsql_client.create_client_sync(url=TURSO_URL, auth_token=TURSO_TOKEN)


def db_exec(db_state: dict, sql: str, args: list | None = None):
    params = args or []
    with _DB_LOCK:
        last_err = None
        for attempt in range(1, 4):
            try:
                return db_state["client"].execute(sql, params)
            except Exception as err:
                last_err = err
                try:
                    db_state["client"].close()
                except Exception:
                    pass
                time.sleep(0.3 * attempt)
                db_state["client"] = get_db()
        raise RuntimeError(f"Turso SQL lỗi sau 3 lần thử: {last_err}")


def db_batch(db_state: dict, stmts: list[tuple[str, list]]):
    if not stmts:
        return
    with _DB_LOCK:
        last_err = None
        for attempt in range(1, 4):
            try:
                return db_state["client"].batch(stmts)
            except Exception as err:
                last_err = err
                try:
                    db_state["client"].close()
                except Exception:
                    pass
                time.sleep(0.3 * attempt)
                db_state["client"] = get_db()
        raise RuntimeError(f"Turso Batch SQL lỗi sau 3 lần thử: {last_err}")


def ensure_watchlist_schema(db_state: dict):
    """Tự động tạo bảng authors, cột comics.author_id và bảng comic_watchlists trên Turso nếu chưa có."""
    db_exec(
        db_state,
        """
        CREATE TABLE IF NOT EXISTS authors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL
        )
        """,
    )
    try:
        db_exec(db_state, "ALTER TABLE comics ADD COLUMN author_id INTEGER DEFAULT NULL")
    except Exception:
        pass
    db_exec(db_state, "CREATE INDEX IF NOT EXISTS idx_comics_author ON comics(author_id)")
    db_exec(
        db_state,
        """
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
        )
        """,
    )
    db_exec(
        db_state,
        "CREATE INDEX IF NOT EXISTS idx_watchlist_due ON comic_watchlists(status, next_check_at ASC, priority DESC)",
    )


def compute_adaptive_schedule(
    *,
    comic_status: str,
    found_new_chapters: bool,
    avg_release_hours: float,
    last_new_chapter_ts: float | None,
    views_day: int,
    consecutive_errors: int,
) -> tuple[float, int, int, str]:
    """
    Tính toán lịch kiểm tra thích ứng:
    - Trả về (new_avg_release_hours, next_interval_mins, priority, watchlist_status)
    """
    now_ts = time.time()
    avg_h = max(6.0, min(720.0, float(avg_release_hours or 168.0)))

    # Tính priority dựa trên lượt xem ngày của độc giả VinaReader
    if views_day >= 500:
        priority = 10
    elif views_day >= 100:
        priority = 8
    elif views_day >= 20:
        priority = 6
    else:
        priority = 5

    if comic_status == "completed":
        return avg_h, 2880, 1, "completed"

    if consecutive_errors >= 5:
        return avg_h, 720, max(1, priority - 3), "active"
    if consecutive_errors > 0:
        backoff = min(360, 45 * (2 ** (consecutive_errors - 1)))
        return avg_h, int(backoff), priority, "active"

    if found_new_chapters:
        if last_new_chapter_ts is not None:
            elapsed_h = max(1.0, (now_ts - last_new_chapter_ts) / 3600.0)
            if elapsed_h <= 720.0:
                avg_h = round(avg_h * 0.65 + elapsed_h * 0.35, 2)
        # Vừa ra chap mới -> kiểm tra sát trong 30 phút (hay có chap đôi / nhóm dịch up liên tiếp)
        return avg_h, 30, min(10, priority + 2), "active"

    # Không có chap mới trong lần quét này
    hours_since_new = ((now_ts - last_new_chapter_ts) / 3600.0) if last_new_chapter_ts else 24.0

    if hours_since_new <= 24.0:
        interval = 45
    elif hours_since_new >= 720.0:  # > 30 ngày không có chap mới
        interval = 1440
        priority = max(2, priority - 2)
    else:
        # Gần sát chu kỳ ra chap dự kiến thì siết lịch xuống 30 phút
        remaining_h = avg_h - hours_since_new
        if remaining_h <= 6.0:
            interval = 30
        elif remaining_h <= 24.0:
            interval = 120
        else:
            interval = 360

    return avg_h, interval, priority, "active"


def upsert_watchlist(
    db_state: dict,
    *,
    comic_id: int,
    source_id: int,
    source_comic_url: str,
    latest_chap: float,
    comic_status: str,
    found_new_chapters: bool,
):
    row_res = db_exec(
        db_state,
        """
        SELECT w.avg_release_hours, w.last_new_chapter_at, w.consecutive_errors, c.views_day
        FROM comics c
        LEFT JOIN comic_watchlists w ON w.comic_id = c.id
        WHERE c.id = ? LIMIT 1
        """,
        [comic_id],
    )
    if row_res.rows:
        prev_avg = float(row_res.rows[0][0] or 168.0)
        last_new_ts = _parse_utc_ts(row_res.rows[0][1])
        views_day = int(row_res.rows[0][3] or 0)
    else:
        prev_avg, last_new_ts, views_day = 168.0, None, 0

    new_avg, interval_mins, priority, wl_status = compute_adaptive_schedule(
        comic_status=comic_status,
        found_new_chapters=found_new_chapters,
        avg_release_hours=prev_avg,
        last_new_chapter_ts=last_new_ts,
        views_day=views_day,
        consecutive_errors=0,
    )

    if found_new_chapters:
        db_exec(
            db_state,
            """
            INSERT INTO comic_watchlists (
                comic_id, source_id, source_comic_url, last_known_chapter,
                avg_release_hours, check_interval_mins, priority,
                next_check_at, last_checked_at, last_new_chapter_at, consecutive_errors, status
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?,
                datetime('now', '+' || ? || ' minutes'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?
            )
            ON CONFLICT(comic_id) DO UPDATE SET
                source_id = excluded.source_id,
                source_comic_url = excluded.source_comic_url,
                last_known_chapter = MAX(comic_watchlists.last_known_chapter, excluded.last_known_chapter),
                avg_release_hours = excluded.avg_release_hours,
                check_interval_mins = excluded.check_interval_mins,
                priority = excluded.priority,
                next_check_at = excluded.next_check_at,
                last_checked_at = CURRENT_TIMESTAMP,
                last_new_chapter_at = CURRENT_TIMESTAMP,
                consecutive_errors = 0,
                status = excluded.status
            """,
            [comic_id, source_id, source_comic_url, latest_chap, new_avg, interval_mins, priority, interval_mins, wl_status],
        )
    else:
        db_exec(
            db_state,
            """
            INSERT INTO comic_watchlists (
                comic_id, source_id, source_comic_url, last_known_chapter,
                avg_release_hours, check_interval_mins, priority,
                next_check_at, last_checked_at, last_new_chapter_at, consecutive_errors, status
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?,
                datetime('now', '+' || ? || ' minutes'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, ?
            )
            ON CONFLICT(comic_id) DO UPDATE SET
                source_id = excluded.source_id,
                source_comic_url = excluded.source_comic_url,
                last_known_chapter = MAX(comic_watchlists.last_known_chapter, excluded.last_known_chapter),
                avg_release_hours = excluded.avg_release_hours,
                check_interval_mins = excluded.check_interval_mins,
                priority = excluded.priority,
                next_check_at = excluded.next_check_at,
                last_checked_at = CURRENT_TIMESTAMP,
                consecutive_errors = 0,
                status = excluded.status
            """,
            [comic_id, source_id, source_comic_url, latest_chap, new_avg, interval_mins, priority, interval_mins, wl_status],
        )


def mark_watchlist_error(db_state: dict, watchlist_id: int):
    row = db_exec(db_state, "SELECT consecutive_errors FROM comic_watchlists WHERE id = ? LIMIT 1", [watchlist_id]).rows
    errs = (int(row[0][0]) if row else 0) + 1
    backoff_mins = min(720, 45 * (2 ** min(errs - 1, 4)))
    db_exec(
        db_state,
        """
        UPDATE comic_watchlists
        SET consecutive_errors = ?,
            last_checked_at = CURRENT_TIMESTAMP,
            next_check_at = datetime('now', '+' || ? || ' minutes')
        WHERE id = ?
        """,
        [errs, backoff_mins, watchlist_id],
    )


def heal_stale_failed_jobs(db_state: dict, force_all: bool = False) -> int:
    """Tự động hồi sinh các job lỗi cũ (> 12h) để thử cào lại khi CDN nguồn ổn định."""
    if force_all:
        count_res = db_exec(db_state, "SELECT COUNT(*) FROM sync_jobs WHERE status = 'pending' AND retry_count >= 3")
        count = int(count_res.rows[0][0]) if count_res.rows else 0
        if count > 0:
            db_exec(db_state, "UPDATE sync_jobs SET retry_count = 0 WHERE status = 'pending' AND retry_count >= 3")
        return count

    count_res = db_exec(
        db_state,
        "SELECT COUNT(*) FROM sync_jobs WHERE status = 'pending' AND retry_count >= 3 AND created_at <= datetime('now', '-12 hours')",
    )
    count = int(count_res.rows[0][0]) if count_res.rows else 0
    if count > 0:
        db_exec(
            db_state,
            "UPDATE sync_jobs SET retry_count = 0, created_at = CURRENT_TIMESTAMP WHERE status = 'pending' AND retry_count >= 3 AND created_at <= datetime('now', '-12 hours')",
        )
    return count


def send_admin_telegram(message: str):
    if not TG_BOT_TOKEN or not TG_ADMIN_ID:
        return
    try:
        url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
        with httpx.Client(timeout=15.0) as client:
            client.post(url, json={"chat_id": TG_ADMIN_ID, "text": message, "parse_mode": "HTML"})
    except Exception as e:
        print(f"[Cảnh báo] Không gửi được thông báo Telegram: {e}")


def _split_image_candidates(packed_url: str) -> tuple[list[str], list[str]]:
    explicit: list[str] = []
    guessed: list[str] = []
    for u in (x.strip() for x in packed_url.split("|") if x.strip()):
        if u not in explicit:
            explicit.append(u)
        m = re.match(r"^(https?://(?:img|cdn|sv)(\d+)\.[^/]+)(/.+)$", u, re.IGNORECASE)
        if m:
            host_tpl = re.sub(r"^(https?://(?:img|cdn|sv))\d+", r"\g<1>{}", m.group(1), flags=re.IGNORECASE)
            for idx in (1, 2, 3, 4):
                alt = f"{host_tpl.format(idx)}{m.group(3)}"
                if alt not in explicit and alt not in guessed:
                    guessed.append(alt)
    return explicit, guessed


def _download_single_url(url: str, dest_path: str, referer: str = ""):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    p = urlparse(referer) if referer else None
    root_ref = f"{p.scheme}://{p.netloc}/" if (p and p.scheme and p.netloc) else ""
    refs = list(dict.fromkeys([root_ref, referer, ""]))
    profiles = ["chrome", "edge", "safari"]
    last_err = None
    curl_sess = _get_curl_session()

    for attempt in range(1, 4):
        if attempt > 1:
            time.sleep(0.25 * attempt)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
            "Sec-Fetch-Dest": "image",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "cross-site",
        }
        ref = refs[(attempt - 1) % len(refs)]
        if ref:
            headers["Referer"] = ref
        if CRAWLER_COOKIE:
            headers["Cookie"] = CRAWLER_COOKIE

        try:
            if curl_sess is not None:
                proxies = {"http": CRAWLER_PROXY, "https": CRAWLER_PROXY} if CRAWLER_PROXY else None
                try:
                    res = curl_sess.get(
                        url,
                        headers=headers,
                        impersonate=profiles[(attempt - 1) % len(profiles)],
                        http_version=CurlHttpVersion.V1_1,
                        timeout=30,
                        allow_redirects=True,
                        proxies=proxies,
                    )
                except Exception as curl_err:
                    if _is_dns_error(curl_err):
                        res = _IMG_HTTPX.get(url, headers=headers)
                    else:
                        raise
            else:
                res = _IMG_HTTPX.get(url, headers=headers)

            if res.status_code in (404, 410):
                raise ImageNotFoundError(f"HTTP {res.status_code} ({url})")
            res.raise_for_status()
            if len(res.content) < 512:
                raise RuntimeError(f"Dữ liệu ảnh quá nhỏ ({len(res.content)} bytes)")
            with open(dest_path, "wb") as f:
                f.write(res.content)
            return
        except ImageNotFoundError:
            raise
        except Exception as e:
            last_err = e
            if _is_dns_error(e):
                break

    raise RuntimeError(f"Tải ảnh thất bại ({url}): {last_err}")


def download_image(packed_url: str, dest_path: str, referer: str = ""):
    explicit_urls, guessed_urls = _split_image_candidates(packed_url)
    last_err = None
    explicit_all_404 = True

    for cand_url in explicit_urls:
        try:
            _download_single_url(cand_url, dest_path, referer=referer)
            return
        except ImageNotFoundError as nf_err:
            last_err = nf_err
        except Exception as err:
            explicit_all_404 = False
            last_err = err

    for cand_url in guessed_urls:
        try:
            _download_single_url(cand_url, dest_path, referer=referer)
            return
        except ImageNotFoundError:
            pass
        except Exception as err:
            if not _is_dns_error(err):
                last_err = err

    if explicit_all_404:
        raise ImageNotFoundError(f"Ảnh không tồn tại trên CDN ({explicit_urls[0]}): {last_err}")
    raise RuntimeError(f"Tải ảnh thất bại ({explicit_urls[0]}): {last_err}")


def normalize_vn_slug(title: str) -> str:
    return slugify(title.replace("Đ", "D").replace("đ", "d"))


def _upload_cover(detail, slug: str, page_url: str) -> tuple[str, str]:
    if not detail.cover_url:
        return "", ""
    try:
        raw_cover = os.path.join(TEMP_DIR, f"{slug}_cover_raw.img")
        avif_cover = os.path.join(TEMP_DIR, f"{slug}_cover.avif")
        download_image(detail.cover_url, raw_cover, referer=page_url)
        compress_to_avif(raw_cover, avif_cover, max_width=720, quality=80, effort=AVIF_EFFORT)
        tg_id = upload_to_telegram(avif_cover, TG_BOT_TOKEN, TG_CHANNEL_ID, caption=f"Cover: {detail.title}")
        gh_path = upload_to_github_backup(avif_cover, f"covers/{slug}.avif", GH_BACKUP_REPO, GH_TOKEN)
        return tg_id, gh_path
    except Exception as e:
        print(f"[Lỗi ảnh bìa] {detail.title}: {e}")
        return "", ""


def sync_author(db_state: dict, author_name: str) -> int | None:
    clean_name = re.sub(r"\s+", " ", (author_name or "")).strip()
    if not clean_name or clean_name.lower() in {"đang cập nhật", "updating", "unknown", "n/a", "chưa rõ", "-"}:
        return None
    a_slug = normalize_vn_slug(clean_name)
    if not a_slug:
        return None
    db_exec(db_state, "INSERT OR IGNORE INTO authors (slug, name) VALUES (?, ?)", [a_slug, clean_name])
    row = db_exec(db_state, "SELECT id FROM authors WHERE slug = ? LIMIT 1", [a_slug]).rows
    return int(row[0][0]) if row else None


def sync_comic_genres(db_state: dict, comic_id: int, raw_genres: list[str]):
    if not raw_genres:
        return
    for raw_genre in raw_genres:
        clean_name = re.sub(r"\s+", " ", (raw_genre or "")).strip(" ,;-|")
        if not clean_name:
            continue
        g_slug = normalize_vn_slug(clean_name)
        if not g_slug:
            continue
        # Tự động thêm thể loại mới nếu chưa tồn tại trong DB
        db_exec(db_state, "INSERT OR IGNORE INTO genres (slug, name) VALUES (?, ?)", [g_slug, clean_name])
        g_row = db_exec(db_state, "SELECT id FROM genres WHERE slug = ? OR lower(name) = lower(?) LIMIT 1", [g_slug, clean_name]).rows
        if g_row:
            db_exec(
                db_state,
                "INSERT OR IGNORE INTO comic_genres (comic_id, genre_id) VALUES (?, ?)",
                [comic_id, int(g_row[0][0])],
            )


def ensure_comic_exists(db_state: dict, detail, page_url: str) -> tuple[int, str, bool]:
    slug = normalize_vn_slug(detail.title)
    author_id = sync_author(db_state, getattr(detail, "author", ""))

    existing = db_exec(
        db_state,
        "SELECT id, cover_file_id, status, description, alt_titles, author_id FROM comics WHERE slug = ? LIMIT 1",
        [slug],
    )
    if existing.rows:
        comic_id = int(existing.rows[0][0])
        old_cover = str(existing.rows[0][1] or "")
        old_status = str(existing.rows[0][2] or "ongoing")
        old_desc = str(existing.rows[0][3] or "")
        old_alt = str(existing.rows[0][4] or "")
        old_author_id = existing.rows[0][5]

        updates = []
        params = []
        if not old_cover and detail.cover_url:
            tg_id, gh_path = _upload_cover(detail, slug, page_url)
            if tg_id or gh_path:
                updates.extend(["cover_file_id = ?", "cover_gh_path = ?"])
                params.extend([tg_id, gh_path])
        if detail.status and detail.status != old_status:
            updates.append("status = ?")
            params.append(detail.status)
        if not old_desc and detail.description:
            updates.append("description = ?")
            params.append(detail.description)
        if not old_alt and detail.alt_titles:
            updates.append("alt_titles = ?")
            params.append(detail.alt_titles)
        if author_id is not None and not old_author_id:
            updates.append("author_id = ?")
            params.append(author_id)

        if updates:
            params.append(comic_id)
            db_exec(db_state, f"UPDATE comics SET {', '.join(updates)} WHERE id = ?", params)

        sync_comic_genres(db_state, comic_id, detail.genres)
        return comic_id, slug, False

    tg_id, gh_path = _upload_cover(detail, slug, page_url)
    db_exec(
        db_state,
        "INSERT INTO comics (slug, title, alt_titles, description, cover_file_id, cover_gh_path, status, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [slug, detail.title, detail.alt_titles, detail.description, tg_id, gh_path, detail.status, author_id],
    )
    comic_id = int(db_exec(db_state, "SELECT id FROM comics WHERE slug = ? LIMIT 1", [slug]).rows[0][0])
    sync_comic_genres(db_state, comic_id, detail.genres)
    return comic_id, slug, True


def _download_raw_task(
    raw_idx: int,
    img_url: str,
    chap_url: str,
    raw_dir: str,
) -> tuple[int, str | None, str, str | None]:
    raw_path = os.path.join(raw_dir, f"raw_{raw_idx:03d}.img")
    try:
        download_image(img_url, raw_path, referer=chap_url)
        return raw_idx, raw_path, img_url, None
    except ImageNotFoundError as nf_err:
        return raw_idx, None, img_url, str(nf_err)


def _process_job(
    db_state: dict,
    job,
    single_comic_url: str,
    comic_cache: dict[str, tuple[int, str]],
    published_by_comic: dict[str, list[float]],
    pending_gh_files: list[tuple[str, str]],
    breaker: HostCircuitBreaker,
    stop_event: threading.Event,
    run_t0: float,
):
    if stop_event.is_set() or (time.monotonic() - run_t0) >= MAX_RUNTIME_SECONDS:
        stop_event.set()
        return

    t0 = time.time()
    job_id, comic_slug, chap_num, chap_url = int(job[0]), str(job[2]), float(job[3]), str(job[4])
    p = urlparse(chap_url)
    chap_origin = f"{p.scheme}://{p.netloc}" if (p.scheme and p.netloc) else str(job[5])

    if breaker.is_open(chap_origin):
        print(f"  [Bỏ qua - Circuit Open] {comic_slug} Ch.{chap_num:g} ({chap_origin})")
        return

    work_dir = os.path.join(TEMP_DIR, f"job_{job_id}")
    raw_dir = os.path.join(work_dir, "raw")
    avif_dir = os.path.join(work_dir, "avif")
    chapter_id = None
    keep_work_dir = False

    try:
        adapter = StandardHtmlRssAdapter(chap_origin, chap_origin, delay_seconds=0.15)
        img_urls = adapter.fetch_chapter_images(chap_url, referer_url=single_comic_url or chap_origin)
        breaker.record_success(chap_origin)
        if not img_urls:
            raise RuntimeError("Không tìm thấy ảnh nào trong chương.")

        with _STATE_LOCK:
            cached = comic_cache.get(comic_slug)
        if cached is None:
            comic_row = db_exec(db_state, "SELECT id, title FROM comics WHERE slug = ? LIMIT 1", [comic_slug]).rows[0]
            cached = (int(comic_row[0]), str(comic_row[1]))
            with _STATE_LOCK:
                comic_cache[comic_slug] = cached
        comic_id, comic_title = cached

        with ThreadPoolExecutor(max_workers=IMAGE_WORKERS) as pool:
            futures = [
                pool.submit(_download_raw_task, idx, url, chap_url, raw_dir)
                for idx, url in enumerate(img_urls)
            ]
            dl_results = [fut.result() for fut in futures]

        dl_results.sort(key=lambda r: r[0])
        valid_raw_items: list[tuple[str, str]] = []
        skipped_404 = 0
        for raw_idx, rpath, rurl, nf_msg in dl_results:
            if rpath is None:
                skipped_404 += 1
                print(f"     [Bỏ qua ảnh 404 #{raw_idx + 1}] {nf_msg}")
                continue
            valid_raw_items.append((rpath, rurl))

        if not valid_raw_items:
            raise RuntimeError(f"Toàn bộ {len(img_urls)} ảnh của chương đều trả về 404 Not Found.")

        branded_paths, removed_wm_logs = apply_chapter_branding(
            valid_raw_items,
            work_dir=work_dir,
            comic_title=comic_title,
            chapter_num=chap_num,
            strip_source_wm=STRIP_SOURCE_WATERMARKS,
            add_own_banners=BRAND_ENABLE_BANNERS,
        )
        for wm_msg in removed_wm_logs:
            print(f"     [Xóa ảnh bản quyền web gốc] {wm_msg}")
        valid_raw_paths = branded_paths

        prepared_pages = pack_and_compress_chapter_images(
            valid_raw_paths,
            avif_dir,
            max_width=AVIF_MAX_WIDTH,
            quality=AVIF_QUALITY,
            effort=AVIF_EFFORT,
            target_height=SLICE_TARGET_HEIGHT,
            max_height=SLICE_MAX_HEIGHT,
        )
        shutil.rmtree(raw_dir, ignore_errors=True)

        tg_items = [
            (page["path"], f"{comic_title} - Ch.{chap_num:g} - P.{idx + 1}")
            for idx, page in enumerate(prepared_pages)
        ]
        with _TG_LOCK:
            tg_file_ids = upload_batch_to_telegram(tg_items, TG_BOT_TOKEN, TG_CHANNEL_ID, chunk_size=10)
            if len(tg_items) > 10:
                time.sleep(0.35)

        upsert_res = db_exec(
            db_state,
            "INSERT INTO chapters (comic_id, chapter_number, title) VALUES (?, ?, ?) "
            "ON CONFLICT(comic_id, chapter_number) DO UPDATE SET title = excluded.title RETURNING id",
            [comic_id, chap_num, f"Chapter {chap_num:g}"],
        )
        chapter_id = int(upsert_res.rows[0][0])

        has_gh = bool(GH_BACKUP_REPO and GH_TOKEN)
        batch_stmts: list[tuple[str, list]] = [
            ("DELETE FROM chapter_pages WHERE chapter_id = ?", [chapter_id]),
        ]
        gh_chunk: list[tuple[str, str]] = []
        for idx, page in enumerate(prepared_pages):
            clean_repo_path = f"chapters/{comic_slug}/ch-{chap_num:g}/{idx:03d}.avif" if has_gh else ""
            if has_gh:
                gh_chunk.append((page["path"], clean_repo_path))
            batch_stmts.append(
                (
                    "INSERT INTO chapter_pages (chapter_id, page_index, tg_file_id, gh_fallback_path, width, height, format) VALUES (?, ?, ?, ?, ?, ?, 'avif')",
                    [
                        chapter_id,
                        idx,
                        tg_file_ids[idx],
                        clean_repo_path,
                        page["width"],
                        page["height"],
                    ],
                )
            )
        batch_stmts.append(("UPDATE comics SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [comic_id]))
        batch_stmts.append(("UPDATE sync_jobs SET status = 'published' WHERE id = ?", [job_id]))
        db_batch(db_state, batch_stmts)

        with _STATE_LOCK:
            published_by_comic[comic_title].append(chap_num)
            if gh_chunk:
                pending_gh_files.extend(gh_chunk)
                keep_work_dir = True

        elapsed = time.time() - t0
        skip_note = f" (bỏ qua {skipped_404} ảnh 404)" if skipped_404 else ""
        print(
            f"  [OK] {comic_slug} Ch.{chap_num:g} ({len(valid_raw_paths)} ảnh gốc -> {len(prepared_pages)} trang AVIF trong {elapsed:.1f}s){skip_note}"
        )
    except SourceBlockedError as b_err:
        tripped = breaker.record_block(chap_origin, str(b_err))
        if tripped:
            print(f"  [CIRCUIT BREAKER] Đã tạm ngắt tên miền {chap_origin} do bị chặn liên tiếp: {b_err}")
        db_exec(db_state, "UPDATE sync_jobs SET status = 'pending', error_log = ? WHERE id = ?", [str(b_err)[:500], job_id])
    except Exception as err:
        if chapter_id is not None:
            db_batch(
                db_state,
                [
                    ("DELETE FROM chapter_pages WHERE chapter_id = ?", [chapter_id]),
                    ("DELETE FROM chapters WHERE id = ?", [chapter_id]),
                ],
            )
        db_exec(
            db_state,
            "UPDATE sync_jobs SET status = 'pending', retry_count = retry_count + 1, error_log = ? WHERE id = ?",
            [str(err)[:500], job_id],
        )
        print(f"  [Lỗi job {job_id} - Ch.{chap_num:g}] {err}")
    finally:
        if not keep_work_dir and os.path.exists(work_dir):
            shutil.rmtree(work_dir, ignore_errors=True)


def run_sync(single_comic_url: str = "", mode: str = "auto", max_chapters: int = BATCH_LIMIT):
    run_t0 = time.monotonic()
    db_state = {"client": get_db()}
    breaker = HostCircuitBreaker(threshold=3)
    stop_event = threading.Event()

    new_comics_log: list[str] = []
    published_by_comic: dict[str, list[float]] = defaultdict(list)
    target_slugs: list[str] = []
    comic_cache: dict[str, tuple[int, str]] = {}
    pending_gh_files: list[tuple[str, str]] = []
    adapters: dict[str, StandardHtmlRssAdapter] = {}
    watchlist_checked_count = 0
    healed_count = 0

    if single_comic_url:
        mode = "single-url"

    def get_adapter(origin: str, feed_url: str) -> StandardHtmlRssAdapter:
        if origin not in adapters:
            adapters[origin] = StandardHtmlRssAdapter(origin, feed_url, delay_seconds=0.15)
        return adapters[origin]

    def scan_comic_url(src_id: int, base_url: str, feed_url: str, comic_url: str, watchlist_id: int | None = None):
        if breaker.is_open(comic_url):
            print(f"[Bỏ qua - Circuit Open] {comic_url}")
            return
        if (time.monotonic() - run_t0) >= MAX_RUNTIME_SECONDS * 0.6:
            return

        adapter = get_adapter(base_url, feed_url)
        try:
            print(f"[Đang quét] {comic_url}")
            detail = adapter.fetch_comic_metadata(comic_url)
            breaker.record_success(comic_url)

            if not detail.chapters:
                print(f"[Cảnh báo] Không tìm thấy danh sách chương tại {comic_url} (Title: {detail.title})")
                if watchlist_id is not None:
                    mark_watchlist_error(db_state, watchlist_id)
                return

            comic_id, slug, is_new = ensure_comic_exists(db_state, detail, comic_url)
            comic_cache[slug] = (comic_id, detail.title)
            if slug not in target_slugs:
                target_slugs.append(slug)
            if is_new:
                new_comics_log.append(detail.title)
                print(f"[Tạo truyện mới] {detail.title} ({len(detail.chapters)} chương)")

            existing_nums = {
                float(r[0])
                for r in db_exec(db_state, "SELECT chapter_number FROM chapters WHERE comic_id = ?", [comic_id]).rows
            }
            job_stmts: list[tuple[str, list]] = []
            for ch in detail.chapters:
                if ch.chapter_number not in existing_nums:
                    job_stmts.append(
                        (
                            "INSERT OR IGNORE INTO sync_jobs (source_id, comic_slug, chapter_number, source_chapter_url, status) VALUES (?, ?, ?, ?, 'pending')",
                            [src_id, slug, ch.chapter_number, ch.url],
                        )
                    )
            if job_stmts:
                db_batch(db_state, job_stmts)
            print(f"[Hàng đợi] Đã thêm {len(job_stmts)} chương mới của '{detail.title}' vào sync_jobs.")

            latest_chap = max((ch.chapter_number for ch in detail.chapters), default=0.0)
            upsert_watchlist(
                db_state,
                comic_id=comic_id,
                source_id=src_id,
                source_comic_url=comic_url,
                latest_chap=latest_chap,
                comic_status=detail.status,
                found_new_chapters=bool(job_stmts),
            )
        except SourceBlockedError as b_err:
            tripped = breaker.record_block(comic_url, str(b_err))
            if tripped:
                print(f"[CIRCUIT BREAKER] Ngắt nguồn {urlparse(comic_url).netloc}: {b_err}")
            if watchlist_id is not None:
                mark_watchlist_error(db_state, watchlist_id)
        except Exception as e:
            print(f"[Lỗi quét truyện] {comic_url}: {e}")
            if watchlist_id is not None:
                mark_watchlist_error(db_state, watchlist_id)

    try:
        ensure_watchlist_schema(db_state)
        print(f"[VinaReader Sync v2] Mode={mode} | MaxChapters={max_chapters} | TimeBudget={MAX_RUNTIME_SECONDS}s")

        # 1. Tự cứu các job lỗi cũ
        if mode in ("auto", "deep-sweep"):
            healed_count = heal_stale_failed_jobs(db_state, force_all=(mode == "deep-sweep"))
            if healed_count > 0:
                print(f"[Auto-Healing] Đã hồi sinh {healed_count} chương lỗi cũ để thử lại.")

        # 2. Quét theo chế độ
        if mode == "single-url":
            parsed = urlparse(single_comic_url)
            origin = f"{parsed.scheme}://{parsed.netloc}"
            sources = db_exec(
                db_state,
                "SELECT id, name, base_url, feed_url FROM sync_sources WHERE base_url LIKE ? LIMIT 1",
                [f"%{parsed.netloc}%"],
            ).rows
            if not sources:
                db_exec(
                    db_state,
                    "INSERT INTO sync_sources (name, base_url, feed_url, adapter_type, is_active) VALUES (?, ?, ?, 'standard', 0)",
                    [parsed.netloc, origin, single_comic_url],
                )
                sources = db_exec(
                    db_state,
                    "SELECT id, name, base_url, feed_url FROM sync_sources WHERE base_url LIKE ? LIMIT 1",
                    [f"%{parsed.netloc}%"],
                ).rows
            src_id, _, base_url, feed_url = int(sources[0][0]), str(sources[0][1]), str(sources[0][2]), str(sources[0][3])
            scan_comic_url(src_id, base_url, feed_url, single_comic_url)
        else:
            # 2A. Quét Smart Watchlist đến hạn (ưu tiên các bộ đã theo dõi, kể cả bộ từng cào lẻ!)
            if mode == "deep-sweep":
                wl_rows = db_exec(
                    db_state,
                    """
                    SELECT w.id, w.source_id, w.source_comic_url, s.base_url, s.feed_url
                    FROM comic_watchlists w
                    JOIN sync_sources s ON w.source_id = s.id
                    WHERE w.status = 'active'
                    ORDER BY w.priority DESC, w.next_check_at ASC
                    LIMIT ?
                    """,
                    [WATCHLIST_SCAN_LIMIT * 2],
                ).rows
            else:
                wl_rows = db_exec(
                    db_state,
                    """
                    SELECT w.id, w.source_id, w.source_comic_url, s.base_url, s.feed_url
                    FROM comic_watchlists w
                    JOIN sync_sources s ON w.source_id = s.id
                    WHERE w.status = 'active' AND w.next_check_at <= CURRENT_TIMESTAMP
                    ORDER BY w.priority DESC, w.next_check_at ASC
                    LIMIT ?
                    """,
                    [WATCHLIST_SCAN_LIMIT],
                ).rows

            if wl_rows:
                print(f"[Smart Watchlist] Có {len(wl_rows)} bộ truyện đến lịch kiểm tra chap mới...")
                for row in wl_rows:
                    wl_id, src_id, c_url, b_url, f_url = int(row[0]), int(row[1]), str(row[2]), str(row[3]), str(row[4])
                    watchlist_checked_count += 1
                    scan_comic_url(src_id, b_url, f_url, c_url, watchlist_id=wl_id)

            # 2B. Quét nguồn RSS / Trang chủ đang bật (nếu không phải watch-only)
            if mode in ("auto", "deep-sweep"):
                sources = db_exec(db_state, "SELECT id, name, base_url, feed_url FROM sync_sources WHERE is_active = 1").rows
                for src in sources:
                    src_id, _, base_url, feed_url = int(src[0]), str(src[1]), str(src[2]), str(src[3])
                    if breaker.is_open(base_url):
                        continue
                    adapter = get_adapter(base_url, feed_url)
                    try:
                        targets = [i.url for i in adapter.fetch_latest_updates()]
                        breaker.record_success(base_url)
                    except SourceBlockedError as b_err:
                        breaker.record_block(base_url, str(b_err))
                        print(f"[Nguồn bị chặn] {feed_url}: {b_err}")
                        continue
                    except Exception as e:
                        print(f"[Lỗi đọc feed] {feed_url}: {e}")
                        continue

                    for comic_url in targets:
                        scan_comic_url(src_id, base_url, feed_url, comic_url)

                    db_exec(db_state, "UPDATE sync_sources SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?", [src_id])

        # 3. Lấy danh sách chương cần xử lý từ sync_jobs
        if mode == "single-url":
            if not target_slugs:
                print("[Dừng] Không lấy được danh sách chương từ URL đã nhập.")
                return
            db_exec(db_state, "UPDATE sync_jobs SET retry_count = 0 WHERE status = 'pending' AND comic_slug = ?", [target_slugs[0]])
            jobs_res = db_exec(
                db_state,
                "SELECT j.id, j.source_id, j.comic_slug, j.chapter_number, j.source_chapter_url, s.base_url "
                "FROM sync_jobs j JOIN sync_sources s ON j.source_id = s.id "
                "WHERE j.status = 'pending' AND j.comic_slug = ? "
                "ORDER BY j.chapter_number ASC, j.created_at ASC LIMIT ?",
                [target_slugs[0], max_chapters],
            )
        else:
            # Ưu tiên cả các bộ có trong Watchlist (kể cả source is_active=0) và các source is_active=1
            jobs_res = db_exec(
                db_state,
                """
                SELECT j.id, j.source_id, j.comic_slug, j.chapter_number, j.source_chapter_url, s.base_url
                FROM sync_jobs j
                JOIN sync_sources s ON j.source_id = s.id
                LEFT JOIN comics c ON c.slug = j.comic_slug
                LEFT JOIN comic_watchlists w ON w.comic_id = c.id
                WHERE j.status = 'pending'
                  AND j.retry_count < 3
                  AND (s.is_active = 1 OR w.status = 'active')
                ORDER BY COALESCE(w.priority, 5) DESC, j.chapter_number ASC, j.created_at ASC
                LIMIT ?
                """,
                [max_chapters],
            )

        if jobs_res.rows:
            print(
                f"[Tăng tốc {CHAPTER_WORKERS}x{IMAGE_WORKERS} | Trang {SLICE_TARGET_HEIGHT}px] "
                f"Bắt đầu xử lý {len(jobs_res.rows)} chương..."
            )
            with ThreadPoolExecutor(max_workers=CHAPTER_WORKERS) as chapter_pool:
                futs = [
                    chapter_pool.submit(
                        _process_job,
                        db_state,
                        job,
                        single_comic_url,
                        comic_cache,
                        published_by_comic,
                        pending_gh_files,
                        breaker,
                        stop_event,
                        run_t0,
                    )
                    for job in jobs_res.rows
                ]
                for fut in futs:
                    fut.result()
        else:
            print("[Hoàn tất] Không còn chương nào đang chờ xử lý.")

        # 4. Đẩy GitHub Backup trong 1 commit duy nhất (luôn chạy kể cả khi chạm Time-Budget)
        total_published = sum(len(chaps) for chaps in published_by_comic.values())
        if pending_gh_files:
            gh_t0 = time.time()
            print(f"[GitHub Backup] Đang đẩy {len(pending_gh_files)} trang vào 1 commit duy nhất...")
            upload_batch_to_github_backup(
                pending_gh_files,
                GH_BACKUP_REPO,
                GH_TOKEN,
                commit_message=f"backup: batch {total_published} chapters ({len(pending_gh_files)} pages)",
            )
            print(f"[GitHub Backup] Hoàn tất trong {time.time() - gh_t0:.1f}s.")

        # 5. Đếm hàng đợi còn tồn
        remain_res = db_exec(db_state, "SELECT COUNT(*) FROM sync_jobs WHERE status = 'pending' AND retry_count < 3")
        remaining_jobs = int(remain_res.rows[0][0]) if remain_res.rows else 0

        total_elapsed = time.monotonic() - run_t0
        print(
            f"[Tổng kết] Hoàn thành {total_published} chương trong {total_elapsed:.1f}s "
            f"(Watchlist kiểm tra: {watchlist_checked_count} | Tồn kho: {remaining_jobs})."
        )

        # 6. Gửi báo cáo Telegram dạng Dashboard nếu có cập nhật hoặc có cảnh báo Circuit Breaker
        tripped = breaker.tripped_hosts()
        if new_comics_log or total_published > 0 or tripped:
            lines = [f"<b>[VinaReader Sync v2 | {mode}]</b> ({total_elapsed:.0f}s)"]
            if new_comics_log:
                lines.append(f"🆕 <b>Bộ mới ({len(new_comics_log)}):</b> " + ", ".join(new_comics_log[:8]))
            if total_published > 0:
                lines.append(f"📚 <b>Đã xuất bản ({total_published} chap):</b>")
                for title, chaps in list(published_by_comic.items())[:12]:
                    chaps_sorted = sorted(chaps)
                    if len(chaps_sorted) == 1:
                        rng = f"Ch.{chaps_sorted[0]:g}"
                    else:
                        rng = f"Ch.{chaps_sorted[0]:g} → {chaps_sorted[-1]:g}"
                    lines.append(f"  • {title}: <b>+{len(chaps_sorted)} chap</b> ({rng})")
            lines.append(f"🔎 Watchlist quét: <b>{watchlist_checked_count}</b> | Hàng đợi còn: <b>{remaining_jobs}</b>")
            if stop_event.is_set():
                lines.append("⏱️ <i>Đã dừng sớm an toàn theo Time-Budget, phần còn lại sẽ chạy tiếp phiên sau.</i>")
            if tripped:
                lines.append("🚨 <b>Cảnh báo nguồn bị chặn (Circuit Breaker):</b>")
                for host, reason in tripped.items():
                    lines.append(f"  • {host}: {reason}")
            send_admin_telegram("\n".join(lines))
    finally:
        if os.path.exists(TEMP_DIR):
            shutil.rmtree(TEMP_DIR, ignore_errors=True)
        try:
            db_state["client"].close()
        except Exception:
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VinaReader Smart Watchlist & Auto-Sync Crawler v2")
    parser.add_argument("--comic-url", type=str, default="", help="URL bộ truyện cần cào & thêm vào Watchlist")
    parser.add_argument(
        "--mode",
        type=str,
        default="auto",
        choices=["auto", "watch-only", "deep-sweep", "single-url"],
        help="Chế độ chạy crawler",
    )
    parser.add_argument("--max-chapters", type=int, default=BATCH_LIMIT, help="Số chương tối đa xử lý trong 1 phiên")
    args = parser.parse_args()
    run_sync(
        single_comic_url=args.comic_url.strip(),
        mode=args.mode,
        max_chapters=max(1, args.max_chapters),
    )
