"""Turn an extracted capture (manifest.json + frames/ [+ transcript.json]) into one record per question.
Usage: python3 process_capture.py <extracted_dir> [--prefix F1] > raw.json

Per record: id, half (QB/BM), side (BML/BMR for Brain Match), t0/t1, q, options, key (the show's answer
from the green bar), plate (player and school who buzzed, Quick Buzz), scores before/after and delta,
clock, text/key frame names for review, and flags for anything that needs a look."""
import json, os, re, sys, difflib, warnings
from collections import Counter
from multiprocessing import Pool
from PIL import Image, ImageOps
import pytesseract
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from boxtext import read_box, read_key, clean, fix_math
warnings.filterwarnings('ignore')

REG = {
 'QB':  {'ans': (36, 366, 384, 412), 'plate': (640, 203, 1002, 238), 'clock': (870, 390, 998, 434),
         's1': (100, 28, 160, 68), 's2': (100, 96, 160, 136)},
 'BML': {'next': (17, 412, 605, 578), 'ans': (10, 710, 350, 752), 'clock': (18, 30, 152, 72),
         's1': (72, 92, 150, 136), 's2': (72, 152, 150, 198)},
 'BMR': {'next': (42, 412, 630, 578), 'ans': (308, 710, 642, 752), 'clock': (495, 30, 633, 72),
         's1': (505, 92, 580, 136), 's2': (505, 152, 580, 198)},
}

def prep(im, invert=False, scale=2.5, thresh=None):
    g = ImageOps.grayscale(im)
    if invert: g = ImageOps.invert(g)
    g = g.resize((int(g.width * scale), int(g.height * scale)), Image.LANCZOS)
    if thresh is not None: g = g.point(lambda p: 255 if p > thresh else 0)
    return g

def ocr_text(im, psm=7):
    d = pytesseract.image_to_data(im, config=f'--psm {psm}', output_type=pytesseract.Output.DICT)
    words = [w for w in d['text'] if w.strip()]
    confs = [float(c) for w, c in zip(d['text'], d['conf']) if w.strip() and float(c) >= 0]
    return ' '.join(words), (sum(confs) / len(confs) if confs else 0.0)

def green_frac(im):
    px = list(im.convert('RGB').resize((40, 8)).getdata())
    return sum(1 for r, g, b in px if g > 100 and g > r + 35 and b < 150) / len(px)

def white_digits(im, thr=185, scale=3, pad=24):
    a = np.asarray(im.convert('RGB'))
    g = Image.fromarray(np.where(a.min(axis=2) > thr, 0, 255).astype('uint8'))
    g = g.resize((g.width * scale, g.height * scale), Image.LANCZOS)
    return ImageOps.expand(g, border=pad, fill=255)

