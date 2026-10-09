"""Look for bank questions in a video's auto transcript (the quiz master reads every question aloud).

Usage: python3 pipeline/tx_match.py transcript.json [--min 80] [--show]
transcript.json is either a list of [seconds, text] or {"segs": [[seconds, text], ...]}.
For every reviewed question in bank/master, the best partial match of its opening words against the transcript
is scored 0-100; a question counts as heard when the score reaches --min. Prints counts per match and stage."""
import glob, json, os, re, sys
from collections import Counter, defaultdict
from rapidfuzz import fuzz, process

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def norm(t):
    t = (t or '').lower().replace('₦', ' naira ').replace('%', ' percent ')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', t)).strip()

def load_tx(path):
    d = json.load(open(path))
    segs = d['segs'] if isinstance(d, dict) else d
    return segs

def windows(segs, size=160, step=40):
    text = ' '.join(norm(s[1]) for s in segs)
    starts = []; pos = 0; marks = []
    for s in segs:
        marks.append((pos, s[0])); pos += len(norm(s[1])) + 1
    out = []
    for i in range(0, max(1, len(text) - size + step), step):
        t = next((sec for p, sec in reversed(marks) if p <= i), 0)
        out.append((text[i:i + size], t))
    return out

def questions():
    qs = []
    for p in sorted(glob.glob(os.path.join(ROOT, 'bank/master/*.json'))):
        m = json.load(open(p)); code = os.path.basename(p)[3:-5]
        for q in m['questions'] + m.get('dropped', []):
            key = norm(q['q'])
            key = re.sub(r'^(which|what|who|how|find|calculate|if|the|a|an)\s+', '', key)   # skip a generic first word
            if len(key) < 25: continue
            qs.append({'match': code, 'stage': m['stage'], 'half': q['half'], 'id': q['id'], 'q': q['q'], 'key': key[:70]})
    return qs

def main():
    path = sys.argv[1]
    mn = int(sys.argv[sys.argv.index('--min') + 1]) if '--min' in sys.argv else 80
    segs = load_tx(path)
    W = windows(segs)
    qs = questions()
    S = process.cdist([q['key'] for q in qs], [w[0] for w in W], scorer=fuzz.partial_ratio, workers=-1)
    best = S.max(axis=1); arg = S.argmax(axis=1)
    by = defaultdict(lambda: [0, 0])
    hits = []
    for q, b, a in zip(qs, best, arg):
        by[q['match']][1] += 1
        if b >= mn: by[q['match']][0] += 1; hits.append((q, b, W[a][1]))
    print(f'{os.path.basename(path)}: {len(segs)} transcript lines; questions heard (score >= {mn}) per reviewed match:')
    for m, (h, n) in sorted(by.items()): print(f'  {m:6} {h:4} of {n}')
    if '--show' in sys.argv:
        for q, b, t in sorted(hits, key=lambda x: x[2]): print(f'  {int(t):5}s {b:5.1f} {q["match"]:5} {q["half"]} {q["q"][:90]}')
    if '--hist' in sys.argv:
        for m in sorted(by):
            vals = sorted(round(float(b)) for q, b in zip(qs, best) if q['match'] == m)
            print(m, Counter(v // 5 * 5 for v in vals))

if __name__ == '__main__':
    main()
