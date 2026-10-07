import type { ItemRec, ScoringRule } from '../types';

export const LADDER = [2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6];

export const RULE_NAMES: Record<ScoringRule, string> = {
  practice: '+10 right, minus 5 wrong',
  show_qb: 'Quick Buzz: +10 right, minus 10 wrong',
  ladder: 'Brain Match ladder',
};

// Brain Match ladder, checked against every score change in the 2026 final: each right answer in a row climbs one step
// (2, 2, 3, 3, 3, 4, 4, 4, 4, 5 ... 6) and a miss drops back to the bottom.
export function scoreItems(items: ItemRec[], rule: ScoringRule): number {
  let s = 0, step = 0;
  for (const it of items) {
    if (rule === 'practice') s += it.r === 'right' ? 10 : it.r === 'wrong' ? -5 : 0;
    else if (rule === 'show_qb') s += it.r === 'right' ? 10 : it.r === 'wrong' ? -10 : 0;
    else { if (it.r === 'right') { s += LADDER[Math.min(step, LADDER.length - 1)]; step++; } else if (it.r !== 'skip') step = 0; }
  }
  return s;
}

export function ladderStep(items: ItemRec[]): number {
  let step = 0;
  for (const it of items) { if (it.r === 'right') step++; else if (it.r !== 'skip') step = 0; }
  return step;
}
