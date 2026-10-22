"""Draws the Recommendation Journal icon set: a speech bubble (someone telling you about something)
with a warm star inside, on dark navy.

Run with Python + Pillow (pip install pillow):  python scripts/make-icons.py
Writes app/assets/*.png (phone icons) and app/public/* (web / home-screen icons).
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

APP = Path(__file__).resolve().parent.parent
NAVY_TOP, NAVY_BOTTOM = (27, 33, 80), (14, 17, 32)   # theme: a lighter navy fading to colors.bg
BUBBLE = (159, 168, 255)                             # theme colors.accent
STAR = (255, 196, 122)                               # theme colors.warm
SS = 4                                               # draw 4x larger, then shrink: smooth edges


def background(size):
    """Vertical navy gradient."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        row = tuple(round(a + (b - a) * t) for a, b in zip(NAVY_TOP, NAVY_BOTTOM))
        for x in range(size):
            px[x, y] = row
    return img


def bubble_mask(size, scale):
    """A rounded speech bubble with a tail at the bottom left. `scale` is its share of the canvas."""
    big = size * SS
    w, h = big * scale, big * scale * 0.78
    x0, y0 = (big - w) / 2, (big - h) / 2 - big * scale * 0.06
    m = Image.new("L", (big, big), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=h * 0.32, fill=255)
    d.polygon([(x0 + w * 0.22, y0 + h * 0.80), (x0 + w * 0.46, y0 + h * 0.80), (x0 + w * 0.16, y0 + h * 1.22)], fill=255)
    return m.resize((size, size), Image.LANCZOS)


def star_mask(size, scale):
    """A five-pointed star in the middle of the bubble."""
    big = size * SS
    cx, cy = big / 2, big / 2 - big * scale * 0.06
    r_out, r_in = big * scale * 0.25, big * scale * 0.105
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = r_out if i % 2 == 0 else r_in
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    m = Image.new("L", (big, big), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def artwork(size, scale, bg=True, mono=False):
    img = background(size).convert("RGBA") if bg else Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bubble, star = bubble_mask(size, scale), star_mask(size, scale)
    img.paste(Image.new("RGBA", (size, size), (255, 255, 255, 255) if mono else BUBBLE + (255,)), (0, 0), bubble)
    # The star is cut out of the bubble (mono) or painted on it in the warm color.
    if mono:
        img.paste(Image.new("RGBA", (size, size), (0, 0, 0, 0)), (0, 0), star)
    else:
        img.paste(Image.new("RGBA", (size, size), STAR + (255,)), (0, 0), star)
    return img


def save(img, rel, size=None, rgb=False):
    out = APP / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    if size:
        img = img.resize((size, size), Image.LANCZOS)
    (img.convert("RGB") if rgb else img).save(out)
    print("wrote", rel, img.size)


full = artwork(1024, 0.62)                 # iOS / Expo icon: fills the square, the OS rounds the corners
save(full, "assets/icon.png", rgb=True)
save(artwork(1024, 0.50), "assets/splash-icon.png")
# Android adaptive icon: the launcher crops to a circle/squircle, so the art stays in the middle ~60%.
save(artwork(512, 0.42, bg=False), "assets/android-icon-foreground.png")
save(background(512).convert("RGBA"), "assets/android-icon-background.png")
save(artwork(432, 0.42, bg=False, mono=True), "assets/android-icon-monochrome.png")
# Web: browser tab, "Add to Home Screen" on iPhone, and installable web app icons.
save(full, "assets/favicon.png", 48)
save(full, "public/apple-touch-icon.png", 180, rgb=True)
save(full, "public/icon-192.png", 192)
save(full, "public/icon-512.png", 512)
