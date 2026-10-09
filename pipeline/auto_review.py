"""Pre-fill review entries for questions the show already asked in a match that has been reviewed.
Usage: python3 auto_review.py bank/raw/<new>.json > draft.json
Prints a JSON object: {"auto": {raw id: patch}, "todo": [raw ids that still need a human look],
"check": [auto ids whose options were read here for the first time, to be cleaned by hand]}.

A new record is matched to a reviewed question when the question text matches (after removing punctuation and
case) and every number in it is the same, and the options match when both have them. The match copies the
subject, topic, cleaned text, options and notes. The answer still comes from this match's own green bar; if
that differs from the reviewed answer, the record goes to the to-do list instead."""
import difflib, glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def norm(t): return re.sub(r'[^a-z0-9]', '', (t or '').lower())
def nums(t): return sorted(re.findall(r'\d+(?:\.\d+)?', (t or '').replace(',', '')))

def load_reviewed(skip_prefix=None):
    """(normalised text, numbers, options, master question) for every reviewed question, leaving out the match
    being reviewed (its raw ids start with skip_prefix)."""
    out = []
    raw_by_id = {}
    for p in glob.glob(os.path.join(ROOT, 'bank/raw/*.json')):
        try: recs = json.load(open(p))
        except ValueError: continue                  # still being written
        for r in recs: raw_by_id[r['id']] = r
    for p in glob.glob(os.path.join(ROOT, 'bank/master/*.json')):
        m = json.load(open(p))
        for q in m['questions'] + m.get('dropped', []):
            if skip_prefix and (q.get('raw') or '').startswith(skip_prefix + '-'): continue
            texts = {q['q']}
            r = raw_by_id.get(q.get('raw'))
            if r: texts.add(r['q'])
            for t in texts:
                out.append((norm(t), nums(q['q']), [norm(o) for o in (q.get('options') or [])], q))
    return out

def snap(key, options):
    """The option the key matches. Decimal points, %, / and signs count here: 13.3 and 133 are different answers."""
    if not key or not options: return key
    kn = lambda t: re.sub(r'[^a-z0-9.%/<>-]', '', (t or '').lower().replace('−', '-'))
    for o in options:
        if kn(o) == kn(key): return o
    best = max(options, key=lambda o: difflib.SequenceMatcher(None, kn(o), kn(key)).ratio())
    return best if difflib.SequenceMatcher(None, kn(best), kn(key)).ratio() >= 0.6 else key

def main(raw_path):
    recs = json.load(open(raw_path))
    prefixes = {r['id'].split('-')[0] for r in recs}
    reviewed = [x for pf in [None] for x in load_reviewed()]
    reviewed = [x for x in reviewed if not any((x[3].get('raw') or '').startswith(p + '-') for p in prefixes)]
    by_prefix = {}
    for item in reviewed: by_prefix.setdefault(item[0][:12], []).append(item)
    auto, todo, check = {}, [], []
    for r in recs:
        k = norm(r['q'])
        cands = by_prefix.get(k[:12], [])
        best, score = None, 0
        for item in cands:
            s = difflib.SequenceMatcher(None, item[0][:140], k[:140]).ratio()
            if s > score: best, score = item, s
        if not best or score < 0.9:
            todo.append(r['id']); continue
        _, qn, qo, mq = best
        if nums(r['q']) != qn and nums(mq['q']) != nums(r['q']):
            todo.append(r['id']); continue
        ro = [norm(o) for o in (r.get('options') or [])]
        if ro and qo and sorted(ro) != sorted(qo) and difflib.SequenceMatcher(None, ''.join(sorted(ro)), ''.join(sorted(qo))).ratio() < 0.8:
            todo.append(r['id']); continue
        opts = mq.get('options')
        key = snap(r.get('key') or '', opts) if opts else (r.get('key') or '')
        expected = mq.get('showKey') or mq['answer']
        p = {'s': mq['subject'], 'tp': mq.get('topic', ''), 'q': mq['q'], 'auto': mq['id']}
        p['o'] = opts or None          # the reviewed copy's options; an options line read here may be left over from the previous question
        if not opts and r.get('options'):
            # this time the show gave options the reviewed copy didn't have: keep this match's (OCR) options and
            # list the record under "check" so a person can clean them
            p['o'] = r['options']
        if mq.get('note'): p['n'] = mq['note']
        if mq['tag'] == 'disputed': p['a'] = mq['answer']; p['t'] = 'd'
        if not key:
            p['a'] = mq['answer']; p['t'] = 'w' if mq['tag'] == 'worked_out' else 'c'
            if mq['subject'] == 'GK' and mq['tag'] == 'worked_out': p['drop'] = 'answer not confirmed'
            if mq['tag'] == 'confirmed': p['n'] = (p.get('n', '') + ' Confirmed when the show used this question in another match.').strip()
        elif norm(key) != norm(expected) and norm(key) != norm(mq['answer']):
            todo.append(r['id']); continue
        else:
            p['k'] = expected if opts is None else key
        auto[r['id']] = p
        if not opts and r.get('options'): check.append(r['id'])
    json.dump({'auto': auto, 'todo': todo, 'check': check}, sys.stdout, indent=0, ensure_ascii=False)
    print(f"\n{len(auto)} matched ({len(check)} with new options to check), {len(todo)} to review", file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1])
