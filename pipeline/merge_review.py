"""Apply review patches to processed records and write the match's master file (before solutions).
Usage: python3 merge_review.py <match_config.json>
Config: {"code": "fin", "video": "...", "match": "Final: FUTA v OAU", "stage": "final",
         "qb_top": "FUTA", "qb_bottom": "OAU", "bm_top": "...", "bm_bottom": "...",
         "cards": [[t, top, bottom], ...],            # end-of-quarter score cards (Quick Buzz)
         "parts": [["raw.json", "patch.json"], ...],
         "bm_subjects": {"1": "AM", ...},              # Brain Match quarter -> subject
         "out": "master/26-fin.json",
         "window": [t0, t1],                           # optional: only records with t0 in [t0, t1)
         "bm_left_row": 1}                             # optional: the left Brain Match panel scores on the bottom row
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

def quarters(recs, starts=None):
    """Number quarters per half by gaps of more than 60 s between questions, or by the config's
    "quarter_starts": {"QB": [t1, t2, t3, t4], "BM": [...]} when the breaks between quarters are short."""
    if starts:
        return {r['id']: max(1, sum(1 for s in starts.get(r['half'], [0]) if s <= r['t0'] + 1)) for r in recs}
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
    if cfg.get('window'):                     # a video holding two matches: keep this match's stretch only
        w0, w1 = cfg['window']; raws = [r for r in raws if w0 <= r['t0'] < w1]
    raws.sort(key=lambda r: r['t0'])
    qn = quarters(raws, cfg.get('quarter_starts'))
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
        player = r.get('player') or ''
        if half == 'BM':
            # Brain Match: the panel side shows whose turn it is. Usually the left panel's player scores on the top row
            # and the right panel's on the bottom row; "bm_left_row": 1 in the config marks a video where it is the
            # other way round. A right answer adds the ladder value; a miss adds nothing and resets the ladder.
            side = 0 if r.get('side') == 'BML' else 1
            row = 1 - side if cfg.get('bm_left_row') == 1 else side
            school = top if row == 0 else bottom
            names = cfg.get('bm_players', {}).get(str(qn[r['id']]))
            player = names[side] if names else ''
            if d is not None and abs(d[0]) <= 6 and abs(d[1]) <= 6 and min(d) >= 0:
                result = 'right' if d[row] > 0 else 'wrong'
        elif d is not None:
            if d[0] == 0 and d[1] == 0: result = 'none'
            else:
                side = 0 if d[0] != 0 else 1
                result = 'right' if d[side] > 0 else 'wrong'
                if not school: school = top if side == 0 else bottom
        if 'r' in p: result = None if p['r'] == '?' else p['r']
        if school and school not in (top, bottom):     # a name label cut short on screen, e.g. YABATEC
            school = next((s for s in (top, bottom) if s and s.startswith(school)), school)
        if 'sch' in p: school = p['sch']
        if 'pl' in p: player = p['pl']
        if result in ('none', None) and half == 'QB': player, school = ('', '') if result == 'none' else (player, school)
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
