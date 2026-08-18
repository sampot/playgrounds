#!/usr/bin/env python3
"""Slice Gemini storefront + character sheets into tiles / animation strips.

Grid overlay on both sources is ~34px (not 32). Character checkerboard is
treated as transparency; sprites are kept by saturation + dark outlines.
Does not remap lobby hotspots — pack objects later.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = Path(
    "/Users/sam/.cursor/projects/Users-sam-dev-sampot-playgrounds/assets"
)
MAP_SRC = ASSET_DIR / (
    "Gemini_Generated_Image_rf9sfwrf9sfwrf9s-8c76bddc-ede4-4936-967d-0318e66abf79.png"
)
SHEET_SRC = ASSET_DIR / (
    "Gemini_Generated_Image_emolbvemolbvemol-b79989cf-fd5f-48af-b4c2-201827ea8407.png"
)
OUT = ROOT / "go-client/static/lobby"
DEBUG = Path("/tmp/lobby-slice")

TILE = 34  # overlay period on both Gemini sheets
PAD = 2


def sat_lum(r: int, g: int, b: int) -> tuple[int, int]:
    mx, mn = max(r, g, b), min(r, g, b)
    return mx - mn, (r + g + b) // 3


def is_checker(r: int, g: int, b: int) -> bool:
    s, lum = sat_lum(r, g, b)
    return s < 22 and 165 <= lum <= 252


def sheet_to_rgba(im: Image.Image) -> Image.Image:
    """Checker + overlay lines → alpha 0; keep sprite color and outlines."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    color = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            s, lum = sat_lum(r, g, b)
            if s >= 28:
                color[y][x] = True
            elif lum < 70 and not is_checker(r, g, b):
                color[y][x] = True

    keep = [row[:] for row in color]
    for y in range(h):
        for x in range(w):
            if not color[y][x]:
                continue
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w:
                        keep[ny][nx] = True

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if not keep[y][x]:
                continue
            if is_checker(r, g, b):
                continue
            s, lum = sat_lum(r, g, b)
            if s < 18 and 90 <= lum <= 175:
                continue
            opx[x, y] = (r, g, b, 255)

    # drop isolated cyan overlay dots
    for y in range(h):
        for x in range(w):
            r, g, b, a = opx[x, y]
            if a < 40:
                continue
            if not (b > r + 18 and g >= r - 4):
                continue
            n = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and opx[nx, ny][3] > 40:
                        n += 1
            if n <= 3:
                opx[x, y] = (0, 0, 0, 0)
    return out


def connected_boxes(
    im: Image.Image, min_area: int = 80
) -> list[tuple[int, int, int, int]]:
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    boxes: list[tuple[int, int, int, int]] = []

    def flood(sx: int, sy: int) -> tuple[int, int, int, int, int]:
        stack = [(sx, sy)]
        seen[sy][sx] = True
        minx = maxx = sx
        miny = maxy = sy
        area = 0
        while stack:
            x, y = stack.pop()
            area += 1
            if x < minx:
                minx = x
            if x > maxx:
                maxx = x
            if y < miny:
                miny = y
            if y > maxy:
                maxy = y
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < w and 0 <= ny < h) or seen[ny][nx]:
                    continue
                if px[nx, ny][3] < 40:
                    continue
                seen[ny][nx] = True
                stack.append((nx, ny))
        return minx, miny, maxx, maxy, area

    for y in range(h):
        for x in range(w):
            if seen[y][x] or px[x, y][3] < 40:
                continue
            x0, y0, x1, y1, area = flood(x, y)
            bw, bh = x1 - x0 + 1, y1 - y0 + 1
            if area < min_area or bh < 14:
                continue
            boxes.append((x0, y0, x1 + 1, y1 + 1))
    return boxes


def merge_nearby(
    boxes: list[tuple[int, int, int, int]], gap: int = 3
) -> list[tuple[int, int, int, int]]:
    """Merge only small fragments; leave character-sized boxes alone."""
    if not boxes:
        return []
    items = [list(b) for b in boxes]
    changed = True
    while changed:
        changed = False
        out: list[list[int]] = []
        used = [False] * len(items)
        for i, a in enumerate(items):
            if used[i]:
                continue
            ax0, ay0, ax1, ay1 = a
            aw, ah = ax1 - ax0, ay1 - ay0
            for j in range(i + 1, len(items)):
                if used[j]:
                    continue
                bx0, by0, bx1, by1 = items[j]
                bw, bh = bx1 - bx0, by1 - by0
                if min(aw, ah) >= 40 and min(bw, bh) >= 40:
                    continue
                if ax1 + gap < bx0 or bx1 + gap < ax0 or ay1 + gap < by0 or by1 + gap < ay0:
                    continue
                ax0, ay0 = min(ax0, bx0), min(ay0, by0)
                ax1, ay1 = max(ax1, bx1), max(ay1, by1)
                aw, ah = ax1 - ax0, ay1 - ay0
                used[j] = True
                changed = True
            used[i] = True
            out.append([ax0, ay0, ax1, ay1])
        items = out
    return [tuple(b) for b in items]  # type: ignore[misc]


