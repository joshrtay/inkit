"""Render home-page cover images (1200 x 750) for game types from their real puzzles.

    npm run build && python3 puzzles/covers.py

Number Line Maze: the Warm-up as a fresh puzzle and the Big Maze solved, with its route.
RYB: levels painted in their solution colors (read from the built pages), one unpainted.
Escape Room: three of its printed sheets (the preview images in public/).
Each board is drawn on a sheet of paper and fanned out on manila, then screenshotted
with headless Chrome.
"""
import html as htmllib
import json
import math
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "puzzles" / "lib"))
import number_maze as nm  # noqa: E402

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
INK, RED, YEL, BLU, TRAIL = "#2b2622", "#c8312f", "#e9b52b", "#2d58a6", "#e0a422"   # site / maze colors
FILL = {1: "#ed1c24", 2: "#fff200", 3: "#00aeef"}   # RYB uses the original game's primaries


# ---- number maze ----
def maze_svg(maze: dict, solved: bool) -> str:
    board = nm.board_for(maze)
    ok, _, walls = nm.check(maze)
    P, ML, MT, MR, MB = 40, 22, 46, 52, 22
    vx = lambda c: ML + c * P
    vy = lambda r: MT + r * P
    W, H = board.W, board.H
    out = []
    if solved:
        route = board.route(walls)
        pts = [(vx(maze["entryCol"]) + P / 2, vy(0) - 10)] + [(vx(c) + P / 2, vy(r) + P / 2) for r, c in route]
        pts.append((vx(W - 1) + 14, vy(maze["exitRow"]) + P / 2))
        out.append(f'<polyline points="{" ".join(f"{x},{y}" for x, y in pts)}" fill="none" stroke="{TRAIL}" '
                   'stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>')
        for e in walls:
            (r1, c1), (r2, c2) = board.pair(e)
            out.append(f'<line x1="{vx(c1)}" y1="{vy(r1)}" x2="{vx(c2)}" y2="{vy(r2)}" stroke="{INK}" stroke-width="5" stroke-linecap="round"/>')
    else:
        for (r1, c1), (r2, c2) in maze.get("hints", []):
            out.append(f'<line x1="{vx(c1)}" y1="{vy(r1)}" x2="{vx(c2)}" y2="{vy(r2)}" stroke="{BLU}" stroke-width="5" stroke-linecap="round"/>')
        for r in range(H):
            for c in range(W):
                out.append(f'<circle cx="{vx(c)}" cy="{vy(r)}" r="12" fill="#fff" stroke="{INK}" stroke-width="1.4"/>'
                           f'<text x="{vx(c)}" y="{vy(r) + 5}" font-size="14" font-weight="700" text-anchor="middle" '
                           f'font-family="Courier Prime, Courier New, monospace" fill="{INK}">{maze["clues"][r][c]}</text>')
    ax, ay = vx(maze["entryCol"]) + P / 2, vy(0)
    bx, by = vx(W - 1), vy(maze["exitRow"]) + P / 2
    out.append(f'<path d="M{ax} {ay - 36} V{ay - 10} M{ax - 6} {ay - 17} L{ax} {ay - 10} L{ax + 6} {ay - 17}" fill="none" stroke="{RED}" stroke-width="3" stroke-linecap="round"/>')
    out.append(f'<path d="M{bx + 10} {by} H{bx + 38} M{bx + 31} {by - 6} L{bx + 38} {by} L{bx + 31} {by + 6}" fill="none" stroke="{RED}" stroke-width="3" stroke-linecap="round"/>')
    vbw, vbh = ML + (W - 1) * P + MR, MT + (H - 1) * P + MB
    return f'<svg viewBox="0 0 {vbw} {vbh}" xmlns="http://www.w3.org/2000/svg">{"".join(out)}</svg>', vbw / vbh


# ---- ryb ----
def ryb_config(n: int) -> dict:
    page = (ROOT / "dist" / "ryb" / str(n) / "index.html").read_text()
    m = re.search(r'data-game-type="ryb"[^>]*data-config="([^"]+)"', page)
    if not m:
        sys.exit("run `npm run build` first: covers read RYB solutions from dist/")
    return json.loads(htmllib.unescape(m.group(1)))


