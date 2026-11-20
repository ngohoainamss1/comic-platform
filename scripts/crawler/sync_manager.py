# scripts/crawler/sync_manager.py
import os
import re
import time
import shutil
import tempfile
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
import httpx
import libsql_client
from slugify import slugify
from dotenv import load_dotenv

os.environ.setdefault("VIPS_CONCURRENCY", "1")

try:
    from curl_cffi import requests as curl_requests, CurlHttpVersion, CurlOpt
except ImportError:
    curl_requests = None
    CurlHttpVersion = None
    CurlOpt = None

from scripts.pipeline.slicer import slice_and_compress_to_avif
from scripts.pipeline.compressor import compress_to_avif
from scripts.pipeline.uploader import (
    upload_to_telegram,
    upload_to_github_backup,
    upload_batch_to_telegram,
    upload_batch_to_github_backup,
)
from scripts.crawler.adapters.standard import StandardHtmlRssAdapter

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

CHAPTER_WORKERS = int(os.getenv("CRAWLER_CHAPTER_WORKERS", "4"))
IMAGE_WORKERS = int(os.getenv("CRAWLER_IMAGE_WORKERS", "4"))
BATCH_LIMIT = int(os.getenv("CRAWLER_BATCH_LIMIT", "100"))
AVIF_MAX_WIDTH = int(os.getenv("AVIF_MAX_WIDTH", "1440"))
AVIF_QUALITY = int(os.getenv("AVIF_QUALITY", "80"))
AVIF_EFFORT = int(os.getenv("AVIF_EFFORT", "2"))

_DB_LOCK = threading.Lock()
_TG_LOCK = threading.Lock()
_STATE_LOCK = threading.Lock()
_TLS = threading.local()


class ImageNotFoundError(RuntimeError):
    pass


def _get_curl_session():
    if curl_requests is None:
        return None
    sess = getattr(_TLS, "curl_session", None)
    if sess is None:
        try:
            opts = {CurlOpt.DOH_URL: "https://1.1.1.1/dns-query"} if (CurlOpt and not CRAWLER_PROXY) else {}
            sess = curl_requests.Session(curl_options=opts)
        except TypeError:
            sess = curl_requests.Session()
        _TLS.curl_session = sess
    return sess


