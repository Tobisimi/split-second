"""Build the question bank from the reviewed master files.

Inputs
  bank/master/*.json      one file per match: {"match", "video", "stage", "questions": [...], "dropped": [...]}
  bank/solutions/*.json   {question id: {"solution", "trick", "accept", "check", "computed", "comment"}}
Outputs
  src/data/questions.json the app's bank
  bank/csv/<AM|DA|VR|GK>_level<1|2|3>.csv, bank/csv/all_questions.csv, bank/csv/dropped.csv
  bank/SUMMARY.md         counts per subject and level, and what the tags mean

Rules
  Level comes from the stage: group stage 1, quarter-finals 2, semi-finals, third place and final 3.
  General Knowledge questions whose answer the show never confirmed are left out (they are in dropped.csv).
  AM and DA carry a full solution and a speed trick; VR carries a short note where one helps; GK the answer only.
"""
import csv, glob, json, os, re, sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVEL = {'group': 1, 'qf': 2, 'sf': 3, 'third': 3, 'final': 3}
STAGE_ORDER = {'group': 0, 'qf': 1, 'third': 2, 'sf': 3, 'final': 4}
STAGE_LABEL = {'group': 'Group stage', 'qf': 'Quarter-final', 'sf': 'Semi-final', 'third': 'Third place', 'final': 'Final'}

def _norm(t): return re.sub(r'[^a-z0-9]', '', (t or '').lower())

def dedup_keys(qs):
    """One key per question: the text plus the options. The show sometimes asked a question with options in one match
    and without them in another; a copy without options joins the copies that had options when there is only one set
    of options for that text (a stem like "Select the word that is spelled incorrectly" with several sets stays apart)."""
    text = lambda q: _norm(q['q'])[:160]
    opts = lambda q: '|'.join(sorted(_norm(o) for o in (q.get('options') or [])))
    sets = defaultdict(set)
    for q in qs:
        if q.get('options'): sets[text(q)].add(opts(q))
    keys = {}
    for q in qs:
        own = opts(q)
        if not own and len(sets[text(q)]) == 1: own = next(iter(sets[text(q)]))
        keys[q['id']] = text(q) + '|' + own
    return keys
STATUS = {'confirmed': 'Confirmed by the show', 'disputed': "Show's answer looks wrong", 'worked_out': 'Not confirmed (worked out)'}
SUBJECTS = ['AM', 'DA', 'VR', 'GK']

def load(pattern):
    out = []
    for p in sorted(glob.glob(os.path.join(ROOT, pattern))): out.append((p, json.load(open(p))))
    return out

def plain(s):
    """LaTeX-free text for the CSV."""
    s = re.sub(r'\\\(|\\\)', '', s or '')
    s = re.sub(r'\\frac\{([^{}]*)\}\{([^{}]*)\}', r'(\1)/(\2)', s)
    s = re.sub(r'\\sqrt\{([^{}]*)\}', r'√(\1)', s)
    s = s.replace('\\times', '×').replace('\\cdot', '·').replace('\\pi', 'π').replace('\\le', '≤').replace('\\ge', '≥')
    return re.sub(r'\\([a-zA-Z]+)', r'\1', s)

def on_show(q):
    r = q.get('result')
    if not r: return ''
    if r == 'none': return 'nobody answered'
    who = (q.get('player') or '') + (f" ({q['school']})" if q.get('school') else '')
    return f"{who.strip() or 'contestant'} {'right' if r == 'right' else ('missed' if q.get('half') == 'BM' else 'wrong')}"

