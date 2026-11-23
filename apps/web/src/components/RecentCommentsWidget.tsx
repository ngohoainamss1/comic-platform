import React, { useEffect, useState } from 'react';
import { MessageSquare, User } from 'lucide-react';
import { fetchRecentComments, RecentCommentItem, resolveAssetUrl } from '../lib/api';
import { getAvatarUrl, resolveMemeUrl } from '../lib/memes';

interface RecentCommentsWidgetProps {
  onSelectComic: (slug: string) => void;
  onSelectUser?: (userId: string) => void;
}

function formatShortTime(dateStr: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
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
    return () => {
      mounted = false;
      window.removeEventListener('comic:comment-posted', handleCommentPosted);
    };
  }, []);

  return (
    <div className="bg-bgc-layer1 border-bd-default w-full overflow-hidden rounded-2xl border p-0 ml-auto shadow-md">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3.5 border-b border-bd-default bg-bgc-layer2/50">
        <MessageSquare className="h-5 w-5 text-lav-400" aria-hidden="true" />
        <span className="text-txt-primary text-base font-semibold uppercase tracking-wide">
          Bình Luận
        </span>
      </div>

      {/* Danh sách bình luận */}
      {loading ? (
        <div className="divide-y divide-bd-default flex flex-col px-3 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 py-3 animate-pulse">
              <div className="h-8 w-8 rounded-full bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 rounded bg-white/10" />
                <div className="h-3.5 w-full rounded bg-white/10" />
              </div>
              <div className="w-[39.2px] sm:w-[44.8px] aspect-[2/3] rounded-md bg-white/10 shrink-0" />
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-txt-secondary">
          Chưa có bình luận nào.
        </div>
      ) : (
        <ul className="divide-y divide-bd-default flex max-h-[520px] flex-col overflow-y-auto overflow-x-hidden overscroll-contain no-scrollbar">
          {comments.map((item) => {
            const displayName = item.display_name || item.username || 'Ẩn danh';
            const replyName = item.reply_to_name || item.reply_to_username;
            const avatarSrc = item.avatar_url || getAvatarUrl(item.avatar_seed, displayName);
            const stickerUrl = resolveMemeUrl(item.meme_url);

            return (
              <li key={item.id} className="flex items-start gap-3 px-3.5 py-3 hover:bg-white/[0.02] transition">
                {/* Avatar */}
                <button
                  type="button"
                  onClick={() => item.user_id && onSelectUser?.(String(item.user_id))}
                  aria-label={`Xem trang cá nhân ${displayName}`}
                  className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#121826] ring-1 ring-white/10"
                >
                  <User className="h-4 w-4 text-txt-primary" aria-hidden="true" />
                  {avatarSrc && (
                    <img
                      src={avatarSrc}
                      alt={displayName}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                </button>

                {/* Nội dung giữa */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-txt-secondary flex-wrap">
                    <button
                      type="button"
                      onClick={() => item.user_id && onSelectUser?.(String(item.user_id))}
                      title={displayName}
                      className="text-left font-semibold text-white/90 hover:text-lav-300 truncate max-w-[38%]"
                    >
                      {displayName}
                    </button>
                    <span className="text-white/40">→</span>
                    <a
                      href={`/truyen/${item.comic_slug}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onSelectComic(item.comic_slug);
                      }}
                      className="truncate max-w-[38%] text-lav-400 hover:text-lav-300 font-medium"
                      title={item.comic_title}
                    >
                      {item.comic_title}
                    </a>
                    <span className="ml-auto shrink-0 text-[11px] text-txt-secondary">
                      {formatShortTime(item.created_at)}
                    </span>
                  </div>

                  {/* Reply info */}
                  {replyName && (
                    <div className="flex items-center text-[11px] text-txt-secondary">
                      <span className="truncate max-w-[60%] font-medium text-lav-300">
                        ↳ {replyName}
                      </span>
                    </div>
                  )}

                  <div className="text-sm leading-relaxed text-white/90 break-words line-clamp-3">
                    {item.content}
                    {stickerUrl && (
                      <div className="mt-1.5">
                        <img
                      src={stickerUrl}
                          alt="sticker"
                          className="inline-block h-12 w-12 rounded object-cover border border-bd-default bg-black/40"
                          loading="lazy"
                        />
                      </div>
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
                  className="ml-1 flex flex-shrink-0 overflow-hidden rounded-md border border-bd-default hover:border-lav-500 transition"
                  aria-label={item.comic_title}
                >
                  <div className="w-[39.2px] sm:w-[44.8px] aspect-[2/3] bg-black/40">
                    {item.comic_cover_url ? (
                      <img
                        src={resolveAssetUrl(item.comic_cover_url)}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover opacity-85 hover:opacity-100 transition-opacity"
                      />
                    ) : (
                      <div className="w-full h-full bg-bgc-layer2" />
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