def lone_zero(im, thr=185):
    """Tesseract often misses a single 0. A lone white ring with a dark centre is a 0."""
    m = np.asarray(im.convert('RGB')).min(axis=2) > thr
    ys, xs = np.where(m)
    if len(xs) < 25: return False
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    w, h = x1 - x0 + 1, y1 - y0 + 1
    if not (0.45 < w / h < 0.95) or h < 10: return False
    cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    centre = m[max(cy - h // 6, 0):cy + h // 6 + 1, max(cx - w // 6, 0):cx + w // 6 + 1]
    gaps = np.diff(np.where(m.any(axis=0))[0]) > 2
    return centre.mean() < 0.2 and not gaps.any()

def read_num(im):
    for psm in (7, 8, 10):
        t = pytesseract.image_to_string(white_digits(im), config=f'--psm {psm} -c tessedit_char_whitelist=-0123456789').strip()
        m = re.search(r'-?\d{1,3}', t)
        if m: return int(m.group())
    return 0 if lone_zero(im) else None

CACHE = {}
def cached(kind, region, im, fn):
    if region in ('s1', 's2', 'clock'):
        t = np.asarray(ImageOps.grayscale(im)).astype(np.int16); tol = 1.5
    else:
        t = np.asarray(ImageOps.grayscale(im).resize((max(1, im.width // 6), max(1, im.height // 6)))).astype(np.int16); tol = 2.0
    k = (kind, region); prev = CACHE.get(k)
    if prev is not None and prev[0].shape == t.shape and float(np.abs(prev[0] - t).mean()) < tol: return prev[1]
    v = fn(im); CACHE[k] = (t, v); return v

BOXR = {'QB': (18, 246, 1004, 412), 'BMR': (40, 226, 632, 400), 'BML': (15, 223, 607, 396)}

def read_frame(arg):
    path, kind = arg
    im = Image.open(path).convert('RGB'); R = REG[kind]; out = {}
    b = cached(kind, 'box', im.crop(BOXR[kind]), lambda c: read_box(im, kind))
    out['options'], out['lines'], out['qconf'] = b['options'], b['lines'], b['conf']
    if 'next' in R:
        nt, out['nconf'] = cached(kind, 'next', im.crop(R['next']), lambda c: ocr_text(prep(c), 6)); out['next'] = nt
    a = im.crop(R['ans'])
    if green_frac(a) > 0.25:
        out['ans'], out['aconf'] = cached(kind, 'ans', a, lambda c: read_key(im, kind))
    else: out['ans'], out['aconf'] = '', 0.0
    if 'plate' in R:
        pc = im.crop(R['plate']); light = float((np.asarray(pc).min(axis=2) > 190).mean())
        out['plate'] = cached(kind, 'plate', pc, lambda c: ocr_text(prep(c), 7)[0]) if light > 0.35 else ''
    out['clock'] = cached(kind, 'clock', im.crop(R['clock']), read_num)
    for k in ('s1', 's2'):
        out[k] = cached(kind, k, im.crop(R[k]), read_num)
    return out

def read_chunk(args):
    CACHE.clear()
    return [read_frame(a) for a in args]

def parse_plate(s):
    m = re.search(r'([A-Z][a-z]+)\W+([A-Z]{2,}[A-Z]*)', s or '')
    return (m.group(1), m.group(2)) if m else ('', '')

def key(s): return re.sub(r'[^a-z0-9]', '', s.lower())

def main(d, prefix):
    man = json.load(open(os.path.join(d, 'manifest.json')))
    items = [it for it in man['items'] if it['kind'] != 'CARD' and os.path.exists(os.path.join(d, 'frames', it['name']))]
    items.sort(key=lambda it: it['t'])
    args = [(os.path.join(d, 'frames', it['name']), it['kind']) for it in items]
    n = len(args); chunks = [args[i * n // 2:(i + 1) * n // 2] for i in range(2)]
    with Pool(2) as pool: res = pool.map(read_chunk, chunks)
    frames = []
    for it, r in zip(items, [x for c in res for x in c]):
        r.update(t=it['t'], kind=it['kind'], reason=it['reason'], name=it['name'])
        r['q'] = re.sub(r'\s+', ' ', ' '.join(r['lines'])).strip()
        frames.append(r)
    # A minus sign is easy to lose. Quick Buzz scores move by 10 at most per answer, so repair sign flips.
    for k in ('s1', 's2'):
        prev = None
        for r in frames:
            v = r[k]
            if v is None: continue
            if prev is not None and r['kind'] == 'QB' and abs(v - prev) > 10 and abs(-v - prev) <= 10: v = -v; r[k] = v
            prev = v
    groups = []
    for r in frames:
        half = 'QB' if r['kind'] == 'QB' else 'BM'
        g = groups[-1] if groups else None
        same = g and g['half'] == half and r['t'] - g['frames'][-1]['t'] < 25 and \
            difflib.SequenceMatcher(None, key(g['best']['q'])[:90], key(r['q'])[:90]).ratio() > 0.6
        if same:
            g['frames'].append(r)
            if r['qconf'] * len(r['q']) > g['best']['qconf'] * len(g['best']['q']): g['best'] = r
        else:
            groups.append({'half': half, 'frames': [r], 'best': r})
    recs = []
    for i, g in enumerate(groups):
        fr = g['frames']; b = g['best']
        if len(key(b['q'])) < 12: continue  # transition noise
        answered = [f for f in fr if f['ans']]
        ans = max(answered, key=lambda f: f['aconf']) if answered else None
        plates = Counter(f.get('plate', '') for f in fr if f.get('plate')).most_common(1)
        player, school = parse_plate(plates[0][0] if plates else '')
        before = next(((f['s1'], f['s2']) for f in fr if f['s1'] is not None and f['s2'] is not None), (None, None))
        nxt = groups[i + 1]['frames'] if i + 1 < len(groups) else []
        after = next(((f['s1'], f['s2']) for f in nxt if f['s1'] is not None and f['s2'] is not None), (None, None))
        delta = [after[0] - before[0], after[1] - before[1]] if None not in tuple(before) + tuple(after) else None
        opt_frames = [f for f in fr if f['options']]
        opts = max(opt_frames, key=lambda f: f['qconf'])['options'] if opt_frames else None
        flags = []
        if b['qconf'] < 80: flags.append('lowq')
        if not ans: flags.append('nokey')
        elif ans['aconf'] < 80: flags.append('lowkey')
        if re.search(r'\d', b['q']) and re.search(r'[?*°^]|\d[a-z]\d|[a-z]\d\b', b['q'][:-1]): flags.append('math')
        recs.append({
            'id': f'{prefix}-{len(recs) + 1:03d}', 'half': g['half'], 'side': b['kind'] if g['half'] == 'BM' else '',
            't0': fr[0]['t'], 't1': fr[-1]['t'], 'q': b['q'], 'qconf': round(b['qconf'], 1), 'options': opts,
            'key': ans['ans'] if ans else '', 'kconf': round(ans['aconf'], 1) if ans else 0,
            'player': player, 'school': school, 'before': list(before), 'after': list(after), 'delta': delta,
            'clock': fr[0]['clock'], 'next_seen': next((f['next'] for f in fr if f.get('next')), ''),
            'text_frame': b['name'], 'key_frame': ans['name'] if ans else '', 'frames': [f['name'] for f in fr], 'flags': flags,
        })
    json.dump(recs, sys.stdout, indent=1, ensure_ascii=False)

if __name__ == '__main__':
    d = sys.argv[1]
    prefix = sys.argv[sys.argv.index('--prefix') + 1] if '--prefix' in sys.argv else 'X'
    main(d, prefix)
