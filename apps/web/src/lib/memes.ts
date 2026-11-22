export interface StickerItem {
  id: string; // Lưu vào DB dạng "preset:cuoi_ra_nuoc_mat" (~20 bytes)
  label: string;
  url: string;
  category: 'hai' | 'soc' | 'yeu' | 'cay';
}

const NOTO_BASE = 'https://fonts.gstatic.com/s/e/notoemoji/latest';
const noto = (code: string) => `${NOTO_BASE}/${code}/512.webp`;

export const STICKER_PRESETS: StickerItem[] = [
  // 1. Cười & Tấu hài
  { id: 'preset:cuoi_ra_nuoc_mat', label: 'Cười ra nước mắt', url: noto('1f602'), category: 'hai' },
  { id: 'preset:cuoi_lan_lon', label: 'Cười lăn lộn', url: noto('1f923'), category: 'hai' },
  { id: 'preset:chu_he', label: 'Chú hề', url: noto('1f921'), category: 'hai' },
  { id: 'preset:dau_lau', label: 'Cười xỉu', url: noto('1f480'), category: 'hai' },
  { id: 'preset:cuoi_deu', label: 'Cười đểu', url: noto('1f60f'), category: 'hai' },
  { id: 'preset:ac_quy', label: 'Ác quỷ', url: noto('1f608'), category: 'hai' },
  { id: 'preset:cuoi_nguoc', label: 'Cười ngược', url: noto('1f643'), category: 'hai' },
  { id: 'preset:che_mieng', label: 'Cười khúc khích', url: noto('1f92d'), category: 'hai' },
  { id: 'preset:ngau_loi', label: 'Ngầu lòi', url: noto('1f60e'), category: 'hai' },
  { id: 'preset:cuc_sh', label: 'Đen thôi', url: noto('1f4a9'), category: 'hai' },

  // 2. Hóng chap & Sốc
  { id: 'preset:no_nao', label: 'Nổ não', url: noto('1f92f'), category: 'soc' },
  { id: 'preset:hoang_hot', label: 'Hoảng hốt', url: noto('1f631'), category: 'soc' },
  { id: 'preset:hong_bien', label: 'Hóng biến', url: noto('1f440'), category: 'soc' },
  { id: 'preset:nghi_ngo', label: 'Nghi ngờ', url: noto('1f928'), category: 'soc' },
  { id: 'preset:suy_ngam', label: 'Suy ngẫm', url: noto('1f914'), category: 'soc' },
  { id: 'preset:do_mat', label: 'Đỏ mặt', url: noto('1f633'), category: 'soc' },
  { id: 'preset:chong_mat', label: 'Lú luôn', url: noto('1f635_200d_1f4ab'), category: 'soc' },
  { id: 'preset:suyt', label: 'Suỵt spoiler', url: noto('1f92b'), category: 'soc' },
  { id: 'preset:noi_doi', label: 'Điêu', url: noto('1f925'), category: 'soc' },
  { id: 'preset:ma_oi', label: 'Hú hồn', url: noto('1f47b'), category: 'soc' },

  // 3. Yêu thích & Đỉnh cao
  { id: 'preset:chay_qua', label: 'Cháy quá', url: noto('1f525'), category: 'yeu' },
  { id: 'preset:me_man', label: 'Mê mẩn', url: noto('1f60d'), category: 'yeu' },
  { id: 'preset:yeu_thuong', label: 'Yêu thương', url: noto('1f970'), category: 'yeu' },
  { id: 'preset:tim_do', label: 'Thả tim', url: noto('2764'), category: 'yeu' },
  { id: 'preset:tram_diem', label: '100 điểm', url: noto('1f4af'), category: 'yeu' },
  { id: 'preset:tuyet_voi', label: 'Tuyệt vời', url: noto('1f44d'), category: 'yeu' },
  { id: 'preset:vo_tay', label: 'Vỗ tay', url: noto('1f44f'), category: 'yeu' },
  { id: 'preset:an_mung', label: 'Ăn mừng', url: noto('1f973'), category: 'yeu' },
  { id: 'preset:phao_hoa', label: 'Quẩy lên', url: noto('1f389'), category: 'yeu' },
  { id: 'preset:nong_qua', label: 'Nóng bỏng', url: noto('1f975'), category: 'yeu' },

  // 4. Cay cú & Bất lực
  { id: 'preset:khoc_loc', label: 'Khóc lóc', url: noto('1f62d'), category: 'cay' },
  { id: 'preset:nan_ni', label: 'Ra chap đi mà', url: noto('1f97a'), category: 'cay' },
  { id: 'preset:cay_cu', label: 'Cay cú', url: noto('1f621'), category: 'cay' },
  { id: 'preset:boc_khoi', label: 'Bốc khói', url: noto('1f624'), category: 'cay' },
  { id: 'preset:bat_luc', label: 'Bất lực', url: noto('1f644'), category: 'cay' },
  { id: 'preset:toat_mo_hoi', label: 'Toát mồ hôi', url: noto('1f605'), category: 'cay' },
  { id: 'preset:tan_vo', label: 'Tan vỡ', url: noto('1f494'), category: 'cay' },
  { id: 'preset:cau_nguyen', label: 'Cầu nguyện', url: noto('1f64f'), category: 'cay' },
  { id: 'preset:buon_ngu', label: 'Đợi chap ngủ gật', url: noto('1f634'), category: 'cay' },
  { id: 'preset:lanh_leo', label: 'Lạnh sống lưng', url: noto('1f976'), category: 'cay' },
];

