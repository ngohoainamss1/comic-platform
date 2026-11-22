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


def remove_hsv_watermark_text(img_bgr: np.ndarray) -> np.ndarray:
    """
    Tự động phát hiện và xóa chữ watermark màu xanh dương (LuotTruyen.Com) 
    và màu đỏ/hồng (sub-text) bằng không gian màu HSV và Inpainting.
    """
    if cv2 is None:
        return img_bgr
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)

    # 1. Mask màu xanh dương đặc trưng của LuotTruyen.Com
    lower_blue = np.array([95, 100, 100])
    upper_blue = np.array([135, 255, 255])
    mask_blue = cv2.inRange(hsv, lower_blue, upper_blue)

    # 2. Mask màu đỏ / hồng đặc trưng của sub-text
    lower_red1 = np.array([0, 100, 100])
    upper_red1 = np.array([10, 255, 255])
    mask_red1 = cv2.inRange(hsv, lower_red1, upper_red1)

    lower_red2 = np.array([170, 100, 100])
    upper_red2 = np.array([180, 255, 255])
    mask_red2 = cv2.inRange(hsv, lower_red2, upper_red2)

    mask = cv2.bitwise_or(mask_blue, cv2.bitwise_or(mask_red1, mask_red2))

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    mask = cv2.dilate(mask, kernel, iterations=1)

    if cv2.countNonZero(mask) > 0:
        img_bgr = cv2.inpaint(img_bgr, mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

    return img_bgr


def is_promo_banner_image(img_path: str, img_url: str = "") -> tuple[bool, str]:
    low_url = (img_url or "").lower()
    promo_keywords = ["luottruyen", "quangcao", "banner", "vip", "donate", "nạp", "nap", "quang-cao"]
    for kw in promo_keywords:
        if kw in low_url:
            return True, f"URL chứa từ khóa quảng cáo '{kw}'"
    return False, ""


def clean_image_watermarks(
    img_path: str,
    source_url: str = "",
    rules_path: str = DEFAULT_RULES_PATH,
    templates_dir: str = DEFAULT_TEMPLATES_DIR,
) -> tuple[bool, str]:
    if cv2 is None or not os.path.exists(img_path):
        return False, ""

    # Kiểm tra xem có phải ảnh banner quảng cáo riêng lẻ không
    is_promo, promo_reason = is_promo_banner_image(img_path, source_url)
    if is_promo:
        return True, f"drop_promo({promo_reason})"

    rules = _load_rules(rules_path)
    rule = _get_domain_rule(source_url, rules)
    templates = _load_templates(templates_dir)

    crop_top = int(rule.get("crop_top", 0) or 0)
    crop_bottom = int(rule.get("crop_bottom", 0) or 0)
    threshold = float(rule.get("match_threshold", 0.78) or 0.78)
    brand_label = (os.getenv("BRAND_SITE_NAME", "VinaReader").strip() or "VinaReader").upper()

    img = cv2.imread(img_path, cv2.IMREAD_COLOR)
    if img is None:
        return False, ""

    changed = False
    actions: list[str] = []

    # 1. Tự động xóa chữ watermark qua HSV (LuotTruyen.Com xanh + đỏ)
    img = remove_hsv_watermark_text(img)
    changed = True
    actions.append("hsv_text_clean")

    # 2. Cắt mép banner cố định nếu có rule
    ih, iw = img.shape[:2]
    if (crop_top > 0 or crop_bottom > 0) and ih > (crop_top + crop_bottom + 240):
        y1 = max(0, crop_top)
        y2 = ih - max(0, crop_bottom)
        img = img[y1:y2, :]
        changed = True
        actions.append(f"crop({crop_top},{crop_bottom})")

    # 3. Template matching cho các logo/banner tùy chỉnh trong templates/
    if templates:
        host = (urlparse(source_url or "").netloc or "").lower()
        img_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        matches = _find_template_matches(img_gray, templates, host, threshold=threshold)
        ih, iw = img.shape[:2]

        for x, y, w, h, _score in matches:
            std_val, _med_bgr = _sample_border_stats(img, x, y, w, h)
            if std_val <= 18.0:
                actions.append("fill")
                changed = True
            elif _is_near_edge_or_corner(x, y, w, h, iw, ih):
                img = _draw_brand_badge_bgr(img, x, y, w, h, brand_label)
                actions.append("cover")
                changed = True
            else:
                roi = img[max(0, y - 4):min(ih, y + h + 4), max(0, x - 4):min(iw, x + w + 4)]
                if roi.size > 0:
                    img[max(0, y - 4):min(ih, y + h + 4), max(0, x - 4):min(iw, x + w + 4)] = cv2.inpaint(
                        roi, np.ones(roi.shape[:2], dtype=np.uint8) * 255, 3, cv2.INPAINT_TELEA
                    )
                actions.append("inpaint")
                changed = True

    if changed:
        cv2.imwrite(img_path, img)
        return True, "+".join(actions)
    return False, ""


def clean_chapter_images(
    raw_items: list[tuple[str, str]],
    chapter_url: str = "",
) -> list[str]:
    if cv2 is None:
        return []
    logs: list[str] = []
    valid_cleaned_items: list[tuple[str, str]] = []

    for idx, (img_path, img_url) in enumerate(raw_items, start=1):
        try:
            is_promo, _ = is_promo_banner_image(img_path, chapter_url or img_url)
            if is_promo:
                logs.append(f"Trang #{idx}: drop_promo_banner")
                try:
                    os.remove(img_path)
                except Exception:
                    pass
                continue

            changed, action = clean_image_watermarks(img_path, source_url=chapter_url or img_url)
            if changed:
                logs.append(f"Trang #{idx}: {action}")
        except Exception:
            continue
    return logs
