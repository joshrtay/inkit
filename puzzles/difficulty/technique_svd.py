# The periodic table from data: a matrix of types × techniques (each type's share of steps per
# signature, from techniques-table.ts → references/ml/steps.jsonl), factored by SVD. The leading
# factors are the techniques that go together across types; the types' coordinates on them place
# alike types near each other. Prints each factor's heaviest techniques and types, and each type's
# nearest types by cosine on the leading factors.
#
#   references/ml/.venv/bin/python puzzles/difficulty/technique_svd.py [factors] [level: sig | family]
import json, os, sys
from collections import Counter, defaultdict
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
K = int(sys.argv[1]) if len(sys.argv) > 1 else 6
level = sys.argv[2] if len(sys.argv) > 2 else "sig"

def coarse(sig):   # the kinds that take part, each once (signatures.ts coarse)
    return " ".join(sorted(set(sig.split(" ")))) if sig else "cell-only"

counts = defaultdict(Counter)
for line in open(os.path.join(HERE, "../../references/ml/steps.jsonl")):
    if not line.strip(): continue
    s = json.loads(line)
    counts[s["genre"]][coarse(s["sig"]) if level == "sig" else s.get("shapeText") or "cell-only"] += 1
types = sorted(t for t in counts if sum(counts[t].values()) >= 30)
tech_total = Counter()
for t in types: tech_total.update(counts[t])
techs = [k for k, v in tech_total.items() if v >= 10 and sum(counts[t][k] > 0 for t in types) >= 1]
print(f"{len(types)} types × {len(techs)} techniques ({level})")

# each type's share of its steps; square root so one huge technique doesn't drown the rest
A = np.array([[counts[t][k] for k in techs] for t in types], dtype=float)
A = np.sqrt(A / A.sum(1, keepdims=True))
U, S, Vt = np.linalg.svd(A, full_matrices=False)
var = S ** 2 / (S ** 2).sum()
print("share of the matrix in the first factors: " + ", ".join(f"{v:.0%}" for v in var[:K]) + f" (together {var[:K].sum():.0%})\n")
for f in range(K):
    sign = 1 if Vt[f][np.argmax(np.abs(Vt[f]))] > 0 else -1   # orient each factor by its heaviest technique
    v, u = sign * Vt[f], sign * U[:, f]
    top = np.argsort(-v)[:4]; tt = np.argsort(-u)[:6]
    print(f"factor {f + 1}: " + ", ".join(f"{techs[i]} {v[i]:+.2f}" for i in top))
    print("   types: " + ", ".join(f"{types[i]} {u[i]:+.2f}" for i in tt))
# nearest types on the leading factors
X = U[:, :K] * S[:K]
Xn = X / np.linalg.norm(X, axis=1, keepdims=True)
C = Xn @ Xn.T; np.fill_diagonal(C, -1)
print("\nnearest types:")
for i, t in enumerate(types):
    nn = np.argsort(-C[i])[:3]
    print(f"  {t}: " + ", ".join(f"{types[j]} {C[i, j]:.2f}" for j in nn))
