import os
import time
import shutil
import tempfile
import argparse
from urllib.parse import urlparse
import httpx
import libsql_client
from slugify import slugify
from dotenv import load_dotenv

try:
    from curl_cffi import requests as curl_requests, CurlHttpVersion, CurlOpt
except ImportError:
    curl_requests = None
    CurlHttpVersion = None
    CurlOpt = None

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
    root_referer = ""
    if referer:
        p = urlparse(referer)
        if p.scheme and p.netloc:
            root_referer = f"{p.scheme}://{p.netloc}/"

    referer_candidates = []
    for candidate in (root_referer, referer, ""):
        if candidate not in referer_candidates:
            referer_candidates.append(candidate)

    profiles = ["chrome", "edge", "safari"]
    last_err = None

    for attempt in range(1, 5):
        current_ref = referer_candidates[(attempt - 1) % len(referer_candidates)]
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
            "Sec-Fetch-Dest": "image",
            "Sec-Fetch-Mode": "no-cors",
            "Sec-Fetch-Site": "cross-site",
        }
        if current_ref:
            headers["Referer"] = current_ref

        try:
            time.sleep(0.25 * attempt)
            if curl_requests is not None:
                curl_opts = {CurlOpt.DOH_URL: "https://1.1.1.1/dns-query"} if CurlOpt else {}
                res = curl_requests.get(
                    url,
                    headers=headers,
                    impersonate=profiles[(attempt - 1) % len(profiles)],
                    http_version=CurlHttpVersion.V1_1,
                    timeout=30,
                    allow_redirects=True,
                    curl_options=curl_opts,
                )
                res.raise_for_status()
                if len(res.content) < 512:
                    raise RuntimeError(f"Dữ liệu ảnh quá nhỏ ({len(res.content)} bytes)")
                with open(dest_path, "wb") as f:
                    f.write(res.content)
                return

            with httpx.Client(timeout=30.0, follow_redirects=True, headers=headers) as client:
                res = client.get(url)
                res.raise_for_status()
                with open(dest_path, "wb") as f:
                    f.write(res.content)
                return
        except Exception as e:
            last_err = e
            time.sleep(1.0 * attempt)

    raise RuntimeError(f"Tải ảnh thất bại sau 4 lần thử ({url}): {last_err}")


def normalize_vn_slug(title: str) -> str:
    cleaned = title.replace("Đ", "D").replace("đ", "d")
    return slugify(cleaned)


def _process_and_upload_cover(detail, slug: str, page_url: str) -> tuple[str, str]:
    if not detail.cover_url:
        return "", ""
    try:
        raw_cover = os.path.join(TEMP_DIR, f"{slug}_cover_raw.img")
        avif_cover = os.path.join(TEMP_DIR, f"{slug}_cover.avif")
        download_image(detail.cover_url, raw_cover, referer=page_url)
        compress_to_avif(raw_cover, avif_cover, max_width=600, quality=72)
        cover_file_id = upload_to_telegram(
            avif_cover, TG_BOT_TOKEN, TG_CHANNEL_ID, caption=f"Cover: {detail.title}"
        )
        cover_gh_path = upload_to_github_backup(
            avif_cover, f"covers/{slug}.avif", GH_BACKUP_REPO, GH_TOKEN
        )
        return cover_file_id, cover_gh_path
    except Exception as e:
        print(f"[Lỗi ảnh bìa] {detail.title}: {e}")
        return "", ""


