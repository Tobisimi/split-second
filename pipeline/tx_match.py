"""Look for known questions in videos' auto transcripts (the quiz master reads every question aloud).

Usage: python3 pipeline/tx_match.py TX.json [TX.json ...] [--raw LABEL:STAGE:path.json ...] [--min 90] [--show] [--json out.json]
A transcript file is a list of [seconds, text] or {"video", "title", "segs": [[seconds, text], ...]}.
Known questions are every reviewed question in bank/master plus any raw OCR files given with --raw.
Each question's opening words are matched (partial match, 0 to 100) against the transcript; a question counts
as heard at --min or above. Calibration on the 2026 third-place video: at 90, about 30% of that match's own
questions are heard and about 0.2% of other matches' questions (false hits on look-alike wording)."""
import glob, json, os, re, sys
from collections import defaultdict
from rapidfuzz import fuzz, process

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def norm(t):
    t = (t or '').lower().replace('₦', ' naira ').replace('%', ' percent ')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', t)).strip()

def windows(segs, size=160, step=40):
    text, marks, pos = [], [], 0
    for s in segs:
        n = norm(s[1]); marks.append((pos, s[0])); text.append(n); pos += len(n) + 1
    text = ' '.join(text)
    out, k = [], 0
    for i in range(0, max(1, len(text) - size + step), step):
        while k + 1 < len(marks) and marks[k + 1][0] <= i: k += 1
        out.append((text[i:i + size], marks[k][1] if marks else 0))
    return out

def key_of(q):
    k = re.sub(r'^(which|what|who|how|find|calculate|if|the|a|an)\s+', '', norm(q))
    return k[:70] if len(k) >= 25 else None

def questions(raws):
    qs = []
    for p in sorted(glob.glob(os.path.join(ROOT, 'bank/master/*.json'))):
        m = json.load(open(p)); code = os.path.basename(p)[3:-5]
        for q in m['questions'] + m.get('dropped', []):
            k = key_of(q['q'])
            if k: qs.append({'match': code, 'stage': m['stage'], 'half': q['half'], 'id': q['id'], 'q': q['q'], 'key': k})
    for label, stage, path in raws:
        for r in json.load(open(path)):
            if (r.get('qconf') or 0) < 55: continue
            k = key_of(r.get('q'))
            if k: qs.append({'match': label, 'stage': stage, 'half': r['half'], 'id': r['id'], 'q': r['q'], 'key': k})
    return qs

def main():
    a = sys.argv[1:]
    mn = int(a[a.index('--min') + 1]) if '--min' in a else 90
    raws = [tuple(a[i + 1].split(':', 2)) for i, x in enumerate(a) if x == '--raw']
    skip = {i + 1 for i, x in enumerate(a) if x in ('--raw', '--min', '--json')}
    txs = [x for i, x in enumerate(a) if not x.startswith('--') and i not in skip]
    qs = questions(raws)
    keys = [q['key'] for q in qs]
    report = {}
    for path in txs:
        d = json.load(open(path)); segs = d['segs'] if isinstance(d, dict) else d
        name = (d.get('video') if isinstance(d, dict) else None) or os.path.basename(path)
        if not segs: print(f'{name}: no transcript'); continue
        W = windows(segs)
        S = process.cdist(keys, [w[0] for w in W], scorer=fuzz.partial_ratio, workers=-1)
        best, arg = S.max(axis=1), S.argmax(axis=1)
        by = defaultdict(lambda: [0, 0]); hits = []
        for q, b, i in zip(qs, best, arg):
            by[q['match']][1] += 1
            if b >= mn: by[q['match']][0] += 1; hits.append({'t': int(W[i][1]), 'score': round(float(b), 1), **{k: q[k] for k in ('match', 'half', 'id', 'q')}})
        title = d.get('title', '') if isinstance(d, dict) else ''
        print(f'{name} {title[:60]} ({len(segs)} lines): ' + ', '.join(f'{m} {h}/{n}' for m, (h, n) in sorted(by.items()) if h))
        if '--show' in a:
            for h in sorted(hits, key=lambda h: h['t']): print(f"   {h['t']:5}s {h['score']:5.1f} {h['match']:6} {h['half']} {h['q'][:90]}")
        report[name] = {'title': title, 'lines': len(segs), 'heard': {m: v for m, v in by.items()}, 'hits': hits}
    if '--json' in a: json.dump(report, open(a[a.index('--json') + 1], 'w'), indent=1, ensure_ascii=False)

if __name__ == '__main__':
    main()
