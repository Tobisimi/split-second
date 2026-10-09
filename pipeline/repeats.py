"""Find questions the show asked in more than one match.

Usage: python3 pipeline/repeats.py [--raw LABEL:STAGE:path.json ...] [--json out.json]
Reads every reviewed match in bank/master (cleaned text) and any raw OCR files given with --raw (a raw file
whose LABEL matches a reviewed match adds to it, e.g. the second part of a match that is not reviewed yet).

Two questions count as the SAME question when their normalised text is at least 90% similar and they contain
the same numbers (or the text is at least 96% similar, which allows for an OCR slip in a digit). Questions that
share the wording but not the numbers are counted as VARIANTS (same template, new numbers)."""
import glob, json, os, re, sys
from collections import defaultdict
from rapidfuzz import fuzz, process

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NAMES = {'fin': 'Final', 'sf1': 'SF1', 'sf2': 'SF2', 'third': 'Third place', 'qf1': 'QF1', 'qf2': 'QF2', 'qf3': 'QF3', 'qf4': 'QF4'}

def norm(t): return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', (t or '').lower())).strip()
def nums(t): return tuple(sorted(re.findall(r'\d+(?:\.\d+)?', (t or '').replace(',', ''))))

def load():
    items = []
    for p in sorted(glob.glob(os.path.join(ROOT, 'bank/master/*.json'))):
        m = json.load(open(p))
        code = os.path.basename(p)[3:-5]
        for q in m['questions'] + m.get('dropped', []):
            items.append({'match': code, 'stage': m['stage'], 'half': q['half'], 'quarter': q.get('quarter'),
                          'subject': q.get('subject'), 't': q['t'], 'q': q['q'], 'src': 'reviewed', 'id': q['id']})
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a != '--raw': continue
        label, stage, path = args[i + 1].split(':', 2)
        recs = json.load(open(path))
        for r in recs:
            t = r.get('q') or ''
            if len(norm(t)) < 20 or len(t.split()) < 4 or (r.get('qconf') or 0) < 55: continue
            items.append({'match': label, 'stage': stage, 'half': r['half'], 'quarter': None, 'subject': None,
                          't': int(r['t0']), 'q': t, 'src': 'raw', 'id': r['id']})
    return items

def main():
    items = load()
    texts = [norm(x['q'])[:200] for x in items]
    N = [nums(x['q']) for x in items]
    sim = process.cdist(texts, texts, scorer=fuzz.ratio, workers=-1)
    parent = list(range(len(items)))
    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    variants = defaultdict(set)
    n = len(items)
    for i in range(n):
        for j in range(i + 1, n):
            s = sim[i][j]
            if s < 75: continue
            # near-identical text with different numbers is only an OCR slip when one side is unreviewed OCR and
            # at most one number differs; otherwise it is the same template with new numbers (a variant)
            ocr = 'raw' in (items[i]['src'], items[j]['src'])
            slip = ocr and len(N[i]) == len(N[j]) and sum(a != b for a, b in zip(N[i], N[j])) <= 1
            same = (s >= 90 and N[i] == N[j]) or (s >= 96 and slip)
            if same: parent[find(i)] = find(j)
            elif items[i]['match'] != items[j]['match'] and N[i] != N[j]:
                variants[tuple(sorted((items[i]['match'], items[j]['match'])))].add(tuple(sorted((i, j))))
    clusters = defaultdict(list)
    for i in range(n): clusters[find(i)].append(i)
    # one entry per question per match (a match can show the same question twice)
    per_match = defaultdict(dict)          # match -> cluster -> first item
    for c, idx in clusters.items():
        for i in sorted(idx, key=lambda k: items[k]['t']):
            per_match[items[i]['match']].setdefault(c, i)
    matches = sorted(per_match, key=lambda m: ['qf1', 'qf2', 'qf3', 'qf4', 'sf1', 'sf2', 'third', 'fin'].index(m) if m in NAMES else 99)
    stage_of = {m: items[next(iter(per_match[m].values()))]['stage'] for m in matches}
    out = {'matches': {}, 'pairs': {}, 'variants': {}}
    print('Questions per match (unique), and how many were also asked in another match')
    for m in matches:
        cs = per_match[m]
        other = [c for c in cs if any(c in per_match[o] for o in matches if o != m)]
        same_stage = [c for c in cs if any(c in per_match[o] for o in matches if o != m and stage_of[o] == stage_of[m])]
        diff_stage = [c for c in cs if any(c in per_match[o] for o in matches if o != m and stage_of[o] != stage_of[m])]
        within = sum(1 for c in cs if sum(1 for i in clusters[c] if items[i]['match'] == m) > 1)
        halves = defaultdict(int)
        for c in other: halves[items[cs[c]]['half']] += 1
        out['matches'][m] = {'unique': len(cs), 'in_other': len(other), 'same_stage': len(same_stage), 'other_stage': len(diff_stage),
                             'asked_twice_in_match': within, 'repeat_by_half': dict(halves)}
        print(f"  {NAMES.get(m, m):12} {len(cs):4} unique | in another match {len(other):3} ({100*len(other)/max(1,len(cs)):.0f}%)"
              f" | same stage {len(same_stage):3} | other stage {len(diff_stage):3} | asked twice in the match {within}")
    print('\nShared questions between matches (QB = Quick Buzz, BM = Brain Match; order = share of the shared questions that came in the same order)')
    for a_i, a in enumerate(matches):
        for b in matches[a_i + 1:]:
            shared = [c for c in per_match[a] if c in per_match[b]]
            if not shared: continue
            kinds = defaultdict(int)
            for c in shared: kinds[f"{items[per_match[a][c]]['half']}->{items[per_match[b][c]]['half']}"] += 1
            # order: longest increasing subsequence of b-times when sorted by a-times
            seq = [items[per_match[b][c]]['t'] for c in sorted(shared, key=lambda c: items[per_match[a][c]]['t'])]
            tails = []
            import bisect
            for x in seq:
                k = bisect.bisect_left(tails, x)
                if k == len(tails): tails.append(x)
                else: tails[k] = x
            order = len(tails) / len(seq)
            var = len(variants.get(tuple(sorted((a, b))), ()))
            out['pairs'][f'{a}|{b}'] = {'shared': len(shared), 'kinds': dict(kinds), 'order': round(order, 2), 'variants': var}
            print(f"  {NAMES.get(a, a):11} & {NAMES.get(b, b):11} {len(shared):3} shared  {dict(kinds)}  order {order:.0%}  variants {var}")
    if '--json' in sys.argv:
        detail = []
        for c, idx in clusters.items():
            ms = sorted({items[i]['match'] for i in idx})
            if len(ms) < 2: continue
            detail.append({'matches': ms, 'q': items[idx[0]]['q'],
                           'where': [{'match': items[i]['match'], 'half': items[i]['half'], 't': items[i]['t'], 'id': items[i]['id']} for i in sorted(idx, key=lambda k: (items[k]['match'], items[k]['t']))]})
        out['clusters'] = detail
        json.dump(out, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1, ensure_ascii=False)

if __name__ == '__main__':
    main()
