# scripts/pipeline/slicer.py
import os

os.environ.setdefault("VIPS_CONCURRENCY", "1")

import pyvips
import numpy as np
from scripts.pipeline.compressor import save_vips_to_avif


def find_safe_cut_row(image: pyvips.Image, target_y: int, search_window: int = 200) -> int:
    height = image.height
    y_min = max(100, target_y - search_window)
    y_max = min(height - 100, target_y + search_window)

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
    target_chunk_height: int = 1600,
    image: pyvips.Image | None = None,
) -> list[tuple[int, int]]:
    if height <= 2400:
        return [(0, height)]

    ranges: list[tuple[int, int]] = []
    current_y = 0
    while current_y < height:
        remaining = height - current_y
        if remaining <= 2000:
            cut_y = height
        else:
            raw_target = current_y + target_chunk_height
            cut_y = find_safe_cut_row(image, raw_target, search_window=200) if image is not None else raw_target
            if cut_y <= current_y + 400:
                cut_y = raw_target
        ranges.append((current_y, cut_y))
        current_y = cut_y
    return ranges


def slice_and_compress_to_avif(
    input_path: str,
    output_dir: str,
    prefix: str = "page",
    max_width: int = 1440,
    quality: int = 80,
    effort: int = 2,
) -> list[dict]:
    os.makedirs(output_dir, exist_ok=True)
    img = pyvips.Image.new_from_file(input_path, access="random")

    if img.hasalpha():
        img = img.flatten(background=[255, 255, 255])

    if img.width > max_width:
        scale = max_width / float(img.width)
        img = img.resize(scale, kernel="lanczos3")

    ranges = _compute_slice_ranges(img.height, target_chunk_height=1600, image=img)
    results: list[dict] = []
    for chunk_idx, (y0, y1) in enumerate(ranges):
        piece = img if (y0 == 0 and y1 == img.height) else img.crop(0, y0, img.width, y1 - y0)
        out_avif = os.path.join(output_dir, f"{prefix}_{chunk_idx:03d}.avif")
        meta = save_vips_to_avif(piece, out_avif, quality=quality, effort=effort)
        results.append(meta)
    return results


def slice_webtoon_image(input_path: str, output_dir: str, prefix: str = "page") -> list[str]:
    os.makedirs(output_dir, exist_ok=True)
    img = pyvips.Image.new_from_file(input_path, access="random")
    ranges = _compute_slice_ranges(img.height, target_chunk_height=1600, image=img)
    chunks: list[str] = []
    for chunk_idx, (y0, y1) in enumerate(ranges):
        piece = img if (y0 == 0 and y1 == img.height) else img.crop(0, y0, img.width, y1 - y0)
        out_path = os.path.join(output_dir, f"{prefix}_{chunk_idx:03d}.png")
        piece.copy_memory().pngsave(out_path, compression=1)
        chunks.append(out_path)
    return chunks
