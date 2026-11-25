"""Builds app/desktop/src-tauri/icons/icon.icns from the brand mark.

macOS draws an app icon as is only when it already has the system's rounded
square shape on a transparent canvas; a full-bleed square gets shrunk into a
grey tile. So the mark sits on a dark rounded square of Apple's grid: 824 px
inside a 1024 px canvas.

Needs rsvg-convert, Pillow and iconutil:  python3 scripts/make-macos-icon.py
"""

import shutil
import subprocess
import sys
import tempfile
from math import copysign, cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MARK = ROOT / "app/frontend/public/favicon.svg"
OUT = ROOT / "app/desktop/src-tauri/icons/icon.icns"

CANVAS = 1024
SHAPE = 824
BACKGROUND = (12, 15, 26, 255)
LETTER = "#09090b"
MARK_WIDTH = 0.56
SUPERSAMPLE = 4
EXPONENT = 5.0


def rounded_square(size: int) -> Image.Image:
    big = size * SUPERSAMPLE
    half = big / 2
    steps = 2048
    points = []
    for i in range(steps):
        t = 2 * pi * i / steps
        c, s = cos(t), sin(t)
        x = copysign(abs(c) ** (2 / EXPONENT), c)
        y = copysign(abs(s) ** (2 / EXPONENT), s)
        points.append((half + x * half, half + y * half))
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask.resize((size, size), Image.LANCZOS)


def render_mark(tmp: Path, width: int) -> Image.Image:
    svg = MARK.read_text()
    svg = svg.split("<style>")[0] + svg.split("</style>")[1]
    svg = svg.replace('class="z"', f'fill="{LETTER}"')
    source = tmp / "mark.svg"
    source.write_text(svg)
    raster = tmp / "mark.png"
    subprocess.run(
        ["rsvg-convert", "-w", "2048", "-h", "2048", "-o", str(raster), str(source)],
        check=True,
    )
    mark = Image.open(raster).convert("RGBA")
    mark = mark.crop(mark.getbbox())
    height = round(mark.height * width / mark.width)
    return mark.resize((width, height), Image.LANCZOS)


def main() -> None:
    if 'class="z"' not in MARK.read_text():
        sys.exit(f"{MARK} no longer marks the letter with class z")
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp = Path(tmp_dir)
        icon = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        tile = Image.new("RGBA", (SHAPE, SHAPE), BACKGROUND)
        mark = render_mark(tmp, round(SHAPE * MARK_WIDTH))
        tile.alpha_composite(mark, ((SHAPE - mark.width) // 2, (SHAPE - mark.height) // 2))
        tile.putalpha(rounded_square(SHAPE))
        offset = (CANVAS - SHAPE) // 2
        icon.alpha_composite(tile, (offset, offset))

        iconset = tmp / "icon.iconset"
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            for scale in (1, 2):
                px = size * scale
                name = f"icon_{size}x{size}{'@2x' if scale == 2 else ''}.png"
                icon.resize((px, px), Image.LANCZOS).save(iconset / name)
        built = tmp / "icon.icns"
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(built)], check=True)
        shutil.copy(built, OUT)
        icon.save(tmp / "preview.png")
        if len(sys.argv) > 1:
            shutil.copy(tmp / "preview.png", sys.argv[1])
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
