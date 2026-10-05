"""Regenerate every puzzle and render printable sheets into public/.

    npm run puzzles          (or: python3 puzzles/build.py)

Each generator script checks its own puzzle (one solution, the right handoff
number) and fails loudly if something is off. Printable sheets are HTML pages
rendered to Letter PDFs with headless Chrome, plus a PNG preview for the site.

Needs: Google Chrome, Python 3 with PyMuPDF (pip install -r puzzles/requirements.txt).
"""
import shutil
import subprocess
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
PUZZLES = ROOT / "puzzles"
PUBLIC = ROOT / "public"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PREVIEW_DPI = 130

# Printable games: generator scripts to run, then sheets in the order players get them.
# A sheet is found in the game's .build/ (generated) or sheets/ (hand-written) folder.
PRINTABLE = {
    "escape-room-packet": {
        "generators": ["letters.py", "grids.py", "fold.py", "tree.py"],
        "sheets": ["letters", "letters_mask", "equations", "grids", "remainders", "fold", "tree", "final"],
    },
}
# Interactive games whose generator writes data straight into src/: (script, arguments).
INTERACTIVE = [
    ("line-maze/generate.py", []),
    # 5 x 5 practice board for trying the whole game quickly (/line-maze/practice/)
    ("line-maze/generate.py", ["--size", "5x5", "--exit-row", "2", "--seed", "10", "--out", "puzzle-practice.json"]),
]


def run(script: Path, args: list[str] = []) -> None:
    print(f"  {script.relative_to(ROOT)} {' '.join(args)}".rstrip())
    out = subprocess.run([sys.executable, script.name, *args], cwd=script.parent, capture_output=True, text=True)
    if out.returncode:
        sys.exit(f"{script.name} failed:\n{out.stdout}{out.stderr}")
    if out.stdout.strip():
        print("    " + out.stdout.strip().splitlines()[0])


def render(html: Path, pdf: Path) -> None:
    pdf.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                    "--virtual-time-budget=8000", f"--print-to-pdf={pdf}", html.as_uri()],
                   check=True, capture_output=True)
    doc = fitz.open(pdf)
    if len(doc) != 1:
        sys.exit(f"{pdf.name} rendered to {len(doc)} pages; every sheet must be exactly one page")
    doc[0].get_pixmap(dpi=PREVIEW_DPI, colorspace=fitz.csGRAY).save(pdf.with_suffix(".png"))


def main() -> None:
    if not Path(CHROME).exists():
        sys.exit("Google Chrome not found; it is used to print sheets to PDF.")
    for game, spec in PRINTABLE.items():
        print(f"{game}:")
        folder = PUZZLES / game
        shutil.rmtree(folder / ".build", ignore_errors=True)
        for g in spec["generators"]:
            run(folder / g)
        for name in spec["sheets"]:
            src = next((p for p in (folder / ".build" / f"{name}.html", folder / "sheets" / f"{name}.html") if p.exists()), None)
            if not src:
                sys.exit(f"no HTML for sheet '{name}' in {game}")
            render(src, PUBLIC / game / "sheets" / f"{name}.pdf")
        print(f"  rendered {len(spec['sheets'])} sheets -> public/{game}/sheets/")
    for script, args in INTERACTIVE:
        print(script.split("/")[0] + ":")
        run(PUZZLES / script, args)


if __name__ == "__main__":
    main()