def main():
    sols = {}
    for _, d in load('bank/solutions/*.json'): sols.update(d)
    bank, dropped, problems = [], [], []
    # The show reuses questions across matches. Keep one copy (from the latest stage), note where else it was asked,
    # and let a copy borrow the solution written for any of its twins.
    allq = [(m, q) for _, m in load('bank/master/*.json') for q in m['questions']]
    # at the same stage, keep a copy whose answer the show confirmed, and then one that came with options
    TAG_RANK = {'confirmed': 0, 'disputed': 0, 'worked_out': 1}
    allq.sort(key=lambda mq: (-STAGE_ORDER[mq[1]['stage']], TAG_RANK.get(mq[1]['tag'], 1), 0 if mq[1].get('options') else 1,
                              mq[1]['video'], mq[1]['t']))
    keys = dedup_keys([q for _, q in allq])
    seen, twins = {}, {}
    for m, q in allq:
        k = keys[q['id']]; twins.setdefault(k, []).append(q)
    for path, m in [(None, None)]:
        for m, q in allq:
            k = keys[q['id']]
            if k in seen: continue
            seen[k] = q['id']
            others = [t for t in twins[k] if t['id'] != q['id']]
            level = LEVEL[q['stage']]
            s = sols.get(q['id']) or next((sols[t['id']] for t in others if t['id'] in sols), {})
            tag, answer, show_key, note = q['tag'], q['answer'], q.get('showKey', ''), q.get('note', '')
            if s.get('check') == 'disagree' and tag != 'disputed':
                problems.append(f"{q['id']}: solver disagrees ({s.get('computed')}) with {answer}: {s.get('comment', '')}")
            if q['subject'] == 'GK' and tag == 'worked_out':
                dropped.append({**q, 'dropReason': 'General Knowledge answer not confirmed'}); continue
            if q['subject'] in ('AM', 'DA') and not s.get('solution'):
                problems.append(f"{q['id']}: no solution yet")
            item = {
                'id': q['id'], 'video': q['video'], 't': q['t'], 'match': q['match'], 'stage': q['stage'],
                'half': q['half'], 'subject': q['subject'], 'topic': q.get('topic') or None, 'level': level,
                'q': q['q'], 'options': q.get('options') or None, 'answer': answer,
                'accept': [a for a in s.get('accept', []) if a and a != answer] or None,
                'tol': q.get('tol') or s.get('tol') or None, 'unitMatters': q.get('unitMatters') or None,
                'tag': tag, 'showKey': show_key or None,
                'showNote': (s.get('comment') if s.get('check') == 'unclear' else None) or None,
                'result': q.get('result') or None, 'player': q.get('player') or None, 'school': q.get('school') or None,
                'solution': (s.get('solution') if q['subject'] in ('AM', 'DA') else (note if q['subject'] == 'VR' else None)) or None,
                'trick': (s.get('trick') if q['subject'] in ('AM', 'DA') else None) or None,
            }
            if q['subject'] in ('AM', 'DA') and note: item['showNote'] = ' '.join(x for x in (item['showNote'], note) if x)
            if others:
                also = sorted({f"{STAGE_LABEL[t['stage']]} ({t['match']})" for t in others if t['match'] != q['match'] or t['stage'] != q['stage']})
                if also: item['alsoIn'] = also
            # a disputed answer that isn't among the options: ask it as a typed question instead
            if tag == 'disputed' and item['options'] and answer not in item['options']: item['options'] = None
            bank.append({kk: v for kk, v in item.items() if v is not None})
    for _, m in load('bank/master/*.json'): dropped += m.get('dropped', [])
    ids = Counter(q['id'] for q in bank)
    dup = [i for i, n in ids.items() if n > 1]
    if dup: sys.exit(f'duplicate ids: {dup}')
    bank.sort(key=lambda q: (SUBJECTS.index(q['subject']), q['level'], q['video'], q['t']))
    json.dump(bank, open(os.path.join(ROOT, 'src/data/questions.json'), 'w'), indent=1, ensure_ascii=False)

    os.makedirs(os.path.join(ROOT, 'bank/csv'), exist_ok=True)
    cols = ['id', 'subject', 'level', 'stage', 'match', 'half', 'topic', 'question', 'option_1', 'option_2', 'option_3',
            'answer', 'status', 'show_answer', 'solution', 'speed_trick', 'note', 'on_the_show', 'video_link']
    def row(q):
        o = (q.get('options') or []) + ['', '', '']
        return {'id': q['id'], 'subject': q['subject'], 'level': q.get('level', LEVEL.get(q['stage'])), 'stage': q['stage'],
                'match': q['match'], 'half': 'Quick Buzz' if q['half'] == 'QB' else 'Brain Match', 'topic': q.get('topic', ''),
                'question': plain(q['q']), 'option_1': plain(o[0]), 'option_2': plain(o[1]), 'option_3': plain(o[2]),
                'answer': plain(q['answer']), 'status': STATUS.get(q['tag'], q['tag']), 'show_answer': plain(q.get('showKey') or ''),
                'solution': plain(q.get('solution') or ''), 'speed_trick': plain(q.get('trick') or ''),
                'note': plain(q.get('showNote') or q.get('dropReason') or ''), 'on_the_show': on_show(q),
                'video_link': f"https://youtu.be/{q['video']}?t={max(0, int(q['t']) - 3)}"}
    groups = defaultdict(list)
    for q in bank: groups[(q['subject'], q['level'])].append(q)
    for subj in SUBJECTS:
        for lv in (1, 2, 3):
            with open(os.path.join(ROOT, f'bank/csv/{subj}_level{lv}.csv'), 'w', newline='', encoding='utf-8-sig') as f:
                w = csv.DictWriter(f, cols); w.writeheader()
                for q in groups[(subj, lv)]: w.writerow(row(q))
    for name, items in (('all_questions', bank), ('dropped', dropped)):
        with open(os.path.join(ROOT, f'bank/csv/{name}.csv'), 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.DictWriter(f, cols); w.writeheader()
            for q in items: w.writerow(row(q))

    c = Counter((q['subject'], q['level']) for q in bank); t = Counter(q['tag'] for q in bank)
    lines = ['# Question bank summary', '', f'{len(bank)} questions, plus {len(dropped)} left out (dropped.csv).', '',
             '| Subject | Level 1 | Level 2 | Level 3 | Total |', '|---|---|---|---|---|']
    for s in SUBJECTS:
        n = [c[(s, lv)] for lv in (1, 2, 3)]; lines.append(f"| {s} | {n[0]} | {n[1]} | {n[2]} | {sum(n)} |")
    lines += ['', 'Status: ' + ', '.join(f'{STATUS[k]}: {t[k]}' for k in STATUS if t[k]), '',
              'Levels follow the stage: group stage is level 1, quarter-finals level 2, semi-finals, third place and final level 3.']
    open(os.path.join(ROOT, 'bank/SUMMARY.md'), 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))
    if problems: print('\nTo look at:\n' + '\n'.join(problems))

if __name__ == '__main__':
    main()
