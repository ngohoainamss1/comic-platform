import os
import shutil
import tempfile
import argparse
import httpx
import libsql_client
from slugify import slugify
from dotenv import load_dotenv

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None

from scripts.pipeline.slicer import slice_webtoon_image
from scripts.pipeline.compressor import compress_to_avif
from scripts.pipeline.uploader import upload_to_telegram, upload_to_github_backup
from scripts.crawler.adapters.standard import StandardHtmlRssAdapter

load_dotenv()

TURSO_URL = os.getenv("TURSO_DATABASE_URL", "").replace("libsql://", "https://")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "")
TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN", "")
TG_CHANNEL_ID = os.getenv("TG_STORAGE_CHANNEL_ID", "")
TG_ADMIN_ID = os.getenv("TG_ADMIN_CHAT_ID", "")
GH_TOKEN = os.getenv("GH_TOKEN", "")
GH_BACKUP_REPO = os.getenv("GH_BACKUP_REPO", "")

TEMP_DIR = os.path.join(tempfile.gettempdir(), "comic_ingest_work")


def get_db():
    return libsql_client.create_client_sync(url=TURSO_URL, auth_token=TURSO_TOKEN)


def send_admin_telegram(message: str):
    if not TG_BOT_TOKEN or not TG_ADMIN_ID:
        return
    try:
        url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
        with httpx.Client(timeout=15.0) as client:
            client.post(url, json={"chat_id": TG_ADMIN_ID, "text": message, "parse_mode": "HTML"})
    except Exception as e:
        print(f"[Cảnh báo] Không gửi được thông báo Telegram: {e}")


def download_image(url: str, dest_path: str, referer: str = ""):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    if referer:
        headers["Referer"] = referer

    if curl_requests is not None:
        res = curl_requests.get(
            url, headers=headers, impersonate="chrome", timeout=30, allow_redirects=True
        )
        res.raise_for_status()
        with open(dest_path, "wb") as f:
            f.write(res.content)
        return

    with httpx.Client(timeout=30.0, follow_redirects=True, headers=headers) as client:
        res = client.get(url)
        res.raise_for_status()
        with open(dest_path, "wb") as f:
            f.write(res.content)


def normalize_vn_slug(title: str) -> str:
    cleaned = title.replace("Đ", "D").replace("đ", "d")
    return slugify(cleaned)


def ensure_comic_exists(db, detail, base_url: str) -> tuple[int, str, bool]:
    slug = normalize_vn_slug(detail.title)
    existing = db.execute("SELECT id FROM comics WHERE slug = ? LIMIT 1", [slug])
    if existing.rows:
        return int(existing.rows[0][0]), slug, False

    cover_file_id = ""
    cover_gh_path = ""
    if detail.cover_url:
        try:
            raw_cover = os.path.join(TEMP_DIR, f"{slug}_cover_raw.img")
            avif_cover = os.path.join(TEMP_DIR, f"{slug}_cover.avif")
            download_image(detail.cover_url, raw_cover, referer=base_url)
            compress_to_avif(raw_cover, avif_cover, max_width=600, quality=72)
            cover_file_id = upload_to_telegram(
                avif_cover, TG_BOT_TOKEN, TG_CHANNEL_ID, caption=f"Cover: {detail.title}"
            )
            cover_gh_path = upload_to_github_backup(
                avif_cover, f"covers/{slug}.avif", GH_BACKUP_REPO, GH_TOKEN
            )
        except Exception as e:
            print(f"[Lỗi ảnh bìa] {detail.title}: {e}")

    db.execute(
        '''
        INSERT INTO comics (slug, title, alt_titles, description, cover_file_id, cover_gh_path, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''',
        [slug, detail.title, detail.alt_titles, detail.description, cover_file_id, cover_gh_path, detail.status],
    )
    row = db.execute("SELECT id FROM comics WHERE slug = ? LIMIT 1", [slug])
    comic_id = int(row.rows[0][0])

    for raw_genre in detail.genres:
        g_slug = normalize_vn_slug(raw_genre)
        g_row = db.execute("SELECT id FROM genres WHERE slug = ? LIMIT 1", [g_slug])
        if g_row.rows:
            db.execute(
                "INSERT OR IGNORE INTO comic_genres (comic_id, genre_id) VALUES (?, ?)",
                [comic_id, int(g_row.rows[0][0])],
            )

    return comic_id, slug, True