def ensure_comic_exists(db, detail, page_url: str) -> tuple[int, str, bool]:
    slug = normalize_vn_slug(detail.title)
    existing = db.execute("SELECT id, cover_file_id FROM comics WHERE slug = ? LIMIT 1", [slug])
    if existing.rows:
        comic_id = int(existing.rows[0][0])
        current_cover = str(existing.rows[0][1] or "")
        if not current_cover and detail.cover_url:
            cover_file_id, cover_gh_path = _process_and_upload_cover(detail, slug, page_url)
            if cover_file_id or cover_gh_path:
                db.execute(
                    "UPDATE comics SET cover_file_id = ?, cover_gh_path = ? WHERE id = ?",
                    [cover_file_id, cover_gh_path, comic_id],
                )
        return comic_id, slug, False

    cover_file_id, cover_gh_path = _process_and_upload_cover(detail, slug, page_url)

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
        if single_comic_url:
            parsed = urlparse(single_comic_url)
            origin = f"{parsed.scheme}://{parsed.netloc}"
            src_rows = db.execute(
                "SELECT id, name, base_url, feed_url FROM sync_sources WHERE base_url LIKE ? LIMIT 1",
                [f"%{parsed.netloc}%"],
            ).rows
            if not src_rows:
                db.execute(
                    '''
                    INSERT INTO sync_sources (name, base_url, feed_url, adapter_type, is_active)
                    VALUES (?, ?, ?, 'standard', 0)
                    ''',
                    [parsed.netloc, origin, single_comic_url],
                )
                src_rows = db.execute(
                    "SELECT id, name, base_url, feed_url FROM sync_sources WHERE base_url LIKE ? LIMIT 1",
                    [f"%{parsed.netloc}%"],
                ).rows
            sources = src_rows
        else:
            sources = db.execute(
                "SELECT id, name, base_url, feed_url FROM sync_sources WHERE is_active = 1"
            ).rows

        if not sources:
            print("[Thông báo] Không có nguồn truyện nào đang bật (is_active = 1).")
            return

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
                    print(f"[Đang quét] {comic_url}")
                    detail = adapter.fetch_comic_metadata(comic_url)
                    if not detail.chapters:
                        print(f"[Cảnh báo] Không tìm thấy danh sách chương tại {comic_url} (Title: {detail.title})")
                        continue

                    comic_id, slug, is_new = ensure_comic_exists(db, detail, comic_url)
                    if is_new:
                        new_comics_log.append(detail.title)
                        print(f"[Tạo truyện mới] {detail.title} ({len(detail.chapters)} chương)")

                    existing_chaps_res = db.execute(
                        "SELECT chapter_number FROM chapters WHERE comic_id = ?", [comic_id]
                    )
                    existing_nums = {float(r[0]) for r in existing_chaps_res.rows}

                    queued = 0
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
                            queued += 1
                    print(f"[Hàng đợi] Đã thêm {queued} chương mới của '{detail.title}' vào sync_jobs.")
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
            WHERE j.status = 'pending'
              AND j.retry_count < 3
              AND (s.is_active = 1 OR ? != '')
            ORDER BY j.chapter_number ASC, j.created_at ASC
            LIMIT 20
            ''',
            [single_comic_url],
        )

        if not jobs_res.rows:
            print("[Hoàn tất] Không còn chương nào đang chờ xử lý.")
            return

        print(f"[Bắt đầu xử lý] {len(jobs_res.rows)} chương trong lượt này...")

        for job in jobs_res.rows:
            job_id = int(job[0])
            comic_slug = str(job[2])
            chap_num = float(job[3])
            chap_url = str(job[4])
            parsed_chap = urlparse(chap_url)
            chap_origin = (
                f"{parsed_chap.scheme}://{parsed_chap.netloc}"
                if parsed_chap.scheme and parsed_chap.netloc
                else str(job[5])
            )

            print(f"  -> Đang tải & nén AVIF: {comic_slug} - Chapter {chap_num:g} ...")
            db.execute("UPDATE sync_jobs SET status = 'processing' WHERE id = ?", [job_id])
            job_work_dir = os.path.join(TEMP_DIR, f"job_{job_id}")
            chapter_id = None

            try:
                adapter = StandardHtmlRssAdapter(chap_origin, chap_origin)
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
                print(f"     [OK] Xong Chapter {chap_num:g} ({page_idx} trang AVIF)")

            except Exception as err:
                if chapter_id is not None:
                    db.execute("DELETE FROM chapter_pages WHERE chapter_id = ?", [chapter_id])
                db.execute(
                    '''
                    UPDATE sync_jobs
                    SET status = 'pending', retry_count = retry_count + 1, error_log = ?
                    WHERE id = ?
                    ''',
                    [str(err)[:500], job_id],
                )
                print(f"     [Lỗi xử lý job {job_id}] {err}")
            finally:
                if os.path.exists(job_work_dir):
                    shutil.rmtree(job_work_dir, ignore_errors=True)

        if new_comics_log or new_chapters_log:
            lines = ["<b>[VinaReader Auto-Sync] Cập nhật mới thành công:</b>"]
            if new_comics_log:
                lines.append(f"• <b>Bộ mới ({len(new_comics_log)}):</b> " + ", ".join(new_comics_log[:10]))
            if new_chapters_log:
                lines.append(f"• <b>Chương mới ({len(new_chapters_log)}):</b>\\n- " + "\\n- ".join(new_chapters_log[:15]))
            send_admin_telegram("\\n".join(lines))

    finally:
        if os.path.exists(TEMP_DIR):
            shutil.rmtree(TEMP_DIR, ignore_errors=True)
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Auto-Sync Crawler & AVIF Publisher")
    parser.add_argument("--comic-url", type=str, default="", help="URL bộ truyện cần cào ngay")
    args = parser.parse_args()
    run_sync(single_comic_url=args.comic_url.strip())
    
