# scripts/pipeline/slicer.py
import os

os.environ.setdefault("VIPS_CONCURRENCY", "1")

import pyvips
import numpy as np
from scripts.pipeline.compressor import save_vips_to_avif

DEFAULT_TARGET_HEIGHT = int(os.getenv("SLICE_TARGET_HEIGHT", "3600"))
DEFAULT_MAX_HEIGHT = int(os.getenv("SLICE_MAX_HEIGHT", "4200"))


def find_safe_cut_row(image: pyvips.Image, target_y: int, search_window: int = 240) -> int:
    height = image.height
    y_min = max(120, target_y - search_window)
    y_max = min(height - 120, target_y + search_window)

    if y_min >= y_max:
        return target_y

    band = image.crop(0, y_min, image.width, y_max - y_min).copy_memory()
    arr = band.numpy()

    if arr.ndim == 3:
        row_std = np.std(arr, axis=(1, 2))
    else:
        row_std = np.std(arr, axis=1)

    best_offset = int(np.argmin(row_std))
    return y_min + best_offset


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
            cut_y = height
        else:
            raw_target = current_y + target_chunk_height
            cut_y = find_safe_cut_row(image, raw_target, search_window=240) if image is not None else raw_target
            if cut_y <= current_y + 600:
                cut_y = raw_target
        ranges.append((current_y, cut_y))
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
        scale = max_width / float(img.width)
        img = img.resize(scale, kernel="lanczos3")
    return img


def slice_and_compress_to_avif(
    input_path: str,
    output_dir: str,
    prefix: str = "page",
    max_width: int = 1440,
    quality: int = 80,
    effort: int = 1,
    target_height: int = DEFAULT_TARGET_HEIGHT,
    max_height: int = DEFAULT_MAX_HEIGHT,
) -> list[dict]:
    os.makedirs(output_dir, exist_ok=True)
    img = _load_normalized_image(input_path, max_width=max_width)

    ranges = _compute_slice_ranges(
        img.height,
        target_chunk_height=target_height,
        max_single_height=max_height,
        image=img,
    )
    results: list[dict] = []
    for chunk_idx, (y0, y1) in enumerate(ranges):
        piece = img if (y0 == 0 and y1 == img.height) else img.crop(0, y0, img.width, y1 - y0)
        out_avif = os.path.join(output_dir, f"{prefix}_{chunk_idx:03d}.avif")
        meta = save_vips_to_avif(piece, out_avif, quality=quality, effort=effort)
        results.append(meta)
    return results


def pack_and_compress_chapter_images(
    input_paths: list[str],
    output_dir: str,
    max_width: int = 1440,
    quality: int = 80,
    effort: int = 1,
    target_height: int = DEFAULT_TARGET_HEIGHT,
    max_height: int = DEFAULT_MAX_HEIGHT,
) -> list[dict]:
    """
    Gộp thông minh các ảnh ngắn cùng chiều rộng thành dải dài (~3600px, tối đa 4200px)
    và cắt an toàn các dải quá dài trước khi nén AVIF để giảm mạnh số file gửi lên Telegram.
    """
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
        if len(buf) == 1:
            packed_strips.append(buf[0])
        else:
            packed_strips.append(pyvips.Image.arrayjoin(buf, across=1))
        buf = []
        buf_width = 0
        buf_height = 0

    for img in normalized_imgs:
        if not buf:
            buf = [img]
            buf_width = img.width
            buf_height = img.height
            continue

        if img.width == buf_width and (buf_height + img.height) <= max_height:
            buf.append(img)
            buf_height += img.height
        else:
            _flush_buffer()
            buf = [img]
            buf_width = img.width
            buf_height = img.height

    _flush_buffer()

    results: list[dict] = []
    page_counter = 0
    for strip in packed_strips:
        ranges = _compute_slice_ranges(
            strip.height,
            target_chunk_height=target_height,
            max_single_height=max_height,
            image=strip,
        )
        for y0, y1 in ranges:
            piece = strip if (y0 == 0 and y1 == strip.height) else strip.crop(0, y0, strip.width, y1 - y0)
            out_avif = os.path.join(output_dir, f"page_{page_counter:03d}.avif")
            meta = save_vips_to_avif(piece, out_avif, quality=quality, effort=effort)
            results.append(meta)
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
