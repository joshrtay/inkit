"""Build the fold-in sheet (receives X = 375041, outputs 5100).

Every line is laid out on a fixed character grid. Columns [K, K+M) form a band
that disappears when the sheet is folded so the two diamond-marked lines meet
(mountain at each marked line, valley at the dotted centre line). Unfolded,
each line reads as a decoy; folded, the left and right parts join into the
real instruction.
"""
from pathlib import Path

OUT = Path(__file__).parent / ".build"   # intermediate HTML; build.py renders it to PDF
OUT.mkdir(exist_ok=True)
PAGE_W, PAGE_H = 215.9, 279.4
INK = "#2b2622"
K, M = 9, 22          # band starts at column K and is M columns wide
CW = 3.3              # mm per character column
FONT = 5.4            # mm

# (left part, hidden middle, right part). Left parts are right-aligned to K.
LINES = [
    ("TAKE ",     "THE FIRST 3 DIGITS OF ",  "THE NUMBER."),
    ("SUBTRACT ", "NOTHING AND DIVIDE BY ",  "370,000."),
    ("ADD ",      "10 AND THEN DIVIDE BY ",  "3 SQUARED."),
    ("ADD ",      "100 AND THEN SUBTRACT ",  "2 TIMES FIVE SQUARED."),
]
FOLDED = ["TAKE THE NUMBER.", "SUBTRACT 370,000.", "ADD 3 SQUARED.", "ADD 2 TIMES FIVE SQUARED."]

rows = []
for (left, mid, right), want in zip(LINES, FOLDED):
    assert len(left) <= K and len(mid) == M, (left, mid, len(mid))
    assert left.lstrip() + right == want, (left + right, want)
    rows.append(left.rjust(K) + mid + right)

# The real solve, and the handoff to the next sheet.
X = 375041
result = X - 370000 + 3 ** 2 + 2 * 5 ** 2
assert result == 5100, result

COLS = max(len(r) for r in rows)
x0 = (PAGE_W - COLS * CW) / 2
x1, x2 = x0 + K * CW, x0 + (K + M) * CW      # the two lines that must meet
xm = (x1 + x2) / 2                            # valley fold
Y0, DY = 96, 17

parts = []
for i, row in enumerate(rows):
    y = Y0 + i * DY
    for c, ch in enumerate(row):
        if ch != " ":
            ch = {"&": "&amp;", "<": "&lt;"}.get(ch, ch)
            parts.append(f'<text x="{x0 + (c + .5) * CW:.2f}" y="{y}">{ch}</text>')

# Handoff hint sits right of the band so it survives the fold.
hy = Y0 + len(rows) * DY + 12
parts.append(f'<text class="hint" x="{x2 + 6 * CW:.2f}" y="{hy}" text-anchor="start">&#8594; for Page 5</text>')

top, bot = 22, PAGE_H - 22
# Fold lines break around each text row so they never cut through letters.
gaps = [(Y0 + i * DY - 4, Y0 + i * DY + 4) for i in range(len(rows))]


def broken_line(x, cls):
    segs, y = [], top + 6
    for g0, g1 in gaps + [(bot - 6, bot - 6)]:
        segs.append(f'<line class="{cls}" x1="{x:.2f}" y1="{y:.2f}" x2="{x:.2f}" y2="{g0:.2f}"/>')
        y = g1
    return "".join(segs)


fold = []
for x in (x1, x2):
    fold.append(broken_line(x, "fold"))
    for yy in (top, bot):
        fold.append(f'<path class="dia" d="M{x:.2f} {yy - 2.6} L{x + 2.2:.2f} {yy} L{x:.2f} {yy + 2.6} L{x - 2.2:.2f} {yy} Z"/>')
fold.append(broken_line(xm, "valley"))


def corner_marks():
    m, L = 10, 9
    return "".join(f'<path d="{p}" class="reg"/>' for p in [
        f"M{m} {m + L} V{m} H{m + L}",
        f"M{PAGE_W - m - L} {m} H{PAGE_W - m} V{m + L}",
        f"M{m} {PAGE_H - m - L} V{PAGE_H - m} H{m + L}",
        f"M{PAGE_W - m - L} {PAGE_H - m} H{PAGE_W - m} V{PAGE_H - m - L}",
    ])


html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Fold-In</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Special+Elite&display=block" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Courier+Prime&text=0123456789&display=block" rel="stylesheet">
<style>
  @page {{ size: letter; margin: 0; }}
  html, body {{ margin: 0; padding: 0; background: #fff; }}
  svg {{ display: block; width: 215.9mm; height: 279.4mm; }}
  text {{ font-family: 'Courier Prime', 'Special Elite', 'Courier New', monospace; fill: {INK};
          font-size: {FONT}px; text-anchor: middle; dominant-baseline: central; }}
  text.hint {{ font-size: {FONT * .8:.2f}px; text-anchor: start; }}
  .reg {{ fill: none; stroke: {INK}; stroke-width: .5; }}
  .fold {{ stroke: {INK}; stroke-width: .3; stroke-dasharray: 2.4 1.6; }}
  .valley {{ stroke: {INK}; stroke-width: .25; stroke-dasharray: .4 1.4; stroke-linecap: round; }}
  .dia {{ fill: {INK}; }}
</style></head>
<body><svg viewBox="0 0 {PAGE_W} {PAGE_H}" xmlns="http://www.w3.org/2000/svg">
{corner_marks()}
{chr(10).join(fold)}
{chr(10).join(parts)}
</svg></body></html>"""
(OUT / "fold.html").write_text(html)

print("unfolded:"); [print("  " + r) for r in rows]
print("folded:");   [print("  " + r[:K].lstrip() + r[K + M:]) for r in rows]
print(f"band x1={x1:.1f} x2={x2:.1f} mm, result={result}")
