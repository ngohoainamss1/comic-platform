# scripts/crawler/adapters/standard.py
import os
import re
import time
import random
import threading
from urllib.parse import urljoin, urlparse
import httpx
import feedparser
from bs4 import BeautifulSoup
from .base import BaseSourceAdapter, ComicSummary, ComicDetail, ChapterInfo

try:
    from curl_cffi import requests as curl_requests, CurlOpt
except ImportError:
    curl_requests = None
    CurlOpt = None



class SourceBlockedError(RuntimeError):
    def __init__(self, message: str, status_code: int = 0, host: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.host = host


class StandardHtmlRssAdapter(BaseSourceAdapter):
    def __init__(self, base_url: str, feed_url: str, delay_seconds: float = 0.2):
        super().__init__(base_url, feed_url)
        self.delay_seconds = delay_seconds
        self.cookie_header = os.getenv("CRAWLER_COOKIE", "").strip()
        self.proxy_url = os.getenv("CRAWLER_PROXY", "").strip()
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            "Upgrade-Insecure-Requests": "1",
        }
        if self.cookie_header:
            self.headers["Cookie"] = self.cookie_header

        self._tls = threading.local()
        self._httpx_client = httpx.Client(
            timeout=25.0,
            follow_redirects=True,
            proxy=self.proxy_url or None,
        )

    def _get_curl_session(self):
        if curl_requests is None:
            return None
        sess = getattr(self._tls, "curl_session", None)
        if sess is None:
            try:
                curl_opts = {CurlOpt.DOH_URL: "https://1.1.1.1/dns-query"} if (CurlOpt and not self.proxy_url) else {}
                sess = curl_requests.Session(curl_options=curl_opts)
            except TypeError:
                sess = curl_requests.Session()
            self._tls.curl_session = sess
        return sess

    def _origin_of(self, url: str) -> str:
        parsed = urlparse(url)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}/"
        return self.base_url.rstrip("/") + "/"

    def _normalize_url(self, raw_url: str, page_url: str) -> str:
        if not raw_url:
            return ""
        raw_url = raw_url.strip().strip("\"'")
        if raw_url.startswith("//"):
            return f"https:{raw_url}"
        return urljoin(page_url, raw_url)

    def _get(self, url: str, referer: str = "", extra_headers: dict | None = None) -> str:
        origin = self._origin_of(url)
        referer_candidates = []
        for candidate in (referer, origin, ""):
            if candidate not in referer_candidates:
                referer_candidates.append(candidate)

        profiles = ["chrome", "edge", "safari"]
        last_err = None
        curl_sess = self._get_curl_session()

        host = urlparse(url).netloc.lower()
        blocked_err: SourceBlockedError | None = None

        for attempt in range(1, 4):
            if attempt > 1:
                time.sleep(self.delay_seconds * attempt + random.uniform(0.15, 0.45))
            req_headers = dict(self.headers)
            if extra_headers:
                req_headers.update(extra_headers)
            current_ref = referer_candidates[(attempt - 1) % len(referer_candidates)]
            if current_ref:
                req_headers["Referer"] = current_ref

            try:
                if curl_sess is not None:
                    proxies = {"http": self.proxy_url, "https": self.proxy_url} if self.proxy_url else None
                    res = curl_sess.get(
                        url,
                        headers=req_headers,
                        impersonate=profiles[(attempt - 1) % len(profiles)],
                        timeout=25,
                        allow_redirects=True,
                        proxies=proxies,
                    )
                else:
                    res = self._httpx_client.get(url, headers=req_headers)

                status = int(getattr(res, "status_code", 0) or 0)
                body = res.text or ""
                if status in (403, 429, 503):
                    blocked_err = SourceBlockedError(f"HTTP {status} tại {host}", status_code=status, host=host)
                    last_err = blocked_err
                    continue
                if "cf-browser-verification" in body or "<title>Just a moment...</title>" in body:
                    blocked_err = SourceBlockedError(f"Cloudflare challenge tại {host}", status_code=403, host=host)
                    last_err = blocked_err
                    continue

                res.raise_for_status()
                return body
            except SourceBlockedError as b_err:
                blocked_err = b_err
                last_err = b_err
            except Exception as err:
                last_err = err

        if blocked_err is not None:
            raise blocked_err
        raise RuntimeError(f"GET thất bại ({url}): {last_err}")

    def fetch_latest_updates(self) -> list[ComicSummary]:
        if "/truyen-tranh/" in self.feed_url:
            return [ComicSummary(title="", url=self.feed_url)]

        if self.feed_url.endswith(".xml") or "rss" in self.feed_url or "feed" in self.feed_url:
            feed = feedparser.parse(self.feed_url)
            items: list[ComicSummary] = []
            for entry in feed.entries[:30]:
                title = entry.get("title", "").strip()
                link = entry.get("link", "").strip()
                if title and link:
                    items.append(ComicSummary(title=title, url=self._normalize_url(link, self.base_url)))
            return items

        html = self._get(self.feed_url)
        soup = BeautifulSoup(html, "html.parser")
        results: list[ComicSummary] = []
        seen_urls: set[str] = set()

        for card in soup.select(".items .item, article, .comic-item, .item, .manga-item"):
            link_el = card.select_one("figure.clearfix .image a, .image a, a[href]")
            title_el = card.select_one("h3 a, h2, h3, .title, .comic-title")
            img_el = card.select_one("img")
            if not link_el:
                continue

            href = self._normalize_url(link_el.get("href", ""), self.feed_url)
            title = (title_el.get_text(strip=True) if title_el else link_el.get("title", "")).strip()
            cover = ""
            if img_el:
                raw_cov = (
                    img_el.get("data-full-src")
                    or img_el.get("data-original")
                    or img_el.get("data-src")
                    or img_el.get("src")
                    or ""
                )
                if raw_cov and not raw_cov.startswith("data:"):
                    cover = self._normalize_url(raw_cov, self.feed_url)

            if title and href and href not in seen_urls:
                seen_urls.add(href)
                results.append(ComicSummary(title=title, url=href, cover_url=cover))

        return results[:30]

    def _parse_chapter_entries(self, soup: BeautifulSoup, page_url: str) -> list[ChapterInfo]:
        chapters: list[ChapterInfo] = []
        seen_nums: set[float] = set()

        chapter_links = soup.select(
            "#nt_listchapter nav ul li.row:not(.heading) .chapter a, "
            "#nt_listchapter .chapter a, #list-chapter a, .list-chapter a, "
            ".list_chapter a, .chapter-list a, .works-chapter-list a, "
            ".box-list-chapter a, .row-content-chapter a, .wp-manga-chapter a, "
            "ul.chapters a, .episode-list a"
        )
        if not chapter_links:
            chapter_links = [
                a
                for a in soup.select("a[href]")
                if any(
                    k in (a.get("href") or "").lower()
                    for k in ("/chuong-", "/chapter-", "chap-", "chap_", "-chuong-")
                )
            ]

        for a in chapter_links:
            href = self._normalize_url(a.get("href", ""), page_url)
            text = a.get_text(" ", strip=True)
            match = re.search(r"(?:chap(?:ter)?|chương)\s*(\d+(?:\.\d+)?)", text, re.IGNORECASE)
            if not match:
                match = re.search(r"(\d+(?:\.\d+)?)", text)
            if not match:
                match = re.search(r"(?:chuong|chapter|chap)[-_]?(\d+(?:\.\d+)?)", href, re.IGNORECASE)
            if match and href:
                num = float(match.group(1))
                if num not in seen_nums:
                    seen_nums.add(num)
                    chap_title = text if re.search(r"\d", text) else f"Chapter {num:g}"
                    chapters.append(ChapterInfo(chapter_number=num, title=chap_title, url=href))

        for opt in soup.select("select.select-chapter option, .chapter-nav select option, select[name*='chapter'] option"):
            raw_val = (opt.get("value") or opt.get("data-url") or "").strip()
            if not raw_val or raw_val.startswith("#"):
                continue
            href = self._normalize_url(raw_val, page_url)
            text = opt.get_text(" ", strip=True)
            match = re.search(r"(?:chap(?:ter)?|chương)\s*(\d+(?:\.\d+)?)", text, re.IGNORECASE)
            if not match:
                match = re.search(r"(?:chuong|chapter|chap)[-_]?(\d+(?:\.\d+)?)", href, re.IGNORECASE)
            if match and href:
                num = float(match.group(1))
                if num not in seen_nums:
                    seen_nums.add(num)
                    chap_title = text if re.search(r"\d", text) else f"Chapter {num:g}"
                    chapters.append(ChapterInfo(chapter_number=num, title=chap_title, url=href))

        chapters.sort(key=lambda c: c.chapter_number)
        return chapters

    def _try_fetch_ajax_chapters(self, comic_url: str, soup: BeautifulSoup) -> list[ChapterInfo]:
        origin = self._origin_of(comic_url).rstrip("/")
        comic_id = ""
        id_match = re.search(r"-(\d+)(?:/)?$", comic_url)
        if id_match:
            comic_id = id_match.group(1)
        if not comic_id:
            el_with_id = soup.select_one("[data-id], input#comicId, input[name='comicId']")
            if el_with_id:
                comic_id = (el_with_id.get("data-id") or el_with_id.get("value") or "").strip()

        if not comic_id:
            return []

        ajax_endpoints = [
            f"{origin}/Comic/Services/ComicService.asmx/GetChapterList?comicId={comic_id}",
            f"{origin}/Comic/Services/ComicService.asmx/ProcessRequest?comicId={comic_id}",
        ]
        for ep in ajax_endpoints:
            try:
                raw_resp = self._get(
                    ep,
                    referer=comic_url,
                    extra_headers={"X-Requested-With": "XMLHttpRequest"},
                )
                if not raw_resp:
                    continue
                cleaned = raw_resp.replace("\\/", "/").replace('\\"', '"')
                sub_soup = BeautifulSoup(cleaned, "html.parser")
                parsed = self._parse_chapter_entries(sub_soup, comic_url)
                if len(parsed) > 2:
                    return parsed
            except Exception:
                continue
        return []

    def fetch_comic_metadata(self, comic_url: str) -> ComicDetail:
        html = self._get(comic_url, referer=self._origin_of(comic_url))
        soup = BeautifulSoup(html, "html.parser")

        title_el = soup.select_one("h1.title-detail, h1, .comic-title, .post-title")
        title = title_el.get_text(strip=True) if title_el else "Truyện Chưa Đặt Tên"

        alt_el = soup.select_one(".other-name, h2.other-name")
        alt_titles = alt_el.get_text(" ", strip=True) if alt_el else ""

        desc_el = soup.select_one(".detail-content p, .detail-content, .description, .summary, #summary")
        description = desc_el.get_text(" ", strip=True) if desc_el else ""

        cover_el = soup.select_one(
            ".detail-info .col-image img, .comic-cover img, .thumb img, .summary_image img, "
            "img[alt*='Bìa'], img[alt*='truyện'], img[alt*='Truyện'], .rounded-lg img, img.object-cover"
        )
        cover_url = ""
        if cover_el:
            raw_cover = (
                cover_el.get("data-full-src")
                or cover_el.get("data-original")
                or cover_el.get("data-src")
                or cover_el.get("data-lazy-src")
                or cover_el.get("src")
                or ""
            )
            if raw_cover and not raw_cover.startswith("data:"):
                cover_url = self._normalize_url(raw_cover, comic_url)

        status_el = soup.select_one(".status p.col-xs-8, .post-status .summary-content")
        status_text = status_el.get_text(strip=True).lower() if status_el else ""
        status = "completed" if ("hoàn thành" in status_text or "completed" in status_text) else "ongoing"

        raw_genres = [
            g.get_text(" ", strip=True)
            for g in soup.select(
                ".kind p.col-xs-8 a, .kind .col-xs-8 a, li.kind a, .kind a, "
                ".genres a, .genres-content a, .genre-list a, .category a, .categories a, "
                ".tags a, .tag-list a, .list01 a, .list-tag a, "
                ".list-info a[href*='the-loai'], .detail-info a[href*='the-loai'], "
                ".comic-info a[href*='the-loai'], a[href*='/the-loai'], "
                "a[href*='/genre/'], a[href*='/genres/'], a[href*='/tag/'], a[href*='/category/']"
            )
            if g.get_text(" ", strip=True)
        ]
        if not raw_genres:
            for row in soup.select(".list-info li, .detail-info li, .info-item, tr, .meta-data"):
                txt = re.sub(r"\s+", " ", row.get_text(" ", strip=True))
                m_gen = re.match(r"^(?:thể loại|genres?|categories?|tags?)\s*[:：]\s*(.+)$", txt, re.IGNORECASE)
                if m_gen:
                    parts = [p.strip() for p in re.split(r"[,;/|•·]", m_gen.group(1)) if p.strip()]
                    raw_genres.extend(parts)
                    break

        skip_genre_tokens = {
            "tất cả", "all", "đang cập nhật", "truyện tranh", "thể loại",
            "home", "trang chủ", "hot", "mới cập nhật", "full", "hoàn thành",
        }
        genres: list[str] = []
        seen_g: set[str] = set()
        for g_name in raw_genres:
            clean_g = re.sub(r"\s+", " ", g_name).strip(" ,;-|#")
            low_g = clean_g.lower()
            if not clean_g or len(clean_g) > 45 or low_g in skip_genre_tokens or low_g in seen_g:
                continue
            seen_g.add(low_g)
            genres.append(clean_g)
        if not genres:
            print(f"[Cảnh báo thể loại] Không bóc tách được thể loại tại {comic_url}")

        author = ""
        author_el = soup.select_one(
            ".author p.col-xs-8, .author .col-xs-8, .author-content, "
            ".info-item .author, li.author p:last-child, "
            ".detail-info a[href*='tac-gia'], a[href*='/tac-gia/'], a[href*='/author/']"
        )
        if author_el:
            author = re.sub(r"\s+", " ", author_el.get_text(" ", strip=True)).strip()
        if not author:
            for li in soup.select(".list-info li, .detail-info li, .info-item, tr"):
                txt = re.sub(r"\s+", " ", li.get_text(" ", strip=True))
                m_au = re.match(r"^(?:tác giả|author)\s*[:：]?\s*(.+)$", txt, re.IGNORECASE)
                if m_au:
                    author = m_au.group(1).strip()
                    break
        if author.lower() in {"đang cập nhật", "updating", "unknown", "n/a", "chưa rõ", "none", "-", ""}:
            author = ""

        chapters = self._parse_chapter_entries(soup, comic_url)

        if len(chapters) <= 2:
            ajax_chapters = self._try_fetch_ajax_chapters(comic_url, soup)
            if len(ajax_chapters) > len(chapters):
                chapters = ajax_chapters

        if len(chapters) <= 2 and chapters:
            try:
                sample_chap_html = self._get(chapters[0].url, referer=comic_url)
                sample_soup = BeautifulSoup(sample_chap_html, "html.parser")
                dropdown_chapters = self._parse_chapter_entries(sample_soup, chapters[0].url)
                if len(dropdown_chapters) > len(chapters):
                    chapters = dropdown_chapters
            except Exception:
                pass

        return ComicDetail(
            title=title,
            alt_titles=alt_titles,
            description=description,
            cover_url=cover_url,
            status=status,
            genres=genres,
            chapters=chapters,
            author=author,
        )

    def fetch_chapter_images(self, chapter_url: str, referer_url: str = "") -> list[str]:
        ref = referer_url or self._origin_of(chapter_url)
        html = self._get(chapter_url, referer=ref)
        soup = BeautifulSoup(html, "html.parser")
        page_title = soup.title.get_text(strip=True) if soup.title else "No Title"

        if "login" in page_title.lower() or "đăng nhập" in page_title.lower():
            raise RuntimeError(
                f"Trang bị chuyển hướng sang Login ('{page_title}') tại {chapter_url}. "
                "Nguồn chặn IP nước ngoài của GitHub Actions hoặc yêu cầu Cookie đăng nhập (CRAWLER_COOKIE)."
            )

        imgs: list[str] = []
        skip_keywords = (
            "logo", "loading", "loader", "spinner", "icon",
            "ads", "advert", "donate", "credit", "avatar", "facebook",
            "zalo", "telegram", "discord", "qr", "placeholder", "1x1", "blank"
        )
        img_attrs = (
            "data-full-src", "data-original", "data-src", "data-cdn", "data-sv1", "data-sv2",
            "data-lazy-src", "data-lazy", "data-url", "data-image",
            "data-img", "data-echo", "data-cfsrc", "src",
        )

        def _extract_candidates(img_tag) -> list[str]:
            found: list[str] = []
            for srcset_attr in ("data-srcset", "srcset"):
                srcset = (img_tag.get(srcset_attr) or "").strip()
                if srcset:
                    best_entry = srcset.split(",")[-1].strip().split(" ")[0].strip()
                    if best_entry and not best_entry.startswith("data:") and best_entry not in found:
                        found.append(best_entry)
            for attr in img_attrs:
                val = (img_tag.get(attr) or "").strip()
                if val and not val.startswith("data:") and val not in found:
                    found.append(val)
            onerror_js = (img_tag.get("onerror") or "").strip()
            if onerror_js:
                for m in re.finditer(r"""(?:this\.src|src)\s*=\s*['"]([^'"]+)['"]""", onerror_js):
                    cand = m.group(1).strip()
                    if cand and not cand.startswith("data:") and cand not in found:
                        found.append(cand)
            return found

        def _is_valid(url_str: str) -> bool:
            low = url_str.lower()
            if not low or low.startswith("data:") or low.startswith("blob:"):
                return False
            if any(k in low for k in skip_keywords):
                return False
            if low.endswith(".svg") or low.endswith(".gif"):
                return False
            return True

        reader_selectors = (
            ".reading-detail .page-chapter img, .reading-detail img, "
            ".reading-content img, .reading-box img, .read-content img, .reading img, "
            ".chapter-content img, .chapter_content img, .chapter-c img, .chapter-detail img, "
            ".page-chapter img, .page-break img, .box-reading img, .content-chapter img, "
            ".container-chapter img, .list-img img, .chapter-imgs img, .img-chapter img, "
            "#chapter_content img, #chapter-content img, #vungdoc img, #vung-doc img, "
            ".vung-doc img, .vung_doc img, #reader img, .viewer img, .comic-viewer img, "
            "article img, main img, .container img, .content img"
        )
        for img in soup.select(reader_selectors):
            cands = [self._normalize_url(c, chapter_url) for c in _extract_candidates(img) if _is_valid(c)]
            if cands:
                packed = "|".join(dict.fromkeys(cands))
                if packed not in imgs:
                    imgs.append(packed)

        if imgs:
            return imgs

        excluded_tags = {"header", "footer", "nav", "aside"}
        excluded_tokens = (
            "header", "footer", "navbar", "sidebar", "related", "recommend",
            "comment", "modal", "popup", "menu", "breadcrumb", "social", "ads"
        )
        for img in soup.find_all("img"):
            if any(
                p.name in excluded_tags
                or any(
                    tok in (" ".join(p.get("class") or []) + " " + (p.get("id") or "")).lower()
                    for tok in excluded_tokens
                )
                for p in img.parents
            ):
                continue

            cands = [self._normalize_url(c, chapter_url) for c in _extract_candidates(img) if _is_valid(c)]
            if not cands:
                continue

            meta_hint = (
                f"{img.get('alt') or ''} {img.get('id') or ''} "
                f"{' '.join(img.get('class') or [])} {cands[0]}"
            ).lower()
            if any(
                h in meta_hint
                for h in ("trang", "page", "chap", "chuong", "comic", "manga", "truyen", "cdn", "storage", "/0", "/1")
            ):
                packed = "|".join(dict.fromkeys(cands))
                if packed not in imgs:
                    imgs.append(packed)

        if imgs:
            return imgs

        url_pattern = re.compile(
            r"""["']((?:https?:)?//[^"'\s<>\\]+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\s<>\\]*)?)["']""",
            re.IGNORECASE,
        )
        for script in soup.find_all("script"):
            script_text = script.string or script.get_text() or ""
            if script_text:
                cleaned_script = script_text.replace("\\/", "/")
                for match in url_pattern.finditer(cleaned_script):
                    raw_u = match.group(1)
                    if _is_valid(raw_u):
                        normalized = self._normalize_url(raw_u, chapter_url)
                        if normalized not in imgs:
                            imgs.append(normalized)

        if not imgs:
            total_imgs = len(soup.find_all("img"))
            raise RuntimeError(
                f"Không tìm thấy ảnh nào trong chương (URL={chapter_url}, Title='{page_title}', TotalImgTags={total_imgs})."
            )

        return imgs
