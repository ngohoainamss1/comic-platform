import re
import time
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


class StandardHtmlRssAdapter(BaseSourceAdapter):
    def __init__(self, base_url: str, feed_url: str, delay_seconds: float = 0.8):
        super().__init__(base_url, feed_url)
        self.delay_seconds = delay_seconds
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            "Upgrade-Insecure-Requests": "1",
        }

    def _origin_of(self, url: str) -> str:
        parsed = urlparse(url)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}/"
        return self.base_url.rstrip("/") + "/"

    def _normalize_url(self, raw_url: str, page_url: str) -> str:
        if not raw_url:
            return ""
        raw_url = raw_url.strip()
        if raw_url.startswith("//"):
            return f"https:{raw_url}"
        return urljoin(page_url, raw_url)

    def _get(self, url: str, referer: str = "") -> str:
        origin = self._origin_of(url)
        referer_candidates = []
        for candidate in (referer, origin, ""):
            if candidate not in referer_candidates:
                referer_candidates.append(candidate)

        profiles = ["chrome", "edge", "safari"]
        last_err = None

        for attempt in range(1, 4):
            time.sleep(self.delay_seconds * attempt)
            req_headers = dict(self.headers)
            current_ref = referer_candidates[(attempt - 1) % len(referer_candidates)]
            if current_ref:
                req_headers["Referer"] = current_ref

            try:
                if curl_requests is not None:
                    curl_opts = {CurlOpt.DOH_URL: "https://1.1.1.1/dns-query"} if CurlOpt else {}
                    res = curl_requests.get(
                        url,
                        headers=req_headers,
                        impersonate=profiles[(attempt - 1) % len(profiles)],
                        timeout=25,
                        allow_redirects=True,
                        curl_options=curl_opts,
                    )
                    res.raise_for_status()
                    return res.text

                with httpx.Client(timeout=25.0, follow_redirects=True, headers=req_headers) as client:
                    res = client.get(url)
                    res.raise_for_status()
                    return res.text
            except Exception as err:
                last_err = err

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
                raw_cov = img_el.get("data-original") or img_el.get("data-src") or img_el.get("src") or ""
                if raw_cov and not raw_cov.startswith("data:"):
                    cover = self._normalize_url(raw_cov, self.feed_url)

            if title and href and href not in seen_urls:
                seen_urls.add(href)
                results.append(ComicSummary(title=title, url=href, cover_url=cover))

        return results[:30]

    def fetch_comic_metadata(self, comic_url: str) -> ComicDetail:
        html = self._get(comic_url, referer=self._origin_of(comic_url))
        soup = BeautifulSoup(html, "html.parser")

        title_el = soup.select_one("h1.title-detail, h1, .comic-title, .post-title")
        title = title_el.get_text(strip=True) if title_el else "Truyện Chưa Đặt Tên"

        alt_el = soup.select_one(".other-name, h2.other-name")
        alt_titles = alt_el.get_text(" ", strip=True) if alt_el else ""

        desc_el = soup.select_one(".detail-content p, .detail-content, .description, .summary, #summary")
        description = desc_el.get_text(" ", strip=True) if desc_el else ""

        cover_el = soup.select_one(".detail-info .col-image img, .comic-cover img, .thumb img, .summary_image img")
        cover_url = ""
        if cover_el:
            raw_cover = (
                cover_el.get("data-original")
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

        genres = [
            g.get_text(strip=True)
            for g in soup.select(".kind p.col-xs-8 a, .genres a, .tags a, a[href*='the-loai']")
            if g.get_text(strip=True)
        ]

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
            href = self._normalize_url(a.get("href", ""), comic_url)
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

        chapters.sort(key=lambda c: c.chapter_number)

        return ComicDetail(
            title=title,
            alt_titles=alt_titles,
            description=description,
            cover_url=cover_url,
            status=status,
            genres=genres,
            chapters=chapters,
        )

    def fetch_chapter_images(self, chapter_url: str) -> list[str]:
        html = self._get(chapter_url, referer=self._origin_of(chapter_url))
        soup = BeautifulSoup(html, "html.parser")
        imgs: list[str] = []

        img_nodes = soup.select(
            ".reading-detail .page-chapter img, .reading-detail img, "
            ".reading-content img, .chapter-content img, .page-chapter img, "
            ".box-reading img, .content-chapter img, #chapter_content img, #reader img"
        )
        skip_keywords = ("logo", "loading", "icon", "banner", "ads", "donate", "credit", "avatar")

        for img in img_nodes:
            src = (
                img.get("data-original")
                or img.get("data-src")
                or img.get("data-cdn")
                or img.get("data-sv1")
                or img.get("data-sv2")
                or img.get("data-lazy-src")
                or img.get("src")
                or ""
            ).strip()
            if src and not src.startswith("data:") and not any(k in src.lower() for k in skip_keywords):
                normalized = self._normalize_url(src, chapter_url)
                if normalized not in imgs:
                    imgs.append(normalized)

        return imgs
