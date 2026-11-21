# scripts/pipeline/branding.py
import os
import statistics
import numpy as np
from PIL import Image, ImageDraw, ImageFont

DEFAULT_BLACKLIST_KEYWORDS = (
    "6b479a29fe192bbdf1f628fb593a617e",
    "banner",
    "credit",
    "watermark",
    "quangcao",
    "quang-cao",
    "advert",
    "donate",
    "tuyendung",
    "tuyen-dung",
    "thongbao",
    "thong-bao",
    "fanpage",
    "discord",
    "telegram",
    "zalo",
    "logo",
)

FONT_BOLD_CANDIDATES = (
    "assets/fonts/Roboto-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/segoeuib.ttf",
)

FONT_REG_CANDIDATES = (
    "assets/fonts/Roboto-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
)


def _load_font(candidates: tuple[str, ...], size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def compute_dhash(pil_img: Image.Image, hash_size: int = 8) -> int:
    """Tính 64-bit difference hash (dHash) dùng Pillow + NumPy, không cần thư viện ngoài."""
    gray = pil_img.convert("L").resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
    arr = np.asarray(gray, dtype=np.int16)
    diff = arr[:, 1:] > arr[:, :-1]
    val = 0
    for bit in diff.flatten():
        val = (val << 1) | int(bool(bit))
    return val


def hamming_distance(h1: int, h2: int) -> int:
    return (h1 ^ h2).bit_count()


def _get_blacklist_keywords() -> list[str]:
    extra = [
        k.strip().lower()
        for k in os.getenv("WATERMARK_BLACKLIST_KEYWORDS", "").split(",")
        if k.strip()
    ]
    return list(DEFAULT_BLACKLIST_KEYWORDS) + extra


def _get_blacklist_hashes() -> list[int]:
    hashes: list[int] = []
    for raw in os.getenv("WATERMARK_BLACKLIST_HASHES", "").split(","):
        s = raw.strip().lower().removeprefix("0x")
        if not s:
            continue
        try:
            hashes.append(int(s, 16))
        except ValueError:
            continue
    return hashes


def is_source_watermark_image(img_path: str, img_url: str = "") -> tuple[bool, str]:
    """
    Kiểm tra an toàn xem ảnh ở đầu/cuối chap có phải ảnh bản quyền/banner web gốc không.
    Trả về (True, lý_do) nếu là ảnh thừa cần xóa; (False, "") nếu là ảnh truyện thật.
    """
    low_url = (img_url or "").lower()
    for kw in _get_blacklist_keywords():
        if kw in low_url:
            return True, f"URL khớp từ khóa '{kw}'"

    try:
        with Image.open(img_path) as im:
            w, h = im.size
            if w <= 0 or h <= 0:
                return True, "Kích thước ảnh không hợp lệ"

            # 1. Ảnh quá nhỏ (spacer, icon, banner nhỏ)
            if h < 180 or w < 220:
                return True, f"Ảnh quá nhỏ ({w}x{h}px)"

            # 2. Ảnh banner ngang quá dẹt (tỷ lệ rộng/cao >= 2.2 và chiều cao <= 600px)
            # Trang truyện thật hiếm khi là dải ngang siêu dẹt ở đúng vị trí đầu/cuối chương
            aspect = w / float(h)
            if aspect >= 2.2 and h <= 600:
                return True, f"Tỷ lệ banner ngang ({w}x{h}px, ratio={aspect:.2f})"

            # 3. So sánh dHash với danh sách đen (nếu cấu hình WATERMARK_BLACKLIST_HASHES)
            bad_hashes = _get_blacklist_hashes()
            if bad_hashes:
                cur_hash = compute_dhash(im)
                for bh in bad_hashes:
                    if hamming_distance(cur_hash, bh) <= 6:
                        return True, f"Khớp dHash blacklist ({cur_hash:016x})"
    except Exception:
        return False, ""

    return False, ""


def strip_edge_source_watermarks(
    raw_items: list[tuple[str, str]],
    max_edge_check: int = 2,
) -> tuple[list[str], list[str]]:
    """
    raw_items: danh sách [(file_path, source_url), ...] đã tải xong.
    Chỉ kiểm tra tối đa `max_edge_check` ảnh đầu và `max_edge_check` ảnh cuối để tuyệt đối
    không xóa nhầm trang truyện ở giữa. Không xóa nếu chương có <= 3 ảnh.
    Trả về: (cleaned_paths, removed_logs)
    """
    if len(raw_items) <= 3:
        return [p for p, _ in raw_items], []

    items = list(raw_items)
    removed_logs: list[str] = []

    # Kiểm tra từ đầu chương (tối đa max_edge_check ảnh liên tiếp)
    checked_head = 0
    while len(items) > 3 and checked_head < max_edge_check:
        path, url = items[0]
        is_wm, reason = is_source_watermark_image(path, url)
        checked_head += 1
        if is_wm:
            removed_logs.append(f"Đầu chap #{checked_head}: {reason}")
            items.pop(0)
        else:
            break

    # Kiểm tra từ cuối chương (tối đa max_edge_check ảnh liên tiếp)
    checked_tail = 0
    while len(items) > 3 and checked_tail < max_edge_check:
        path, url = items[-1]
        is_wm, reason = is_source_watermark_image(path, url)
        checked_tail += 1
        if is_wm:
            removed_logs.append(f"Cuối chap #{checked_tail}: {reason}")
            items.pop()
        else:
            break

    return [p for p, _ in items], removed_logs


def _infer_chapter_width(image_paths: list[str], default_width: int = 1080) -> int:
    widths: list[int] = []
    for p in image_paths[:8]:
        try:
            with Image.open(p) as im:
                if im.width >= 400:
                    widths.append(im.width)
        except Exception:
            continue
    if not widths:
        return default_width
    med = int(statistics.median(widths))
    return max(760, min(1440, med))


def _truncate_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> str:
    if draw.textlength(text, font=font) <= max_width:
        return text
    out = text
    while len(out) > 4 and draw.textlength(out + "...", font=font) > max_width:
        out = out[:-1]
    return out.rstrip() + "..."


def create_brand_banner(
    output_path: str,
    comic_title: str,
    chapter_num: float,
    is_header: bool = True,
    width: int = 1080,
) -> str:
    """
    Tự tạo ảnh bản quyền (header / footer) cho web của bạn.
    Nếu có sẵn file tĩnh assets/brand_header.png hoặc assets/brand_footer.png thì dùng trực tiếp.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    custom_asset = "assets/brand_header.png" if is_header else "assets/brand_footer.png"
    if os.path.exists(custom_asset):
        with Image.open(custom_asset) as im:
            rgb = im.convert("RGB")
            if rgb.width != width:
                new_h = max(120, int(rgb.height * (width / float(rgb.width))))
                rgb = rgb.resize((width, new_h), Image.Resampling.LANCZOS)
            rgb.save(output_path, format="PNG")
            return output_path

    site_name = os.getenv("BRAND_SITE_NAME", "VinaReader").strip() or "VinaReader"
    site_url = os.getenv("BRAND_SITE_URL", "VINAREADER.PAGES.DEV").strip() or "VINAREADER.PAGES.DEV"

    height = max(280, int(width * 0.28))
    img = Image.new("RGB", (width, height), color=(11, 11, 16))
    draw = ImageDraw.Draw(img)

    # Nền gradient tối sang trọng
    for y in range(height):
        t = y / max(1, height - 1)
        r = int(13 + 12 * t)
        g = int(13 + 8 * t)
        b = int(20 + 16 * t)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Khung viền + thanh nhấn màu Rose
    pad = max(20, int(width * 0.03))
    draw.rounded_rectangle(
        [pad, pad, width - pad, height - pad],
        radius=20,
        fill=(18, 18, 26),
        outline=(244, 63, 94),
        width=2,
    )
    bar_w = max(80, int(width * 0.14))
    draw.rounded_rectangle(
        [(width - bar_w) // 2, pad + 18, (width + bar_w) // 2, pad + 24],
        radius=4,
        fill=(244, 63, 94),
    )

    scale = width / 1080.0
    font_brand = _load_font(FONT_BOLD_CANDIDATES, max(20, int(34 * scale)))
    font_title = _load_font(FONT_BOLD_CANDIDATES, max(16, int(25 * scale)))
    font_sub = _load_font(FONT_REG_CANDIDATES, max(13, int(19 * scale)))

    max_text_w = width - pad * 4

    if is_header:
        top_label = f"ĐỌC TRUYỆN TẠI {site_name.upper()}"
        mid_label = _truncate_text(draw, f"{comic_title}  •  Chapter {chapter_num:g}", font_title, max_text_w)
        bot_label = os.getenv(
            "BRAND_HEADER_SUBTEXT",
            f"Truy cập {site_url} — Ảnh siêu nét AVIF, cập nhật chương mới tự động",
        ).format(site_name=site_name, site_url=site_url)
    else:
        top_label = f"HẾT CHAPTER {chapter_num:g}  •  {site_name.upper()}"
        mid_label = _truncate_text(draw, f"Cảm ơn bạn đã đọc {comic_title} tại {site_name}!", font_title, max_text_w)
        bot_label = os.getenv(
            "BRAND_FOOTER_SUBTEXT",
            f"Theo dõi {site_url} để cập nhật chương mới sớm nhất",
        ).format(site_name=site_name, site_url=site_url)

    top_label = _truncate_text(draw, top_label, font_brand, max_text_w)
    bot_label = _truncate_text(draw, bot_label, font_sub, max_text_w)

    cx = width // 2
    draw.text((cx, int(height * 0.34)), top_label, fill=(251, 113, 133), font=font_brand, anchor="mm")
    draw.text((cx, int(height * 0.57)), mid_label, fill=(244, 244, 245), font=font_title, anchor="mm")
    draw.text((cx, int(height * 0.77)), bot_label, fill=(161, 161, 170), font=font_sub, anchor="mm")

    img.save(output_path, format="PNG")
    return output_path


def apply_chapter_branding(
    raw_items: list[tuple[str, str]],
    work_dir: str,
    comic_title: str,
    chapter_num: float,
    strip_source_wm: bool = True,
    add_own_banners: bool = True,
) -> tuple[list[str], list[str]]:
    """
    Pipeline hoàn chỉnh:
    1. Lọc xóa ảnh bản quyền web gốc ở đầu & cuối chương (nếu strip_source_wm=True).
    2. Tự tạo và chèn ảnh bản quyền web của bạn ở đầu & cuối chương (nếu add_own_banners=True).
    """
    if strip_source_wm:
        cleaned_paths, removed_logs = strip_edge_source_watermarks(raw_items)
    else:
        cleaned_paths, removed_logs = [p for p, _ in raw_items], []

    if not cleaned_paths:
        return [], removed_logs

    if not add_own_banners:
        return cleaned_paths, removed_logs

    banner_w = _infer_chapter_width(cleaned_paths)
    header_path = os.path.join(work_dir, "brand_header.png")
    footer_path = os.path.join(work_dir, "brand_footer.png")
    create_brand_banner(header_path, comic_title, chapter_num, is_header=True, width=banner_w)
    create_brand_banner(footer_path, comic_title, chapter_num, is_header=False, width=banner_w)

    return [header_path, *cleaned_paths, footer_path], removed_logs
