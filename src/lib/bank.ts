import type { Progress, Question, Result, Setup } from '../types';
import raw from '../data/questions.json';

export const BANK: Question[] = raw as Question[];

// A question the show asked in several matches is kept once; its other copies' ids point to it, so progress saved
// under an id from an older version of the bank still counts.
const BY_ID = new Map<string, Question>();
for (const q of BANK) for (const id of [...(q.aka ?? []), q.id]) BY_ID.set(id, q);
export const questionById = (id: string) => BY_ID.get(id);
export const canonId = (id: string) => BY_ID.get(id)?.id ?? id;

export interface QState { seen: number; last: number; lastR?: Result; rights: number; wrongs: number; nones: number; ms: number[] }

export function questionStates(p: Progress): Map<string, QState> {
  const m = new Map<string, QState>();
  for (const s of p.sessions) for (const it of s.items) {
    const id = canonId(it.id);
    const st = m.get(id) ?? { seen: 0, last: 0, rights: 0, wrongs: 0, nones: 0, ms: [] };
    st.seen++; st.last = Math.max(st.last, s.at); st.lastR = it.r;
    if (it.r === 'right') st.rights++; else if (it.r === 'wrong') st.wrongs++; else if (it.r === 'none') st.nones++;
    if (it.ms != null && it.r !== 'skip') st.ms.push(it.ms);
    m.set(id, st);
  }
  return m;
}

const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function poolFor(setup: Setup, states: Map<string, QState>): Question[] {
  let q = BANK.filter(x => (setup.subject === 'MIX' || x.subject === setup.subject) && (setup.level === 0 || x.level === setup.level));
  if (setup.missesOnly) q = q.filter(x => { const st = states.get(x.id); return st && st.lastR && st.lastR !== 'right'; });
  return q;
}

// Unseen questions first, then the ones seen longest ago; ties are shuffled so repeat runs differ.
export function ordered(pool: Question[], states: Map<string, QState>): Question[] {
  const unseen = shuffle(pool.filter(x => !states.get(x.id)));
  const seen = shuffle(pool.filter(x => states.get(x.id))).sort((a, b) => (states.get(a.id)!.last - states.get(b.id)!.last));
  return [...unseen, ...seen];
}

export const shuffleOptions = (opts: string[]) => shuffle([...opts]);
export const ytLink = (q: Question) => `https://youtu.be/${q.video}?t=${Math.max(0, Math.floor(q.t) - 3)}`;
export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
