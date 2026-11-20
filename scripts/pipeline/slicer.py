import os
import pyvips
import numpy as np


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


def slice_webtoon_image(input_path: str, output_dir: str, prefix: str = "page") -> list[str]:
    os.makedirs(output_dir, exist_ok=True)
    img = pyvips.Image.new_from_file(input_path, access="random")

    if img.height <= 2200:
        out_path = os.path.join(output_dir, f"{prefix}_000.png")
        img.copy_memory().pngsave(out_path)
        return [out_path]

    chunks: list[str] = []
    current_y = 0
    chunk_idx = 0
    target_chunk_height = 1400

    while current_y < img.height:
        remaining = img.height - current_y
        if remaining <= 1800:
            cut_y = img.height
        else:
            raw_target = current_y + target_chunk_height
            cut_y = find_safe_cut_row(img, raw_target, search_window=200)
            if cut_y <= current_y + 400:
                cut_y = raw_target

        slice_h = cut_y - current_y
        piece = img.crop(0, current_y, img.width, slice_h).copy_memory()
        out_path = os.path.join(output_dir, f"{prefix}_{chunk_idx:03d}.png")
        piece.pngsave(out_path)
        chunks.append(out_path)

        current_y = cut_y
        chunk_idx += 1

    return chunks
