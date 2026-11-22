# scripts/pipeline/watermark_cleaner.py
import json
import os
import threading
from urllib.parse import urlparse

import numpy as np
from PIL import Image, ImageDraw, ImageFont

try:
    import cv2
except ImportError:
    cv2 = None

PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_RULES_PATH = os.path.join(PIPELINE_DIR, "watermark_rules.json")
DEFAULT_TEMPLATES_DIR = os.path.join(PIPELINE_DIR, "templates")
DEFAULT_BLOCKED_DIR = os.path.join(PIPELINE_DIR, "blocked_pages")

FONT_CANDIDATES = (
    "assets/fonts/Roboto-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/segoeuib.ttf",
)

_CACHE_LOCK = threading.Lock()
_RULES_CACHE: dict | None = None
_TEMPLATES_CACHE: list[dict] | None = None
_BLOCKED_PAGES_CACHE: list[dict] | None = None


def _compute_dhash(pil_img: Image.Image, hash_size: int = 8) -> int:
    gray = pil_img.convert("L").resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
    arr = np.asarray(gray, dtype=np.int16)
    diff = arr[:, 1:] > arr[:, :-1]
    val = 0
    for bit in diff.flatten():
        val = (val << 1) | int(bool(bit))
    return val


def _hamming(h1: int, h2: int) -> int:
    return (h1 ^ h2).bit_count()


