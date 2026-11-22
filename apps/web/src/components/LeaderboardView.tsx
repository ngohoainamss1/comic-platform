import React, { useEffect, useState } from 'react';
import { Eye, ThumbsUp, Trophy } from 'lucide-react';
import {
  type LeaderboardCategory,
  type LeaderboardPeriod,
  type LeaderboardPayload,
  fetchLeaderboard,
  resolveAssetUrl,
} from '../lib/api';
import { buildUrlFromRoute, pushRoute, type RouteState } from '../lib/router';
import { getAvatarUrl } from '../lib/memes';

interface LeaderboardViewProps {
  category: LeaderboardCategory;
  period: LeaderboardPeriod;
  page: number;
  onNavigate: (route: RouteState) => void;
  onOpenComic: (slug: string) => void;
}

const CATEGORY_TITLES: Record<LeaderboardCategory, string> = {
  manga: 'TOP TRUYỆN HENTAI',
  artists: 'TOP ARTIST',
  translator: 'TOP DỊCH GIẢ',
  member: 'THÁNH LỌ BẢNG',
  waifu: 'TOP HAREM',
};

const CATEGORY_TABS: Array<{ id: LeaderboardCategory; label: string }> = [
  { id: 'manga', label: 'Top Truyện hentai' },
  { id: 'artists', label: 'Top Artist' },
  { id: 'translator', label: 'Top Dịch Giả' },
  { id: 'member', label: 'Thánh Lọ Bảng' },
  { id: 'waifu', label: 'Top Harem' },
];

