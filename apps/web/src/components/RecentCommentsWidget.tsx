import React, { useEffect, useState } from 'react';
import { MessageSquare, User } from 'lucide-react';
import { fetchRecentComments, RecentCommentItem, resolveAssetUrl } from '../lib/api';
import { getAvatarUrl, resolveMemeUrl } from '../lib/memes';

interface RecentCommentsWidgetProps {
  onSelectComic: (slug: string) => void;
  onSelectUser?: (userId: string) => void;
}

function parseUtcDate(dateStr: string): number {
  if (!dateStr) return NaN;
  const normalized = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
  const full = normalized.endsWith('Z') || normalized.includes('+') ? normalized : `${normalized}Z`;
  return new Date(full).getTime();
}

function formatShortTime(dateStr: string): string {
  const ts = parseUtcDate(dateStr);
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}p`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}g`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}n`;
}

export const RecentCommentsWidget: React.FC<RecentCommentsWidgetProps> = ({
  onSelectComic,
  onSelectUser,
}) => {
  const [comments, setComments] = useState<RecentCommentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadRecent = () => {
      fetchRecentComments(20)
        .then((list) => {
          if (mounted) setComments(list);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    };

    loadRecent();

    const handleCommentPosted = () => {
      loadRecent();
    };
    window.addEventListener('comic:comment-posted', handleCommentPosted);
    const interval = setInterval(loadRecent, 10000);

    return () => {
      mounted = false;
      window.removeEventListener('comic:comment-posted', handleCommentPosted);
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="bg-bgc-layer1 border-bd-default w-full overflow-hidden rounded-2xl border p-0 ml-auto shadow-md">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-bd-default">
        <MessageSquare className="h-5 w-5 text-lav-400 shrink-0" aria-hidden="true" />
        <span className="text-txt-primary text-[15px] font-bold uppercase tracking-wide">
          Bình Luận
        </span>
      </div>

      {/* Danh sách bình luận */}
      {loading ? (
        <div className="divide-y divide-bd-default flex flex-col">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-3.5 py-3 animate-pulse">
              <div className="h-9 w-9 rounded-full bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 rounded bg-white/10" />
                <div className="h-3.5 w-full rounded bg-white/10" />
              </div>
              <div className="w-[46px] h-[64px] rounded-md bg-white/10 shrink-0" />
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-txt-secondary">
          Chưa có bình luận nào.
        </div>
      ) : (
        <ul className="divide-y divide-bd-default flex max-h-[560px] flex-col overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar">
          {comments.map((item) => {
            const displayName = item.display_name || item.username || 'Ẩn danh';
            const replyName = item.reply_to_name || item.reply_to_username;
            const avatarSrc =
              item.avatar_url ||
              (item.avatar_seed ? getAvatarUrl(item.avatar_seed, displayName) : null);
            const stickerUrl = resolveMemeUrl(item.meme_url);
            const isStaff = item.user_role === 'admin' || item.user_role === 'mod';

            return (
              <li
                key={item.id}
                className="group flex items-start gap-3 px-3.5 py-3 hover:bg-white/[0.03] transition-colors"
              >
                {/* Avatar tròn bên trái */}
                <button
                  type="button"
                  onClick={() => item.user_id && onSelectUser?.(String(item.user_id))}
                  aria-label={`Xem trang cá nhân ${displayName}`}
                  className="relative mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-bgc-layer2 ring-1 ring-white/15"
                >
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={displayName}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="h-4 w-4 text-txt-secondary" aria-hidden="true" />
                  )}
                </button>

                {/* Cột nội dung ở giữa */}
                <div className="min-w-0 flex-1">
                  {/* Dòng 1: Tên user -> Tên truyện + Thời gian */}
                  <div className="flex items-center gap-1.5 text-[12.5px] leading-tight">
                    <button
                      type="button"
                      onClick={() => item.user_id && onSelectUser?.(String(item.user_id))}
                      title={displayName}
                      className={`shrink-0 max-w-[38%] truncate text-left font-semibold transition-colors ${
                        isStaff
                          ? 'text-lav-400 hover:text-txt-focus'
                          : 'text-white hover:text-lav-400'
                      }`}
                    >
                      {displayName}
                    </button>

                    <span className="shrink-0 text-white/40 text-xs">→</span>

                    <a
                      href={`/truyen/${item.comic_slug}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onSelectComic(item.comic_slug);
                      }}
                      title={`${item.comic_title}${item.chapter_number !== null && item.chapter_number !== undefined ? ` - Chap ${item.chapter_number}` : ''}`}
                      className="min-w-0 flex-1 truncate text-white/60 hover:text-lav-400 transition-colors"
                    >
                      {item.comic_title}{item.chapter_number !== null && item.chapter_number !== undefined ? ` (Chap ${item.chapter_number})` : ''}
                    </a>

                    <span className="ml-auto shrink-0 pl-1 text-[11.5px] text-white/45">
                      {formatShortTime(item.created_at)}
                    </span>
                  </div>

                  {/* Dòng 2 (nếu là reply): ↳ Tên người được trả lời + nội dung bình luận gốc */}
                  {replyName && (
                    <div className="mt-1 flex items-center gap-1.5 pl-1 text-[11.5px] leading-snug">
                      <span className="shrink-0 font-semibold text-white/90">
                        ↳ {replyName}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-white/45">
                        {item.parent_content?.trim() || 'Bình luận gốc'}
                      </span>
                    </div>
                  )}

                  {/* Dòng 3: Nội dung bình luận + Sticker ngang hàng */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13.5px] leading-snug text-white/95 break-words">
                    {item.content && (
                      <span className="line-clamp-3 break-words">{item.content}</span>
                    )}
                    {stickerUrl && (
                      <img
                        src={stickerUrl}
                        alt="sticker"
                        loading="lazy"
                        className="inline-block h-11 w-11 shrink-0 rounded object-cover"
                      />
                    )}
                  </div>
                </div>

                {/* Ảnh bìa truyện bên phải */}
                <a
                  href={`/truyen/${item.comic_slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onSelectComic(item.comic_slug);
                  }}
                  title={item.comic_title}
                  aria-label={item.comic_title}
                  className="ml-0.5 flex flex-shrink-0 overflow-hidden rounded-[5px] border border-white/10 group-hover:border-lav-400/60 transition-colors"
                >
                  <div className="w-[46px] h-[64px] bg-bgc-layer2">
                    {item.comic_cover_url ? (
                      <img
                        src={resolveAssetUrl(item.comic_cover_url)}
                        alt={item.comic_title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-bgc-layer2" />
                    )}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