_IMG_HTTPX = httpx.Client(
    timeout=30.0,
    follow_redirects=True,
    proxy=CRAWLER_PROXY or None,
    limits=httpx.Limits(max_connections=32, max_keepalive_connections=16),
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


def send_admin_telegram(message: str):
    if not TG_BOT_TOKEN or not TG_ADMIN_ID:
        return
    try:
        url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
        with httpx.Client(timeout=15.0) as client:
            client.post(url, json={"chat_id": TG_ADMIN_ID, "text": message, "parse_mode": "HTML"})
    except Exception as e:
        print(f"[Cảnh báo] Không gửi được thông báo Telegram: {e}")


def _expand_image_candidates(packed_url: str) -> list[str]:
    expanded: list[str] = []
    for u in (x.strip() for x in packed_url.split("|") if x.strip()):
        if u not in expanded:
            expanded.append(u)
        m = re.match(r"^(https?://(?:img|cdn|sv)(\d+)\.[^/]+)(/.+)$", u, re.IGNORECASE)
        if m:
            host_tpl = re.sub(r"^(https?://(?:img|cdn|sv))\d+", r"\g<1>{}", m.group(1), flags=re.IGNORECASE)
            for idx in (1, 2, 3, 4):
                alt = f"{host_tpl.format(idx)}{m.group(3)}"
                if alt not in expanded:
                    expanded.append(alt)
    return expanded


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
            time.sleep(0.3 * attempt)
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
                res = curl_sess.get(
                    url,
                    headers=headers,
                    impersonate=profiles[(attempt - 1) % len(profiles)],
                    http_version=CurlHttpVersion.V1_1,
                    timeout=30,
                    allow_redirects=True,
                    proxies=proxies,
                )
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

    raise RuntimeError(f"Tải ảnh thất bại ({url}): {last_err}")


def download_image(packed_url: str, dest_path: str, referer: str = ""):
    candidates = _expand_image_candidates(packed_url)
    last_err = None
    all_not_found = True
    for cand_url in candidates:
        try:
            _download_single_url(cand_url, dest_path, referer=referer)
            return
        except ImageNotFoundError as nf_err:
            last_err = nf_err
        except Exception as err:
            all_not_found = False
            last_err = err
    if all_not_found:
        raise ImageNotFoundError(f"Ảnh không tồn tại trên CDN ({candidates[0]}): {last_err}")
    raise RuntimeError(f"Tải ảnh thất bại ({candidates[0]}): {last_err}")


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


def ensure_comic_exists(db_state: dict, detail, page_url: str) -> tuple[int, str, bool]:
    slug = normalize_vn_slug(detail.title)
    existing = db_exec(db_state, "SELECT id, cover_file_id FROM comics WHERE slug = ? LIMIT 1", [slug])
    if existing.rows:
        comic_id = int(existing.rows[0][0])
        if not str(existing.rows[0][1] or "") and detail.cover_url:
            tg_id, gh_path = _upload_cover(detail, slug, page_url)
            if tg_id or gh_path:
                db_exec(db_state, "UPDATE comics SET cover_file_id = ?, cover_gh_path = ? WHERE id = ?", [tg_id, gh_path, comic_id])
        return comic_id, slug, False

    tg_id, gh_path = _upload_cover(detail, slug, page_url)
    db_exec(
        db_state,
        "INSERT INTO comics (slug, title, alt_titles, description, cover_file_id, cover_gh_path, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [slug, detail.title, detail.alt_titles, detail.description, tg_id, gh_path, detail.status],
    )
    comic_id = int(db_exec(db_state, "SELECT id FROM comics WHERE slug = ? LIMIT 1", [slug]).rows[0][0])
    for raw_genre in detail.genres:
        g_row = db_exec(db_state, "SELECT id FROM genres WHERE slug = ? LIMIT 1", [normalize_vn_slug(raw_genre)])
        if g_row.rows:
            db_exec(db_state, "INSERT OR IGNORE INTO comic_genres (comic_id, genre_id) VALUES (?, ?)", [comic_id, int(g_row.rows[0][0])])
    return comic_id, slug, True


def _prepare_source_image(
    raw_idx: int,
    img_url: str,
    chap_url: str,
    work_dir: str,
) -> tuple[int, list[dict] | None, str | None]:
    raw_path = os.path.join(work_dir, "raw", f"raw_{raw_idx:03d}.img")
    try:
        download_image(img_url, raw_path, referer=chap_url)
    except ImageNotFoundError as nf_err:
        return raw_idx, None, str(nf_err)

    avif_dir = os.path.join(work_dir, "avif", f"src_{raw_idx:03d}")
    items = slice_and_compress_to_avif(
        raw_path,
        avif_dir,
        prefix=f"p{raw_idx:03d}",
        max_width=AVIF_MAX_WIDTH,
        quality=AVIF_QUALITY,
        effort=AVIF_EFFORT,
    )
    return raw_idx, items, None


def _process_job(
    db_state: dict,
    job,
    single_comic_url: str,
    comic_cache: dict[str, tuple[int, str]],
    new_chapters_log: list[str],
    pending_gh_files: list[tuple[str, str]],
):
    t0 = time.time()
    job_id, comic_slug, chap_num, chap_url = int(job[0]), str(job[2]), float(job[3]), str(job[4])
    p = urlparse(chap_url)
    chap_origin = f"{p.scheme}://{p.netloc}" if (p.scheme and p.netloc) else str(job[5])

    work_dir = os.path.join(TEMP_DIR, f"job_{job_id}")
    chapter_id = None
    keep_work_dir = False

    try:
        adapter = StandardHtmlRssAdapter(chap_origin, chap_origin, delay_seconds=0.15)
        img_urls = adapter.fetch_chapter_images(chap_url, referer_url=single_comic_url or chap_origin)
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
                pool.submit(_prepare_source_image, idx, url, chap_url, work_dir)
                for idx, url in enumerate(img_urls)
            ]
            prepared_results = [fut.result() for fut in futures]

        prepared_results.sort(key=lambda r: r[0])
        prepared_pages: list[dict] = []
        skipped_404 = 0
        for raw_idx, items, nf_msg in prepared_results:
            if items is None:
                skipped_404 += 1
                print(f"     [Bỏ qua ảnh 404 #{raw_idx + 1}] {nf_msg}")
                continue
            prepared_pages.extend(items)

        if not prepared_pages:
            raise RuntimeError(f"Toàn bộ {len(img_urls)} ảnh của chương đều trả về 404 Not Found.")

        tg_items = [
            (page["path"], f"{comic_title} - Ch.{chap_num:g} - P.{idx + 1}")
            for idx, page in enumerate(prepared_pages)
        ]
        with _TG_LOCK:
            tg_file_ids = upload_batch_to_telegram(tg_items, TG_BOT_TOKEN, TG_CHANNEL_ID, chunk_size=10)
            time.sleep(0.6)

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
            new_chapters_log.append(f"{comic_title} - Chap {chap_num:g} ({len(prepared_pages)} trang)")
            if gh_chunk:
                pending_gh_files.extend(gh_chunk)
                keep_work_dir = True

        elapsed = time.time() - t0
        skip_note = f" (bỏ qua {skipped_404} ảnh 404)" if skipped_404 else ""
        print(f"  [OK] {comic_slug} Ch.{chap_num:g} ({len(prepared_pages)} trang AVIF {AVIF_MAX_WIDTH}px Q{AVIF_QUALITY} trong {elapsed:.1f}s){skip_note}")
    except Exception as err:
        if chapter_id is not None:
            db_batch(
                db_state,
                [
                    ("DELETE FROM chapter_pages WHERE chapter_id = ?", [chapter_id]),
                    ("DELETE FROM chapters WHERE id = ?", [chapter_id]),
                ],
            )
        db_exec(db_state, "UPDATE sync_jobs SET status = 'pending', retry_count = retry_count + 1, error_log = ? WHERE id = ?", [str(err)[:500], job_id])
        print(f"  [Lỗi job {job_id} - Ch.{chap_num:g}] {err}")
    finally:
        if not keep_work_dir and os.path.exists(work_dir):
            shutil.rmtree(work_dir, ignore_errors=True)


