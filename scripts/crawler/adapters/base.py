from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ComicSummary:
    title: str
    url: str
    cover_url: str = ""
    genres: list[str] = field(default_factory=list)


@dataclass
class ChapterInfo:
    chapter_number: float
    title: str
    url: str


@dataclass
class ComicDetail:
    title: str
    alt_titles: str
    description: str
    cover_url: str
    status: str
    genres: list[str]
    chapters: list[ChapterInfo]
    author: str = ""


class BaseSourceAdapter(ABC):
    def __init__(self, base_url: str, feed_url: str):
        self.base_url = base_url.rstrip("/")
        self.feed_url = feed_url

    @abstractmethod
    def fetch_latest_updates(self) -> list[ComicSummary]:
        raise NotImplementedError

    @abstractmethod
    def fetch_comic_metadata(self, comic_url: str) -> ComicDetail:
        raise NotImplementedError

    @abstractmethod
    def fetch_chapter_images(self, chapter_url: str) -> list[str]:
        raise NotImplementedError
