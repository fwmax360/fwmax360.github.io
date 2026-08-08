"""
Convert assets/miku-run-src.png (8-frame run sheet with checker bg + labels)
into public/images/miku-run.png: 512×80 (8×64×80), transparent.

Usage: python3 scripts/convert-miku-run.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "miku-run-src.png"
OUT = ROOT / "public" / "images" / "miku-run.png"

FW, FH = 64, 80
FRAMES = 8
Y0, Y1 = 232, 418


def is_bg_pixel(p: tuple[int, int, int, int]) -> bool:
    r, g, b, _a = p
    neut = abs(r - g) < 16 and abs(g - b) < 16
    sat = max(r, g, b) - min(r, g, b)
    if r > 248 and g > 248 and b > 248:
        return True
    if neut and r > 180 and sat < 30:
        return True
    if neut and 170 < r < 245 and sat < 25:
        return True
    return False


def key_out(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            if is_bg_pixel(px[x, y]):
                px[x, y] = (0, 0, 0, 0)
    return im.crop(im.getbbox())


def find_bounds(band: Image.Image) -> list[tuple[int, int]]:
    px = band.load()
    w, h = band.size
    dens = []
    for x in range(w):
        dens.append(sum(1 for y in range(h) if px[x, y][3] > 0 and not is_bg_pixel(px[x, y])))
    # smooth
    smooth = []
    for x in range(w):
        sl = dens[max(0, x - 2) : x + 3]
        smooth.append(sum(sl) / len(sl))
    thr = max(smooth) * 0.08
    bounds: list[tuple[int, int]] = []
    inside = False
    start = 0
    for x, v in enumerate(smooth):
        on = v > thr
        if on and not inside:
            start = x
            inside = True
        elif not on and inside:
            bounds.append((start, x - 1))
            inside = False
    if inside:
        bounds.append((start, w - 1))
    if len(bounds) != FRAMES:
        raise RuntimeError(f"expected {FRAMES} frames, got {len(bounds)}: {bounds}")
    return bounds


def fit_frame(fr: Image.Image) -> Image.Image:
    max_w, max_h = 58, 74
    scale = min(max_w / fr.width, max_h / fr.height)
    nw = max(1, int(round(fr.width * scale)))
    nh = max(1, int(round(fr.height * scale)))
    mid = fr.resize((max(nw * 2, nw), max(nh * 2, nh)), Image.BOX)
    fr2 = mid.resize((nw, nh), Image.NEAREST).convert("RGBA")
    px = fr2.load()
    for y in range(fr2.height):
        for x in range(fr2.width):
            r, g, b, a = px[x, y]
            if a > 0 and r > 225 and g > 225 and b > 225:
                px[x, y] = (0, 0, 0, 0)
    canvas = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    canvas.alpha_composite(fr2, ((FW - nw) // 2, FH - nh - 1))
    return canvas


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    band = src.crop((0, Y0, src.width, Y1))
    # Pre-key band for bound detection
    band_px = band.load()
    for y in range(band.height):
        for x in range(band.width):
            if is_bg_pixel(band_px[x, y]):
                band_px[x, y] = (0, 0, 0, 0)
    bounds = find_bounds(band)

    sheet = Image.new("RGBA", (FW * FRAMES, FH), (0, 0, 0, 0))
    for i, (x0, x1) in enumerate(bounds):
        a2 = max(0, x0 - 1)
        b2 = min(src.width - 1, x1 + 1)
        crop = key_out(src.crop((a2, Y0, b2 + 1, Y1)))
        sheet.paste(fit_frame(crop), (i * FW, 0))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)
    dist = ROOT / "dist" / "images" / "miku-run.png"
    if dist.parent.exists():
        sheet.save(dist)

    assert sheet.size == (512, 80), sheet.size
    print(f"wrote {OUT} size={sheet.size} from {SRC.name}")


if __name__ == "__main__":
    main()
