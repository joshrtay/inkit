# Insight-grain scoring (research review 2026-10-24, idea 4): split a recorded solve's moves into
# bookkeeping (a move the smallest windows make from where the person stands, about as cheap as
# the cheapest step on offer there) and insights (the rest: a dearer step, or one no window makes from there),
# then score next-move agreement on each kind apart. The walkthroughs suggested the gap to people
# is mostly bookkeeping; if so, agreement on insights is the number that matters for hints.
#
# Three steps, on opus_human_tune.py's held-out side at its 6 states a puzzle (per_solver.py's):
#   python insight_grain.py prep <labels.jsonl> <jobs.jsonl>        each puzzle's states, as menus to list
#   node insight-menus.ts <jobs.jsonl> <menus.jsonl>                  deduce.ts's menus at each state
#   python insight_grain.py score <menus.jsonl> <per-solver-rows.jsonl>
# per-solver-rows.jsonl: per_solver.py's rows (PER_SOLVER_ROWS), matched by puzzle and state.
import json, os, sys
from collections import defaultdict

# bookkeeping: on the menu from the smallest windows (stage 0), within TIE of the menu's cheapest
TIE = float(os.environ.get("INSIGHT_TIE", 0.5))

def spread(ks, per):   # graph_policy.py's
    ks = list(ks)
    return ks[:: max(1, len(ks) // per)][:per] if per and len(ks) > per else ks

def prep(labels, out):
    with open(out, "w") as f:
        for l in open(labels):
            d = json.loads(l)
            if d.get("split") != "test": continue
            names = [m["name"] for m in d["structure"]["marks"]]
            known0 = {x.rsplit("=", 1)[0] if isinstance(x, str) else x[0] for x in d["initial"]}
            R = len(d["rounds"]); rnd = {}
            for ri, rd in enumerate(d["rounds"]):
                for (name, *_rest) in rd["facts"]:
                    if name not in rnd and name not in known0: rnd[name] = ri
            if not R or len(names) > 4000: continue
            ks = spread(range(R), 6)
            # each state's marks, as what's newly settled since the last state
            adds, last = [], 0
            for k in ks:
                adds.append(sorted(m for m, r in rnd.items() if last <= r < k)); last = k
            # the person's next 3 at each state: their order, the first 3 still open
            order = [m for m, _ in sorted(d.get("humanOrder") or [], key=lambda x: x[1])]
            nxt = [[m for m in order if rnd.get(m, R) >= k and m not in known0][:3] for k in ks]
            f.write(json.dumps({"name": d["name"], "genre": d["genre"], "solver": d.get("solver"), "ks": ks, "adds": adds, "next": nxt}) + "\n")

def score(menus, rows_file):
    rows = [json.loads(l) for l in open(rows_file)]
    by_state = {(r[6], r[7]): r for r in rows}
    # each state: is the person's very next move bookkeeping, and is every one of their next 3?
    tally = defaultdict(lambda: [0, 0, 0, 0])   # (kind) → states, net hits, nearness hits (states with one), nearness states
    per_type = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    share = defaultdict(lambda: [0, 0])
    for l in open(menus):
        m = json.loads(l)
        if "positions" not in m: continue
        for p in m["positions"]:
            r = by_state.get((m["name"], p["k"]))
            if r is None or not p["next"]: continue
            first = p["next"][0]
            cost = p["cost"].get(first)
            kind = "bookkeeping" if cost is not None and cost[1] == 0 and p["min"] is not None and cost[0] <= p["min"] + TIE else "insight"
            share[m["genre"]][0] += 1; share[m["genre"]][1] += kind == "insight"
            t = tally[kind]; t[0] += 1; t[1] += r[2]
            if r[4] == r[4]: t[2] += r[4]; t[3] += 1
            per_type[m["genre"]][kind][0] += 1; per_type[m["genre"]][kind][1] += r[2]
    for kind, (n, net, near, nn) in tally.items():
        print(f"{kind:<12} {n:>5} states  net {net / n:5.0%}  nearness {near / max(nn, 1):5.0%}")
    print("\nby type: insight share of states; net on bookkeeping / insight")
    for g in sorted(per_type):
        b, i = per_type[g]["bookkeeping"], per_type[g]["insight"]
        f = lambda x: f"{x[1] / x[0]:4.0%} ({x[0]})" if x[0] else "   - (0)"
        print(f"  {g:<16} insight {share[g][1] / share[g][0]:4.0%}   net {f(b)} / {f(i)}")

if __name__ == "__main__":
    {"prep": prep, "score": score}[sys.argv[1]](*sys.argv[2:])