def split_on_gutters(
    im: Image.Image, box: tuple[int, int, int, int], min_part: int = 22
) -> list[tuple[int, int, int, int]]:
    x0, y0, x1, y1 = box
    if x1 - x0 < 70:
        return [box]
    crop = im.crop(box)
    w, h = crop.size
    px = crop.load()
    occ = [
        sum(1 for y in range(h) if px[x, y][3] > 40) for x in range(w)
    ]
    thresh = max(3, h // 16)
    gaps: list[tuple[int, int]] = []
    i = 0
    while i < w:
        if occ[i] <= thresh:
            j = i
            while j < w and occ[j] <= thresh:
                j += 1
            if j - i >= 3:
                gaps.append((i, j))
            i = j
        else:
            i += 1
    cuts = [0]
    for a, b in gaps:
        mid = (a + b) // 2
        if mid - cuts[-1] >= min_part and w - mid >= min_part:
            cuts.append(mid)
    cuts.append(w)
    parts: list[tuple[int, int, int, int]] = []
    for a, b in zip(cuts, cuts[1:]):
        if b - a < min_part:
            continue
        # tighten to opaque pixels
        sub = crop.crop((a, 0, b, h))
        bbox = sub.getbbox()
        if not bbox:
            continue
        sx0, sy0, sx1, sy1 = bbox
        parts.append((x0 + a + sx0, y0 + sy0, x0 + a + sx1, y0 + sy1))
    return parts or [box]


def split_even(
    im: Image.Image, box: tuple[int, int, int, int], nominal: int = 68
) -> list[tuple[int, int, int, int]]:
    x0, y0, x1, y1 = box
    w = x1 - x0
    if w < 90:
        return [box]
    n = max(2, int(round(w / nominal)))
    step = w / n
    parts: list[tuple[int, int, int, int]] = []
    for i in range(n):
        sl = im.crop((int(x0 + i * step), y0, int(x0 + (i + 1) * step), y1))
        bb = sl.getbbox()
        if not bb:
            continue
        parts.append(
            (
                int(x0 + i * step) + bb[0],
                y0 + bb[1],
                int(x0 + i * step) + bb[2],
                y0 + bb[3],
            )
        )
    return parts or [box]


def group_rows(
    boxes: list[tuple[int, int, int, int]], y_tol: int = 18
) -> list[list[tuple[int, int, int, int]]]:
    boxes = sorted(boxes, key=lambda b: (b[1] + b[3]) / 2)
    rows: list[list[tuple[int, int, int, int]]] = []
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        if rows:
            last_cy = sum((x[1] + x[3]) / 2 for x in rows[-1]) / len(rows[-1])
            if abs(cy - last_cy) <= y_tol:
                rows[-1].append(b)
                continue
        rows.append([b])
    for row in rows:
        row.sort(key=lambda b: b[0])
    return rows


def split_row_anims(
    row: list[tuple[int, int, int, int]],
) -> list[list[tuple[int, int, int, int]]]:
    if len(row) <= 1:
        return [row]
    if len(row) <= 4:
        return [row]
    gaps = [(row[i + 1][0] - row[i][2], i) for i in range(len(row) - 1)]
    max_gap, idx = max(gaps)
    mid = len(row) // 2
    if max_gap >= 20 and abs(idx + 1 - mid) <= 2:
        return [row[: idx + 1], row[idx + 1 :]]
    if len(row) >= 6 and len(row) % 2 == 0:
        half = len(row) // 2
        return [row[:half], row[half:]]
    if len(row) == 7:
        return [row[:4], row[4:]]
    return [row]


def crop_pad(im: Image.Image, box: tuple[int, int, int, int], pad: int = PAD) -> Image.Image:
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(im.width, x1 + pad)
    y1 = min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def pack_strip(frames: list[Image.Image]) -> Image.Image:
    if not frames:
        raise ValueError("no frames")
    h = max(f.height for f in frames)
    w = sum(f.width for f in frames)
    strip = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    x = 0
    for f in frames:
        y = h - f.height
        strip.paste(f, (x, y), f)
        x += f.width
    return strip


def voidish(im: Image.Image) -> bool:
    rgb = im.convert("RGB")
    px = rgb.load()
    n = rgb.width * rgb.height
    dark = 0
    for y in range(rgb.height):
        for x in range(rgb.width):
            if sum(px[x, y]) / 3 < 28:
                dark += 1
    return dark / n > 0.82


def slice_map() -> None:
    tiles_dir = OUT / "tiles"
    unique_dir = OUT / "tileset"
    if tiles_dir.exists():
        shutil.rmtree(tiles_dir)
    if unique_dir.exists():
        shutil.rmtree(unique_dir)
    tiles_dir.mkdir(parents=True)

    im = Image.open(MAP_SRC).convert("RGB")
    cols = im.width // TILE
    rows = im.height // TILE
    index: list[dict] = []
    n_all = 0

    preview = im.copy()
    d = ImageDraw.Draw(preview)
    for x in range(0, im.width, TILE):
        d.line([(x, 0), (x, im.height)], fill=(0, 220, 255), width=1)
    for y in range(0, im.height, TILE):
        d.line([(0, y), (im.width, y)], fill=(0, 220, 255), width=1)
    preview.save(tiles_dir / "_grid-preview.png")

    for r in range(rows):
        for c in range(cols):
            x, y = c * TILE, r * TILE
            tile = im.crop((x, y, x + TILE, y + TILE))
            n_all += 1
            if voidish(tile):
                continue
            name = f"r{r:02d}_c{c:02d}.png"
            tile.save(tiles_dir / name)
            index.append({"row": r, "col": c, "file": name, "x": x, "y": y})

    (tiles_dir / "index.json").write_text(
        json.dumps(
            {
                "tile": TILE,
                "source": "source-storefront.png",
                "cols": cols,
                "rows": rows,
                "cells": index,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"map tiles {n_all} kept-nonvoid {len(index)}")


BOSS_NAMES = [
    "walk_down",
    "walk_up",
    "walk_left",
    "walk_right",
    "talk_down",
    "interact_counter",
    "talk_counter",
    "seated",
]
CUST_NAMES = [
    "walk_down",
    "walk_up",
    "walk_left",
    "walk_right",
    "idle_left",
    "idle",
    "browse",
    "carry",
]


def slice_chars() -> None:
    chars = OUT / "chars"
    if chars.exists():
        shutil.rmtree(chars)
    chars.mkdir(parents=True)
    DEBUG.mkdir(exist_ok=True)

    raw = Image.open(SHEET_SRC).convert("RGB")
    rgba = sheet_to_rgba(raw)
    rgba.save(DEBUG / "sheet-alpha.png")

    mid = raw.width // 2
    for who, box, names in (
        ("boss", (0, 0, mid, raw.height), BOSS_NAMES),
        ("customer", (mid, 0, raw.width, raw.height), CUST_NAMES),
    ):
        half = rgba.crop(box)
        blobs = merge_nearby(connected_boxes(half), gap=3)
        expanded: list[tuple[int, int, int, int]] = []
        for b in blobs:
            parts = split_on_gutters(half, b)
            if len(parts) == 1 and (b[2] - b[0]) >= 90:
                parts = split_even(half, b)
            expanded.extend(parts)
        # drop titles / captions (short) and full-width leftovers
        sprites = [
            b
            for b in expanded
            if (b[3] - b[1]) >= 48 and (b[2] - b[0]) < half.width * 0.9
        ]
        rows = group_rows(sprites, y_tol=20)
        anims: list[list[tuple[int, int, int, int]]] = []
        for row in rows:
            anims.extend(split_row_anims(row))

        dest = chars / who
        dest.mkdir()
        half.save(dest / "_sheet.png")
        print(f"{who}: {len(sprites)} sprites → {len(anims)} strips")
        manifest_rows = []
        for i, frames_boxes in enumerate(anims):
            name = names[i] if i < len(names) else f"row_{i:02d}"
            frames = [crop_pad(half, b) for b in frames_boxes]
            row_dir = dest / name
            row_dir.mkdir()
            for fi, fr in enumerate(frames):
                fr.save(row_dir / f"{fi:02d}.png")
            strip = pack_strip(frames)
            strip.save(dest / f"{name}.png")
            manifest_rows.append(
                {"name": name, "frames": len(frames), "boxes": frames_boxes}
            )
            print(f"  {name}: {len(frames)} frames sizes {[f.size for f in frames]}")
        (dest / "manifest.json").write_text(
            json.dumps({"tile": TILE, "strips": manifest_rows}, indent=2) + "\n"
        )

        vis = Image.new("RGBA", half.size, (40, 40, 48, 255))
        vis.paste(half, (0, 0), half)
        d = ImageDraw.Draw(vis)
        for i, frames_boxes in enumerate(anims):
            name = names[i] if i < len(names) else str(i)
            for b in frames_boxes:
                d.rectangle((b[0], b[1], b[2] - 1, b[3] - 1), outline=(255, 80, 0))
            if frames_boxes:
                d.text(
                    (frames_boxes[0][0], max(0, frames_boxes[0][1] - 10)),
                    name,
                    fill=(255, 220, 0),
                )
        vis.save(DEBUG / f"{who}-boxes.png")


def copy_sources() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(MAP_SRC, OUT / "source-storefront.png")
    shutil.copy2(SHEET_SRC, OUT / "source-chars.png")


def main() -> None:
    DEBUG.mkdir(exist_ok=True)
    if not MAP_SRC.exists() or not SHEET_SRC.exists():
        raise SystemExit(f"missing sources: {MAP_SRC.exists()} {SHEET_SRC.exists()}")
    copy_sources()
    slice_map()
    slice_chars()
    print("done", OUT)


if __name__ == "__main__":
    main()
