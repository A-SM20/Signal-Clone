"""Procedurally generated seed media (no third-party images or licences involved)."""

import io
import random
import uuid
from pathlib import Path

from PIL import Image, ImageDraw

PALETTES = {
    "trail-map": ((206, 226, 214), (120, 160, 130), (70, 110, 90)),
    "summit": ((255, 196, 140), (190, 110, 120), (60, 50, 90)),
    "lake": ((170, 210, 240), (90, 140, 190), (40, 80, 120)),
    "sunset": ((250, 180, 120), (220, 100, 110), (80, 40, 90)),
}


def landscape(name: str, size: tuple[int, int] = (960, 720)) -> bytes:
    """Sky gradient, sun and layered mountain ridges — reads as a photo thumbnail."""
    sky_top, sky_bottom, ridge = PALETTES.get(name, PALETTES["lake"])
    w, h = size
    rng = random.Random(name)
    img = Image.new("RGB", size)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        draw.line([(0, y), (w, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(sky_top, sky_bottom)))
    draw.ellipse([w * 0.62, h * 0.18, w * 0.62 + 110, h * 0.18 + 110], fill=(255, 240, 210))
    for layer in range(3):
        base = h * (0.55 + layer * 0.12)
        points = [(0, h)]
        for x in range(0, w + 80, 80):
            points.append((x, base - rng.randint(20, 140) / (layer + 1)))
        points.append((w, h))
        shade = tuple(max(0, c - layer * 18) for c in ridge)
        draw.polygon(points, fill=shade)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=82)
    return out.getvalue()


def pdf_document(title: str) -> bytes:
    page = Image.new("RGB", (850, 1100), "white")
    draw = ImageDraw.Draw(page)
    draw.rectangle([60, 60, 790, 130], fill=(44, 107, 237))
    draw.text((80, 85), title, fill="white")
    for i in range(18):
        y = 180 + i * 44
        draw.rectangle([80, y, 80 + 600 - (i % 4) * 90, y + 14], fill=(225, 225, 225))
    out = io.BytesIO()
    page.save(out, format="PDF")
    return out.getvalue()


def store(upload_dir: str, data: bytes, ext: str) -> str:
    key = uuid.uuid4().hex + ext
    path = Path(upload_dir) / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return key
