import re
import time
from urllib.parse import urljoin
import httpx
import feedparser
from bs4 import BeautifulSoup
from .base import BaseSourceAdapter, ComicSummary, ComicDetail, ChapterInfo

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    curl_requests = None


class StandardHtmlRssAdapter(BaseSourceAdapter):
    def __init__(self, base_url: str, feed_url: str, delay_seconds: float = 1.5):
        super().__init__(base_url, feed_url)
        self.delay_seconds = delay_seconds
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
            "Referer": self.base_url.rstrip("/") + "/",
        }

    def _get(self, url: str) -> str:
        time.sleep(self.delay_seconds)
        if curl_requests is not None:
            res = curl_requests.get(
                url,
                headers=self.headers,
                impersonate="chrome",
                timeout=25,
                allow_redirects=True,
            )
            res.raise_for_status()
            return res.text

        with httpx.Client(timeout=25.0, follow_redirects=True, headers=self.headers) as client:
            res = client.get(url)
            res.raise_for_status()
            return res.text

    def fetch_latest_updates(self) -> list[ComicSummary]:
        # Nếu feed_url trỏ thẳng tới 1 bộ truyện cụ thể (vd: /truyen-tranh/hell-login...)
        if "/truyen-tranh/" in self.feed_url:
            return [ComicSummary(title="", url=self.feed_url)]

        if self.feed_url.endswith(".xml") or "rss" in self.feed_url or "feed" in self.feed_url:
            feed = feedparser.parse(self.feed_url)
            items: list[ComicSummary] = []
            for entry in feed.entries[:30]:
                title = entry.get("title", "").strip()
                link = entry.get("link", "").strip()
                if title and link:
                    items.append(ComicSummary(title=title, url=urljoin(self.base_url, link)))
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

            href = urljoin(self.base_url, link_el.get("href", ""))
            title = (title_el.get_text(strip=True) if title_el else link_el.get("title", "")).strip()
            cover = ""
            if img_el:
                cover = img_el.get("data-original") or img_el.get("data-src") or img_el.get("src") or ""
                if cover:
                    cover = urljoin(self.base_url, cover)

            if title and href and href not in seen_urls:
                seen_urls.add(href)
                results.append(ComicSummary(title=title, url=href, cover_url=cover))

        return results[:30]

    def fetch_comic_metadata(self, comic_url: str) -> ComicDetail:
        html = self._get(comic_url)
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
            raw_cover = cover_el.get("data-original") or cover_el.get("data-src") or cover_el.get("src") or ""
            cover_url = urljoin(self.base_url, raw_cover) if raw_cover else ""

        genres = [
            g.get_text(strip=True)
            for g in soup.select(".kind p.col-xs-8 a, .genres a, .tags a, a[href*='the-loai']")
        ]

        chapters: list[ChapterInfo] = []
        seen_nums: set[float] = set()
        chapter_links = soup.select(
            "#nt_listchapter nav ul li.row:not(.heading) .chapter a, .chapter-list a, .list-chapter a, ul.chapters a, a[href*='chap']"
        )
        for a in chapter_links:
            href = urljoin(self.base_url, a.get("href", ""))
            text = a.get_text(" ", strip=True)
            match = re.search(r"(?:chap(?:ter)?|chương)\s*(\d+(?:\.\d+)?)", text, re.IGNORECASE)
            if not match:
                match = re.search(r"(\d+(?:\.\d+)?)", text)
            if match and href:
                num = float(match.group(1))
                if num not in seen_nums:
                    seen_nums.add(num)
                    chapters.append(ChapterInfo(chapter_number=num, title=text, url=href))

        chapters.sort(key=lambda c: c.chapter_number)

        return ComicDetail(
            title=title,
            alt_titles=alt_titles,
            description=description,
            cover_url=cover_url,
            status="ongoing",
            genres=genres,
            chapters=chapters,
        )

    def fetch_chapter_images(self, chapter_url: str) -> list[str]:
        html = self._get(chapter_url)
        soup = BeautifulSoup(html, "html.parser")
        imgs: list[str] = []

        img_nodes = soup.select(
            ".reading-detail .page-chapter img, .reading-content img, .chapter-content img, .page-chapter img, #reader img"
        )
        for img in img_nodes:
            src = (
                img.get("data-original")
                or img.get("data-src")
                or img.get("data-cdn")
                or img.get("data-sv1")
                or img.get("src")
                or ""
            ).strip()
            if src and not src.startswith("data:") and "logo" not in src.lower():
                imgs.append(urljoin(self.base_url, src))

        return imgs