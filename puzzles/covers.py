"""Render home-page cover images (1200 x 750) for game types from their real puzzles.

    npm run build && python3 puzzles/covers.py

Every cover shows puzzles as a player first sees them, never a solution.
Number Line Maze: two mazes' number grids. Three Coats: three levels, unpainted.
Round the Bend: two empty grids. Picture Squares: three blank grids with their clues.
Escape Room: three of its printed sheets (the preview images in public/).
Each board is drawn in its game type's ballpoint ink on a sheet of paper, fanned out on
the site's paper, then screenshotted with headless Chrome.
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
# Ballpoint inks, one per game type (as in src/games.ts), and the site's red.
MAZE_INK, RYB_INK, RIVER_INK, PIC_INK, RED = "#26398f", "#2b2b30", "#2d6a45", "#a3343f", "#c4364b"
FILL = {1: "#ed1c24", 2: "#fff200", 3: "#00aeef"}   # RYB uses the original game's primaries
FONT = 'font-family="Kalam, cursive" font-weight="700"'
PAPER = (ROOT / "public" / "paper.svg").as_uri()   # the site's paper texture
_ids = 0


def wash(u: float):
    """(defs, filter) for the site's watercolor (src/lib/ink.ts), for a board of `u` units per pixel."""
    global _ids
    _ids += 1
    fid = f"wash{_ids}"
    dark = lambda k: f"{k} 0 0 0 0  0 {k} 0 0 0  0 0 {k} 0 0  0 0 0 1 0"
    return (f'''<defs><filter id="{fid}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="{0.025 / u}" numOctaves="3" seed="3" result="blot"/>
      <feTurbulence type="fractalNoise" baseFrequency="{0.006 / u} {0.09 / u}" numOctaves="2" seed="8" result="streak"/>
      <feDisplacementMap in="SourceGraphic" in2="blot" scale="{5 * u}" xChannelSelector="R" yChannelSelector="G" result="shape"/>
      <feMorphology in="shape" operator="erode" radius="{4 * u}" result="core0"/>
      <feGaussianBlur in="core0" stdDeviation="{3.5 * u}" result="core"/>
      <feComposite in="shape" in2="core" operator="out" result="rim0"/>
      <feColorMatrix in="rim0" type="matrix" values="{dark(0.62)}" result="rim"/>
      <feColorMatrix in="blot" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.75 0 0 0 -0.33" result="light0"/>
      <feComposite in="light0" in2="shape" operator="in" result="light"/>
      <feColorMatrix in="shape" type="matrix" values="{dark(0.8)}" result="deep"/>
      <feColorMatrix in="streak" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.85" result="streakA"/>
      <feComposite in="deep" in2="streakA" operator="in" result="streaks"/>
      <feMerge result="paint"><feMergeNode in="shape"/><feMergeNode in="light"/><feMergeNode in="streaks"/><feMergeNode in="rim"/></feMerge>
      <feGaussianBlur in="paint" stdDeviation="{0.5 * u}"/></filter></defs>''', f"url(#{fid})")


