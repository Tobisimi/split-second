"""Write the Applied Maths and Data Analysis questions that still need a solution into batch files for the solution
writers. Run `npm run bank` first: the built bank (src/data/questions.json) holds one copy of each question, and a copy
there without a solution is what still needs one (a solution written for any twin is already borrowed by the build).
Usage: python3 pipeline/solution_batches.py <batch_size> [AM|DA ...]
Writes /home/claude/ud/solutions/in/bNNN.json (one subject per batch) and prints the batch names and sizes."""
import glob, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = '/home/claude/ud/solutions/in'

def main(size, subjects):
    bank = json.load(open(os.path.join(ROOT, 'src/data/questions.json')))
    master = {}
    for p in glob.glob(os.path.join(ROOT, 'bank/master/*.json')):
        for q in json.load(open(p))['questions']: master[q['id']] = q
    names = []
    for subj in subjects:
        todo = []
        for b in bank:
            if b['subject'] != subj or b.get('solution'): continue
            q = master[b['id']]
            item = {'id': q['id'], 'subject': q['subject'], 'topic': q.get('topic', ''), 'question': q['q'],
                    'options': q.get('options'), 'answer': q['answer'],
                    'answer_source': 'shown on the show' if q['tag'] == 'confirmed' else 'worked out, not confirmed'}
            if q.get('showKey') and q['tag'] == 'disputed': item['show_answer'] = q['showKey']
            if q.get('note'): item['note'] = q['note']
            todo.append(item)
        for i in range(0, len(todo), size):
            name = f"b{len(glob.glob(f'{OUT}/b*.json')) + 1:03d}"
            json.dump(todo[i:i + size], open(f'{OUT}/{name}.json', 'w'), indent=1, ensure_ascii=False)
            names.append((name, subj, len(todo[i:i + size])))
    print(names)

if __name__ == '__main__':
    main(int(sys.argv[1]), sys.argv[2:] or ['AM', 'DA'])
