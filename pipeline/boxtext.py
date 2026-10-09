"""Read the question box of a captured frame line by line.
Quick Buzz: an optional options line "(A • B • C)" on top, then the question.
Brain Match: question only.
The bullets are found as small round blobs, so options are split on geometry, not on
whatever character the OCR thinks the bullet is."""
import re
import numpy as np, cv2, pytesseract
from PIL import Image

BOX = {  # x0, y0, x1, y1 inside the saved crop (v2 capture layout)
    'QB': (24, 250, 1001, 384),
    'BMR': (46, 232, 626, 394),
    'BML': (21, 229, 601, 390),
}

def green_top(a, x0, x1, y0, y1):
    """First row of the green answer bar inside the box, if the bar is showing."""
    seg = a[y0:y1, x0:x1].astype(int)
    g = (seg[..., 1] > 100) & (seg[..., 1] > seg[..., 0] + 35) & (seg[..., 2] < 150)
    f = g.mean(axis=1)
    for y in range(len(f) - 2):
        if f[y] > 0.25 and f[y + 1] > 0.25: return y0 + y
    return None

def ink_lines(dark, min_h=8):
    h = dark[:, 4:-4].sum(axis=1)
    runs, s = [], None
    for y, v in enumerate(h >= 2):
        if v and s is None: s = y
        if not v and s is not None: runs.append([s, y]); s = None
    if s is not None: runs.append([s, len(h)])
    out = []
    for r in runs:
        if out and r[0] - out[-1][1] <= 3: out[-1][1] = r[1]
        else: out.append(r)
    return [r for r in out if r[1] - r[0] >= min_h]

def ocr_line(gray, scale=2.5, psm=7):
    """gray: uint8 crop with dark text on light ground."""
    g = Image.fromarray(gray)
    g = g.resize((max(1, int(g.width * scale)), max(1, int(g.height * scale))), Image.LANCZOS)
    pad = Image.new('L', (g.width + 40, g.height + 40), 255); pad.paste(g, (20, 20))
    d = pytesseract.image_to_data(pad, config=f'--psm {psm}', output_type=pytesseract.Output.DICT)
    words, confs = [], []
    for w, c in zip(d['text'], d['conf']):
        if w.strip():
            words.append(w); c = float(c)
            if c >= 0: confs.append(c)
    return ' '.join(words), (sum(confs) / len(confs) if confs else 0.0), confs

def bullets(dark_line):
    """x centres of bullet dots on an options line."""
    H = dark_line.shape[0]
    n, lab, st, cen = cv2.connectedComponentsWithStats(dark_line.astype(np.uint8), 8)
    comps = [tuple(st[i]) for i in range(1, n)]
    xs = []
    for (x, y, w, h, area) in comps:
        if not (4 <= w <= 10 and 4 <= h <= 10 and abs(w - h) <= 2): continue
        if area / (w * h) < 0.6: continue
        cy = (y + h / 2) / H
        if not (0.3 <= cy <= 0.8): continue
        # needs clear space on both sides (a decimal point hugs its digits)
        near = [c for c in comps if c[0] != x and not (c[0] + c[2] < x - 4 or c[0] > x + w + 4)]
        if near: continue
        xs.append(x + w / 2)
    return sorted(xs)

def clean(s):
    s = re.sub(r'\s+', ' ', s).strip()
    s = s.strip(' _~—–=«»"\'‘’“”')
    s = re.sub(r'(?<=[A-Za-z]) \|\|$', ' II', s)
    s = re.sub(r'(?<=[A-Za-z]) \|$', ' I', s)
    return s.strip(' |')

def fix_math(s):
    """Safe repairs of common OCR slips in maths text."""
    s = re.sub(r'\bIn\(', 'ln(', s)
    s = re.sub(r'(?<=[\d.=(\s-])O(?=[\d.,)\s]|$)', '0', s)
    s = re.sub(r'(?<=\d)O', '0', s)
    s = re.sub(r'O(?=\.\d)', '0', s)
    return s

