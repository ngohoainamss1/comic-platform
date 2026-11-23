import React, { useEffect, useState, useRef } from 'react';
import {
  MessageSquare,
  Heart,
  Smile,
  Send,
  Trash2,
  CornerDownRight,
  X,
  Search,
  Shield,
  Image as ImageIcon,
} from 'lucide-react';
import {
  type CommentItem,
  type UserProfile,
  fetchComments,
  postComment,
  toggleLikeComment,
  deleteComment,
  fetchComicDetail,
  fetchChapterPages,
} from '../lib/api';
import {
  STICKER_PRESETS,
  STICKER_CATEGORIES,
  QUICK_EMOJIS,
  resolveMemeUrl,
  getAvatarUrl,
  HAS_GIF_SEARCH,
  searchGifs,
  type GifItem,
} from '../lib/memes';

interface CommentSectionProps {
  comicId?: number | null;
  comicSlug?: string | null;
  chapterId?: number | null;
  currentUser: UserProfile | null;
  onRequireAuth: () => void;
}

export const CommentSection: React.FC<CommentSectionProps> = ({
  comicId,
  comicSlug,
  chapterId,
  currentUser,
  onRequireAuth,
}) => {
  const [resolvedComicId, setResolvedComicId] = useState<number>(Number(comicId) || 0);

  useEffect(() => {
    let id = Number(comicId);
    if (Number.isFinite(id) && id > 0) {
      setResolvedComicId(id);
      return;
    }
    if (comicSlug) {
      fetchComicDetail(comicSlug)
        .then((detail) => {
          if (detail?.id) setResolvedComicId(Number(detail.id));
        })
        .catch(() => {});
    } else if (chapterId) {
      fetchChapterPages(chapterId)
        .then((payload) => {
          if (payload?.chapter?.comic_id) setResolvedComicId(Number(payload.chapter.comic_id));
        })
        .catch(() => {});
    }
  }, [comicId, comicSlug, chapterId]);

  const numComicId = Number(resolvedComicId);
  const isValidComic = Number.isFinite(numComicId) && numComicId > 0;

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [selectedMeme, setSelectedMeme] = useState<string | null>(null);

  // Trạng thái trả lời (Reply)
  const [replyingToCommentId, setReplyingToCommentId] = useState<number | null>(null);
  const [replyingToName, setReplyingToName] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replyMeme, setReplyMeme] = useState<string | null>(null);

  // Picker popup
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<'emoji' | 'sticker' | 'gif'>('emoji');
  const [stickerCategory, setStickerCategory] = useState<'hai' | 'soc' | 'yeu' | 'cay'>('hai');
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState<GifItem[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [activePickerTarget, setActivePickerTarget] = useState<'main' | 'reply'>('main');

  const pickerRef = useRef<HTMLDivElement | null>(null);

  const loadComments = async () => {
    setLoading(true);
    try {
      const data = await fetchComments(numComicId || 1, chapterId);
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [numComicId, chapterId]);

  // Đóng picker khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (pickerTab === 'gif' && HAS_GIF_SEARCH) {
      setGifLoading(true);
      searchGifs(gifQuery)
        .then(setGifResults)
        .catch(() => setGifResults([]))
        .finally(() => setGifLoading(false));
    }
  }, [pickerTab, gifQuery]);

  const handlePostMain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!content.trim() && !selectedMeme) return;

    try {
      await postComment({
        comic_id: numComicId || 1,
        comic_slug: comicSlug || undefined,
        chapter_id: chapterId ? Number(chapterId) : null,
        content: content.trim(),
        meme_url: selectedMeme,
      });
      setContent('');
      setSelectedMeme(null);
      setPickerOpen(false);
      loadComments();
      window.dispatchEvent(new CustomEvent('comic:comment-posted'));
    } catch (err) {
      alert((err as Error).message || 'Không thể đăng bình luận.');
    }
  };

  const handlePostReply = async (parentId: number) => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!replyContent.trim() && !replyMeme) return;

    try {
      await postComment({
        comic_id: numComicId || 1,
        comic_slug: comicSlug || undefined,
        chapter_id: chapterId ? Number(chapterId) : null,
        parent_id: parentId,
        reply_to_name: replyingToName,
        content: replyContent.trim(),
        meme_url: replyMeme,
      });
      setReplyContent('');
      setReplyMeme(null);
      setReplyingToCommentId(null);
      setReplyingToName(null);
      setPickerOpen(false);
      loadComments();
      window.dispatchEvent(new CustomEvent('comic:comment-posted'));
    } catch (err) {
      alert((err as Error).message || 'Không thể gửi trả lời.');
    }
  };

  const handleLike = async (commentId: number) => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    try {
      const res = await toggleLikeComment(commentId);
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) {
            return { ...c, liked_by_me: res.liked, likes_count: res.likes_count };
          }
          return {
            ...c,
            replies: c.replies.map((r) =>
              r.id === commentId ? { ...r, liked_by_me: res.liked, likes_count: res.likes_count } : r
            ),
          };
        })
      );
    } catch {}
  };

  const handleDelete = async (commentId: number) => {
    if (!confirm('Xóa bình luận này?')) return;
    try {
      await deleteComment(commentId);
      loadComments();
    } catch (err) {
      alert((err as Error).message || 'Không thể xóa.');
    }
  };

  const formatTime = (iso: string) => {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const diff = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (diff < 60) return 'Vừa xong';
    if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
    return `${Math.floor(diff / 86400)} ngày trước`;
  };

  return (
    <div className="rounded-3xl bg-[#111119] border border-white/10 p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-base sm:text-lg text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-rose-500" /> Bình luận ({comments.reduce((acc, c) => acc + 1 + c.replies.length, 0)})
        </h3>
      </div>

      {/* Khung đăng bình luận gốc */}
      <form onSubmit={handlePostMain} className="space-y-3 relative">
        <div className="flex items-start gap-3">
          <img
            src={getAvatarUrl(currentUser?.avatar_seed, currentUser?.username)}
            alt="Avatar"
            className="w-10 h-10 rounded-2xl bg-zinc-900 border border-white/15 p-0.5 shrink-0"
          />
          <div className="flex-1 rounded-2xl bg-black/50 border border-white/10 focus-within:border-rose-500 overflow-hidden transition">
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={currentUser ? 'Viết bình luận của bạn...' : 'Đăng nhập để tham gia bình luận...'}
              onClick={() => {
                if (!currentUser) onRequireAuth();
              }}
              className="w-full bg-transparent p-3 text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none resize-none"
            />

            {selectedMeme && (
              <div className="px-3 pb-2 flex items-center gap-2">
                <div className="relative inline-block">
                  <img
                    src={resolveMemeUrl(selectedMeme) || ''}
                    alt="Meme"
                    className="h-20 w-auto rounded-xl object-contain bg-zinc-900 border border-white/10"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedMeme(null)}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-xs shadow-lg"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border-t border-white/5">
              <button
                type="button"
                onClick={() => {
                  if (!currentUser) {
                    onRequireAuth();
                    return;
                  }
                  setActivePickerTarget('main');
                  setPickerOpen((o) => !o);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-300 flex items-center gap-1.5 transition"
              >
                <Smile className="w-4 h-4 text-amber-400" /> Meme / Emoji
              </button>

              <button
                type="submit"
                disabled={(!content.trim() && !selectedMeme) || !currentUser}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:brightness-110 disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1.5 shadow-md shadow-rose-500/20 transition"
              >
                <Send className="w-3.5 h-3.5" /> Gửi
              </button>
            </div>
          </div>
        </div>

        {/* Picker Popover / Bottom Sheet */}
        {pickerOpen && (
          <div
            ref={pickerRef}
            className="absolute z-50 left-0 sm:left-12 top-full mt-2 w-full sm:w-80 rounded-3xl bg-[#181822] border border-white/15 p-4 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPickerTab('emoji')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                    pickerTab === 'emoji' ? 'bg-rose-500 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Emoji
                </button>
                <button
                  type="button"
                  onClick={() => setPickerTab('sticker')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                    pickerTab === 'sticker' ? 'bg-rose-500 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Sticker
                </button>
                {HAS_GIF_SEARCH && (
                  <button
                    type="button"
                    onClick={() => setPickerTab('gif')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                      pickerTab === 'gif' ? 'bg-rose-500 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    GIF
                  </button>
                )}
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} className="text-zinc-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {pickerTab === 'emoji' && (
              <div className="grid grid-cols-8 gap-1.5 max-h-48 overflow-y-auto">
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      if (activePickerTarget === 'main') setContent((c) => c + em);
                      else setReplyContent((c) => c + em);
                    }}
                    className="p-2 rounded-xl hover:bg-white/10 text-lg flex items-center justify-center transition"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {pickerTab === 'sticker' && (
              <div className="space-y-2.5">
                <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                  {STICKER_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setStickerCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                        stickerCategory === cat.id ? 'bg-white/20 text-white' : 'bg-white/5 text-zinc-400'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto pr-1">
                  {STICKER_PRESETS.filter((s) => s.category === stickerCategory).map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        if (activePickerTarget === 'main') setSelectedMeme(st.id);
                        else setReplyMeme(st.id);
                        setPickerOpen(false);
                      }}
                      title={st.label}
                      className="p-2 rounded-2xl bg-black/40 hover:bg-rose-500/20 border border-white/5 hover:border-rose-500/40 flex items-center justify-center transition group"
                    >
                      <img src={st.url} alt={st.label} className="w-12 h-12 object-contain group-hover:scale-110 transition" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {pickerTab === 'gif' && HAS_GIF_SEARCH && (
              <div className="space-y-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={gifQuery}
                    onChange={(e) => setGifQuery(e.target.value)}
                    placeholder="Tìm GIF động..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs text-white outline-none"
                  />
                </div>
                {gifLoading ? (
                  <p className="text-xs text-zinc-500 text-center py-6">Đang tìm GIF...</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {gifResults.map((gif) => (
                      <button
                        key={gif.id}
                        type="button"
                        onClick={() => {
                          if (activePickerTarget === 'main') setSelectedMeme(gif.url);
                          else setReplyMeme(gif.url);
                          setPickerOpen(false);
                        }}
                        className="rounded-xl overflow-hidden aspect-video bg-black/40 border border-white/5 hover:border-rose-500 transition"
                      >
                        <img src={gif.previewUrl} alt={gif.title} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </form>

      {/* Danh sách bình luận */}
      <div className="divide-y divide-white/5 space-y-4 pt-2">
        {loading ? (
          <p className="text-xs text-zinc-500 text-center py-8">Đang tải bình luận...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-8">Chưa có bình luận nào. Hãy là người đầu tiên bình luận!</p>
        ) : (
          comments.map((comment) => {
            const avatarUrl = getAvatarUrl(comment.user.avatar_seed, comment.user.username);
            const memeImage = resolveMemeUrl(comment.meme_url);
            const isAdmin = comment.user.role === 'admin';
            const isOwner = currentUser && currentUser.id === comment.user_id;
            const canDelete = currentUser && (currentUser.role === 'admin' || isOwner);

            return (
              <div key={comment.id} className="pt-4 first:pt-0 space-y-3">
                <div className="flex items-start gap-3">
                  <img
                    src={avatarUrl}
                    alt={comment.user.display_name}
                    className="w-9 h-9 rounded-2xl bg-zinc-900 border border-white/10 p-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          {comment.user.display_name}
                          {isAdmin && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[9px] font-black border border-rose-500/30">
                              ADMIN
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-zinc-500">{formatTime(comment.created_at)}</span>
                      </div>

                      {canDelete && (
                        <button
                          onClick={() => handleDelete(comment.id)}
                          title="Xóa bình luận"
                          className="text-zinc-500 hover:text-rose-400 p-1 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {comment.content && <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed whitespace-pre-line">{comment.content}</p>}

                    {memeImage && (
                      <div className="pt-1">
                        <img
                          src={memeImage}
                          alt="Sticker/Meme"
                          loading="lazy"
                          className="max-h-40 w-auto rounded-2xl object-contain bg-zinc-900/60 border border-white/10 shadow-md"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-4 pt-1 text-xs">
                      <button
                        onClick={() => handleLike(comment.id)}
                        className={`flex items-center gap-1.5 font-bold transition ${
                          comment.liked_by_me ? 'text-rose-500' : 'text-zinc-400 hover:text-rose-400'
                        }`}
                      >
                        <Heart className={`w-3.5 h-3.5 ${comment.liked_by_me ? 'fill-rose-500' : ''}`} />
                        <span>{comment.likes_count > 0 ? comment.likes_count : 'Thích'}</span>
                      </button>
                      <button
                        onClick={() => {
                          if (!currentUser) {
                            onRequireAuth();
                            return;
                          }
                          setReplyingToCommentId(comment.id);
                          setReplyingToName(comment.user.display_name);
                          setReplyContent(`@${comment.user.display_name} `);
                        }}
                        className="font-bold text-zinc-400 hover:text-white transition flex items-center gap-1"
                      >
                        <CornerDownRight className="w-3.5 h-3.5" /> Trả lời
                      </button>
                    </div>

                    {/* Khung nhập Reply (nếu đang mở) */}
                    {replyingToCommentId === comment.id && (
                      <div className="pt-3 pl-4 sm:pl-6 border-l-2 border-rose-500/40 space-y-2.5">
                        <div className="flex items-center justify-between text-xs text-zinc-400">
                          <span>Đang trả lời <strong className="text-rose-400">@{replyingToName}</strong></span>
                          <button
                            onClick={() => {
                              setReplyingToCommentId(null);
                              setReplyingToName(null);
                            }}
                            className="text-zinc-500 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="rounded-2xl bg-black/50 border border-white/10 overflow-hidden">
                          <textarea
                            rows={2}
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder="Viết phản hồi..."
                            className="w-full bg-transparent p-2.5 text-xs text-white placeholder:text-zinc-500 outline-none resize-none"
                          />
                          {replyMeme && (
                            <div className="px-2.5 pb-2">
                              <div className="relative inline-block">
                                <img
                                  src={resolveMemeUrl(replyMeme) || ''}
                                  alt="Meme"
                                  className="h-16 w-auto rounded-xl object-contain bg-zinc-900 border border-white/10"
                                />
                                <button
                                  type="button"
                                  onClick={() => setReplyMeme(null)}
                                  className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px]"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between px-2.5 py-1.5 bg-white/[0.02] border-t border-white/5">
                            <button
                              type="button"
                              onClick={() => {
                                setActivePickerTarget('reply');
                                setPickerOpen((o) => !o);
                              }}
                              className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-bold text-zinc-300 flex items-center gap-1"
                            >
                              <Smile className="w-3.5 h-3.5 text-amber-400" /> Meme
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePostReply(comment.id)}
                              disabled={!replyContent.trim() && !replyMeme}
                              className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-xs font-bold text-white flex items-center gap-1"
                            >
                              <Send className="w-3 h-3" /> Gửi
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Danh sách Replies */}
                    {comment.replies && comment.replies.length > 0 && (
                      <div className="pt-3 pl-4 sm:pl-8 space-y-3 border-l border-white/10">
                        {comment.replies.map((reply) => {
                          const rAvatar = getAvatarUrl(reply.user.avatar_seed, reply.user.username);
                          const rMeme = resolveMemeUrl(reply.meme_url);
                          const rIsAdmin = reply.user.role === 'admin';
                          const rCanDelete = currentUser && (currentUser.role === 'admin' || currentUser.id === reply.user_id);

                          return (
                            <div key={reply.id} className="flex items-start gap-2.5">
                              <img
                                src={rAvatar}
                                alt={reply.user.display_name}
                                className="w-7 h-7 rounded-xl bg-zinc-900 border border-white/10 p-0.5 shrink-0"
                              />
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[11px] font-bold text-white flex items-center gap-1">
                                      {reply.user.display_name}
                                      {rIsAdmin && (
                                        <span className="px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 text-[8px] font-black border border-rose-500/30">
                                          ADMIN
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-[10px] text-zinc-500">{formatTime(reply.created_at)}</span>
                                  </div>

                                  {rCanDelete && (
                                    <button
                                      onClick={() => handleDelete(reply.id)}
                                      className="text-zinc-500 hover:text-rose-400 p-0.5"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>

                                {reply.content && <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-line">{reply.content}</p>}

                                {rMeme && (
                                  <div className="pt-0.5">
                                    <img
                                      src={rMeme}
                                      alt="Sticker/Meme"
                                      loading="lazy"
                                      className="max-h-32 w-auto rounded-xl object-contain bg-zinc-900/60 border border-white/10"
                                    />
                                  </div>
                                )}

                                <div className="pt-0.5 text-xs">
                                  <button
                                    onClick={() => handleLike(reply.id)}
                                    className={`flex items-center gap-1 font-bold transition ${
                                      reply.liked_by_me ? 'text-rose-500' : 'text-zinc-400 hover:text-rose-400'
                                    }`}
                                  >
                                    <Heart className={`w-3 h-3 ${reply.liked_by_me ? 'fill-rose-500' : ''}`} />
                                    <span>{reply.likes_count > 0 ? reply.likes_count : 'Thích'}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