def ryb_svg(cfg: dict, painted: bool) -> str:
    out = []
    xs = [p[0] for pc in cfg["pieces"] for p in pc["points"]]
    span = max(xs) - min(xs)
    for i, pc in enumerate(cfg["pieces"]):
        fill = FILL[cfg["solution"][i]] if painted else INK
        pts = " ".join(f"{x},{y}" for x, y in pc["points"])
        out.append(f'<polygon points="{pts}" fill="{fill}" stroke="#fff" stroke-width="{span * 0.006}" stroke-linejoin="round"/>')
    for pc in cfg["pieces"]:
        dots = pc["dots"]
        if not dots or (pc["hidden"] and not painted):
            continue
        cx = sum(p[0] for p in pc["points"]) / len(pc["points"])
        cy = sum(p[1] for p in pc["points"]) / len(pc["points"])
        r = span * 0.028
        ring = r * (1.45 if len(dots) > 1 else 0)
        for k, c in enumerate(dots):
            a = -math.pi / 2 + 2 * math.pi * k / len(dots)
            out.append(f'<circle cx="{cx + ring * math.cos(a)}" cy="{cy + ring * math.sin(a)}" r="{r}" '
                       f'fill="{FILL[c]}" stroke="{INK if c == 2 else "#fff"}" stroke-width="{span * 0.0035}"/>')
    ys = [p[1] for pc in cfg["pieces"] for p in pc["points"]]
    pad = span * 0.06
    w, h = span + 2 * pad, max(ys) - min(ys) + 2 * pad
    return f'<svg viewBox="{min(xs) - pad} {min(ys) - pad} {w} {h}" xmlns="http://www.w3.org/2000/svg">{"".join(out)}</svg>', w / h


# ---- lazy river ----
def river_config(n: int) -> dict:
    page = (ROOT / "dist" / "lazy-river" / str(n) / "index.html").read_text()
    m = re.search(r'data-game-type="lazy-river"[^>]*data-config="([^"]+)"', page)
    if not m:
        sys.exit("run `npm run build` first: covers read Lazy River solutions from dist/")
    return json.loads(htmllib.unescape(m.group(1)))


def river_svg(cfg: dict, solved: bool):
    grid, walls, sol = cfg["grid"], cfg["walls"], cfg["solution"]
    H, W, S, P = len(grid), len(grid[0]), 44, 12
    x0 = lambda c: P + c * S
    y0 = lambda r: P + r * S
    out = []
    for r in range(H):
        for c in range(W):
            fill = INK if grid[r][c] == "#" else ("#f6f2e9" if (r + c) % 2 else "#fff")
            out.append(f'<rect x="{x0(c)}" y="{y0(r)}" width="{S}" height="{S}" fill="{fill}"/>')
    for r in range(H + 1):
        out.append(f'<line x1="{P}" y1="{y0(r)}" x2="{P + W * S}" y2="{y0(r)}" stroke="#d9cfbd"/>')
    for c in range(W + 1):
        out.append(f'<line x1="{x0(c)}" y1="{P}" x2="{x0(c)}" y2="{P + H * S}" stroke="#d9cfbd"/>')
    if solved:
        for r in range(H):
            for c in range(W):
                cx, cy = x0(c) + S / 2, y0(r) + S / 2
                if sol[r][c] & 2:
                    out.append(f'<line x1="{cx}" y1="{cy}" x2="{cx + S}" y2="{cy}" stroke="#2f8fd8" stroke-width="9" stroke-linecap="round"/>')
                if sol[r][c] & 4:
                    out.append(f'<line x1="{cx}" y1="{cy}" x2="{cx}" y2="{cy + S}" stroke="#2f8fd8" stroke-width="9" stroke-linecap="round"/>')
    for r in range(H):
        for c in range(W):
            if walls[r][c] & 2:
                out.append(f'<line x1="{x0(c + 1)}" y1="{y0(r)}" x2="{x0(c + 1)}" y2="{y0(r + 1)}" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>')
            if walls[r][c] & 4:
                out.append(f'<line x1="{x0(c)}" y1="{y0(r + 1)}" x2="{x0(c + 1)}" y2="{y0(r + 1)}" stroke="{INK}" stroke-width="6" stroke-linecap="round"/>')
    out.append(f'<rect x="{P}" y="{P}" width="{W * S}" height="{H * S}" fill="none" stroke="{INK}" stroke-width="3"/>')
    vw, vh = W * S + 2 * P, H * S + 2 * P
    return f'<svg viewBox="0 0 {vw} {vh}" xmlns="http://www.w3.org/2000/svg">{"".join(out)}</svg>', vw / vh


