"""Build the sum-grid sheet (receives 600 from the equations sheet, outputs f = 66).

Every label beside a grid is the sum of that row or column. Arrows carry a
value from one grid to the next: y -> grid 2, a -> grid 3, e -> grid 4.
"""
from pathlib import Path

OUT = Path(__file__).parent / ".build"   # intermediate HTML; build.py renders it to PDF
OUT.mkdir(exist_ok=True)
PAGE_W, PAGE_H = 215.9, 279.4
INK = "#2b2622"

# ---- check the puzzle before drawing it -------------------------------------
d1, d2, d3 = 6, 0, 0                      # digits of 600
G4_GIVEN, G4_ROW2 = 20, 50               # sketch had these swapped
X = d1 + d2; g = 3 - d2; h = X - g; y = d1 + h
P = X - y; Z = X - P; a = d3 + Z           # grid 2: row 1 and column 2 both sum to X
b = a - 3; c = 3 * a - 2 * b; e = 1 + 2 * c
s = e - G4_GIVEN; u = 15 - s; t = G4_ROW2 - u; f = G4_GIVEN + t
assert P == -3                             # the one negative cell, in grid 2
assert min(X, g, h, y, Z, a, b, c, e, s, t, u, f) >= 0
assert f == 66, f

# ---- drawing helpers ---------------------------------------------------------
parts = []


def text(x, y, s, size=6.5, cls="t", anchor="middle"):
    parts.append(f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" font-size="{size}" '
                 f'text-anchor="{anchor}">{s}</text>')


def grid(x0, y0, cols, rows, cw, ch, cells=None, top=None, right=None, bottom=None,
         label_size=7.0):
    """Draw a grid. cells: {(r, c): text}; top/bottom: {col: label}; right: {row: label}."""
    w, hgt = cols * cw, rows * ch
    parts.append(f'<rect class="g" x="{x0}" y="{y0}" width="{w}" height="{hgt}"/>')
    for i in range(1, cols):
        parts.append(f'<line class="g" x1="{x0 + i * cw}" y1="{y0}" x2="{x0 + i * cw}" y2="{y0 + hgt}"/>')
    for j in range(1, rows):
        parts.append(f'<line class="g" x1="{x0}" y1="{y0 + j * ch}" x2="{x0 + w}" y2="{y0 + j * ch}"/>')
    for (r, c_), s in (cells or {}).items():
        cx, cy = x0 + (c_ + .5) * cw, y0 + (r + .5) * ch
        if "|" in s:  # two-line small caption, e.g. "1st|digit"
            l1, l2 = s.split("|")
            text(cx, cy - 2.2, l1, 3.8, "small"); text(cx, cy + 3.0, l2, 3.8, "small")
        else:
            text(cx, cy, s, 6.5)
    for c_, s in (top or {}).items():
        text(x0 + (c_ + .5) * cw, y0 - 4.5, s, label_size)
    for c_, s in (bottom or {}).items():
        text(x0 + (c_ + .5) * cw, y0 + hgt + 7.5, s, label_size)
    for r, s in (right or {}).items():
        text(x0 + w + 4.5, y0 + (r + .5) * ch, s, label_size, anchor="start")


def arrow(d):
    parts.append(f'<path class="arr" d="{d}" marker-end="url(#head)"/>')


# ---- example ----------------------------------------------------------------
text(26, 37, "ex.", 6, anchor="start")
grid(46, 24, 2, 2, 11, 11, {(0, 0): "a", (0, 1): "b", (1, 0): "c", (1, 1): "d"},
     top={0: "W", 1: "X"}, right={0: "Y", 1: "Z"}, label_size=5.5)
for i, eq in enumerate(["a + b = Y", "c + d = Z"]):
    text(96, 31.5 + i * 11, eq, 5.5, anchor="start")
for i, eq in enumerate(["a + c = W", "b + d = X"]):
    text(146, 31.5 + i * 11, eq, 5.5, anchor="start")

# ---- grid 1 (takes the three digits) ----------------------------------------
grid(30, 82, 2, 2, 24, 22, {(0, 0): "1st|digit", (0, 1): "2nd|digit"},
     top={0: "y", 1: "3"}, right={0: "X", 1: "X"})

# ---- grid 2 -----------------------------------------------------------------
grid(126, 82, 2, 2, 24, 22, {(0, 0): "y", (1, 0): "3rd|digit", (1, 1): "Z"},
     top={1: "X"}, right={0: "X", 1: "a"})
arrow("M42 72 C 46 52, 134 50, 137 78")             # y label -> grid 2

# ---- grid 3 -----------------------------------------------------------------
grid(30, 152, 3, 3, 18, 18,
     {(0, 0): "1", (0, 1): "2", (0, 2): "b", (1, 0): "c", (1, 2): "b",
      (2, 0): "c", (2, 1): "c", (2, 2): "c"},
     right={0: "a"}, bottom={0: "e", 2: "3a"})
arrow("M180 133 C 184 152, 140 161, 97 161")        # a label -> grid 3

# ---- grid 4 -----------------------------------------------------------------
grid(122, 168, 2, 2, 26, 20, {(0, 0): str(G4_GIVEN)},
     right={0: "e", 1: str(G4_ROW2)}, bottom={0: "f", 1: "15"})
arrow("M39 219 C 50 262, 214 246, 189 184")         # e label -> grid 4

text(30, 252, "Use f &#8594; for Page 3", 6.2, anchor="start")


def corner_marks():
    m, L = 10, 9
    return "".join(f'<path d="{p}" class="reg"/>' for p in [
        f"M{m} {m + L} V{m} H{m + L}",
        f"M{PAGE_W - m - L} {m} H{PAGE_W - m} V{m + L}",
        f"M{m} {PAGE_H - m - L} V{PAGE_H - m} H{m + L}",
        f"M{PAGE_W - m - L} {PAGE_H - m} H{PAGE_W - m} V{PAGE_H - m - L}",
    ])


html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Sum Grids</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Special+Elite&display=block" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Courier+Prime&text=0123456789&display=block" rel="stylesheet">
<style>
  @page {{ size: letter; margin: 0; }}
  html, body {{ margin: 0; padding: 0; background: #fff; }}
  svg {{ display: block; width: 215.9mm; height: 279.4mm; }}
  text {{ font-family: 'Courier Prime', 'Special Elite', 'Courier New', monospace; fill: {INK};
          dominant-baseline: central; }}
  .g {{ fill: none; stroke: {INK}; stroke-width: .55; }}
  .reg {{ fill: none; stroke: {INK}; stroke-width: .5; }}
  .arr {{ fill: none; stroke: {INK}; stroke-width: .4; }}
</style></head>
<body><svg viewBox="0 0 {PAGE_W} {PAGE_H}" xmlns="http://www.w3.org/2000/svg">
<defs><marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6"
  orient="auto-start-reverse"><path d="M1 1 L9 5 L1 9" fill="none" stroke="{INK}" stroke-width="1.4"/></marker></defs>
{corner_marks()}
{chr(10).join(parts)}
</svg></body></html>"""
(OUT / "grids.html").write_text(html)
print(f"X={X} y={y} P={P} Z={Z} a={a} b={b} c={c} e={e} s={s} t={t} u={u} f={f}")
