# scripts/pipeline/compressor.py
import os

os.environ.setdefault("VIPS_CONCURRENCY", "1")

import pyvips
import numpy as np


def is_grayscale_page(image: pyvips.Image) -> bool:
    if image.bands < 3:
        return True
    thumb = image.thumbnail_image(256, height=256, size="both").copy_memory().numpy()
    if thumb.ndim < 3 or thumb.shape[2] < 3:
        return True
    diff_rg = np.abs(thumb[:, :, 0].astype(np.int16) - thumb[:, :, 1].astype(np.int16))
    diff_gb = np.abs(thumb[:, :, 1].astype(np.int16) - thumb[:, :, 2].astype(np.int16))
    return bool(np.mean(diff_rg) < 1.5 and np.mean(diff_gb) < 1.5 and np.percentile(diff_rg, 98) < 8)


def save_vips_to_avif(
    img: pyvips.Image,
    output_avif_path: str,
    quality: int = 80,
    effort: int = 2,
) -> dict:
    os.makedirs(os.path.dirname(os.path.abspath(output_avif_path)), exist_ok=True)
    if is_grayscale_page(img):
        img = img.colourspace("b-w")

    mem_img = img.copy_memory()
    mem_img.heifsave(
        output_avif_path,
        Q=quality,
        compression="av1",
        effort=effort,
        subsample_mode="off",
        strip=True,
    )

    return {
        "path": output_avif_path,
        "width": int(mem_img.width),
        "height": int(mem_img.height),
        "size_bytes": os.path.getsize(output_avif_path),
        "format": "avif",
    }


def compress_to_avif(
    input_path: str,
    output_avif_path: str,
    max_width: int = 1440,
    quality: int = 80,
    effort: int = 2,
) -> dict:
    img = pyvips.Image.new_from_file(input_path, access="random")
    if img.hasalpha():
        img = img.flatten(background=[255, 255, 255])
    if img.width > max_width:
        scale = max_width / float(img.width)
        img = img.resize(scale, kernel="lanczos3")
    return save_vips_to_avif(img, output_avif_path, quality=quality, effort=effort)
