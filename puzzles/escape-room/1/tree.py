"""Build the sum-tree sheet (? = 108; with 5100 from the fold-in, the answer is 4992).

Each node is the sum of the nodes directly below it. Letters are unknowns; the
same letter is the same number everywhere on this sheet.
"""
from pathlib import Path

OUT = Path(__file__).parent / ".build"   # intermediate HTML; build.py renders it to PDF
OUT.mkdir(exist_ok=True)
PAGE_W, PAGE_H = 215.9, 279.4
INK = "#26398f"

# ---- structure ----------------------------------------------------------------
# Bottom row, left to right (index = column).
LEAVES = ["c", "a", "a", "b", "a", "b", "7", "7", "d", "d", "d"]
X0, DX, Y_LEAF = 22.0, 17.2, 232.0


def col(i):
    return X0 + i * DX


# name: (x in columns, y in mm, label shown, children)
NODES = {f"L{i}": (i, Y_LEAF, s, []) for i, s in enumerate(LEAVES)}
NODES.update({
    "B":   (0.5, 212, "b", ["L0", "L1"]),
    # 146 lattice over L1..L5
    "P1":  (1.5, 212, "", ["L1", "L2"]), "P2": (2.5, 212, "", ["L2", "L3"]),
    "P3":  (3.5, 212, "", ["L3", "L4"]), "P4": (4.5, 212, "", ["L4", "L5"]),
    "Q1":  (2.0, 194, "", ["P1", "P2"]), "Q2": (3.0, 194, "", ["P2", "P3"]),
    "Q3":  (4.0, 194, "", ["P3", "P4"]),
    "R1":  (2.5, 176, "", ["Q1", "Q2"]), "R2": (3.5, 176, "", ["Q2", "Q3"]),
    "T":   (3.0, 158, "146", ["R1", "R2"]),
    # middle
    "C":   (6.5, 215, "c", ["L6", "L7"]),
    "N1":  (5.5, 199, "", ["L5", "L6"]), "N2": (7.5, 199, "", ["L7", "L8"]),
    "N":   (6.5, 180, "", ["N1", "N2"]),
    "BIG": (1.0, 118, "", ["L1", "N"]),
    # 148 over the d's
    "D1":  (8.5, 208, "", ["L8", "L9"]), "D2": (9.5, 208, "", ["L9", "L10"]),
    "E":   (9.0, 184, "148", ["D1", "D2"]),
    "ROOT": (8.0, 62, "?", ["BIG", "L8"]),
})

# ---- check: one solution, and ? = 108 ------------------------------------------


def value(name, env):
    label, kids = NODES[name][2], NODES[name][3]
    if not kids:
        return int(label) if label.isdigit() else env[label]
    return sum(value(k, env) for k in kids)


def consistent(env):
    for name, (_, _, label, kids) in NODES.items():
        if kids and label and label != "?":
            want = int(label) if label.isdigit() else env[label]
            if value(name, env) != want:
                return False
    return True


sols = [dict(a=a, b=b, c=c, d=d)
        for a in range(1, 60) for b in range(1, 60) for c in range(1, 60) for d in range(1, 60)
        if consistent(dict(a=a, b=b, c=c, d=d))]
assert len(sols) == 1, sols
QUESTION = value("ROOT", sols[0])
assert QUESTION == 108 and 5100 - QUESTION == 4992

# ---- drawing --------------------------------------------------------------------
parts = []


def pos(name):
    cx, y = NODES[name][0], NODES[name][1]
    return col(cx), y


def radius(name):
    label = NODES[name][2]
    return 6.2 if len(label) >= 3 else 5.0


for name, (_, _, _, kids) in NODES.items():
    x1, y1 = pos(name)
    for k in kids:
        x2, y2 = pos(k)
        parts.append(f'<line class="e" x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}"/>')
for name, (_, _, label, _) in NODES.items():
    x, y = pos(name)
    parts.append(f'<circle class="n" cx="{x:.2f}" cy="{y:.2f}" r="{radius(name)}"/>')
    if label:
        size = 5.2 if len(label) < 3 else 4.4
        parts.append(f'<text x="{x:.2f}" y="{y:.2f}" font-size="{size}">{label}</text>')


def corner_marks():
    m, L = 10, 9
    return "".join(f'<path d="{p}" class="reg"/>' for p in [
        f"M{m} {m + L} V{m} H{m + L}",
        f"M{PAGE_W - m - L} {m} H{PAGE_W - m} V{m + L}",
        f"M{m} {PAGE_H - m - L} V{PAGE_H - m} H{m + L}",
        f"M{PAGE_W - m - L} {PAGE_H - m} H{PAGE_W - m} V{PAGE_H - m - L}",
    ])


html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Sum Tree</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=block" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Kalam:wght@700&text=0123456789&display=block" rel="stylesheet">
<style>
  @page {{ size: letter; margin: 0; }}
  html, body {{ margin: 0; padding: 0; background: #fff; }}
  svg {{ display: block; width: 215.9mm; height: 279.4mm; }}
  text {{ font-family: 'Kalam', cursive; fill: {INK};
          text-anchor: middle; dominant-baseline: central; }}
  .prompt {{ font-size: 5.3px; text-anchor: start; }}
  .e {{ stroke: {INK}; stroke-width: .45; }}
  .n {{ fill: #fff; stroke: {INK}; stroke-width: .55; }}
  .reg {{ fill: none; stroke: {INK}; stroke-width: .5; }}
</style></head>
<body><svg viewBox="0 0 {PAGE_W} {PAGE_H}" xmlns="http://www.w3.org/2000/svg">
{corner_marks()}
<text class="prompt" x="26" y="30">Find the positive difference between</text>
<text class="prompt" x="26" y="39">the question mark and Page 4.</text>
{chr(10).join(parts)}
</svg></body></html>"""
(OUT / "tree.html").write_text(html)
print("solution", sols[0], "? =", QUESTION, "answer =", 5100 - QUESTION)
