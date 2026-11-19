import re
import time
from urllib.parse import urljoin
import httpx
import feedparser
from bs4 import BeautifulSoup
from .base import BaseSourceAdapter, ComicSummary, ComicDetail, ChapterInfo


class StandardHtmlRssAdapter(BaseSourceAdapter):
    def __init__(self, base_url: str, feed_url: str, delay_seconds: float = 1.5):
        super().__init__(base_url, feed_url)
        self.delay_seconds = delay_seconds
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Linux; Android 14; Pixel 8) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36"
            ),
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
        }

    def _get(self, url: str) -> str:
        time.sleep(self.delay_seconds)
        with httpx.Client(timeout=25.0, follow_redirects=True, headers=self.headers) as client:
            res = client.get(url)
            res.raise_for_status()
            return res.text

    def fetch_latest_updates(self) -> list[ComicSummary]:
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

        for card in soup.select("article, .comic-item, .item, .manga-item"):
            link_el = card.select_one("a[href]")
            title_el = card.select_one("h2, h3, .title, .comic-title")
            img_el = card.select_one("img")
            if not link_el:
                continue

            href = urljoin(self.base_url, link_el.get("href", ""))
            title = (title_el.get_text(strip=True) if title_el else link_el.get("title", "")).strip()
            cover = ""
            if img_el:
                cover = img_el.get("data-src") or img_el.get("src") or ""
                if cover:
                    cover = urljoin(self.base_url, cover)

            if title and href and href not in seen_urls:
                seen_urls.add(href)
                results.append(ComicSummary(title=title, url=href, cover_url=cover))

        return results[:30]

    def fetch_comic_metadata(self, comic_url: str) -> ComicDetail:
        html = self._get(comic_url)
        soup = BeautifulSoup(html, "html.parser")

        title_el = soup.select_one("h1, .comic-title, .post-title")
        title = title_el.get_text(strip=True) if title_el else "Truyện Chưa Đặt Tên"

        desc_el = soup.select_one(".description, .summary, .detail-content, #summary")
        description = desc_el.get_text(" ", strip=True) if desc_el else ""

        cover_el = soup.select_one(".comic-cover img, .thumb img, .summary_image img")
        cover_url = ""
        if cover_el:
            raw_cover = cover_el.get("data-src") or cover_el.get("src") or ""
            cover_url = urljoin(self.base_url, raw_cover) if raw_cover else ""

        genres = [g.get_text(strip=True) for g in soup.select(".genres a, .tags a, a[href*='the-loai']")]

        chapters: list[ChapterInfo] = []
        seen_nums: set[float] = set()
        for a in soup.select(".chapter-list a, .list-chapter a, ul.chapters a, a[href*='chap']"):
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
            alt_titles="",
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

        for img in soup.select(".reading-content img, .chapter-content img, .page-chapter img, #reader img"):
            src = img.get("data-original") or img.get("data-src") or img.get("src") or ""
            src = src.strip()
            if src and not src.startswith("data:"):
                imgs.append(urljoin(self.base_url, src))

        return imgs