const PERIOD_TABS: Array<{ id: LeaderboardPeriod; label: string }> = [
  { id: 'daily', label: 'Top ngày' },
  { id: 'weekly', label: 'Top 7 ngày' },
  { id: 'monthly', label: 'Top tháng' },
  { id: 'all-time', label: 'Mọi thời đại' },
];

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  category,
  period,
  page,
  onNavigate,
  onOpenComic,
}) => {
  const [data, setData] = useState<LeaderboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    document.title = `${CATEGORY_TITLES[category] || 'Bảng Xếp Hạng'} | VinaHentai`;
    fetchLeaderboard(category, period, page)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [category, period, page]);

  const getRankColorClass = (rank: number) => {
    if (rank === 1) return 'text-[#FFE133]';
    if (rank === 2) return 'text-[#5BD8FA]';
    if (rank === 3) return 'text-[#FF7158]';
    return 'text-txt-primary';
  };

  return (
    <div className="container-page flex flex-col items-center justify-center gap-11 px-4 py-8 md:px-6 lg:px-0">
      {/* Pills danh mục BXH */}
      <div className="mx-auto flex w-full max-w-[750px] flex-wrap items-center justify-center gap-2 self-center sm:w-fit sm:max-w-none sm:gap-4">
        {CATEGORY_TABS.map((tab) => {
          const isActive = category === tab.id;
          return (
            <a
              key={tab.id}
              href={buildUrlFromRoute({
                view: 'leaderboard',
                leaderboardCategory: tab.id,
                leaderboardPeriod: period,
                page: 1,
              })}
              aria-current={isActive ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                onNavigate({
                  view: 'leaderboard',
                  leaderboardCategory: tab.id,
                  leaderboardPeriod: period,
                  page: 1,
                });
              }}
              className={`inline-flex cursor-pointer items-center justify-center rounded-[32px] px-3 py-1.5 text-center text-xs leading-normal font-medium whitespace-nowrap backdrop-blur-[3.4px] transition-colors select-none touch-manipulation [touch-action:manipulation] sm:px-4 sm:py-2 sm:text-base ${
                isActive ? 'bg-btn-primary text-txt-inverse font-bold' : 'bg-bgc-layer-semi-neutral text-txt-primary hover:opacity-90'
              }`}
            >
              {tab.label}
            </a>
          );
        })}
      </div>

      {/* Tiêu đề H1 */}
      <h1 className="w-full text-center text-4xl leading-10 font-semibold tracking-wide">
        {CATEGORY_TITLES[category]}
      </h1>

      {/* Khung Card BXH */}
      <div className="w-full max-w-[750px] rounded-xl bg-bgc-layer1 outline-1 outline-offset-[-1px] outline-bd-default shadow-xl">
        <div dir="ltr" data-orientation="horizontal" className="w-full">
          {/* Tablist mốc thời gian */}
          <div
            role="tablist"
            aria-orientation="horizontal"
            className="flex w-full overflow-x-auto border-b border-bd-default no-scrollbar"
          >
            {PERIOD_TABS.map((tab) => {
              const isPeriodActive = period === tab.id;
              return (
                <a
                  key={tab.id}
                  role="tab"
                  aria-selected={isPeriodActive}
                  data-state={isPeriodActive ? 'active' : 'inactive'}
                  href={buildUrlFromRoute({
                    view: 'leaderboard',
                    leaderboardCategory: category,
                    leaderboardPeriod: tab.id,
                    page: 1,
                  })}
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate({
                      view: 'leaderboard',
                      leaderboardCategory: category,
                      leaderboardPeriod: tab.id,
                      page: 1,
                    });
                  }}
                  className="data-[state=active]:border-lav-500 data-[state=active]:text-txt-primary text-txt-secondary hover:text-txt-primary flex min-h-12 flex-1 items-center justify-center whitespace-nowrap border-b-2 border-transparent bg-transparent px-2 py-3 text-center text-sm font-medium transition-colors data-[state=active]:font-semibold sm:px-3 sm:text-base"
                >
                  {tab.label}
                </a>
              );
            })}
          </div>

          {/* Tabpanel danh sách xếp hạng */}
          <div role="tabpanel" className="space-y-0 pb-4 divide-y divide-white/5">
            {loading ? (
              <div className="py-20 text-center text-txt-secondary">Đang tải bảng xếp hạng...</div>
            ) : !data || data.items.length === 0 ? (
              <div className="py-16 text-center text-txt-secondary text-sm">Chưa có dữ liệu xếp hạng.</div>
            ) : (
              data.items.map((item, index) => {
                const rank = (data.pagination.startRank || 1) + index;
                const displayName = item.title || item.name || item.slug;

                if (category === 'manga' || category === 'waifu') {
                  return (
                    <a
                      key={item.id}
                      href={`/comic/${item.slug}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onOpenComic(item.slug);
                      }}
                      className="flex items-start gap-3 p-3 transition-colors hover:bg-white/[0.03]"
                    >
                      <span className={`w-5 text-center text-base font-semibold ${getRankColorClass(rank)}`}>
                        {rank}
                      </span>
                      <div
                        className="flex-shrink-0 overflow-hidden bg-black/20 rounded-lg aspect-[2/3]"
                        style={{ width: '94.08px' }}
                      >
                        <img
                          src={resolveAssetUrl(item.cover_url || '')}
                          alt={displayName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-txt-primary line-clamp-2 text-base leading-6 font-semibold hover:text-lav-400 transition">
                          {displayName}
                        </div>
                        <div className="flex items-center justify-start gap-4 pt-1">
                          <div className="flex items-center gap-1.5 backdrop-blur-md">
                            <Eye aria-hidden="true" className="text-txt-primary h-3 w-3" />
                            <span className="text-txt-primary text-xs font-medium">
                              {Number(item.views || 0).toLocaleString('vi-VN')}
                              <span className="sr-only"> lượt xem</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 backdrop-blur-md">
                            <ThumbsUp aria-hidden="true" className="text-txt-primary h-3 w-3" />
                            <span className="text-txt-primary text-xs font-medium">
                              {Number(item.likes_count || 0).toLocaleString('vi-VN')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </a>
                  );
                }

                // Artists, Translator, Member
                const avatar = category === 'member'
                  ? getAvatarUrl(item.avatar_seed || item.slug, item.slug)
                  : resolveAssetUrl(item.cover_url || '');

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (category === 'artists') {
                        onNavigate({ view: 'browse', author: item.slug, page: 1 });
                      } else if (category === 'translator') {
                        onNavigate({ view: 'browse', q: item.name, page: 1 });
                      }
                    }}
                    className="flex items-center gap-3 p-3 transition-colors hover:bg-white/[0.03] cursor-pointer"
                  >
                    <span className={`w-5 text-center text-base font-semibold ${getRankColorClass(rank)}`}>
                      {rank}
                    </span>
                    <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-bgc-layer2 border border-bd-default flex items-center justify-center">
                      <img
                        src={avatar}
                        alt={displayName}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-txt-primary line-clamp-1 text-base leading-6 font-semibold hover:text-lav-400 transition">
                        {displayName}
                      </div>
                      <div className="flex items-center justify-start gap-4 text-xs text-txt-secondary">
                        {category === 'member' ? (
                          <span>Điểm hoạt động: <strong className="text-txt-primary">{Number(item.score || 0).toLocaleString('vi-VN')}</strong></span>
                        ) : (
                          <>
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" /> {Number(item.views || 0).toLocaleString('vi-VN')}
                            </span>
                            <span>{item.comic_count || 0} truyện</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Phân trang */}
            {data && data.pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4 px-3">
                {Array.from({ length: data.pagination.totalPages }).map((_, i) => {
                  const p = i + 1;
                  const isCurrent = p === page;
                  return (
                    <button
                      key={p}
                      onClick={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        onNavigate({
                          view: 'leaderboard',
                          leaderboardCategory: category,
                          leaderboardPeriod: period,
                          page: p,
                        });
                      }}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                        isCurrent
                          ? 'bg-lav-500 text-white border-lav-500'
                          : 'bg-bgc-layer2 border-bd-default text-txt-secondary hover:text-txt-primary'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
