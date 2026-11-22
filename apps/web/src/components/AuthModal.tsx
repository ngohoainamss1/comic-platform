import React, { useState } from 'react';
import { X, User, Lock, Sparkles, LogIn, UserPlus, RefreshCw } from 'lucide-react';
import { loginUser, registerUser, type UserProfile } from '../lib/api';
import { AVATAR_STYLES, getAvatarUrl } from '../lib/memes';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<string>(AVATAR_STYLES[0]);
  const [seed, setSeed] = useState(() => 'user_' + Math.random().toString(36).slice(2, 8));
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const randomizeSeed = () => {
    setSeed('user_' + Math.random().toString(36).slice(2, 8));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      if (tab === 'login') {
        const res = await loginUser({ username, password });
        onSuccess(res.user);
        onClose();
      } else {
        const avatar_seed = `${selectedStyle}:${seed}`;
        const res = await registerUser({
          username,
          password,
          display_name: displayName || username,
          avatar_seed,
        });
        onSuccess(res.user);
        onClose();
      }
    } catch (err) {
      setErrorMsg((err as Error).message || 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#121218] border border-white/10 p-5 sm:p-6 space-y-5 shadow-2xl pb-[calc(1.5rem+var(--sab))] sm:pb-6 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex bg-white/[0.05] p-1 rounded-2xl border border-white/10">
            <button
              onClick={() => {
                setTab('login');
                setErrorMsg('');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                tab === 'login' ? 'bg-rose-500 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" /> Đăng nhập
            </button>
            <button
              onClick={() => {
                setTab('register');
                setErrorMsg('');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                tab === 'register' ? 'bg-rose-500 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" /> Đăng ký
            </button>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white p-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'register' && (
            <div className="space-y-3 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-center">
              <label className="text-xs font-bold text-zinc-300 block">Chọn Avatar ngẫu nhiên</label>
              <div className="flex justify-center items-center gap-3">
                <img
                  src={getAvatarUrl(`${selectedStyle}:${seed}`)}
                  alt="Avatar"
                  className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/15 p-1"
                />
                <div className="space-y-2 text-left">
                  <select
                    value={selectedStyle}
                    onChange={(e) => setSelectedStyle(e.target.value)}
                    className="rounded-xl bg-black/50 border border-white/10 px-2.5 py-1.5 text-xs text-white outline-none"
                  >
                    {AVATAR_STYLES.map((st) => (
                      <option key={st} value={st}>
                        Style: {st}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={randomizeSeed}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5 text-zinc-200"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Đổi hình khác
                  </button>
                </div>
              </div>

              <div className="space-y-1 text-left pt-1">
                <label className="text-[11px] font-bold text-zinc-400">Tên hiển thị (Tối đa 32 ký tự)</label>
                <input
                  type="text"
                  maxLength={32}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ví dụ: Otaku Pro..."
                  className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-rose-500"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-400">Tên đăng nhập (3-24 ký tự, không dấu)</label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                maxLength={24}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="username..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-400">Mật khẩu (Ít nhất 6 ký tự)</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {errorMsg && <p className="text-xs font-semibold text-rose-400">{errorMsg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 hover:brightness-110 font-bold text-sm text-white shadow-lg shadow-rose-500/25 disabled:opacity-50 transition min-h-[44px]"
          >
            {loading ? 'Đang xử lý...' : tab === 'login' ? 'Đăng nhập' : 'Đăng ký tài khoản'}
          </button>
        </form>
      </div>
    </div>
  );
};