def _load_rules(rules_path: str = DEFAULT_RULES_PATH) -> dict:
    global _RULES_CACHE
    with _CACHE_LOCK:
        if _RULES_CACHE is not None:
            return _RULES_CACHE
        if not os.path.exists(rules_path):
            _RULES_CACHE = {"domains": {}, "default": {}}
            return _RULES_CACHE
        try:
            with open(rules_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            _RULES_CACHE = data if isinstance(data, dict) else {"domains": {}, "default": {}}
        except Exception:
            _RULES_CACHE = {"domains": {}, "default": {}}
        return _RULES_CACHE


def _load_blocked_pages(
    blocked_dir: str = DEFAULT_BLOCKED_DIR,
    rules: dict | None = None,
) -> list[dict]:
    """
    Nạp danh sách ảnh banner/credit cần xóa toàn trang (kể cả khi nằm giữa chap).
    Thả file ảnh banner mẫu vào thư mục `scripts/pipeline/blocked_pages/`.
    """
    global _BLOCKED_PAGES_CACHE
    with _CACHE_LOCK:
        if _BLOCKED_PAGES_CACHE is not None:
            return _BLOCKED_PAGES_CACHE

        entries: list[dict] = []
        if os.path.isdir(blocked_dir):
            for fname in sorted(os.listdir(blocked_dir)):
                if not fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                    continue
                fpath = os.path.join(blocked_dir, fname)
                try:
                    with Image.open(fpath) as im:
                        w, h = im.size
                        if w <= 0 or h <= 0:
                            continue
                        entries.append(
                            {
                                "name": fname,
                                "hash": _compute_dhash(im),
                                "aspect": w / float(h),
                            }
                        )
                except Exception:
                    continue

        for raw in (rules or {}).get("blocked_hashes", []) or []:
            s = str(raw).strip().lower().removeprefix("0x")
            if not s:
                continue
            try:
                entries.append({"name": f"hash:{s[:8]}", "hash": int(s, 16), "aspect": None})
            except ValueError:
                continue

        _BLOCKED_PAGES_CACHE = entries
        return _BLOCKED_PAGES_CACHE


def _load_templates(templates_dir: str = DEFAULT_TEMPLATES_DIR) -> list[dict]:
    global _TEMPLATES_CACHE
    if cv2 is None:
        return []
    with _CACHE_LOCK:
        if _TEMPLATES_CACHE is not None:
            return _TEMPLATES_CACHE
        loaded: list[dict] = []
        if os.path.isdir(templates_dir):
            for fname in sorted(os.listdir(templates_dir)):
                if not fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                    continue
                fpath = os.path.join(templates_dir, fname)
                gray = cv2.imread(fpath, cv2.IMREAD_GRAYSCALE)
                if gray is None or gray.shape[0] < 8 or gray.shape[1] < 8:
                    continue
                stem = os.path.splitext(fname)[0].lower()
                domain_key = "global"
                if "__" in stem:
                    domain_key = stem.split("__", 1)[0].strip() or "global"
                loaded.append(
                    {
                        "name": fname,
                        "domain": domain_key,
                        "gray": gray,
                        "w": gray.shape[1],
                        "h": gray.shape[0],
                    }
                )
        _TEMPLATES_CACHE = loaded
        return _TEMPLATES_CACHE


def _get_domain_rule(source_url: str, rules: dict) -> dict:
    host = (urlparse(source_url or "").netloc or "").lower()
    merged = dict(rules.get("default") or {})
    for key, cfg in (rules.get("domains") or {}).items():
        if key.lower() in host and isinstance(cfg, dict):
            merged.update(cfg)
    return merged


def _should_drop_banner_page(
    img_path: str,
    img_url: str,
    rule: dict,
    blocked_pages: list[dict],
    allow_heuristic: bool = True,
) -> tuple[bool, str]:
    low_url = (img_url or "").lower()
    for kw in rule.get("blocked_url_keywords", []) or []:
        k = str(kw).strip().lower()
        if k and k in low_url:
            return True, f"drop-url({k})"

    try:
        with Image.open(img_path) as im:
            w, h = im.size
            if w <= 0 or h <= 0:
                return True, "drop-invalid"

            aspect = w / float(h)

            if blocked_pages:
                cur_hash = _compute_dhash(im)
                max_dist = int(rule.get("blocked_hash_distance", 6) or 6)
                for bp in blocked_pages:
                    if _hamming(cur_hash, bp["hash"]) <= max_dist:
                        bp_aspect = bp.get("aspect")
                        if bp_aspect is None:
                            return True, f"drop-match({bp['name']})"
                        ratio_diff = abs(aspect - bp_aspect) / max(aspect, bp_aspect)
                        if ratio_diff <= 0.28:
                            return True, f"drop-match({bp['name']})"

            if allow_heuristic and rule.get("drop_thin_banners", True):
                if h < 110 or w < 180:
                    return True, f"drop-tiny({w}x{h})"
                if aspect >= 3.2 and h <= 320:
                    return True, f"drop-thin-banner({w}x{h})"
    except Exception:
        return False, ""

    return False, ""


def _nms_boxes(boxes: list[tuple[int, int, int, int, float]], iou_thresh: float = 0.35):
    if not boxes:
        return []
    boxes = sorted(boxes, key=lambda b: b[4], reverse=True)
    kept = []
    while boxes:
        cur = boxes.pop(0)
        kept.append(cur)
        cx1, cy1, cw, ch, _ = cur
        cx2, cy2 = cx1 + cw, cy1 + ch
        nxt = []
        for b in boxes:
            bx1, by1, bw, bh, _ = b
            bx2, by2 = bx1 + bw, by1 + bh
            ix1, iy1 = max(cx1, bx1), max(cy1, by1)
            ix2, iy2 = min(cx2, bx2), min(cy2, by2)
            inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
            union = cw * ch + bw * bh - inter
            if union <= 0 or (inter / union) < iou_thresh:
                nxt.append(b)
        boxes = nxt
    return kept


def _find_template_matches(
    img_gray: np.ndarray,
    templates: list[dict],
    source_host: str,
    threshold: float = 0.78,
    scales: tuple[float, ...] = (0.85, 1.0, 1.15),
) -> list[tuple[int, int, int, int, float]]:
    ih, iw = img_gray.shape[:2]
    raw_boxes: list[tuple[int, int, int, int, float]] = []

    for tpl in templates:
        if tpl["domain"] != "global" and tpl["domain"] not in source_host:
            continue
        base_gray = tpl["gray"]
        for scale in scales:
            tw = int(tpl["w"] * scale)
            th = int(tpl["h"] * scale)
            if tw < 12 or th < 10 or tw >= iw - 4 or th >= ih - 4:
                continue
            resized = (
                base_gray
                if scale == 1.0
                else cv2.resize(base_gray, (tw, th), interpolation=cv2.INTER_AREA)
            )
            res = cv2.matchTemplate(img_gray, resized, cv2.TM_CCOEFF_NORMED)
            ys, xs = np.where(res >= threshold)
            if len(xs) == 0:
                continue
            scores = res[ys, xs]
            top_idx = np.argsort(scores)[::-1][:12]
            for idx in top_idx:
                raw_boxes.append((int(xs[idx]), int(ys[idx]), tw, th, float(scores[idx])))

    return _nms_boxes(raw_boxes)


def _sample_border_stats(img_bgr: np.ndarray, x: int, y: int, w: int, h: int, pad: int = 6):
    ih, iw = img_bgr.shape[:2]
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(iw, x + w + pad)
    y2 = min(ih, y + h + pad)

    strips = []
    if y1 < y:
        strips.append(img_bgr[y1:y, x1:x2].reshape(-1, 3))
    if y + h < y2:
        strips.append(img_bgr[y + h : y2, x1:x2].reshape(-1, 3))
    if x1 < x:
        strips.append(img_bgr[y1:y2, x1:x].reshape(-1, 3))
    if x + w < x2:
        strips.append(img_bgr[y1:y2, x + w : x2].reshape(-1, 3))

    if not strips:
        return 999.0, (255, 255, 255)
    pixels = np.concatenate(strips, axis=0)
    if pixels.size == 0:
        return 999.0, (255, 255, 255)

    std_val = float(np.mean(np.std(pixels, axis=0)))
    med_bgr = tuple(int(v) for v in np.median(pixels, axis=0))
    return std_val, med_bgr


def _is_near_edge_or_corner(x: int, y: int, w: int, h: int, iw: int, ih: int) -> bool:
    cx = x + w / 2.0
    cy = y + h / 2.0
    near_x = cx < iw * 0.24 or cx > iw * 0.76
    near_y = cy < ih * 0.14 or cy > ih * 0.86
    return near_x or near_y


def _draw_brand_badge_bgr(img_bgr: np.ndarray, x: int, y: int, w: int, h: int, label: str) -> np.ndarray:
    ih, iw = img_bgr.shape[:2]
    pad = 4
    bx1 = max(0, x - pad)
    by1 = max(0, y - pad)
    bx2 = min(iw, x + w + pad)
    by2 = min(ih, y + h + pad)
    bw, bh = bx2 - bx1, by2 - by1
    if bw < 20 or bh < 14:
        return img_bgr

    pil_img = Image.fromarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)).convert("RGBA")
    overlay = Image.new("RGBA", pil_img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    radius = max(6, min(14, bh // 3))
    draw.rounded_rectangle(
        [bx1, by1, bx2, by2],
        radius=radius,
        fill=(14, 14, 22, 232),
        outline=(244, 63, 94, 210),
        width=2,
    )

    font_size = max(11, min(26, int(bh * 0.52)))
    font = ImageFont.load_default()
    for fpath in FONT_CANDIDATES:
        if os.path.exists(fpath):
            try:
                font = ImageFont.truetype(fpath, size=font_size)
                break
            except Exception:
                continue

    while font_size > 10 and draw.textlength(label, font=font) > bw - 14:
        font_size -= 1
        for fpath in FONT_CANDIDATES:
            if os.path.exists(fpath):
                try:
                    font = ImageFont.truetype(fpath, size=font_size)
                    break
                except Exception:
                    continue

    draw.text(
        (bx1 + bw // 2, by1 + bh // 2),
        label,
        fill=(244, 244, 245, 255),
        font=font,
        anchor="mm",
    )

    composed = Image.alpha_composite(pil_img, overlay).convert("RGB")
    return cv2.cvtColor(np.asarray(composed), cv2.COLOR_RGB2BGR)


def _inpaint_text_roi(img_bgr: np.ndarray, x: int, y: int, w: int, h: int) -> np.ndarray:
    ih, iw = img_bgr.shape[:2]
    pad = 4
    rx1, ry1 = max(0, x - pad), max(0, y - pad)
    rx2, ry2 = min(iw, x + w + pad), min(ih, y + h + pad)
    roi = img_bgr[ry1:ry2, rx1:rx2]
    if roi.size == 0:
        return img_bgr

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    diff = cv2.absdiff(gray, blur)
    _, mask = cv2.threshold(diff, 14, 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.dilate(mask, kernel, iterations=1)

    if np.count_nonzero(mask) < mask.size * 0.03:
        mask[:, :] = 0
        mask[pad : max(pad + 1, mask.shape[0] - pad), pad : max(pad + 1, mask.shape[1] - pad)] = 255

    cleaned_roi = cv2.inpaint(roi, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
    img_bgr[ry1:ry2, rx1:rx2] = cleaned_roi
    return img_bgr


def clean_image_watermarks(
    img_path: str,
    source_url: str = "",
    rules_path: str = DEFAULT_RULES_PATH,
    templates_dir: str = DEFAULT_TEMPLATES_DIR,
) -> tuple[bool, str]:
    if cv2 is None or not os.path.exists(img_path):
        return False, ""

    rules = _load_rules(rules_path)
    rule = _get_domain_rule(source_url, rules)
    templates = _load_templates(templates_dir)

    crop_top = int(rule.get("crop_top", 0) or 0)
    crop_bottom = int(rule.get("crop_bottom", 0) or 0)
    threshold = float(rule.get("match_threshold", 0.78) or 0.78)
    flat_std_limit = float(rule.get("flat_std_threshold", 18.0) or 18.0)
    brand_label = (os.getenv("BRAND_SITE_NAME", "VinaReader").strip() or "VinaReader").upper()

    if crop_top <= 0 and crop_bottom <= 0 and not templates:
        return False, ""

    img = cv2.imread(img_path, cv2.IMREAD_COLOR)
    if img is None:
        return False, ""

    changed = False
    actions: list[str] = []

    ih, iw = img.shape[:2]
    if (crop_top > 0 or crop_bottom > 0) and ih > (crop_top + crop_bottom + 240):
        y1 = max(0, crop_top)
        y2 = ih - max(0, crop_bottom)
        img = img[y1:y2, :]
        changed = True
        actions.append(f"crop({crop_top},{crop_bottom})")

    if templates:
        host = (urlparse(source_url or "").netloc or "").lower()
        img_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        matches = _find_template_matches(img_gray, templates, host, threshold=threshold)
        ih, iw = img.shape[:2]

        for x, y, w, h, _score in matches:
            std_val, med_bgr = _sample_border_stats(img, x, y, w, h)
            if std_val <= flat_std_limit:
                pad = 2
                cv2.rectangle(
                    img,
                    (max(0, x - pad), max(0, y - pad)),
                    (min(iw - 1, x + w + pad), min(ih - 1, y + h + pad)),
                    med_bgr,
                    thickness=-1,
                )
                actions.append("fill")
                changed = True
            elif _is_near_edge_or_corner(x, y, w, h, iw, ih):
                img = _draw_brand_badge_bgr(img, x, y, w, h, brand_label)
                actions.append("cover")
                changed = True
            else:
                img = _inpaint_text_roi(img, x, y, w, h)
                actions.append("inpaint")
                changed = True

    if changed:
        cv2.imwrite(img_path, img)
        return True, "+".join(actions)
    return False, ""


def clean_chapter_images(
    raw_items: list[tuple[str, str]],
    chapter_url: str = "",
) -> tuple[list[tuple[str, str]], list[str]]:
    """
    1. Lọc bỏ các ảnh banner rời / quảng cáo chèn ở đầu, giữa hoặc cuối chap.
    2. Làm sạch watermark nằm trong từng trang truyện còn lại.
    Trả về: (filtered_items, logs)
    """
    rules = _load_rules()
    blocked_pages = _load_blocked_pages(rules=rules)
    allow_heuristic = len(raw_items) > 3

    kept_items: list[tuple[str, str]] = []
    logs: list[str] = []

    for idx, (img_path, img_url) in enumerate(raw_items, start=1):
        source = chapter_url or img_url
        rule = _get_domain_rule(source, rules)

        should_drop, drop_reason = _should_drop_banner_page(
            img_path,
            img_url,
            rule=rule,
            blocked_pages=blocked_pages,
            allow_heuristic=allow_heuristic,
        )
        if should_drop:
            logs.append(f"Trang #{idx}: {drop_reason}")
            try:
                os.remove(img_path)
            except Exception:
                pass
            continue

        try:
            changed, action = clean_image_watermarks(img_path, source_url=source)
            if changed:
                logs.append(f"Trang #{idx}: {action}")
        except Exception:
            pass

        kept_items.append((img_path, img_url))

    if not kept_items and raw_items:
        return list(raw_items), logs
    return kept_items, logs
