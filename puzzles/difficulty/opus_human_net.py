# The baseline network's top guess on opus-human.ts's states (references/ml/opus-human/items.json):
# the registered snapshot baseline-2026-10-14 (models.json; weights from the private bucket's
# models/ into references/ml/models/), its config set before graph_policy is imported. Each state
# is built on the puzzle's human-labelled record (graphs-human-labels.jsonl, split "test") from the
# item's known marks; the top guess is the open mark and value scored highest, as score() takes it.
# On digit types also the best placement (a digit set true), as a fairer guess there.
# Random's chance is the person's next moves over twice the open marks, as score() has it.
#
#   references/ml/.venv/bin/python puzzles/difficulty/opus_human_net.py   → references/ml/opus-human/net.jsonl
import json, os, sys
os.environ.update(GRAPH_H="256", GRAPH_HEADS="8", GRAPH_POS="1", GRAPH_STRUCTURE="1")
sys.argv = [sys.argv[0], "--attention"]
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np, torch
import graph_policy as gp

REFS = os.path.join(HERE, "../../references/ml/")
OUT = os.path.join(REFS, "opus-human/")
items = json.load(open(OUT + "items.json"))["items"]
names = {it["name"] for it in items}
recs = {}
for line in open(REFS + "graphs-human-labels.jsonl"):
    d = json.loads(line)
    if d["name"] in names and d.get("split") == "test": recs[d["name"]] = d
missing = names - set(recs)
if missing: sys.exit(f"no record for {len(missing)} puzzles, e.g. {sorted(missing)[:3]}")
net = gp.load_net(os.path.join(REFS, "models/baseline-2026-10-14/model.pt"))
net.eval()
pz = {n: gp.Puzzle(d) for n, d in recs.items()}
marks = {n: [m["name"] for m in d["structure"]["marks"]] for n, d in recs.items()}
out = []
with torch.no_grad():
    for it in items:
        p, ms = pz[it["name"]], marks[it["name"]]
        idx = {m: i for i, m in enumerate(ms)}
        s = np.zeros(len(ms), np.int8)
        for m, v in it["known"]:
            if m in idx: s[idx[m]] = 1 if v else 2
        y = np.zeros((len(ms), 2), np.float32)
        g, _, mask, _ = gp.batch_states([(p, s, y)], gp.attends(net))
        lg = net(gp.to(g)).cpu()
        masked = lg.masked_fill(mask[:, None] == 0, -1e9)
        top = masked.flatten().argmax().item()
        # digit types: the best placement (a digit true), since people's labels there are placements
        place = None
        if any(m.startswith("digit(") for m in ms):
            i = masked[:, 0].argmax().item(); place = [ms[i], True]
        n_open = 2 * int(mask.sum().item())
        nxt = sum(1 for m, _ in it["next"] if m in idx and s[idx[m]] == 0)
        out.append({"id": it["id"], "top": [ms[top // 2], top % 2 == 0], "place": place, "random": nxt / max(1, n_open), "open": n_open // 2})
with open(OUT + "net.jsonl", "w") as f:
    for r in out: f.write(json.dumps(r) + "\n")
print(f"{len(out)} states scored → {OUT}net.jsonl")
