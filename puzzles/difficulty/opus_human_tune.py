# The fair comparison for opus-human.ts: the baseline network (baseline-2026-10-14) fine-tuned on
# Janko's human move labels (graphs-human-labels.jsonl, split "train": each state's targets are the
# person's next 3 moves), then scored on opus-human.ts's 400 held-out states beside the baseline.
#
# - Never trains on a test puzzle: the "test" side (which every one of the 400 states comes from)
#   is held out by puzzle, and a training record is also dropped if its content (content_key) or
#   name is on the test side or in the human test set (graphs-human.jsonl), as load() does.
# - A tenth of the training puzzles (by a hash of the name) is held back to pick the epoch and the
#   learning rate: agreement with people on their states, the measure opus-human.ts reports.
# - Resumable: each learning rate's epochs are checkpointed in OUT (TUNE_OUT), and a rerun starts
#   from the last one saved.
#
#   python opus_human_tune.py train      → OUT/tune.json, OUT/lr-<lr>/epoch-<k>.pt, OUT/best.pt
#   python opus_human_tune.py score <model.pt> <out.jsonl>   (the 400 states: top, place, pos)
#   python opus_human_tune.py heldout <model.pt>             (agreement with people, whole test side)
#
# TUNE_LRS (default "3e-4 1e-4"), TUNE_EPOCHS (6), TUNE_DEADLINE (seconds for all training, 0: none),
# TUNE_LIMIT (a smoke test on that many training puzzles).
import hashlib, json, os, sys, time
os.environ.update(GRAPH_H="256", GRAPH_HEADS="8", GRAPH_POS="1", GRAPH_STRUCTURE="1")
MODE, ARGS = (sys.argv[1] if len(sys.argv) > 1 else "train"), sys.argv[2:]
sys.argv = [sys.argv[0], "--attention"]
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np, torch, torch.nn as nn
import graph_policy as gp

REFS = os.path.join(HERE, "../../references/ml/")
LABELS = os.path.join(REFS, "graphs-human-labels.jsonl")
BASE = os.path.join(REFS, "models/baseline-2026-10-14/model.pt")
OUT = os.environ.get("TUNE_OUT") or os.path.join(REFS, "opus-human/tune/")
ITEMS = os.path.join(REFS, "opus-human/items.json")
LRS = [float(x) for x in os.environ.get("TUNE_LRS", "3e-4 1e-4").split()]
EPOCHS = int(os.environ.get("TUNE_EPOCHS", 6))
DEADLINE = float(os.environ.get("TUNE_DEADLINE") or 0)
LIMIT = int(os.environ.get("TUNE_LIMIT") or 0)   # a smoke test: this many training puzzles
VAL_PER = 6   # states a validation puzzle, spread through the solve

def log(*a): print(*a, flush=True)
def val_side(name): return int(hashlib.md5(f"opus-human-tune:{name}".encode()).hexdigest()[:12], 16) / 16 ** 12 < 0.1

def load():
    """(training puzzles, validation puzzles, held-out test puzzles), with the leakage guards."""
    human = {gp.content_key(json.loads(l)) for l in gp.lines(gp.HUMAN)} if os.path.exists(gp.HUMAN) else set()
    test_keys, test_names, recs = set(), set(), []
    for l in gp.lines(LABELS):
        d = json.loads(l); recs.append(d)
        if d.get("split") == "test": test_keys.add(gp.content_key(d)); test_names.add(d["name"])
    item_names = {it["name"] for it in json.load(open(ITEMS))["items"]} if os.path.exists(ITEMS) else set()
    assert item_names <= test_names, "an opus-human state's puzzle isn't on the test side"
    tr, va, te, dropped, seen = [], [], [], 0, set()
    for d in recs:
        key = gp.content_key(d)
        if d.get("split") != "test":
            if key in test_keys or key in human or d["name"] in test_names or d["name"] in item_names or key in seen: dropped += 1; continue
            seen.add(key)
        p = gp.Puzzle(d)
        if not p.R or p.M > gp.MAX_MARKS: continue
        (te if d.get("split") == "test" else va if val_side(d["name"]) else tr).append(p)
    log(f"human labels: {len(tr)} puzzles to train on ({sum(p.R for p in tr)} states), {len(va)} to validate, {len(te)} held out; {dropped} training records dropped as copies of test puzzles or repeats")
    return tr, va, te

def agreement(net, items):
    """The share of states whose top guess is among the person's next 3 moves (score()'s r[4][0]),
    mean over types, and over all states."""
    rows =[(pz.genre, r[4][0]) for pz, k, r in gp.score(net, items) if r[4] is not None]
    by = {}
    for g, h in rows: by.setdefault(g, []).append(h)
    return float(np.mean([np.mean(v) for v in by.values()])), float(np.mean([h for _, h in rows])), {g: float(np.mean(v)) for g, v in sorted(by.items())}