def tint(ink: str, k: float) -> str:
    """`ink` mixed with white: k = 1 is the ink itself."""
    rgb = [int(ink[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(255 - (255 - v) * k):02x}" for v in rgb)


# ---- number maze ----
def maze_svg(maze: dict, solved: bool) -> str:
    board = nm.board_for(maze)
    ok, _, walls = nm.check(maze)
    P = 40
    # margins leave room for the arrows: 46 beside the entrance, 52 beside the exit, else 22
    room = {s: max([22] + [m for o, m in ((board.entry, 46), (board.exit, 52)) if o.side == s]) for s in nm.SIDES}
    ML, MT, MR, MB = room["left"], room["top"], room["right"], room["bottom"]
    vx = lambda c: ML + c * P
    vy = lambda r: MT + r * P
    W, H = board.W, board.H

    def outside(o, d):            # point d units out from the middle of a gap
        (r, c), (dr, dc) = board.doorway(o)
        return vx(c) + dc * d, vy(r) + dr * d

    def arrow(a, b):              # a line from a to b with its head at b
        (x1, y1), (x2, y2) = a, b
        ux, uy = (x2 - x1) / math.hypot(x2 - x1, y2 - y1), (y2 - y1) / math.hypot(x2 - x1, y2 - y1)
        h1 = (x2 - 7 * ux - 6 * uy, y2 - 7 * uy + 6 * ux)
        h2 = (x2 - 7 * ux + 6 * uy, y2 - 7 * uy - 6 * ux)
        return (f'<path d="M{x1} {y1} L{x2} {y2} M{h1[0]} {h1[1]} L{x2} {y2} L{h2[0]} {h2[1]}" fill="none" '
                f'stroke="{RED}" stroke-width="3" stroke-linecap="round"/>')
    out = []
    if solved:
        route = board.route(walls)
        pts = [outside(board.entry, 10)] + [(vx(c) + P / 2, vy(r) + P / 2) for r, c in route]
        pts.append(outside(board.exit, 14))
        out.append(f'<polyline points="{" ".join(f"{x},{y}" for x, y in pts)}" fill="none" stroke="#f29a38" '
                   'stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>')
        for e in walls:
            (r1, c1), (r2, c2) = board.pair(e)
            out.append(f'<line x1="{vx(c1)}" y1="{vy(r1)}" x2="{vx(c2)}" y2="{vy(r2)}" stroke="{MAZE_INK}" stroke-width="5" stroke-linecap="round"/>')
    else:
        for (r1, c1), (r2, c2) in maze.get("hints", []):
            out.append(f'<line x1="{vx(c1)}" y1="{vy(r1)}" x2="{vx(c2)}" y2="{vy(r2)}" stroke="{MAZE_INK}" stroke-width="5" stroke-linecap="round"/>')
        for r in range(H):
            for c in range(W):
                out.append(f'<circle cx="{vx(c)}" cy="{vy(r)}" r="12.5" fill="#fff" stroke="{MAZE_INK}" stroke-width="1.6"/>'
                           f'<text x="{vx(c)}" y="{vy(r) + 6}" font-size="16" text-anchor="middle" '
                           f'{FONT} fill="{MAZE_INK}">{maze["clues"][r][c]}</text>')
    out.append(arrow(outside(board.entry, 36), outside(board.entry, 10)))   # points in
    out.append(arrow(outside(board.exit, 10), outside(board.exit, 38)))     # points out
    vbw, vbh = ML + (W - 1) * P + MR, MT + (H - 1) * P + MB
    return f'<svg viewBox="0 0 {vbw} {vbh}" xmlns="http://www.w3.org/2000/svg">{"".join(out)}</svg>', vbw / vbh


# ---- ryb ----
def ryb_config(n: int) -> dict:
    page = (ROOT / "dist" / "three-coats" / str(n) / "index.html").read_text()
    m = re.search(r'data-game-type="ryb"[^>]*data-config="([^"]+)"', page)
    if not m:
        sys.exit("run `npm run build` first: covers read RYB solutions from dist/")
    return json.loads(htmllib.unescape(m.group(1)))


def ryb_svg(cfg: dict, painted: bool) -> str:
    xs = [p[0] for pc in cfg["pieces"] for p in pc["points"]]
    span = max(xs) - min(xs)
    defs, wc = wash(span / 400)
    out, edges = [defs], []
    for i, pc in enumerate(cfg["pieces"]):
        fill = FILL[cfg["solution"][i]] if painted else tint(RYB_INK, 0.26)
        pts = " ".join(f"{x},{y}" for x, y in pc["points"])
        out.append(f'<polygon points="{pts}" fill="{fill}" filter="{wc}"/>')
        edges.append(f'<polygon points="{pts}" fill="none" stroke="{RYB_INK}" stroke-width="{span * 0.005}" stroke-linejoin="round"/>')
    out += edges
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
                       f'fill="{FILL[c]}" stroke="{RYB_INK}" stroke-width="{span * 0.0035}"/>')
    ys = [p[1] for pc in cfg["pieces"] for p in pc["points"]]
    pad = span * 0.06
    w, h = span + 2 * pad, max(ys) - min(ys) + 2 * pad
    return f'<svg viewBox="{min(xs) - pad} {min(ys) - pad} {w} {h}" xmlns="http://www.w3.org/2000/svg">{"".join(out)}</svg>', w / h


# ---- lazy river ----
def river_config(n: int) -> dict:
    page = (ROOT / "dist" / "round-the-bend" / str(n) / "index.html").read_text()
    m = re.search(r'data-game-type="lazy-river"[^>]*data-config="([^"]+)"', page)
    if not m:
        sys.exit("run `npm run build` first: covers read Lazy River solutions from dist/")
    return json.loads(htmllib.unescape(m.group(1)))


def river_svg(cfg: dict, solved: bool):
    grid, walls, sol = cfg["grid"], cfg["walls"], cfg["solution"]
    H, W, S, P = len(grid), len(grid[0]), 44, 12
    x0 = lambda c: P + c * S
    y0 = lambda r: P + r * S
    defs, wc = wash(1)
    out = [defs]
    for r in range(H):
        for c in range(W):
            fill = "#f5f8f5" if (r + c) % 2 else "#fff"
            out.append(f'<rect x="{x0(c)}" y="{y0(r)}" width="{S}" height="{S}" fill="{fill}"/>')
            if grid[r][c] == "#":
                out.append(f'<rect x="{x0(c)}" y="{y0(r)}" width="{S}" height="{S}" fill="{tint(RIVER_INK, 0.75)}" filter="{wc}"/>')
    for r in range(H + 1):
        out.append(f'<line x1="{P}" y1="{y0(r)}" x2="{P + W * S}" y2="{y0(r)}" stroke="{RIVER_INK}" stroke-opacity=".28"/>')
    for c in range(W + 1):
        out.append(f'<line x1="{x0(c)}" y1="{P}" x2="{x0(c)}" y2="{P + H * S}" stroke="{RIVER_INK}" stroke-opacity=".28"/>')
    if solved:
        for r in range(H):
            for c in range(W):
                cx, cy = x0(c) + S / 2, y0(r) + S / 2
                if sol[r][c] & 2:
                    out.append(f'<line x1="{cx}" y1="{cy}" x2="{cx + S}" y2="{cy}" stroke="#3fb0e6" stroke-width="9" stroke-linecap="round"/>')
                if sol[r][c] & 4:
                    out.append(f'<line x1="{cx}" y1="{cy}" x2="{cx}" y2="{cy + S}" stroke="#3fb0e6" stroke-width="9" stroke-linecap="round"/>')
    for r in range(H):
        for c in range(W):
            if walls[r][c] & 2:
                out.append(f'<line x1="{x0(c + 1)}" y1="{y0(r)}" x2="{x0(c + 1)}" y2="{y0(r + 1)}" stroke="{RIVER_INK}" stroke-width="6" stroke-linecap="round"/>')
            if walls[r][c] & 4:
                out.append(f'<line x1="{x0(c)}" y1="{y0(r + 1)}" x2="{x0(c + 1)}" y2="{y0(r + 1)}" stroke="{RIVER_INK}" stroke-width="6" stroke-linecap="round"/>')
    out.append(f'<rect x="{P}" y="{P}" width="{W * S}" height="{H * S}" fill="none" stroke="{RIVER_INK}" stroke-width="3"/>')
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
    page = f"""<!doctype html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kalam:wght@700&display=block"><style>
      html, body {{ margin: 0; width: 1200px; height: 750px; overflow: hidden;
        background: radial-gradient(ellipse 80% 75% at 50% 45%, transparent 55%, rgba(120,112,102,.05) 82%, rgba(95,88,80,.1) 100%),
          linear-gradient(rgba(251,251,249,.6), rgba(251,251,249,.6)), url("{PAPER}") 0 0 / 512px 512px, #fbfbf9; }}
      .sheet {{ position: absolute; padding: 18px; background: #fff;
        box-shadow: 0 2px 3px rgba(70,62,52,.2), 0 22px 40px -12px rgba(70,62,52,.4); }}
      .sheet svg {{ filter: url(#pen); }}
      .sheet svg, .sheet img {{ display: block; width: 100%; height: 100%; }}
    </style></head><body>
    <svg width="0" height="0" style="position:absolute"><filter id="pen" x="-2%" y="-2%" width="104%" height="104%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4"/>
      <feDisplacementMap in="SourceGraphic" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter></svg>
    {"".join(cards)}</body></html>"""
    with tempfile.TemporaryDirectory() as tmp:
        src, png = Path(tmp) / "cover.html", Path(tmp) / "cover.png"
        src.write_text(page)
        subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars", "--window-size=1200,750", "--virtual-time-budget=4000",
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
    b_svg, b_ar = maze_svg(big, solved=False)
    cover([(w_svg, w_ar, 360, 390, 470, -8), (b_svg, b_ar, 740, 380, 640, 5)],
          ROOT / "public" / "number-line-maze" / "cover.jpg")

    t, hx, sq = ryb_config(1), ryb_config(2), ryb_config(3)
    sheets = [ryb_svg(sq, painted=False), ryb_svg(t, painted=False), ryb_svg(hx, painted=False)]
    cover([(sheets[0][0], sheets[0][1], 300, 400, 380, -9),
           (sheets[2][0], sheets[2][1], 880, 395, 400, 8),
           (sheets[1][0], sheets[1][1], 590, 380, 430, -1)],
          ROOT / "public" / "three-coats" / "cover.jpg")


def mosaic_svg(level: dict):
    """A blank grid with its row and column clues, as the puzzle starts."""
    pic = level["picture"]
    H, W, S = len(pic), len(pic[0]), 30
    runs = lambda line: [len(r) for r in "".join("#" if ch != "." else "." for ch in line).split(".") if r] or [0]
    rows, cols = [runs(row) for row in pic], [runs([row[c] for row in pic]) for c in range(W)]
    L, T, F = max(map(len, rows)) * 22 + 10, max(map(len, cols)) * 24 + 8, 'font-size="18" ' + FONT
    out = []
    for r in range(H + 1):
        out.append(f'<line x1="{L}" y1="{T + r * S}" x2="{L + W * S}" y2="{T + r * S}" stroke="{PIC_INK}" stroke-opacity="{.6 if r % 5 == 0 else .28}" stroke-width="{2 if r % 5 == 0 else 1}"/>')
    for c in range(W + 1):
        out.append(f'<line x1="{L + c * S}" y1="{T}" x2="{L + c * S}" y2="{T + H * S}" stroke="{PIC_INK}" stroke-opacity="{.6 if c % 5 == 0 else .28}" stroke-width="{2 if c % 5 == 0 else 1}"/>')
    for r, clue in enumerate(rows):
        for k, n in enumerate(reversed(clue)):
            out.append(f'<text x="{L - 12 - k * 22}" y="{T + r * S + S / 2 + 6}" text-anchor="middle" {F} fill="{PIC_INK}">{n}</text>')
    for c, clue in enumerate(cols):
        for k, n in enumerate(reversed(clue)):
            out.append(f'<text x="{L + c * S + S / 2}" y="{T - 10 - k * 24}" text-anchor="middle" {F} fill="{PIC_INK}">{n}</text>')
    out.append(f'<rect x="{L}" y="{T}" width="{W * S}" height="{H * S}" fill="none" stroke="{PIC_INK}" stroke-width="2.5"/>')
    vw, vh = L + W * S + 6, T + H * S + 6
    return f'<svg viewBox="0 0 {vw} {vh}" xmlns="http://www.w3.org/2000/svg">{"".join(out)}</svg>', vw / vh


def mosaic_cover():
    games = ROOT / "src" / "games" / "picture-squares"
    pics = [mosaic_svg(json.loads((games / f"{n}.json").read_text())["mosaic"]) for n in (3, 5, 2)]
    cover([(pics[0][0], pics[0][1], 330, 395, 380, -9), (pics[1][0], pics[1][1], 870, 400, 380, 8),
           (pics[2][0], pics[2][1], 600, 380, 440, -1)], ROOT / "public" / "picture-squares" / "cover.jpg")


def lazy_river_cover():
    a, b = river_svg(river_config(3), solved=False), river_svg(river_config(4), solved=False)
    cover([(a[0], a[1], 380, 390, 470, -8), (b[0], b[1], 780, 380, 520, 6)],
          ROOT / "public" / "round-the-bend" / "cover.jpg")


if __name__ == "__main__":
    main()
    lazy_river_cover()
    mosaic_cover()
