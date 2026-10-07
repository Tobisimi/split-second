"""Apply review patches to processed records and write the match's master file (before solutions).
Usage: python3 merge_review.py <match_config.json>
Config: {"code": "fin", "video": "...", "match": "Final: FUTA v OAU", "stage": "final",
         "qb_top": "FUTA", "qb_bottom": "OAU", "bm_top": "...", "bm_bottom": "...",
         "cards": [[t, top, bottom], ...],            # end-of-quarter score cards (Quick Buzz)
         "parts": [["raw.json", "patch.json"], ...],
         "bm_subjects": {"1": "AM", ...},              # Brain Match quarter -> subject
         "out": "master/26-fin.json"}
Patch keys per record id: s subject, tp topic, q/o/k corrected question/options/key, a answer (when it is not
the key), t tag (c confirmed, w worked out, d disputed), n note, drop (reason; kept out of the bank), skip."""
import json, re, sys, difflib

def norm(s): return re.sub(r'[^a-z0-9.%/<>-]', '', (s or '').lower())

def snap(key, options):
    if not key or not options: return key
    if key in options: return key
    best = max(options, key=lambda o: difflib.SequenceMatcher(None, norm(o), norm(key)).ratio())
    return best if difflib.SequenceMatcher(None, norm(best), norm(key)).ratio() >= 0.6 else key

def autofix(q):
    q = re.sub(r'\blf\b', 'If', q)
    q = re.sub(r'\bina\b', 'in a', q)
    q = re.sub(r'\s+([?.,])', r'\1', q)
    return q.strip()

def quarters(recs):
    """Number quarters per half by gaps of more than 60 s between questions."""
    out, last, n = {}, {}, {}
    for r in sorted(recs, key=lambda r: r['t0']):
        h = r['half']
        if h not in last or r['t0'] - last[h] > 60: n[h] = n.get(h, 0) + 1
        last[h] = r['t1']; out[r['id']] = n[h]
    return out

def main(cfg_path):
    cfg = json.load(open(cfg_path))
    raws, patch = [], {}
    for raw, pf in cfg['parts']:
        raws += json.load(open(raw)); patch.update(json.load(open(pf)))
    raws.sort(key=lambda r: r['t0'])
    qn = quarters(raws)
    cards = sorted(cfg.get('cards', []))
    seq = {'QB': 0, 'BM': 0}; master, dropped, missing = [], [], []
    for r in raws:
        p = patch.get(r['id'])
        if p is None: missing.append(r['id']); continue
        if p.get('skip'): continue
        half = r['half']
        options = p.get('o', r.get('options'))
        key = snap(p.get('k', r.get('key', '')), options)
        answer = p.get('a', key)
        tag = {'c': 'confirmed', 'w': 'worked_out', 'd': 'disputed'}.get(p.get('t'), 'confirmed' if key else 'worked_out')
        # who answered and how it went
        top, bottom = (cfg['qb_top'], cfg['qb_bottom']) if half == 'QB' else (cfg.get('bm_top'), cfg.get('bm_bottom'))
        d = r.get('delta'); result = None; school = r.get('school') or ''
        if d is not None and half == 'QB' and (abs(d[0]) > 10 or abs(d[1]) > 10):
            card = next((c for c in cards if c[0] > r['t1']), None)   # last question of a quarter: use the score card
            d = [card[1] - r['before'][0], card[2] - r['before'][1]] if card and None not in r['before'] else None
        if d is not None:
            if d[0] == 0 and d[1] == 0: result = 'none'
            else:
                side = 0 if d[0] != 0 else 1
                result = 'right' if d[side] > 0 else 'wrong'
                if not school: school = top if side == 0 else bottom
        player = r.get('player') or ''
        if result == 'none': player, school = '', ''
        rec = {
            'video': cfg['video'], 't': int(r['t0']), 'match': cfg['match'], 'stage': cfg['stage'], 'half': half,
            'quarter': qn[r['id']], 'subject': p.get('s'), 'topic': p.get('tp', ''),
            'q': autofix(p.get('q', r['q'])), 'options': options, 'answer': answer, 'tag': tag,
            'showKey': key if (tag == 'disputed' or (key and answer != key)) else '',
            'note': p.get('n', ''), 'result': result, 'player': player, 'school': school,
            'raw': r['id'],
        }
        if half == 'BM' and cfg.get('bm_subjects'): rec['subject'] = p.get('s') or cfg['bm_subjects'].get(str(rec['quarter']))
        rec['id'] = f"26-{cfg['code']}-{half.lower()}-{int(r['t0']):04d}"   # time-based, so ids stay stable
        if p.get('drop'): rec['dropReason'] = p['drop']; dropped.append(rec); continue
        master.append(rec)
    if missing: print('records without a review entry:', missing, file=sys.stderr)
    json.dump({'match': cfg['match'], 'video': cfg['video'], 'stage': cfg['stage'], 'questions': master, 'dropped': dropped},
              open(cfg['out'], 'w'), indent=1, ensure_ascii=False)
    print(f"{cfg['out']}: {len(master)} questions, {len(dropped)} dropped", file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1])