export const STICKER_CATEGORIES = [
  { id: 'hai', label: '😂 Tấu hài' },
  { id: 'soc', label: '🤯 Hóng & Sốc' },
  { id: 'yeu', label: '🔥 Đỉnh & Yêu' },
  { id: 'cay', label: '😭 Cay & Đợi chap' },
] as const;

export const QUICK_EMOJIS = [
  '😂', '🤣', '😭', '😍', '🔥', '💀', '🤡', '🤯',
  '🥺', '😡', '👍', '👏', '🙏', '❤️', '💔', '👀',
  '🤔', '😎', '😳', '😈', '💯', '🎉', '💩', '🫡',
];

const STICKER_MAP = new Map(STICKER_PRESETS.map((s) => [s.id, s.url]));

export function resolveMemeUrl(raw?: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith('preset:')) {
    return STICKER_MAP.get(raw) ?? null;
  }
  if (raw.startsWith('https://')) {
    return raw;
  }
  return null;
}

export const AVATAR_STYLES = [
  'adventurer',
  'fun-emoji',
  'bottts',
  'lorelei',
  'notionists',
  'pixel-art',
] as const;

export function getAvatarUrl(avatarSeed?: string | null, fallbackName = 'reader'): string {
  const raw = (avatarSeed || '').trim();
  if (raw.includes(':')) {
    const [style, ...rest] = raw.split(':');
    const seed = encodeURIComponent(rest.join(':') || fallbackName);
    return `https://api.dicebear.com/9.x/${encodeURIComponent(style)}/svg?seed=${seed}&backgroundColor=18181b`;
  }
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(raw || fallbackName)}&backgroundColor=18181b`;
}

export interface GifItem {
  id: string;
  title: string;
  previewUrl: string;
  url: string;
}

export const HAS_GIF_SEARCH = Boolean(import.meta.env.VITE_GIPHY_API_KEY);

export async function searchGifs(query: string, limit = 16): Promise<GifItem[]> {
  const apiKey = import.meta.env.VITE_GIPHY_API_KEY as string | undefined;
  if (!apiKey) return [];

  const endpoint = query.trim()
    ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query.trim())}&limit=${limit}&rating=pg-13`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(apiKey)}&limit=${limit}&rating=pg-13`;

  const res = await fetch(endpoint);
  if (!res.ok) return [];
  const json = await res.json();
  const list = Array.isArray(json?.data) ? json.data : [];

  return list
    .map((item: any) => ({
      id: String(item.id || ''),
      title: String(item.title || 'GIF'),
      previewUrl: item?.images?.fixed_width_small?.webp || item?.images?.fixed_width_small?.url || '',
      url: item?.images?.fixed_width?.webp || item?.images?.fixed_width?.url || '',
    }))
    .filter((g: GifItem) => g.url.startsWith('https://'));
}
