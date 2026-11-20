# scripts/pipeline/compressor.py
import os

os.environ.setdefault("VIPS_CONCURRENCY", "1")

import pyvips
import numpy as np


def is_grayscale_page(image: pyvips.Image) -> bool:
    if image.bands < 3:
        return True
    sample_w = min(image.width, 600)
    sample_h = min(image.height, 600)
    sample = image.crop(0, 0, sample_w, sample_h).copy_memory().numpy()
    diff_rg = np.abs(sample[:, :, 0].astype(np.int16) - sample[:, :, 1].astype(np.int16))
    diff_gb = np.abs(sample[:, :, 1].astype(np.int16) - sample[:, :, 2].astype(np.int16))
    return bool(np.mean(diff_rg) < 2.5 and np.mean(diff_gb) < 2.5)


def compress_to_avif(
    input_path: str,
    output_avif_path: str,
    max_width: int = 1080,
    quality: int = 68,
    effort: int = 2,
) -> dict:
    os.makedirs(os.path.dirname(os.path.abspath(output_avif_path)), exist_ok=True)
    img = pyvips.Image.new_from_file(input_path, access="random")

    if img.hasalpha():
        img = img.flatten(background=[255, 255, 255])

    if img.width > max_width:
        scale = max_width / float(img.width)
        img = img.resize(scale, kernel="lanczos3")

    if is_grayscale_page(img):
        img = img.colourspace("b-w")

    img = img.copy_memory()
    img.heifsave(
        output_avif_path,
        Q=quality,
        compression="av1",
        effort=effort,
        subsample_mode="off",
        strip=True,
    )

    return {
        "path": output_avif_path,
        "width": int(img.width),
        "height": int(img.height),
        "size_bytes": os.path.getsize(output_avif_path),
        "format": "avif",
    }
    
