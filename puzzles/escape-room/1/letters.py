"""Build the letter-matrix sheet and its matching cut-out mask sheet.

Both sheets share one coordinate system (mm on US Letter), so when the mask's
numbered circles are cut out and the mask is laid on top of the letter sheet,
the holes reveal A, P, P, L, E in order 1-5.
"""
import random
import string
from pathlib import Path

OUT = Path(__file__).parent / ".build"   # intermediate HTML; build.py renders it to PDF
OUT.mkdir(exist_ok=True)
PAGE_W, PAGE_H = 215.9, 279.4  # mm, US Letter
HOLE_R = 4.2                   # mm, radius of each cut-out circle
WORD = "apple"
SEED = 8200

ALPHA = string.ascii_lowercase
rng = random.Random(SEED)

# Blocks roughly follow the hand sketch: a dense top block, a short tight
# middle band, and a bigger-lettered bottom block.
BLOCKS = [
    dict(x0=22, y0=28, cols=19, rows=11, dx=9.6, dy=9.6, size=6.0),
    dict(x0=24, y0=152, cols=22, rows=2, dx=7.9, dy=9.0, size=4.8),
    dict(x0=24, y0=196, cols=13, rows=4, dx=13.6, dy=16.0, size=8.6),
]


def alphabet_runs(n):
    """Letters made of alphabet runs that restart at odd places, like the sketch."""
    out = []
    while len(out) < n:
        start = rng.choice([0, 0, 0, rng.randrange(26)])
        length = rng.randint(4, 26)
        out.extend(ALPHA[(start + i) % 26] for i in range(length))
    return out[:n]


cells = []  # dicts: block, row, col, x, y, size, rot, ch
for b, blk in enumerate(BLOCKS):
    letters = alphabet_runs(blk["cols"] * blk["rows"])
    for r in range(blk["rows"]):
        # Rows drift slightly left/right so the page doesn't look machine-ruled.
        drift = rng.uniform(-2.0, 2.0)
        for c in range(blk["cols"]):
            cells.append(dict(
                block=b, row=r, col=c,
                x=blk["x0"] + c * blk["dx"] + drift,
                y=blk["y0"] + r * blk["dy"],
                size=blk["size"] * rng.uniform(0.9, 1.12),
                rot=rng.uniform(-7, 7),
                ch=letters[r * blk["cols"] + c],
            ))


# Target cells: (letter, block, approx row, approx col). Scattered, not in
# reading order, and each picked where the run already has that letter, so
# nothing about the target cell looks different from its neighbours.
TARGETS = [
    ("a", 0, 2, 15),   # 1 - upper right
    ("p", 2, 2, 2),    # 2 - bottom left
    ("p", 1, 1, 11),   # 3 - middle band
    ("l", 0, 7, 3),    # 4 - upper left
    ("e", 2, 1, 10),   # 5 - bottom right
]


def pick(ch, block, row, col, taken):
    pool = [c for c in cells if c["block"] == block and id(c) not in taken]
    hits = [c for c in pool if c["ch"] == ch]
    if hits:
        best = min(hits, key=lambda c: (c["row"] - row) ** 2 + ((c["col"] - col) / 2) ** 2)
        if abs(best["row"] - row) <= 2 and abs(best["col"] - col) <= 5:
            return best
    # Fall back to overwriting the closest cell.
    best = min(pool, key=lambda c: (c["row"] - row) ** 2 + (c["col"] - col) ** 2)
    best["ch"] = ch
    return best


taken = set()
holes = []
for n, (ch, b, r, c) in enumerate(TARGETS, 1):
    cell = pick(ch, b, r, c, taken)
    taken.add(id(cell))
    holes.append((n, cell))
assert "".join(c["ch"] for _, c in holes) == WORD

# Holes must only ever show one letter: check no neighbour sits inside a hole.
for n, h in holes:
    for c in cells:
        if c is h:
            continue
        d = ((c["x"] - h["x"]) ** 2 + (c["y"] - h["y"]) ** 2) ** 0.5
        assert d - c["size"] * 0.4 > HOLE_R, f"hole {n} would show a neighbour"


def corner_marks():
    """L-shaped registration marks, identical on both sheets."""
    m, L = 10, 9
    paths = [
        f"M{m} {m + L} V{m} H{m + L}",
        f"M{PAGE_W - m - L} {m} H{PAGE_W - m} V{m + L}",
        f"M{m} {PAGE_H - m - L} V{PAGE_H - m} H{m + L}",
        f"M{PAGE_W - m - L} {PAGE_H - m} H{PAGE_W - m} V{PAGE_H - m - L}",
    ]
    return "".join(f'<path d="{p}" class="reg"/>' for p in paths)


def page(svg_body, title):
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=block" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Kalam:wght@700&text=0123456789&display=block" rel="stylesheet">
<style>
  @page {{ size: letter; margin: 0; }}
  html, body {{ margin: 0; padding: 0; background: #fff; }}
  svg {{ display: block; width: 215.9mm; height: 279.4mm; }}
  .ltr {{ font-family: 'Kalam', cursive; fill: #26398f;
          text-anchor: middle; dominant-baseline: central; }}
  .reg {{ fill: none; stroke: #26398f; stroke-width: 0.5; }}
  .cut {{ fill: none; stroke: #26398f; stroke-width: 0.35; stroke-dasharray: 1.2 0.9; }}
  .num {{ font-family: 'Kalam', cursive; fill: #26398f;
          font-size: 4.6px; text-anchor: middle; dominant-baseline: central; }}
</style></head>
<body><svg viewBox="0 0 {PAGE_W} {PAGE_H}" xmlns="http://www.w3.org/2000/svg">
{corner_marks()}
{svg_body}
</svg></body></html>"""


letters_svg = "\n".join(
    f'<text class="ltr" x="{c["x"]:.2f}" y="{c["y"]:.2f}" font-size="{c["size"]:.2f}" '
    f'transform="rotate({c["rot"]:.1f} {c["x"]:.2f} {c["y"]:.2f})">{c["ch"].upper()}</text>'
    for c in cells
)
mask_svg = "\n".join(
    f'<circle class="cut" cx="{c["x"]:.2f}" cy="{c["y"]:.2f}" r="{HOLE_R}"/>'
    f'<text class="num" x="{c["x"]:.2f}" y="{c["y"]:.2f}">{n}</text>'
    for n, c in holes
)

(OUT / "letters.html").write_text(page(letters_svg, "Letter Matrix"))
(OUT / "letters_mask.html").write_text(page(mask_svg, "Letter Mask"))
for n, c in holes:
    print(n, c["ch"], f"block {c['block']} row {c['row']} col {c['col']}  ({c['x']:.1f}, {c['y']:.1f}) mm")
