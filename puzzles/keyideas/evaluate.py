"""Embed the pilot's key ideas and test whether they bring the domains together.

    python3 -I puzzles/keyideas/evaluate.py <items.jsonl> <labels.jsonl> <out dir> [--compare other-labels.jsonl]

Embeds (bge-small, as the math bank) three texts per item: the problem as given (text), the
main idea's concrete step (step), and the main idea's domain-free sentence (mechanism). For each
it reports:
  mixing     share of an item's 10 nearest neighbours that come from another domain, over the share
             expected if neighbours ignored domain (1.0 = domains fully mixed, 0 = never mixed)
  cross-fam  how often an item's nearest neighbour from another domain has the same main family,
             over the rate expected by chance
  chess      how often a labelled family matches the family of a Lichess theme the labeller never saw
Writes report.md and pairs.jsonl (the closest cross-domain pairs, for reading by eye).
"""
import argparse, collections, json, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mathbank'))

THEME_FAMILY = {  # Lichess theme -> our family (only themes with a clear match)
    'fork': 'double-threat', 'doubleCheck': 'double-threat',
    'pin': 'pin-skewer', 'skewer': 'pin-skewer', 'xRayAttack': 'pin-skewer',
    'deflection': 'deflection-decoy', 'attraction': 'deflection-decoy',
    'discoveredAttack': 'discovery', 'discoveredCheck': 'discovery',
    'interference': 'interference-clearance', 'clearance': 'interference-clearance',
    'zugzwang': 'tempo-zugzwang', 'intermezzo': 'tempo-zugzwang',
    'promotion': 'promotion-race', 'advancedPawn': 'promotion-race', 'underPromotion': 'promotion-race',
    'sacrifice': 'sacrifice', 'capturingDefender': 'overload', 'trappedPiece': 'confinement',
    'backRankMate': 'confinement', 'smotheredMate': 'confinement', 'arabianMate': 'confinement',
    'anastasiaMate': 'confinement', 'bodenMate': 'confinement', 'hookMate': 'confinement',
    'dovetailMate': 'confinement', 'doubleBishopMate': 'confinement', 'operaMate': 'confinement',
    'pillsburysMate': 'confinement', 'morphysMate': 'confinement', 'balestraMate': 'confinement',
    'blindSwineMate': 'confinement', 'cornerMate': 'confinement', 'killBoxMate': 'confinement',
    'vukovicMate': 'confinement', 'triangleMate': 'confinement', 'swallowstailMate': 'confinement',
    'epauletteMate': 'confinement', 'defensiveMove': 'defensive-resource', 'equality': 'defensive-resource',
}

def embed_all(texts, ids, cache):
    # cached by item id, so a rerun (or the problem text, which needs no labels) embeds only what's new
    have = dict(np.load(cache, allow_pickle=True).item()) if os.path.exists(cache) else {}
    todo = [n for n, i in enumerate(ids) if i not in have]
    if todo:
        from embed import model, embed
        for n, v in zip(todo, embed(model(4), [texts[n] for n in todo])): have[ids[n]] = v
        np.save(cache, have, allow_pickle=True)
    return np.stack([have[i] for i in ids]).astype(np.float32)