def run_sync(single_comic_url: str = ""):
    db = get_db()
    new_comics_log: list[str] = []
    new_chapters_log: list[str] = []

    try:
        sources_res = db.execute(
            "SELECT id, name, base_url, feed_url FROM sync_sources WHERE is_active = 1"
        )
        sources = sources_res.rows

        for src in sources:
            src_id, _, base_url, feed_url = int(src[0]), str(src[1]), str(src[2]), str(src[3])
            adapter = StandardHtmlRssAdapter(base_url, feed_url)

            if single_comic_url:
                targets = [single_comic_url]
            else:
                updates = adapter.fetch_latest_updates()
                targets = [item.url for item in updates]

            for comic_url in targets:
                try:
                    detail = adapter.fetch_comic_metadata(comic_url)
                    comic_id, slug, is_new = ensure_comic_exists(db, detail, base_url)
                    if is_new:
                        new_comics_log.append(detail.title)

                    existing_chaps_res = db.execute(
                        "SELECT chapter_number FROM chapters WHERE comic_id = ?", [comic_id]
                    )
                    existing_nums = {float(r[0]) for r in existing_chaps_res.rows}

                    for ch in detail.chapters:
                        if ch.chapter_number not in existing_nums:
                            db.execute(
                                '''
                                INSERT OR IGNORE INTO sync_jobs
                                (source_id, comic_slug, chapter_number, source_chapter_url, status)
                                VALUES (?, ?, ?, ?, 'pending')
                                ''',
                                [src_id, slug, ch.chapter_number, ch.url],
                            )
                except Exception as e:
                    print(f"[Lỗi quét truyện] {comic_url}: {e}")

            db.execute(
                "UPDATE sync_sources SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?", [src_id]
            )

        jobs_res = db.execute(
            '''
            SELECT j.id, j.source_id, j.comic_slug, j.chapter_number, j.source_chapter_url, s.base_url
            FROM sync_jobs j
            JOIN sync_sources s ON j.source_id = s.id
            WHERE j.status = 'pending' AND j.retry_count < 3
            ORDER BY j.created_at ASC
            LIMIT 20
            '''
        )

        for job in jobs_res.rows:
            job_id = int(job[0])
            comic_slug = str(job[2])
            chap_num = float(job[3])
            chap_url = str(job[4])
            base_url = str(job[5])

            db.execute("UPDATE sync_jobs SET status = 'processing' WHERE id = ?", [job_id])
            job_work_dir = os.path.join(TEMP_DIR, f"job_{job_id}")

            try:
                adapter = StandardHtmlRssAdapter(base_url, base_url)
                img_urls = adapter.fetch_chapter_images(chap_url)
                if not img_urls:
                    raise RuntimeError("Không tìm thấy ảnh nào trong chương.")

                comic_row = db.execute(
                    "SELECT id, title FROM comics WHERE slug = ? LIMIT 1", [comic_slug]
                ).rows[0]
                comic_id, comic_title = int(comic_row[0]), str(comic_row[1])

                db.execute(
                    "INSERT OR IGNORE INTO chapters (comic_id, chapter_number, title) VALUES (?, ?, ?)",
                    [comic_id, chap_num, f"Chapter {chap_num:g}"],
                )
                chap_row = db.execute(
                    "SELECT id FROM chapters WHERE comic_id = ? AND chapter_number = ? LIMIT 1",
                    [comic_id, chap_num],
                ).rows[0]
                chapter_id = int(chap_row[0])

                page_idx = 0
                for raw_idx, img_url in enumerate(img_urls):
                    raw_path = os.path.join(job_work_dir, "raw", f"raw_{raw_idx:03d}.img")
                    download_image(img_url, raw_path, referer=chap_url)

                    sliced_paths = slice_webtoon_image(
                        raw_path, os.path.join(job_work_dir, "sliced"), prefix=f"p{raw_idx:03d}"
                    )

                    for s_path in sliced_paths:
                        avif_path = os.path.join(
                            job_work_dir, "avif", f"{comic_slug}_ch{chap_num:g}_{page_idx:03d}.avif"
                        )
                        meta = compress_to_avif(s_path, avif_path, max_width=1080, quality=68)

                        tg_file_id = upload_to_telegram(
                            avif_path,
                            TG_BOT_TOKEN,
                            TG_CHANNEL_ID,
                            caption=f"{comic_title} - Ch.{chap_num:g} - P.{page_idx + 1}",
                        )
                        gh_path = upload_to_github_backup(
                            avif_path,
                            f"chapters/{comic_slug}/ch-{chap_num:g}/{page_idx:03d}.avif",
                            GH_BACKUP_REPO,
                            GH_TOKEN,
                        )

                        db.execute(
                            '''
                            INSERT INTO chapter_pages
                            (chapter_id, page_index, tg_file_id, gh_fallback_path, width, height, format)
                            VALUES (?, ?, ?, ?, ?, ?, 'avif')
                            ''',
                            [chapter_id, page_idx, tg_file_id, gh_path, meta["width"], meta["height"]],
                        )
                        page_idx += 1

                db.execute(
                    "UPDATE comics SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [comic_id]
                )
                db.execute("UPDATE sync_jobs SET status = 'published' WHERE id = ?", [job_id])
                new_chapters_log.append(f"{comic_title} - Chap {chap_num:g} ({page_idx} trang)")

            except Exception as err:
                db.execute(
                    '''
                    UPDATE sync_jobs
                    SET status = 'pending', retry_count = retry_count + 1, error_log = ?
                    WHERE id = ?
                    ''',
                    [str(err)[:500], job_id],
                )
                print(f"[Lỗi xử lý job {job_id}] {err}")
            finally:
                if os.path.exists(job_work_dir):
                    shutil.rmtree(job_work_dir, ignore_errors=True)

        if new_comics_log or new_chapters_log:
            lines = ["<b>[VinaReader Auto-Sync] Cập nhật mới thành công:</b>"]
            if new_comics_log:
                lines.append(f"• <b>Bộ mới ({len(new_comics_log)}):</b> " + ", ".join(new_comics_log[:10]))
            if new_chapters_log:
                lines.append(f"• <b>Chương mới ({len(new_chapters_log)}):</b>\n- " + "\n- ".join(new_chapters_log[:15]))
            send_admin_telegram("\n".join(lines))

    finally:
        if os.path.exists(TEMP_DIR):
            shutil.rmtree(TEMP_DIR, ignore_errors=True)
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Auto-Sync Crawler & AVIF Publisher")
    parser.add_argument("--comic-url", type=str, default="", help="URL bộ truyện cần cào ngay")
    args = parser.parse_args()
    run_sync(single_comic_url=args.comic_url.strip())