def train():
    os.makedirs(OUT, exist_ok=True)
    tr, va, _ = load()
    if LIMIT: tr, va = tr[:LIMIT], va[:LIMIT // 10 + 1]
    items, vitems = gp.states(tr), gp.states(va, VAL_PER)
    state_file = os.path.join(OUT, "tune.json")
    st = json.load(open(state_file)) if os.path.exists(state_file) else {"runs": {}}
    def save(): json.dump(st, open(state_file, "w"), indent=1)
    if "base" not in st:
        net = gp.load_net(BASE)
        st["base"] = agreement(net, vitems); save()
    log(f"baseline on validation: {st['base'][0]:.1%} (mean over types), {st['base'][1]:.1%} of states")
    t0 = time.time()
    for lr in LRS:
        run = st["runs"].setdefault(f"{lr:g}", {"epochs": []}); d = os.path.join(OUT, f"lr-{lr:g}"); os.makedirs(d, exist_ok=True)
        net = gp.load_net(BASE)
        done = len(run["epochs"])
        if done: net.load_state_dict(torch.load(os.path.join(d, f"epoch-{done}.pt"), map_location=gp.dev)); log(f"lr {lr:g}: resuming after epoch {done}")
        opt = torch.optim.AdamW(net.parameters(), lr, weight_decay=1e-4)
        opt_file = os.path.join(d, "opt.pt")
        if done and os.path.exists(opt_file): opt.load_state_dict(torch.load(opt_file, map_location=gp.dev))
        for ep in range(done, EPOCHS):
            if DEADLINE and run["epochs"] and time.time() - t0 + run["epochs"][-1]["s"] > DEADLINE: log(f"lr {lr:g}: stopping, out of time"); break
            te = time.time(); net.train(); gp.random.shuffle(items); tot = n = 0
            parts = gp.chunks(items)
            for i, part in enumerate(parts):
                # warm up over the first epoch's first tenth
                if ep == 0:
                    for g in opt.param_groups: g["lr"] = lr * min(1.0, (i + 1) / max(1, len(parts) // 10))
                loss = gp.loss_of(net, part)
                opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(net.parameters(), 1.0); opt.step()
                tot += loss.item(); n += 1
            a = agreement(net, vitems)
            torch.save(net.state_dict(), os.path.join(d, f"epoch-{ep + 1}.pt")); torch.save(opt.state_dict(), opt_file)
            run["epochs"].append({"loss": tot / max(1, n), "val": a[0], "valStates": a[1], "byType": a[2], "s": time.time() - te}); save()
            log(f"lr {lr:g} epoch {ep + 1}: loss {tot / max(1, n):.3f}, validation {a[0]:.1%} (mean over types), {a[1]:.1%} of states ({time.time() - te:.0f} s)")
    best = max(((lr, k, e["val"]) for lr, r in st["runs"].items() for k, e in enumerate(r["epochs"], 1)), key=lambda x: x[2], default=None)
    if best:
        st["best"] = {"lr": best[0], "epoch": best[1], "val": best[2]}; save()
        import shutil; shutil.copy(os.path.join(OUT, f"lr-{best[0]}", f"epoch-{best[1]}.pt"), os.path.join(OUT, "best.pt"))
        log(f"best: lr {best[0]} epoch {best[1]}, validation {best[2]:.1%} (baseline {st['base'][0]:.1%}) → {OUT}best.pt")

def score_items(model, out):
    """opus_human_net.py's scoring of the 400 states, plus each network's best positive move (a mark
    set true) and its top 3, for the rescoring without negative marks."""
    items = json.load(open(ITEMS))["items"]; names = {it["name"] for it in items}
    recs = {}
    for l in gp.lines(LABELS):
        d = json.loads(l)
        if d["name"] in names and d.get("split") == "test": recs[d["name"]] = d
    net = gp.load_net(model); net.eval()
    pz = {n: gp.Puzzle(d) for n, d in recs.items()}
    marks = {n: [m["name"] for m in d["structure"]["marks"]] for n, d in recs.items()}
    rows = []
    with torch.no_grad():
        for it in items:
            p, ms = pz[it["name"]], marks[it["name"]]
            idx = {m: i for i, m in enumerate(ms)}
            s = np.zeros(len(ms), np.int8)
            for m, v in it["known"]:
                if m in idx: s[idx[m]] = 1 if v else 2
            g, _, mask, _ = gp.batch_states([(p, s, np.zeros((len(ms), 2), np.float32))], gp.attends(net))
            masked = net(gp.to(g)).cpu().masked_fill(mask[:, None] == 0, -1e9)
            order = masked.flatten().argsort(descending=True)[:3].tolist()
            mv = lambda c: [ms[c // 2], c % 2 == 0]
            pos = [ms[masked[:, 0].argmax().item()], True] if mask.sum() else None
            place = pos if any(m.startswith("digit(") for m in ms) else None
            nxt = sum(1 for m, _ in it["next"] if m in idx and s[idx[m]] == 0)
            rows.append({"id": it["id"], "top": mv(order[0]), "top3": [mv(c) for c in order], "place": place, "pos": pos, "random": nxt / max(1, 2 * int(mask.sum().item())), "open": int(mask.sum().item())})
    with open(out, "w") as f:
        for r in rows: f.write(json.dumps(r) + "\n")
    log(f"{len(rows)} states scored with {model} → {out}")

if MODE == "train": train()
elif MODE == "score": score_items(ARGS[0], ARGS[1])
elif MODE == "heldout":
    _, _, te = load()
    for m in ARGS:
        a = agreement(gp.load_net(m), gp.states(te, VAL_PER))
        log(f"{m}: agreement with people on the test side ({VAL_PER} states a puzzle): {a[0]:.1%} mean over types, {a[1]:.1%} of states; " + ", ".join(f"{g} {v:.0%}" for g, v in a[2].items()))
else: sys.exit(f"unknown mode {MODE}")
