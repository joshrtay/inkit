"""Build and verify puzzle content for every game instance in src/games/<type>/<n>.json.

    npm run puzzles          (or: python3 puzzles/build.py)

packet instances (e.g. escape-room/1)
    If puzzles/<type>/<n>/ exists, every *.py in it is run first (each one generates and
    verifies sheets, writing HTML to its .build/). Each sheet listed in the instance is
    then printed to public/<type>/<n>/sheets/<file>.pdf from .build/<file>.html or
    puzzles/<type>/<n>/sheets/<file>.html. Sheets with no HTML source must already be in
    public/ as PDFs (e.g. made elsewhere). Every PDF gets a PNG preview for the site.

number-maze instances
    The clue grid is checked to have exactly one solution (puzzles/number-maze/check.py).

ryb instances
    Checked by the Astro build itself (src/game-types/ryb/solver.ts).

Needs: Google Chrome, Python 3 with PyMuPDF (pip install -r puzzles/requirements.txt).
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
PUZZLES = ROOT / "puzzles"
PUBLIC = ROOT / "public"
GAMES = ROOT / "src" / "games"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PREVIEW_DPI = 130

sys.path.insert(0, str(PUZZLES / "lib"))
import number_maze  # noqa: E402
import lazy_river  # noqa: E402


def run(script: Path) -> None:
    print(f"    {script.relative_to(ROOT)}")
    out = subprocess.run([sys.executable, script.name], cwd=script.parent, capture_output=True, text=True)
    if out.returncode:
        sys.exit(f"{script.name} failed:\n{out.stdout}{out.stderr}")


def print_pdf(html: Path, pdf: Path) -> None:
    if not Path(CHROME).exists():
        sys.exit("Google Chrome not found; it is used to print sheets to PDF.")
    pdf.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                    "--virtual-time-budget=8000", f"--print-to-pdf={pdf}", html.as_uri()],
                   check=True, capture_output=True)


def preview(pdf: Path) -> None:
    doc = fitz.open(pdf)
    if len(doc) != 1:
        sys.exit(f"{pdf.relative_to(ROOT)} has {len(doc)} pages; every sheet must be exactly one page")
    doc[0].get_pixmap(dpi=PREVIEW_DPI, colorspace=fitz.csGRAY).save(pdf.with_suffix(".png"))


def build_packet(slug: str, packet: dict) -> None:
    source = PUZZLES / slug               # slug is "<type>/<n>"
    if source.is_dir():
        shutil.rmtree(source / ".build", ignore_errors=True)
        for script in sorted(source.glob("*.py")):
            run(script)
    out = PUBLIC / slug / "sheets"
    printed = 0
    for sheet in packet["sheets"]:
        name = sheet["file"]
        html = next((p for p in (source / ".build" / f"{name}.html", source / "sheets" / f"{name}.html") if p.exists()), None)
        pdf = out / f"{name}.pdf"
        if html:
            print_pdf(html, pdf); printed += 1
        elif not pdf.exists():
            sys.exit(f"{slug}: sheet '{name}' has no HTML source and no PDF at {pdf.relative_to(ROOT)}")
        preview(pdf)
    print(f"    {len(packet['sheets'])} sheets ({printed} printed from HTML) -> public/{slug}/sheets/")


def main() -> None:
    failed = False
    for path in sorted(GAMES.glob("*/*.json")):
        instance = json.loads(path.read_text())
        slug, kind = f"{path.parent.name}/{path.stem}", instance.get("type")
        print(f"{slug} ({kind}):")
        if kind == "packet":
            build_packet(slug, instance["packet"])
        elif kind == "number-maze":
            ok, message, _ = number_maze.check(instance["maze"])
            print(f"    {'ok' if ok else 'PROBLEM'}: {message}")
            failed |= not ok
        elif kind == "lazy-river":
            ok, message = lazy_river.check(instance["river"])
            print(f"    {'ok' if ok else 'PROBLEM'}: {message}")
            failed |= not ok
        elif kind in ("ryb", "mosaic"):
            print("    checked by the Astro build (npm run build)")
        else:
            sys.exit(f"{path.name}: unknown game type {kind!r}")
    if failed:
        sys.exit("some puzzles need fixing (see above)")


if __name__ == "__main__":
    main()