# ---- page ----
def cover(sheets, out: Path):
    """sheets: list of (svg, aspect, centre_x, centre_y, height, angle_deg)."""
    cards = []
    for svg, aspect, x, y, h, ang in sheets:
        w = h * aspect
        cards.append(f'<div class="sheet" style="left:{x - w / 2 - 18}px;top:{y - h / 2 - 18}px;width:{w}px;height:{h}px;'
                     f'transform:rotate({ang}deg)">{svg}</div>')
    page = f"""<!doctype html><html><head><meta charset="utf-8"><style>
      html, body {{ margin: 0; width: 1200px; height: 750px; overflow: hidden; background: #ddd0b3; }}
      .sheet {{ position: absolute; padding: 18px; background: #fff;
        box-shadow: 0 2px 3px rgba(60,45,20,.25), 0 22px 40px -12px rgba(60,45,20,.45); }}
      .sheet svg, .sheet img {{ display: block; width: 100%; height: 100%; }}
    </style></head><body>{"".join(cards)}</body></html>"""
    with tempfile.TemporaryDirectory() as tmp:
        src, png = Path(tmp) / "cover.html", Path(tmp) / "cover.png"
        src.write_text(page)
        subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars", "--window-size=1200,750",
                        f"--screenshot={png}", src.as_uri()], check=True, capture_output=True)
        out.parent.mkdir(parents=True, exist_ok=True)
        Image.open(png).convert("RGB").crop((0, 0, 1200, 750)).save(out, quality=86, optimize=True)
    print(f"  {out.relative_to(ROOT)}")


def main():
    sheets_dir = ROOT / "public" / "escape-room" / "1" / "sheets"
    sheet = lambda name: (f'<img src="{(sheets_dir / f"{name}.png").as_uri()}">', 8.5 / 11)
    (g, ga), (l, la), (t, ta) = sheet("grids"), sheet("letters"), sheet("tree")
    cover([(g, ga, 400, 400, 560, -11), (t, ta, 800, 410, 560, 9), (l, la, 600, 385, 560, -1)],
          ROOT / "public" / "escape-room" / "cover.jpg")

    games = ROOT / "src" / "games"
    warm = json.loads((games / "number-line-maze" / "1.json").read_text())["maze"]
    big = json.loads((games / "number-line-maze" / "2.json").read_text())["maze"]
    w_svg, w_ar = maze_svg(warm, solved=False)
    b_svg, b_ar = maze_svg(big, solved=True)
    cover([(w_svg, w_ar, 360, 390, 470, -8), (b_svg, b_ar, 740, 380, 640, 5)],
          ROOT / "public" / "number-line-maze" / "cover.jpg")

    t, hx, sq = ryb_config(1), ryb_config(2), ryb_config(3)
    sheets = [ryb_svg(sq, painted=False), ryb_svg(t, painted=True), ryb_svg(hx, painted=True)]
    cover([(sheets[0][0], sheets[0][1], 300, 400, 380, -9),
           (sheets[2][0], sheets[2][1], 880, 395, 400, 8),
           (sheets[1][0], sheets[1][1], 590, 380, 430, -1)],
          ROOT / "public" / "ryb" / "cover.jpg")


def mosaic_svg(level: dict):
    pic, pal = level["picture"], level["palette"]
    H, W, S = len(pic), len(pic[0]), 30
    cells = "".join(f'<rect x="{c * S}" y="{r * S}" width="{S + .5}" height="{S + .5}" fill="{pal[ch]}"/>'
                    for r, row in enumerate(pic) for c, ch in enumerate(row))
    frame = f'<rect x="0" y="0" width="{W * S}" height="{H * S}" fill="none" stroke="{INK}" stroke-width="4"/>'
    return f'<svg viewBox="0 0 {W * S} {H * S}" xmlns="http://www.w3.org/2000/svg">{cells}{frame}</svg>', W / H


def mosaic_cover():
    games = ROOT / "src" / "games" / "mosaic"
    pics = [mosaic_svg(json.loads((games / f"{n}.json").read_text())["mosaic"]) for n in (3, 5, 2)]
    cover([(pics[0][0], pics[0][1], 330, 395, 380, -9), (pics[1][0], pics[1][1], 870, 400, 380, 8),
           (pics[2][0], pics[2][1], 600, 380, 440, -1)], ROOT / "public" / "mosaic" / "cover.jpg")


def lazy_river_cover():
    a, b = river_svg(river_config(3), solved=False), river_svg(river_config(4), solved=True)
    cover([(a[0], a[1], 380, 390, 470, -8), (b[0], b[1], 780, 380, 520, 6)],
          ROOT / "public" / "lazy-river" / "cover.jpg")


if __name__ == "__main__":
    main()
    lazy_river_cover()
    mosaic_cover()
