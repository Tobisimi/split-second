import type { Question } from '../types';
import { plain } from './math';

const norm = (s: string) => plain(s).toLowerCase().replace(/[−–—]/g, '-').replace(/×/g, 'x')
  .replace(/\s+/g, ' ').replace(/[.]+$/, '').trim();

// Every number a written answer could stand for: "25%" -> [25, 0.25], "1/4" -> [0.25], "2 1/2" -> [2.5].
function values(s: string, unitMatters?: boolean): number[] {
  let t = norm(s).replace(/[$₦£€]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(/\s+/g, ' ').trim();
  if (!unitMatters) t = t.replace(/^(-?[\d.\/ ]+%?)\s*[a-z°Ωµ/^\d\s.]*$/i, '$1').trim();
  const pct = t.endsWith('%');
  if (pct) t = t.slice(0, -1).trim();
  let n: number | null = null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(-?\d+) (\d+)\/(\d+)$/))) n = Number(m[1]) + Math.sign(Number(m[1]) || 1) * Number(m[2]) / Number(m[3]);
  else if ((m = t.match(/^(-?\d*\.?\d+)\/(\d*\.?\d+)$/))) n = Number(m[1]) / Number(m[2]);
  else if (/^-?\d*\.?\d+(e-?\d+)?$/.test(t)) n = Number(t);
  if (n === null || !isFinite(n)) return [];
  return pct ? [n, n / 100] : [n];
}

const loose = (s: string) => norm(s).replace(/^(the|a|an) /, '').replace(/[^a-z0-9+\-*/^=]/g, '');

export function checkTyped(given: string, q: Question): boolean {
  if (!given.trim()) return false;
  const targets = [q.answer, ...(q.accept ?? [])];
  const g = norm(given);
  if (targets.some(t => norm(t) === g || loose(t) === loose(given) && loose(given).length > 0)) return true;
  const gv = values(given, q.unitMatters);
  if (!gv.length) return false;
  for (const t of targets) {
    for (const tv of values(t, q.unitMatters)) {
      const tol = q.tol ?? Math.max(1e-9, Math.abs(tv) * 1e-6);
      if (gv.some(x => Math.abs(x - tv) <= tol)) return true;
    }
  }
  return false;
}
