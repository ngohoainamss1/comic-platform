# scripts/pipeline/slicer.py
import os

os.environ.setdefault("VIPS_CONCURRENCY", "1")

import pyvips
import numpy as np
from scripts.pipeline.compressor import save_vips_to_avif

DEFAULT_TARGET_HEIGHT = int(os.getenv("SLICE_TARGET_HEIGHT", "3200"))
DEFAULT_MAX_HEIGHT = int(os.getenv("SLICE_MAX_HEIGHT", "3800"))
SLICE_OVERLAP_PX = int(os.getenv("SLICE_OVERLAP_PX", "96"))


def find_safe_cut_row(
    image: pyvips.Image,
    target_y: int,
    search_window: int = 560,
    min_band_height: int = 14,
    std_threshold: float = 12.0,
) -> tuple[int, bool]:
    height = image.height
    y_min = max(120, target_y - search_window)
    y_max = min(height - 120, target_y + search_window)
    if y_min >= y_max:
        return target_y, False

    band = image.crop(0, y_min, image.width, y_max - y_min).copy_memory()
    arr = band.numpy()
    row_std = np.std(arr, axis=(1, 2)) if arr.ndim == 3 else np.std(arr, axis=1)

    is_quiet = row_std <= std_threshold
    best_center = None
    best_score = float("inf")
    n = len(is_quiet)
    i = 0
    while i < n:
        if not is_quiet[i]:
            i += 1
            continue
        j = i
        while j < n and is_quiet[j]:
            j += 1
        run_len = j - i
        if run_len >= min_band_height:
            abs_y = y_min + (i + j) // 2
            dist_penalty = abs(abs_y - target_y) / max(1.0, float(search_window))
            width_bonus = min(run_len, 80) / 80.0
            score = dist_penalty - 0.35 * width_bonus
            if score < best_score:
                best_score = score
                best_center = abs_y
        i = j

    if best_center is not None:
        return best_center, True

    best_offset = int(np.argmin(row_std))
    return y_min + best_offset, bool(row_std[best_offset] <= std_threshold * 0.6)


def _compute_slice_ranges(
    height: int,
    target_chunk_height: int = DEFAULT_TARGET_HEIGHT,
    max_single_height: int = DEFAULT_MAX_HEIGHT,
    image: pyvips.Image | None = None,
) -> list[tuple[int, int]]:
    if height <= max_single_height:
        return [(0, height)]

    ranges: list[tuple[int, int]] = []
    current_y = 0
    while current_y < height:
        remaining = height - current_y
        if remaining <= max_single_height:
            ranges.append((current_y, height))
            break
        raw_target = current_y + target_chunk_height
        if image is not None:
            cut_y, is_clean = find_safe_cut_row(image, raw_target, search_window=560)
        else:
            cut_y, is_clean = raw_target, True
        if cut_y <= current_y + 600:
            cut_y, is_clean = raw_target, False
        ranges.append((current_y, cut_y))
        if not is_clean and SLICE_OVERLAP_PX > 0 and (cut_y - SLICE_OVERLAP_PX) > current_y + 300:
            current_y = cut_y - SLICE_OVERLAP_PX
        else:
            current_y = cut_y
    return ranges


def _load_normalized_image(input_path: str, max_width: int = 1440) -> pyvips.Image:
    img = pyvips.Image.new_from_file(input_path, access="random")
    if img.hasalpha():
        img = img.flatten(background=[255, 255, 255])
    if img.bands == 1:
        img = img.colourspace("srgb")
    elif img.bands > 3:
        img = img.extract_band(0, n=3)
    if img.width > max_width:
        img = img.resize(max_width / float(img.width), kernel="lanczos3")
    return img


def slice_and_compress_to_avif(
    input_path: str, output_dir: str, prefix: str = "page",
    max_width: int = 1440, quality: int = 80, effort: int = 1,
    target_height: int = DEFAULT_TARGET_HEIGHT, max_height: int = DEFAULT_MAX_HEIGHT,
) -> list[dict]:
    os.makedirs(output_dir, exist_ok=True)
    img = _load_normalized_image(input_path, max_width=max_width)
    ranges = _compute_slice_ranges(img.height, target_chunk_height=target_height, max_single_height=max_height, image=img)
    results: list[dict] = []
    for chunk_idx, (y0, y1) in enumerate(ranges):
        piece = img if (y0 == 0 and y1 == img.height) else img.crop(0, y0, img.width, y1 - y0)
        out_avif = os.path.join(output_dir, f"{prefix}_{chunk_idx:03d}.avif")
        results.append(save_vips_to_avif(piece, out_avif, quality=quality, effort=effort))
    return results


def pack_and_compress_chapter_images(
    input_paths: list[str], output_dir: str,
    max_width: int = 1440, quality: int = 80, effort: int = 1,
    target_height: int = DEFAULT_TARGET_HEIGHT, max_height: int = DEFAULT_MAX_HEIGHT,
) -> list[dict]:
    os.makedirs(output_dir, exist_ok=True)
    if not input_paths:
        return []
    normalized_imgs = [_load_normalized_image(p, max_width=max_width) for p in input_paths]
    packed_strips: list[pyvips.Image] = []
    buf: list[pyvips.Image] = []
    buf_width = 0
    buf_height = 0

    def _flush_buffer():
        nonlocal buf, buf_width, buf_height
        if not buf:
            return
        packed_strips.append(buf[0] if len(buf) == 1 else pyvips.Image.arrayjoin(buf, across=1))
        buf, buf_width, buf_height = [], 0, 0

    for img in normalized_imgs:
        if not buf:
            buf, buf_width, buf_height = [img], img.width, img.height
            continue
        if img.width == buf_width and (buf_height + img.height) <= max_height:
            buf.append(img)
            buf_height += img.height
        else:
            _flush_buffer()
            buf, buf_width, buf_height = [img], img.width, img.height
    _flush_buffer()

    results: list[dict] = []
    page_counter = 0
    for strip in packed_strips:
        ranges = _compute_slice_ranges(strip.height, target_chunk_height=target_height, max_single_height=max_height, image=strip)
        for y0, y1 in ranges:
            piece = strip if (y0 == 0 and y1 == strip.height) else strip.crop(0, y0, strip.width, y1 - y0)
            out_avif = os.path.join(output_dir, f"page_{page_counter:03d}.avif")
            results.append(save_vips_to_avif(piece, out_avif, quality=quality, effort=effort))
            page_counter += 1
    return results


def slice_webtoon_image(input_path: str, output_dir: str, prefix: str = "page") -> list[str]:
    os.makedirs(output_dir, exist_ok=True)
    img = pyvips.Image.new_from_file(input_path, access="random")
    ranges = _compute_slice_ranges(img.height, target_chunk_height=DEFAULT_TARGET_HEIGHT, max_single_height=DEFAULT_MAX_HEIGHT, image=img)
    chunks: list[str] = []
    for chunk_idx, (y0, y1) in enumerate(ranges):
        piece = img if (y0 == 0 and y1 == img.height) else img.crop(0, y0, img.width, y1 - y0)
        out_path = os.path.join(output_dir, f"{prefix}_{chunk_idx:03d}.png")
        piece.copy_memory().pngsave(out_path, compression=1)
        chunks.append(out_path)
    return chunks