def main():
    a = argparse.ArgumentParser(); a.add_argument('items'); a.add_argument('labels'); a.add_argument('out')
    a.add_argument('--compare'); o = a.parse_args()
    os.makedirs(o.out, exist_ok=True)
    items = {i['id']: i for i in map(json.loads, open(o.items))}
    labels = [l for l in map(json.loads, open(o.labels)) if 'ideas' in l and l['ideas']]
    for l in labels: l['main'] = next((x for x in l['ideas'] if x['role'] == 'main'), l['ideas'][0])
    ids = [l['id'] for l in labels]; dom = np.array([items[i]['domain'] for i in ids])
    group = np.where(dom == 'logic', 'grid', dom)  # text logic puzzles count with grid puzzles as "puzzles"
    fam = np.array([l['main']['family'] for l in labels])
    rep = [f"# Key-idea pilot\n\n{len(labels)} labelled items: " +
           ', '.join(f'{k} {v}' for k, v in collections.Counter(dom).items()) + '\n']
    rep.append('## Families\n\nMain-idea family by domain (top 8):\n')
    for d in ('math', 'logic', 'grid', 'chess'):
        c = collections.Counter(fam[dom == d]); n = (dom == d).sum()
        rep.append(f"- **{d}**: " + ', '.join(f'{k} {v / n:.0%}' for k, v in c.most_common(8)))
    texts = {'text': [items[i]['text'] for i in ids], 'step': [l['main']['step'] for l in labels],
             'mechanism': [l['main']['mechanism'] for l in labels]}
    V = {k: embed_all(t, ids, f'{o.out}/vec-{k}.npy') for k, t in texts.items()}
    groups = sorted(set(group)); share = {g: (group == g).mean() for g in groups}
    p_fam = collections.Counter(fam)
    rep.append('\n## Do the domains mix?\n\n| vectors | mixing | cross-fam (x chance) |\n|---|---|---|')
    pairs = []
    for k, X in V.items():
        S = X @ X.T; np.fill_diagonal(S, -1)
        nn = np.argsort(-S, axis=1)[:, :10]
        other = (group[nn] != group[:, None]).mean(1)
        expect = np.array([1 - share[g] for g in group])
        mixing = (other / expect).mean()
        hit = chance = 0.0
        for i in range(len(ids)):
            mask = group != group[i]; j = np.flatnonzero(mask)[np.argmax(S[i, mask])]
            hit += fam[j] == fam[i]
            fo = collections.Counter(fam[mask]); chance += fo[fam[i]] / mask.sum()
            if k == 'mechanism': pairs.append((float(S[i, j]), ids[i], ids[j]))
        rep.append(f'| {k} | {mixing:.2f} | {hit / len(ids):.1%} vs {chance / len(ids):.1%} ({hit / max(chance, 1e-9):.1f}x) |')
    # chess families against Lichess themes the labeller never saw
    ok = n = 0; conf = collections.Counter()
    for l in labels:
        it = items[l['id']]
        if it['domain'] != 'chess': continue
        want = {THEME_FAMILY[t] for t in it['truth']['themes'] if t in THEME_FAMILY}
        if not want: continue
        got = {x['family'] for x in l['ideas']}; n += 1; ok += bool(want & got)
        if l['main']['family'] not in want: conf[(sorted(want)[0], l['main']['family'])] += 1
    rep.append(f'\n## Chess families against Lichess themes\n\n{ok}/{n} = {ok / max(n, 1):.0%} of puzzles with a mapped '
               f'theme have it among their labelled families. Commonest misses (theme family -> main label): ' +
               ', '.join(f'{a}->{b} {c}' for (a, b), c in conf.most_common(6)))
    if o.compare:
        other = {l['id']: l for l in map(json.loads, open(o.compare)) if l.get('ideas')}
        both = [l for l in labels if l['id'] in other]
        same = sum(l['main']['family'] == next((x for x in other[l['id']]['ideas'] if x['role'] == 'main'), other[l['id']]['ideas'][0])['family'] for l in both)
        anyf = sum(bool({x['family'] for x in l['ideas']} & {x['family'] for x in other[l['id']]['ideas']}) for l in both)
        rep.append(f'\n## Agreement with the other labeller\n\n{len(both)} items: same main family {same / len(both):.0%}, '
                   f'at least one family shared {anyf / len(both):.0%}.')
    pairs.sort(reverse=True); seen = set()
    with open(f'{o.out}/pairs.jsonl', 'w') as f:
        for s, i, j in pairs:
            key = tuple(sorted((i, j)))
            if key in seen: continue
            seen.add(key)
            li = next(l for l in labels if l['id'] == i); lj = next(l for l in labels if l['id'] == j)
            f.write(json.dumps({'sim': round(s, 3), 'a': i, 'b': j, 'a_mech': li['main']['mechanism'], 'b_mech': lj['main']['mechanism'],
                                'a_step': li['main']['step'], 'b_step': lj['main']['step'], 'a_fam': li['main']['family'], 'b_fam': lj['main']['family']}) + '\n')
    open(f'{o.out}/report.md', 'w').write('\n'.join(rep) + '\n'); print('\n'.join(rep))

if __name__ == '__main__':
    main()
