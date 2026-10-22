# The network's order on opus-walkthrough.ts's Janko states (references/ml/opus-human/walk-items.json):
# from each state, greedily, its top-scored open mark and value, applied with the solution's value
# (a wrong guess still names where it looks next), until 60 moves or the grid is full. Built on the
# puzzle's human-labelled record as opus_human_net.py builds its states. The relations-tuned network
# (relations-tuned-2026-10-20) needs GRAPH_RELATIONS=1.
#
#   GRAPH_RELATIONS=1 python puzzles/difficulty/walkthrough_net.py <model.pt>   → walk-net.jsonl
import json, os, sys
os.environ.update(GRAPH_H="256", GRAPH_HEADS="8", GRAPH_POS="1", GRAPH_STRUCTURE="1")
MODEL = sys.argv[1]
sys.argv = [sys.argv[0], "--attention"]
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np, torch
import graph_policy as gp

REFS = os.path.join(HERE, "../../references/ml/")
OUT = os.path.join(REFS, "opus-human/")
LIMIT = 60
items = [w for w in json.load(open(OUT + "walk-items.json"))["items"] if w["set"] == "janko"]
names = {w["name"] for w in items}
recs = {}
for line in open(REFS + "graphs-human-labels.jsonl"):
    d = json.loads(line)
    if d["name"] in names and d.get("split") == "test": recs[d["name"]] = d
net = gp.load_net(MODEL); net.eval()
rows = []
with torch.no_grad():
    for w in items:
        d = recs[w["name"]]; p = gp.Puzzle(d)
        ms = [m["name"] for m in d["structure"]["marks"]]; idx = {m: i for i, m in enumerate(ms)}
        answer = set(d["answer"])
        s = np.zeros(len(ms), np.int8)
        for m, v in w["known"]:
            if m in idx: s[idx[m]] = 1 if v else 2
        order = []
        while len(order) < LIMIT and (s == 0).any():
            g, _, mask, _ = gp.batch_states([(p, s, np.zeros((len(ms), 2), np.float32))], gp.attends(net))
            if mask.sum() == 0: break
            top = net(gp.to(g)).cpu().masked_fill(mask[:, None] == 0, -1e9).flatten().argmax().item()
            m = ms[top // 2]; order.append([m, top % 2 == 0])
            s[idx[m]] = 1 if m in answer else 2
        rows.append({"id": w["id"], "model": os.path.basename(os.path.dirname(MODEL)), "order": order})
        print(f"{w['id']}: {len(order)} moves", file=sys.stderr)
with open(OUT + "walk-net.jsonl", "w") as f:
    for r in rows: f.write(json.dumps(r) + "\n")
print(f"{len(rows)} orders → {OUT}walk-net.jsonl")