def run_sync(single_comic_url: str = ""):
    run_t0 = time.time()
    db_state = {"client": get_db()}
    new_comics_log, new_chapters_log, target_slugs = [], [], []
    comic_cache: dict[str, tuple[int, str]] = {}
    pending_gh_files: list[tuple[str, str]] = []
    adapters: dict[str, StandardHtmlRssAdapter] = {}

    def get_adapter(origin: str, feed_url: str) -> StandardHtmlRssAdapter:
        if origin not in adapters:
            adapters[origin] = StandardHtmlRssAdapter(origin, feed_url, delay_seconds=0.15)
        return adapters[origin]

    try:
        if single_comic_url:
            parsed = urlparse(single_comic_url)
            origin = f"{parsed.scheme}://{parsed.netloc}"
            sources = db_exec(db_state, "SELECT id, name, base_url, feed_url FROM sync_sources WHERE base_url LIKE ? LIMIT 1", [f"%{parsed.netloc}%"]).rows
            if not sources:
                db_exec(db_state, "INSERT INTO sync_sources (name, base_url, feed_url, adapter_type, is_active) VALUES (?, ?, ?, 'standard', 0)", [parsed.netloc, origin, single_comic_url])
                sources = db_exec(db_state, "SELECT id, name, base_url, feed_url FROM sync_sources WHERE base_url LIKE ? LIMIT 1", [f"%{parsed.netloc}%"]).rows
        else:
            sources = db_exec(db_state, "SELECT id, name, base_url, feed_url FROM sync_sources WHERE is_active = 1").rows

        if not sources:
            print("[Thông báo] Không có nguồn truyện nào đang bật (is_active = 1).")
            return

        for src in sources:
            src_id, _, base_url, feed_url = int(src[0]), str(src[1]), str(src[2]), str(src[3])
            adapter = get_adapter(base_url, feed_url)
            targets = [single_comic_url] if single_comic_url else [i.url for i in adapter.fetch_latest_updates()]

            for comic_url in targets:
                try:
                    print(f"[Đang quét] {comic_url}")
                    detail = adapter.fetch_comic_metadata(comic_url)
                    if not detail.chapters:
                        print(f"[Cảnh báo] Không tìm thấy danh sách chương tại {comic_url} (Title: {detail.title})")
                        continue

                    comic_id, slug, is_new = ensure_comic_exists(db_state, detail, comic_url)
                    comic_cache[slug] = (comic_id, detail.title)
                    if slug not in target_slugs:
                        target_slugs.append(slug)
                    if is_new:
                        new_comics_log.append(detail.title)
                        print(f"[Tạo truyện mới] {detail.title} ({len(detail.chapters)} chương)")

                    existing_nums = {float(r[0]) for r in db_exec(db_state, "SELECT chapter_number FROM chapters WHERE comic_id = ?", [comic_id]).rows}
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
                except Exception as e:
                    print(f"[Lỗi quét truyện] {comic_url}: {e}")

            db_exec(db_state, "UPDATE sync_sources SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?", [src_id])

        if single_comic_url:
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
                [target_slugs[0], BATCH_LIMIT],
            )
        else:
            jobs_res = db_exec(
                db_state,
                "SELECT j.id, j.source_id, j.comic_slug, j.chapter_number, j.source_chapter_url, s.base_url "
                "FROM sync_jobs j JOIN sync_sources s ON j.source_id = s.id "
                "WHERE j.status = 'pending' AND j.retry_count < 3 AND s.is_active = 1 "
                "ORDER BY j.chapter_number ASC, j.created_at ASC LIMIT ?",
                [BATCH_LIMIT],
            )

        if not jobs_res.rows:
            print("[Hoàn tất] Không còn chương nào đang chờ xử lý.")
            return

        print(f"[Tăng tốc {CHAPTER_WORKERS}x{IMAGE_WORKERS}] Bắt đầu xử lý {len(jobs_res.rows)} chương...")
        with ThreadPoolExecutor(max_workers=CHAPTER_WORKERS) as chapter_pool:
            futs = [
                chapter_pool.submit(_process_job, db_state, job, single_comic_url, comic_cache, new_chapters_log, pending_gh_files)
                for job in jobs_res.rows
            ]
            for fut in futs:
                fut.result()

        if pending_gh_files:
            gh_t0 = time.time()
            print(f"[GitHub Backup] Đang đẩy {len(pending_gh_files)} trang vào 1 commit duy nhất...")
            upload_batch_to_github_backup(
                pending_gh_files,
                GH_BACKUP_REPO,
                GH_TOKEN,
                commit_message=f"backup: batch {len(new_chapters_log)} chapters ({len(pending_gh_files)} pages)",
            )
            print(f"[GitHub Backup] Hoàn tất trong {time.time() - gh_t0:.1f}s.")

        total_elapsed = time.time() - run_t0
        print(f"[Tổng kết] Hoàn thành {len(new_chapters_log)} chương trong {total_elapsed:.1f}s.")

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
        try:
            db_state["client"].close()
        except Exception:
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Auto-Sync Crawler & AVIF Publisher")
    parser.add_argument("--comic-url", type=str, default="", help="URL bộ truyện cần cào ngay")
    args = parser.parse_args()
    run_sync(single_comic_url=args.comic_url.strip())
