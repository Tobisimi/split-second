"""Write AM/DA questions that still need a solution into batch files for the solution writers.
Usage: python3 solution_batches.py <batch_size> master/*.json
Skips ids already present in solutions/out/*.json. Writes solutions/in/<name>.json and prints the names."""
import glob, json, os, sys

ROOT = '/home/claude/ud'

def main(size, files):
    done = set()
    for p in glob.glob(f'{ROOT}/solutions/out/*.json'):
        done |= set(json.load(open(p)))
    todo = []
    for f in files:
        m = json.load(open(f))
        for q in m['questions']:
            if q['subject'] in ('AM', 'DA') and q['id'] not in done:
                item = {'id': q['id'], 'subject': q['subject'], 'topic': q['topic'], 'question': q['q'],
                        'options': q['options'], 'answer': q['answer'],
                        'answer_source': 'shown on the show' if q['tag'] == 'confirmed' else 'worked out, not confirmed'}
                if q.get('note'): item['note'] = q['note']
                todo.append(item)
    names = []
    for i in range(0, len(todo), size):
        name = f"b{len(glob.glob(f'{ROOT}/solutions/in/b*.json')) + 1:03d}"
        json.dump(todo[i:i + size], open(f'{ROOT}/solutions/in/{name}.json', 'w'), indent=1, ensure_ascii=False)
        names.append((name, len(todo[i:i + size])))
    print(names)

if __name__ == '__main__':
    main(int(sys.argv[1]), sys.argv[2:])