def read_box(im, kind):
    """im: PIL RGB frame crop as saved by capture.js. Returns dict(options, lines, conf, low)."""
    a = np.asarray(im.convert('RGB'))
    x0, y0, x1, y1 = BOX[kind]
    gt = green_top(a, x0, min(x1, x0 + 360), y0, y1 + 30) if kind == 'QB' else None
    if gt is not None and gt - 1 - y0 >= 20: y1 = min(y1, gt - 1)   # a green graphic at the very top is not the answer bar
    box = a[y0:y1, x0:x1]
    if box.size == 0: return {'options': None, 'lines': [], 'conf': 0.0, 'low': True}
    gray = cv2.cvtColor(box, cv2.COLOR_RGB2GRAY)
    dark = gray < 150
    W = dark.shape[1]
    off = np.zeros_like(dark)
    if kind == 'QB': off[:16, W - 45:] = True            # slanted top-right corner of the box
    if kind == 'BMR': off[118:, W - 38:] = True          # question countdown circle (bottom right)
    if kind == 'BML': off[118:, :38] = True              # (bottom left)
    dark[off] = False
    gray = gray.copy(); gray[off] = 255
    ls = ink_lines(dark)
    if not ls: return {'options': None, 'lines': [], 'conf': 0.0, 'low': True}
    heights = [b - t for t, b in ls]
    out_lines, confs, options = [], [], None
    for i, (t, b) in enumerate(ls):
        t0, b0 = max(0, t - 3), min(gray.shape[0], b + 3)
        cols = np.where(dark[t:b].any(axis=0))[0]
        if not len(cols): continue
        l0, l1 = max(0, cols.min() - 4), min(gray.shape[1], cols.max() + 5)
        crop = gray[t0:b0, l0:l1]
        txt, c, wc = ocr_line(crop)
        if i == 0 and len(ls) > 1:
            smaller = (b - t) <= 0.85 * np.median(heights[1:])
            if txt.startswith(('(', '[', '{')) or txt.endswith((')', ']', '}')) or smaller:
                bx = bullets(dark[t:b, l0:l1])
                if len(bx) == 2:
                    cuts = [0] + [int(v) for v in bx] + [crop.shape[1]]
                    parts = []
                    for k in range(3):
                        s0 = cuts[k] + (0 if k == 0 else 6)
                        s1 = cuts[k + 1] - (0 if k == 2 else 6)
                        seg = crop[:, s0:s1]
                        pt, pc, _ = ocr_line(seg)
                        parts.append(clean(pt.strip('()[]{}| ')))
                        confs.append(pc)
                    options = [fix_math(p) for p in parts]
                    continue
                # fall back on text separators
                inner = txt.strip('()[]{} |')
                ps = [clean(p) for p in re.split(r'\s+[•·«»*+=e®©°-]\s+', inner) if clean(p)]
                if len(ps) == 3:
                    options = ps; confs.append(c); continue
        out_lines.append(fix_math(txt)); confs.append(c)
    conf = float(np.mean(confs)) if confs else 0.0
    return {'options': options, 'lines': out_lines, 'conf': conf, 'low': conf < 75}

KEYR = {'QB': (36, 366, 384, 412), 'BML': (10, 710, 350, 752), 'BMR': (308, 710, 642, 752)}

def key_bar(a, kind):
    """Crop of the green answer bar, or None when it is not showing."""
    x0, y0, x1, y1 = KEYR[kind]
    seg = a[y0:y1, x0:x1].astype(int)
    g = (seg[..., 1] > 100) & (seg[..., 1] > seg[..., 0] + 35) & (seg[..., 2] < 150)
    return seg.astype(np.uint8) if g.mean() > 0.25 else None

def read_key(im, kind):
    """White text on the green bar -> (text, conf). Stripes are green, so a white mask drops them;
    the bar's own light outline is removed as thin or edge-touching components."""
    a = np.asarray(im.convert('RGB'))
    seg = key_bar(a, kind)
    if seg is None: return '', 0.0
    white = (seg.min(axis=2) > 170).astype(np.uint8)
    H, W = white.shape
    rm = white.mean(axis=1)
    for y in list(range(0, 3)) + list(range(H - 7, H)):
        if rm[y] > 0.15: white[y] = 0                       # the bar's top/bottom outline rows
    n, lab, st, cen = cv2.connectedComponentsWithStats(white, 8)
    keep = np.zeros_like(white)
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area < 3: continue                                # specks
        if h <= 4 and w >= 12 and (y <= 4 or y + h >= H - 4 or w >= 40): continue   # outline segment, not a minus sign
        if w <= 4 and h >= H - 6: continue                   # vertical outline segment
        if x <= 4: continue                                  # the bar's slanted left edge
        if w > 8 * h: continue                               # long thin line
        keep[lab == i] = 1
    cols = np.where(keep.any(axis=0))[0]; rows = np.where(keep.any(axis=1))[0]
    if not len(cols): return '', 0.0
    # split into runs of columns separated by wide gaps and keep the heaviest run (the text,
    # which can be left-aligned or centred depending on the layout)
    runs, start, prev = [], cols[0], cols[0]
    for c in cols[1:]:
        if c - prev > 28: runs.append((start, prev)); start = c
        prev = c
    runs.append((start, prev))
    a0, a1 = max(runs, key=lambda r: keep[:, r[0]:r[1] + 1].sum())
    sub = keep[max(0, rows.min() - 2):rows.max() + 3, max(0, a0 - 3):a1 + 4]
    g = np.where(sub > 0, 0, 255).astype(np.uint8)
    best = ('', 0.0)
    for psm in (7, 8, 10):
        txt, c, _ = ocr_line(g, scale=3, psm=psm)
        txt = re.sub(r'\s+[*•·°®©]+$', '', txt).strip(' |[]{}\'"‘’“”,;:_~—=')
        if txt.startswith('(') and ')' not in txt: txt = txt[1:]
        if txt and c > best[1]: best = (txt, c)
        if best[1] >= 85: break
    return fix_math(best[0]), best[1]
