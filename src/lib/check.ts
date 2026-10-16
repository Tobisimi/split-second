import type { Question } from '../types';
import { plain } from './math';

// How typed answers are checked. scripts/check_answers.ts runs this against every question in the bank.

const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

// Lower case plain text: no accents, one kind of minus and times sign, superscripts written as ^n.
export const norm = (s: string) => plain(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, m => '^' + [...m].map(c => SUP[c]).join(''))
  .replace(/[−–—]/g, '-').replace(/[×·]/g, 'x').replace(/÷/g, '/').replace(/π/g, 'pi').replace(/√/g, 'sqrt')
  .replace(/\s+/g, ' ').replace(/[.]+$/, '').trim();

// British and American spellings count as the same word; so do leading articles and "her"/"his".
const canon = (s: string) => norm(s).replace(/^(the|a|an|his|her|their|its|my|your) /, '')
  .replace(/isation/g, 'ization').replace(/our/g, 'or').replace(/tre\b/g, 'ter').replace(/ae/g, 'e').replace(/oe/g, 'e').replace(/mme\b/g, 'm');
// keeps signs and decimal points ("-4sin(4x)" is not "4sin4x", "1.5" is not "15"); numbers in a list stay apart ("1, 3" is not "13")
const loose = (s: string) => canon(s).replace(/(\d)[\s,&]+(?=\d)/g, '$1,').replace(/[^a-z0-9.,+\-*/^=]/g, '');
const bare = (s: string) => canon(s).replace(/[^a-z0-9]/g, '');            // for word answers: "North-East" = "north east"
const STOP = new Set(['and', 'or', 'the', 'a', 'an']);
const wordSet = (s: string) => canon(s).split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w)).sort().join(' ');

// Number text: "6,000" -> "6000", "N6000" (naira) -> "6000", "1.5 x 10^7" -> "1.5e7", "10^4" -> "1e4".
function numText(s: string): string {
  return norm(s).replace(/[$₦£€]/g, '').replace(/^n(?=-?\.?\d)/, '').replace(/\s*per ?cent\b/g, '%')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/(-?\d*\.?\d+)\s*[x*]\s*10\s*\^\s*\(?([-+]?\d+)\)?/g, '$1e$2')
    .replace(/(^|[^\d.])10\s*\^\s*\(?([-+]?\d+)\)?/g, '$11e$2')
    .trim();
}

// Drop trailing unit words ("20 m", "25m/s^2", "100 degrees", "6,000 crates"). A word only counts as a unit if it is
// letters (with ^n, / or digits after letters, as in cm3): "5 out of 36", "1 and 3" and "-4sin(4x)" keep their numbers.
// Maths words are never units: "1/2 pi" is not 1/2, "2sqrt3" is not 2, "5x" is not 5.
const NOT_UNIT = /^(pi|sqrt|root|x|y|z)(?![a-z])/;
function stripUnit(t: string): string {
  if (/^-?\d*\.?\d+e[-+]?\d+$/.test(t)) return t;
  const toks = t.replace(/(\d)(?!e[-+]?\d)([a-zµΩ°])/g, '$1 $2').split(' ').filter(Boolean);
  let k = toks.length;
  while (k > 1 && /^[a-zµΩ°][a-zµΩ°/^\d.\-]*$/.test(toks[k - 1]) && !NOT_UNIT.test(toks[k - 1])) k--;
  return toks.slice(0, k).join(' ');
}

function parseNum(t: string): number | null {
  let m: RegExpMatchArray | null;
  t = t.replace(/^[a-z]\s*=\s*/, '');                                   // "x = 2"
  if ((m = t.match(/^(-?\d+) (\d+)\/(\d+)$/))) return Number(m[1]) + Math.sign(Number(m[1]) || 1) * Number(m[2]) / Number(m[3]);
  if ((m = t.match(/^(-?\d*\.?\d+)\s*\/\s*(\d*\.?\d+)$/))) return Number(m[1]) / Number(m[2]);
  if ((m = t.match(/^(-?\d*\.?\d+)\^(-?\d+)$/))) return Math.pow(Number(m[1]), Number(m[2]));
  if (/^-?\d*\.?\d+(e[-+]?\d+)?$/.test(t)) return Number(t);
  return null;
}

// Every number a written answer could stand for ("25%" -> 25 and 0.25). `ulp` is one unit in the last decimal place
// when the number was written as a decimal with at least 3 significant figures: then a rounded or cut-short value counts.
interface Val { v: number; ulp: number | null }
function values(s: string, unitMatters?: boolean): Val[] {
  let t = numText(s);
  if (t in WORDS) return [{ v: WORDS[t], ulp: null }];             // "two", but not the "three" of "three quarters"
  if (!unitMatters) t = stripUnit(t);
  const pct = t.endsWith('%');
  if (pct) t = t.slice(0, -1).trim();
  const n = parseNum(t);
  if (n === null || !isFinite(n)) return [];
  const dec = t.match(/^-?\d*\.(\d+)$/);
  const sf = dec ? t.replace(/^-?0*\.?0*/, '').replace('.', '').length : 0;
  const ulp = dec && sf >= 3 ? Math.pow(10, -dec[1].length) : null;
  return pct ? [{ v: n, ulp }, { v: n / 100, ulp: ulp && ulp / 100 }] : [{ v: n, ulp }];
}

function sameNumber(given: Val[], target: Val[], tol?: number): boolean {
  for (const t of target) for (const g of given) {
    const d = Math.abs(g.v - t.v);
    if (d <= (tol ?? Math.max(1e-9, Math.abs(t.v) * 1e-6))) return true;
    if (g.ulp && d <= g.ulp * (1 + 1e-9)) return true;
  }
  return false;
}

// "Larynx (voice box)" accepts either part; so does "Oil palm/Palm kernel".
function alternatives(t: string): string[] {
  const out = [t];
  const m = t.match(/^(.+?)\s+\(([^()]+)\)$/);
  if (m) out.push(m[1], m[2]);
  if (!/\d/.test(t) && t.includes('/')) out.push(...t.split('/').map(x => x.trim()).filter(Boolean));
  return out;
}

export function checkTyped(given: string, q: Question): boolean {
  if (!given.trim()) return false;
  const targets = [q.answer, ...(q.accept ?? [])].flatMap(alternatives);
  const g = norm(given);
  for (const t of targets) {
    if (norm(t) === g) return true;
    const lt = loose(t);
    if (lt && lt === loose(given)) return true;
    if (!/\d/.test(t)) {
      const bt = bare(t);
      if (bt && bt === bare(given)) return true;
    }
    if (/, | and | ?& ?/.test(t) && wordSet(t) && wordSet(t) === wordSet(given)) return true;   // a list in any order: "1 and 3", "Red, black and green"
  }
  const gv = values(given, q.unitMatters);
  if (!gv.length) return false;
  return targets.some(t => sameNumber(gv, values(t, q.unitMatters), q.tol));
}

// The option that is right: normally the answer itself; tolerate an answer written longer than its option.
export const isRightOption = (o: string, q: Question) => o === q.answer || (!!q.options && !q.options.includes(q.answer) && !!q.accept?.includes(o));
