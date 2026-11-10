"""Ask a Claude model for each item's key ideas at three levels, through the Message Batches API.

    python3 -I puzzles/keyideas/label.py submit <items.jsonl> <run dir> [--model claude-haiku-5-5] [--ids file]
    python3 -I puzzles/keyideas/label.py collect <run dir>        # writes <run dir>/labels.jsonl

Reads the API key from INKIT_ANTHROPIC_KEY (ANTHROPIC_API_KEY belongs to Claude Code's own sign-in).
Each label: ideas = 1-3 of {family (families.py), mechanism (one domain-free sentence), step
(the concrete move in the item's own terms), role (main | supporting)}.
"""
import argparse, json, os, sys
import anthropic
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from families import FAMILIES

SYSTEM = """You read one solved problem, puzzle or chess position and name the key ideas that solve it.

Give 1 to 3 ideas, most important first. An idea is the insight that unlocks the solution, not routine work: \
skip ideas a beginner would do without thinking. For each idea give:
- family: the one technique family it belongs to, from the list below.
- mechanism: ONE sentence, at most 25 words, stating the logical structure of the idea with NO domain words. \
Do not mention numbers, digits, shapes, cells, grids, squares, boards, pieces, chess, moves, equations or any \
object from the problem. Write it so the same sentence could describe a math proof, a grid logic puzzle, or a \
chess combination that rests on the same idea. Good: "Two demands fall on one resource that can meet only one, \
so the other goes unmet." Bad: "The knight forks the king and rook."
- step: one sentence saying where the idea is used in this item, in its own terms.
- role: "main" for the idea the solution hinges on (exactly one), "supporting" for the others.

Technique families:
""" + '\n'.join(f'- {k}: {v}' for k, v in FAMILIES.items())

SCHEMA = {
    'type': 'object',
    'properties': {'ideas': {'type': 'array', 'minItems': 1, 'items': {
        'type': 'object',
        'properties': {'family': {'type': 'string', 'enum': list(FAMILIES)},
                       'mechanism': {'type': 'string'}, 'step': {'type': 'string'},
                       'role': {'type': 'string', 'enum': ['main', 'supporting']}},
        'required': ['family', 'mechanism', 'step', 'role'], 'additionalProperties': False}}},
    'required': ['ideas'], 'additionalProperties': False,
}

def client(): return anthropic.Anthropic(api_key=os.environ['INKIT_ANTHROPIC_KEY'])

def params(model, item):
    return {
        'model': model, 'max_tokens': 8000,
        'system': [{'type': 'text', 'text': SYSTEM, 'cache_control': {'type': 'ephemeral'}}],
        'output_config': {'effort': 'medium', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
        'messages': [{'role': 'user', 'content': item['text']}],
    }

def submit(o):
    items = [json.loads(l) for l in open(o.items)]
    if o.ids:
        keep = set(open(o.ids).read().split()); items = [i for i in items if i['id'] in keep]
    os.makedirs(o.run, exist_ok=True)
    cid = {f'k{n}': it['id'] for n, it in enumerate(items)}  # custom_id allows only [A-Za-z0-9_-]
    b = client().messages.batches.create(requests=[{'custom_id': k, 'params': params(o.model, it)}
                                                   for k, it in zip(cid, items)])
    json.dump({'batch': b.id, 'model': o.model, 'ids': cid}, open(f'{o.run}/batch.json', 'w'))
    print(b.id, len(items), 'requests')

def collect(o):
    meta = json.load(open(f'{o.run}/batch.json')); c = client()
    b = c.messages.batches.retrieve(meta['batch'])
    print(b.processing_status, b.request_counts)
    if b.processing_status != 'ended': sys.exit(2)
    n_in = n_out = n_cache = 0; bad = 0
    with open(f'{o.run}/labels.jsonl', 'w') as f:
        for r in c.messages.batches.results(meta['batch']):
            iid = meta['ids'][r.custom_id]
            if r.result.type != 'succeeded':
                bad += 1; f.write(json.dumps({'id': iid, 'error': r.result.type}) + '\n'); continue
            m = r.result.message; u = m.usage
            n_in += u.input_tokens; n_out += u.output_tokens; n_cache += u.cache_read_input_tokens or 0
            if m.stop_reason != 'end_turn':
                bad += 1; f.write(json.dumps({'id': iid, 'error': m.stop_reason}) + '\n'); continue
            text = next(x.text for x in m.content if x.type == 'text')
            f.write(json.dumps({'id': iid, **json.loads(text)}, ensure_ascii=False) + '\n')
    print(f'failed {bad}; tokens in {n_in} (+{n_cache} cached) out {n_out}')

if __name__ == '__main__':
    a = argparse.ArgumentParser(); s = a.add_subparsers(dest='cmd', required=True)
    p = s.add_parser('submit'); p.add_argument('items'); p.add_argument('run')
    p.add_argument('--model', default='claude-haiku-5-5'); p.add_argument('--ids')
    p = s.add_parser('collect'); p.add_argument('run')
    o = a.parse_args(); {'submit': submit, 'collect': collect}[o.cmd](o)
