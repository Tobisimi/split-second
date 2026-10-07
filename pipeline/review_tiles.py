"""Review sheets: one row per question = question box (with options) + the show's green answer bar.
Usage: python3 review_tiles.py <extracted_dir> <raw.json> <out_dir> [--per 12] [--scale 0.62]
Writes sheet_XX.jpg and sheet_XX.txt (the OCR text for the same rows) into out_dir."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

BOXC = {'QB': (18, 246, 1004, 388), 'BMR': (40, 226, 632, 400), 'BML': (15, 223, 607, 396)}
KEYC = {'QB': (30, 362, 392, 416), 'BML': (4, 704, 356, 756), 'BMR': (302, 704, 645, 756)}

def font(sz):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'):
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

def kind_of(name):
    return 'QB' if '_QB_' in name else ('BML' if '_BML_' in name else 'BMR')

def row_image(d, rec):
    tf = rec['text_frame']; k = kind_of(tf)
    box = Image.open(os.path.join(d, 'frames', tf)).convert('RGB').crop(BOXC[k])
    if k != 'QB':  # Brain Match box is narrow and tall: keep it as is
        pass
    if rec.get('key_frame'):
        kk = kind_of(rec['key_frame'])
        bar = Image.open(os.path.join(d, 'frames', rec['key_frame'])).convert('RGB').crop(KEYC[kk])
    else:
        bar = Image.new('RGB', (360, 54), (60, 60, 60))
        ImageDraw.Draw(bar).text((10, 15), 'no answer bar', fill=(255, 255, 255), font=font(18))
    W = 120 + box.width + 12 + bar.width; H = max(box.height, bar.height) + 8
    im = Image.new('RGB', (W, H), (255, 255, 255))
    dr = ImageDraw.Draw(im)
    dr.text((6, 8), rec['id'].split('-')[-1], fill=(200, 0, 0), font=font(34))
    res = rec.get('delta'); who = (rec.get('player') or '') + (' ' + rec['school'] if rec.get('school') else '')
    dr.text((6, 52), who[:12], fill=(0, 0, 0), font=font(16))
    if res is not None: dr.text((6, 74), str(res), fill=(0, 0, 0), font=font(16))
    im.paste(box, (120, 4)); im.paste(bar, (120 + box.width + 12, 4))
    return im

def main(d, raw, out, per=12, scale=0.62):
    recs = json.load(open(raw)); os.makedirs(out, exist_ok=True)
    for s in range(0, len(recs), per):
        rows = [row_image(d, r) for r in recs[s:s + per]]
        W = max(r.width for r in rows); H = sum(r.height for r in rows)
        sheet = Image.new('RGB', (W, H), (255, 255, 255)); y = 0
        for r in rows: sheet.paste(r, (0, y)); y += r.height
        sheet = sheet.resize((int(W * scale), int(H * scale)), Image.LANCZOS)
        n = s // per + 1
        sheet.save(os.path.join(out, f'sheet_{n:02d}.jpg'), quality=88)
        with open(os.path.join(out, f'sheet_{n:02d}.txt'), 'w') as f:
            for r in recs[s:s + per]:
                o = ' ; '.join(r['options']) if r.get('options') else '-'
                f.write(f"{r['id']} | {r['q']} | {o} | key: {r['key'] or '-'}\n")

if __name__ == '__main__':
    a = sys.argv
    per = int(a[a.index('--per') + 1]) if '--per' in a else 12
    sc = float(a[a.index('--scale') + 1]) if '--scale' in a else 0.62
    main(a[1], a[2], a[3], per, sc)
