"""Generate the default contact icons used by SignOff signatures.

Email clients can't show SVG, so icons are small PNGs: a filled circle in the
brand colour with a white glyph. One set per preset colour, drawn large and
downsampled for smooth edges. Exported at 40x40 for display at 20x20.

Usage:  python tools/make_icons.py
Output: assets/icons/<VERSION>/<icon>-<hex>.png

Bump VERSION whenever an icon changes: mail clients cache images, so
replacing a file in place won't update signatures people already use.
"""
from pathlib import Path

from PIL import Image, ImageDraw

VERSION = "v1"
# Keep in sync with ICON_COLOURS in js/themes.js.
COLOURS = [
    "1b2a4a", "1f4b99", "0f4c5c", "0f766e", "2f6b3a", "8a6d1d", "7c2d12",
    "c2410c", "b42318", "9d174d", "5b21b6", "2b2b2b", "6b6b6b",
]
BIG = 320          # drawing size
OUT = 40           # exported size (2x display)
WHITE = (255, 255, 255, 255)
W = 15             # stroke width at drawing size

OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "icons" / VERSION


def base(hex_colour):
    img = Image.new("RGBA", (BIG, BIG), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rgb = tuple(int(hex_colour[i:i + 2], 16) for i in (0, 2, 4))
    d.ellipse((0, 0, BIG - 1, BIG - 1), fill=rgb + (255,))
    return img, d


def web(d):
    c, r = BIG / 2, 84
    d.ellipse((c - r, c - r, c + r, c + r), outline=WHITE, width=W)
    d.ellipse((c - 36, c - r, c + 36, c + r), outline=WHITE, width=W)
    d.line((c - r, c, c + r, c), fill=WHITE, width=W)
    for dy in (-42, 42):
        half = (r * r - dy * dy) ** 0.5 - 4
        d.line((c - half, c + dy, c + half, c + dy), fill=WHITE, width=W - 3)


def phone(d):
    c = BIG / 2
    d.rounded_rectangle((c - 52, c - 88, c + 52, c + 88), radius=20, outline=WHITE, width=W)
    d.ellipse((c - 10, c + 50, c + 10, c + 70), fill=WHITE)


def email(d):
    c = BIG / 2
    left, top, right, bottom = c - 88, c - 60, c + 88, c + 60
    d.rounded_rectangle((left, top, right, bottom), radius=12, outline=WHITE, width=W)
    d.line((left + 6, top + 8, c, c + 8, right - 6, top + 8), fill=WHITE, width=W, joint="curve")


def social(d):
    c = BIG / 2
    dots = [(c + 46, c - 56), (c - 50, c), (c + 46, c + 56)]
    d.line((*dots[0], *dots[1]), fill=WHITE, width=W)
    d.line((*dots[1], *dots[2]), fill=WHITE, width=W)
    for x, y in dots:
        d.ellipse((x - 26, y - 26, x + 26, y + 26), fill=WHITE)


ICONS = {"web": web, "phone": phone, "email": email, "social": social}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, draw in ICONS.items():
        for colour in COLOURS:
            img, d = base(colour)
            draw(d)
            path = OUT_DIR / f"{name}-{colour}.png"
            img.resize((OUT, OUT), Image.LANCZOS).save(path, optimize=True)
            total += path.stat().st_size
    print(f"Wrote {len(ICONS) * len(COLOURS)} icons to {OUT_DIR} ({total / 1024:.1f} KB total)")


if __name__ == "__main__":
    main()
