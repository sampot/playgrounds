#!/usr/bin/env python3
"""Slice the Gemini arcade lobby tileset using detected (irregular) grid lines.

Origin (0, 101). Inner cells exclude 1px grid ink. Empty / label beige cells skipped.
Does not assemble lobby objects or remap hotspots.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "go-client/static/lobby/source-tileset.png"
OUT = ROOT / "go-client/static/lobby/tiles"

OX, OY = 0, 101
LINE = 1
WALK_LO, WALK_HI = 24, 32


def collapse(vals: list[int], gap: int = 2) -> list[int]:
    groups: list[list[int]] = []
    for v in vals:
        if not groups or v - groups[-1][-1] > gap:
            groups.append([v])
        else:
            groups[-1].append(v)
    return [int(round(float(np.median(g)))) for g in groups]


def detect_lines(lum: np.ndarray, beige: np.ndarray) -> tuple[list[int], list[int]]:
    h, w = lum.shape
    xs_raw: list[int] = []
    for x in range(1, w - 1):
        neigh = beige[:, x - 1] | beige[:, x + 1]
        if neigh.sum() < 20:
            continue
        drop = float(
            ((lum[neigh, x - 1] + lum[neigh, x + 1]) / 2 - lum[neigh, x]).mean()
        )
        if drop > 15:
            xs_raw.append(x)
    ys_raw: list[int] = []
    for y in range(1, h - 1):
        neigh = beige[y - 1] | beige[y + 1]
        if neigh.sum() < 30:
            continue
        drop = float(
            ((lum[y - 1, neigh] + lum[y + 1, neigh]) / 2 - lum[y, neigh]).mean()
        )
        if drop > 10:
            ys_raw.append(y)
    return collapse(xs_raw), collapse(ys_raw)


def walk(detected: list[int], origin: int, end: int, lo: int, hi: int) -> list[int]:
    kept = [origin]
    cand = [v for v in detected if v > origin]
    while True:
        nxt = [v for v in cand if lo <= v - kept[-1] <= hi]
        if not nxt:
            rem = end - kept[-1]
            if lo <= rem <= hi:
                kept.append(end)
            break
        kept.append(min(nxt))
        cand = [v for v in cand if v > kept[-1]]
    return kept


def beige_to_alpha(rgb: Image.Image) -> Image.Image:
    arr = np.array(rgb.convert("RGB"))
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    lum = (r.astype(np.int16) + g.astype(np.int16) + b.astype(np.int16)) // 3
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    sheet = (lum > 195) & (sat < 40)
    rgba = np.dstack([arr, np.where(sheet, 0, 255).astype(np.uint8)])
    return Image.fromarray(rgba, "RGBA")


def mostly_sheet(im: Image.Image, frac: float = 0.82) -> bool:
    a = np.array(im.split()[-1])
    return float((a < 40).mean()) > frac


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")
    rgb = Image.open(SRC).convert("RGB")
    w, h = rgb.size
    arr = np.array(rgb).astype(np.float32)
    lum = arr.mean(axis=2)
    sat = arr.max(axis=2) - arr.min(axis=2)
    beige = (lum > 200) & (sat < 40)
    xc, yc = detect_lines(lum, beige)
    xs = walk(xc, OX, w, WALK_LO, WALK_HI)
    ys = walk(yc, OY, h, WALK_LO, WALK_HI)

    keep_preview = {p.name for p in OUT.glob("_*.png")} if OUT.exists() else set()
    if OUT.exists():
        for p in OUT.iterdir():
            if p.is_file() and p.name not in keep_preview and p.suffix == ".png":
                p.unlink()
            if p.name == "index.json":
                p.unlink()
    OUT.mkdir(parents=True, exist_ok=True)

    vis = rgb.copy()
    d = ImageDraw.Draw(vis)
    cells: list[dict] = []
    kept = 0
    skipped = 0
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            x0, x1 = xs[i] + LINE, xs[i + 1]
            y0, y1 = ys[j] + LINE, ys[j + 1]
            cw, ch = x1 - x0, y1 - y0
            if cw < 8 or ch < 8:
                skipped += 1
                continue
            crop = beige_to_alpha(rgb.crop((x0, y0, x1, y1)))
            if mostly_sheet(crop):
                skipped += 1
                continue
            name = f"r{j:02d}_c{i:02d}.png"
            crop.save(OUT / name)
            d.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(0, 220, 255))
            cells.append(
                {
                    "row": j,
                    "col": i,
                    "file": name,
                    "x": x0,
                    "y": y0,
                    "w": cw,
                    "h": ch,
                }
            )
            kept += 1

    (OUT / "index.json").write_text(
        json.dumps(
            {
                "source": "source-tileset.png",
                "method": "irregular-mesh",
                "origin": [OX, OY],
                "line_px": LINE,
                "xs": xs,
                "ys": ys,
                "cells": cells,
            },
            indent=2,
        )
        + "\n"
    )
    cap = 48
    preview = Image.new("RGB", (w, h + cap), (18, 16, 24))
    dc = ImageDraw.Draw(preview)
    dc.text(
        (10, 14),
        f"A mesh slice  origin=({OX},{OY})  kept={kept}  skipped-empty={skipped}",
        fill=(240, 240, 245),
    )
    preview.paste(vis, (0, cap))
    preview.save(OUT / "_grid-preview.png")
    print(f"kept {kept} skipped {skipped} cols {len(xs)-1} rows {len(ys)-1}")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
