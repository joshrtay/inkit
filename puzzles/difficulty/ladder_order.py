# Our chapter ladders (bench-solve.ts ladders) reordered: by the relations-tuned network's greedy walk
# through each puzzle (as walkthrough_net.py walks: its top-scored open mark and value each time,
# applied with the answer's value), each chapter placed where the walk first reaches the mark it
# decides; and reversed, as a control for whether order matters at all. The theme line stays first.
# Records come from `bench-solve.ts graphs <set>`.
#
#   GRAPH_RELATIONS=1 python3 puzzles/difficulty/ladder_order.py <model.pt> [set]
#     → solve-<set>/ladders-net.jsonl, ladders-reversed.jsonl, net-walks.jsonl
import json, os, sys
os.environ.update(GRAPH_H="256", GRAPH_HEADS="8", GRAPH_POS="1", GRAPH_STRUCTURE="1")
MODEL = sys.argv[1]
SET = sys.argv[2] if len(sys.argv) > 2 else "thinky"
sys.argv = [sys.argv[0], "--attention"]
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np, torch
import graph_policy as gp

D = os.path.join(HERE, f"../../references/ml/bench/solve-{SET}/")
lads = {}
for line in open(D + "ladders-ours.jsonl"):
    r = json.loads(line)
    if r.get("ladder"): lads[r["id"]] = r
net = gp.load_net(MODEL); net.eval()
walks, by_net, rev = [], [], []
with torch.no_grad():
    for line in open(D + "graphs.jsonl"):
        d = json.loads(line); lad = lads.get(d["name"])
        if not lad: continue
        p = gp.Puzzle(d)
        ms = [m["name"] for m in d["structure"]["marks"]]; idx = {m: i for i, m in enumerate(ms)}
        answer = set(d["answer"])
        s = np.zeros(len(ms), np.int8)
        for m in d.get("initial") or []:
            if m in idx: s[idx[m]] = 1 if m in answer else 2
        when = {}
        t = 0
        while (s == 0).any():
            g, _, mask, _ = gp.batch_states([(p, s, np.zeros((len(ms), 2), np.float32))], gp.attends(net))
            if mask.sum() == 0: break
            top = net(gp.to(g)).cpu().masked_fill(mask[:, None] == 0, -1e9).flatten().argmax().item()
            m = ms[top // 2]; s[idx[m]] = 1 if m in answer else 2
            when[m] = t; t += 1
        ch = lad["chapters"]; marks = d.get("chapterMarks") or [None] * len(ch)
        # a chapter whose mark the walk never reached (or has none) keeps its place relative to its neighbours
        pos = [when.get(m, None) if m else None for m in marks]
        filled, last = [], -1
        for k, x in enumerate(pos):
            if x is None: x = last + 0.5
            filled.append(x); last = x
        order = sorted(range(len(ch)), key=lambda k: (filled[k], k))
        flat = lambda o: ([lad["theme"]] if lad.get("theme") else []) + [str(ch[k][f]) for k in o for f in ("look", "idea", "step") if ch[k].get(f)]
        moved = sum(1 for a, b in zip(order, range(len(ch))) if a != b)
        walks.append({"id": d["name"], "steps": t, "order": order, "moved": moved, "reached": sum(x is not None for x in pos), "chapters": len(ch)})
        by_net.append({"id": d["name"], "order": order, "ladder": flat(order)})
        rev.append({"id": d["name"], "order": list(range(len(ch)))[::-1], "ladder": flat(list(range(len(ch)))[::-1])})
        print(f"{d['name']}: {t} walk steps, {moved}/{len(ch)} chapters moved", file=sys.stderr)
for name, rows in (("ladders-net", by_net), ("ladders-reversed", rev), ("net-walks", walks)):
    with open(D + name + ".jsonl", "w") as f:
        for r in rows: f.write(json.dumps(r) + "\n")
print(f"{len(by_net)} ladders reordered → ladders-net.jsonl, ladders-reversed.jsonl")
