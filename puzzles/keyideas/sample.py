"""Draw the key-idea pilot's items from three domains into one JSONL file.

    python3 -I puzzles/keyideas/sample.py <data dir> <items.jsonl>

<data dir> holds (all private or downloaded, never committed):
  meta.parquet            the math bank (gs://inkit-research-ml/datasets/mathbank/)
  lichess-200k.csv        the first 200k rows of database.lichess.org/lichess_db_puzzle.csv.zst (CC0)
  thinky-dailies/thinky-dailies.json   Thinky dailies with hint ladders (gs://.../private/refs/; private)

Each item: id, domain (math | logic | grid | chess), kind (subject, genre or opening phase),
text (what the labeller reads: the problem and its solution, the puzzle's rules and hint ladder,
or the position and winning line), and truth (labels we hold out to check the labeller:
MATH's level, Lichess themes and rating).
"""
import csv, json, random, re, sys
import pyarrow.parquet as pq, pyarrow.compute as pc

SEED = 20261110
N_MATH, N_LOGIC, N_CHESS = 2500, 500, 2000
MAX_SOLUTION = 3000

def math_items(path, rng):
    t = pq.read_table(path, columns=['id', 'dataset', 'source', 'topic', 'level', 'question_type', 'synthetic', 'problem', 'solution', 'answer'])
    rows = t.to_pylist()
    real = lambda r: not r['synthetic'] and r['solution'] and len(r['solution']) > 80
    hard_math = [r for r in rows if r['dataset'] == 'math' and (r['level'] or 0) >= 3]
    contest = [r for r in rows if r['dataset'] == 'numina15' and real(r) and r['source'] in
               ('olympiads', 'amc_aime', 'aops_forum', 'olympiads_ref', 'cn_contest', 'number_theory', 'inequalities')
               and r['topic'] != 'logic_and_puzzles']
    logic = [r for r in rows if r['dataset'] == 'numina15' and real(r) and r['topic'] == 'logic_and_puzzles'
             and r['source'] in ('olympiads', 'aops_forum', 'olympiads_ref', 'cn_contest', 'amc_aime')]
    out = []
    for domain, pool, n in (('math', hard_math, N_MATH // 2), ('math', contest, N_MATH - N_MATH // 2), ('logic', logic, N_LOGIC)):
        for r in rng.sample(pool, n):
            out.append(dict(id=r['id'], domain=domain, kind=r['topic'],
                            text=f"PROBLEM:\n{r['problem'].strip()}\n\nSOLUTION:\n{r['solution'].strip()[:MAX_SOLUTION]}",
                            truth=dict(source=r['source'], level=r['level'], question_type=r['question_type'])))
    return out

def lex_text(n):
    # Thinky stores rich text as a Lexical tree
    if isinstance(n, dict):
        if isinstance(n.get('text'), str): return n['text']
        cap = (n.get('fields') or {}).get('caption')  # a rule block: picture plus caption
        if isinstance(cap, str): return f' - {cap}'
        kids = n.get('children') or ([n['root']] if 'root' in n else [])
        return ' '.join(lex_text(c) for c in kids)
    if isinstance(n, list): return ' '.join(lex_text(c) for c in n)
    return ''

def grid_items(path):
    out = []
    for p in json.load(open(path))['puzzles']:
        genre = p.get('genre') or ''
        hints = [h['hint'].strip() for h in p.get('hints') or [] if isinstance(h, dict) and h.get('hint')]
        if genre in ('Visual Riddle', 'Metapuzzle') or not hints: continue
        rules = re.sub(r'\s+', ' ', lex_text(p.get('rules'))).strip()
        ladder = '\n'.join(f'{i + 1}. {h}' for i, h in enumerate(hints))
        out.append(dict(id=f"thinky/{p['slug']}", domain='grid', kind=genre,
                        text=f"PUZZLE TYPE: {genre}\nRULES: {rules}\n\nHINTS, from general to specific "
                             f"(each points at the next step of the solve):\n{ladder}",
                        truth=dict(difficulty=p.get('difficulty'))))
    return out

def chess_items(path, rng):
    import chess
    rows = [r for r in csv.DictReader(open(path)) if int(r['Popularity']) >= 80 and int(r['NbPlays']) >= 300]
    # flatten the theme mix: weight each puzzle by its rarest theme, so forks don't swamp the sample
    tags = lambda r: [x for x in r['Themes'].split() if x not in ('short', 'long', 'veryLong', 'oneMove', 'middlegame', 'endgame', 'opening', 'advantage', 'crushing', 'mate', 'master', 'masterVsMaster', 'superGM', 'equality')]
    freq = {}
    for r in rows:
        for x in tags(r): freq[x] = freq.get(x, 0) + 1
    rows = [r for r in rows if tags(r)]
    w = [1 / min(freq[x] for x in tags(r)) for r in rows]
    picked, seen = [], set()
    while len(picked) < N_CHESS:
        r = rng.choices(rows, w)[0]
        if r['PuzzleId'] in seen: continue
        seen.add(r['PuzzleId']); picked.append(r)
    out = []
    for r in picked:
        b = chess.Board(r['FEN']); moves = r['Moves'].split()
        b.push_uci(moves[0])  # Lichess gives the opponent's last move first; the puzzle starts after it
        side = 'White' if b.turn else 'Black'
        start = b.copy(); san = []
        for i, m in enumerate(moves[1:]):
            mv = chess.Move.from_uci(m)
            san.append(b.san(mv)); b.push(mv)
        line = ' '.join(f"{'' if i % 2 else '>'}{s}" for i, s in enumerate(san))
        phase = next((x for x in ('opening', 'middlegame', 'endgame') if x in r['Themes'].split()), '')
        out.append(dict(id=f"lichess/{r['PuzzleId']}", domain='chess', kind=phase,
                        text=f"CHESS PUZZLE. {side} to move and win (rated {r['Rating']}).\n"
                             f"Position (FEN): {start.fen()}\nBoard (upper case White, lower case Black; White plays up the board):\n{start}\n\n"
                             f"WINNING LINE (moves marked > are the solver's, the others the best replies): {line}\n"
                             f"Final position: {'checkmate' if b.is_checkmate() else 'material or positional win'}",
                        truth=dict(themes=r['Themes'].split(), rating=int(r['Rating']))))
    return out

def main(data, out):
    rng = random.Random(SEED)
    items = math_items(f'{data}/meta.parquet', rng) + grid_items(f'{data}/thinky-dailies/thinky-dailies.json') + chess_items(f'{data}/lichess-200k.csv', rng)
    with open(out, 'w') as f:
        for it in items: f.write(json.dumps(it, ensure_ascii=False) + '\n')
    from collections import Counter
    print(len(items), Counter(i['domain'] for i in items))

if __name__ == '__main__':
    main(*sys.argv[1:3])
