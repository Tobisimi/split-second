// Checks the question bank and the typed-answer checker (src/lib/check.ts). Run: npm run check
// 0. every piece of maths in the bank renders (KaTeX) and every \( has its \)
// 1. fixed cases with a known right result (rounding, units, scientific notation, spelling, lists)
// 2. every answer and accepted form is marked right for its own question; the answer is one of the options
// 3. common rewrites of a right numeric answer (no commas, naira as N, unit added) are marked right
// 4. wrong answers are not: the first number of a multi-number answer, other questions' answers with a different number
import raw from '../src/data/questions.json';
import type { Question } from '../src/types';
import katex from 'katex';
import { checkTyped, norm } from '../src/lib/check';

const bank = raw as Question[];
const fails: string[] = [];
const fail = (q: Question, why: string) => fails.push(`${q.id} [${q.answer}] ${why}`);

// 0. maths
let mathBits = 0;
for (const q of bank) {
  for (const [field, text] of [['q', q.q], ['answer', q.answer], ['solution', q.solution], ['trick', q.trick], ['showNote', q.showNote],
    ...(q.options ?? []).map((o, i) => [`option ${i + 1}`, o]), ...(q.accept ?? []).map((a, i) => [`accept ${i + 1}`, a])] as [string, string | undefined][]) {
    if (!text) continue;
    const opens = text.split('\\(').length - 1, closes = text.split('\\)').length - 1;
    if (opens !== closes) { fail(q, `${field}: ${opens} \\( but ${closes} \\)`); continue; }
    for (const m of text.matchAll(/\\\((.*?)\\\)/gs)) {
      mathBits++;
      try { katex.renderToString(m[1], { throwOnError: true, output: 'html' }); }
      catch (e) { fail(q, `${field}: maths does not render: ${(e as Error).message.slice(0, 90)}`); }
    }
  }
}

// 1. fixed cases: [answer, accept, typed, should count]
const CASES: [string, string[], string, boolean][] = [
  ['5/36', [], '5', false], ['5/36', [], '0.139', true], ['5/36', [], '0.14', false], ['5/36', [], '5/36', true],
  ['−4sin(4x)', [], '-4', false], ['−4sin(4x)', [], '-4sin4x', true], ['−4sin(4x)', [], '4sin4x', false],
  ['1.5 × 10⁷ L/min', [], '1.5', false], ['1.5 × 10⁷ L/min', [], '15000000', true], ['1.5 × 10⁷ L/min', [], '1.5x10^7', true],
  ['1.5 × 10⁷ L/min', [], '1.5e7 L/min', true], ['1.5 × 10⁷ L/min', [], '1.5 × 10⁷', true],
  ['₦6,000', [], 'N6000', true], ['₦6,000', [], '6000 naira', true], ['₦6,000', [], '600', false],
  ['North-East', [], 'north east', true], ['North-East', [], 'northeast', true], ['North-East', [], 'north', false],
  ['Léopold Sédar Senghor', [], 'leopold sedar senghor', true],
  ['Larynx (voice box)', [], 'larynx', true], ['Larynx (voice box)', [], 'voice box', true], ['Larynx (voice box)', [], 'voice', false],
  ['Red, black and green', [], 'green, red, black', true], ['Red, black and green', [], 'red and black', false],
  ['World Trade Organization', [], 'world trade organisation', true], ['Haemoglobin', [], 'hemoglobin', true],
  ['Her nephew', [], 'nephew', true], ['1 and 3', [], '1', false], ['1 and 3', [], '3 and 1', true],
  ['2', [], 'two', true], ['9/44', [], '0.2045', true], ['9/44', [], '0.2', false], ['0.5', [], '0.54', false],
  ['62,500', [], '62000', false], ['62,500', [], '62,500', true], ['x = 2', [], '2', true],
  ['25%', [], '0.25', true], ['0.25', [], '25%', true], ['2 1/2', [], '2.5', true],
  ['Ethane', [], 'ethene', false], ['Zambia', [], 'gambia', false], ['South Africa', [], 'africa', false],
  ['100 degrees', [], '100°', true], ['20m', [], '20', true], ['20m', [], '2', false], ['3:2', [], '3', false],
  ['0.0001 M (1 × 10⁻⁴ M)', [], '1x10^-4', true], ['0.0001 M (1 × 10⁻⁴ M)', [], '1', false],
  ['1 litre (1,000 cm³)', [], '1000 cm3', true], ['6,667 m³ (20,000/3)', [], '6666.67', true],
  ['Oil palm/Palm kernel', [], 'palm kernel', true], ['5 tonnes or 500 kg', [], '50', false],
  ['i + 9j', ['(1, 9)'], '1/9', false], ['1 and 3', [], '3, 1', true], ['2.4', [], '2.41', false], ['13.6 g/cm³', [], '13.5', false], ['1 × 10⁻⁹ M', [], '0', false], ['9/44', [], '0.204', true], ['20000/3', [], '6666.666', true], ['1:3', [], '13', false], ['1:3', [], '1 : 3', true], ['π/2 radians', ['1/2 π'], '1/2', false], ['2√3', [], '2', false], ['5x', [], '5', false], ['10 per cent', [], '0.1', true],
];
for (const [answer, accept, typed, want] of CASES) {
  const q = { id: 'case', answer, accept } as unknown as Question;
  if (checkTyped(typed, q) !== want) fails.push(`case [${answer}] typed "${typed}" should ${want ? '' : 'not '}count`);
}

// 2. own answers
for (const q of bank) {
  for (const a of [q.answer, ...(q.accept ?? [])]) if (!checkTyped(a, q)) fail(q, `own form not accepted: "${a}"`);
  if (q.options && !q.options.includes(q.answer)) fail(q, 'answer is not one of the options');
}

// 3. rewrites of numeric answers that should still count
const rewrites = (s: string): string[] => {
  const m = s.match(/^([₦$£€]|N(?=\d))?\s*(-?\d{1,3}(?:,\d{3})+|-?\d+)(\.\d+)?(\s*[a-zA-Z%°/²³]+)?$/);
  if (!m) return [];
  if (m[4] && /^(pi|x|y|z)$/i.test(m[4].trim())) return [];   // "5x" is algebra, not 5 with a unit
  const n = (m[2] + (m[3] ?? '')).replace(/,/g, '');
  const out = [n];
  if (m[1]) out.push(`N${n}`, `₦${Number(n).toLocaleString('en-US')}`);
  if (m[4]) out.push(`${n} ${m[4].trim()}`);
  return out;
};
for (const q of bank) {
  if (q.options) continue;
  for (const v of rewrites(q.answer)) if (!checkTyped(v, q)) fail(q, `rewrite not accepted: "${v}"`);
}

// 4a. typing only the first number of an answer with several different numbers must not count,
//     unless some accepted form is that number with at most a unit after it ("5 tonnes or 500 kg" takes "5")
const lead = (s: string) => {   // the first number in an answer, reading a leading fraction like 2/5 as 0.4 and 5 × 10⁻³ as 0.005
  const t = norm(s).replace(/(\d),(\d{3})/g, '$1$2');
  const e = t.match(/^\D*?(-?\d*\.?\d+)\s*[x*]\s*10\s*\^\s*\(?([-+]?\d+)\)?/) ?? t.match(/^\D*?()10\s*\^\s*\(?([-+]?\d+)\)?/);
  if (e) return String(Number(`${e[1] || 1}e${e[2]}`));
  const m = s.replace(/(\d),(\d{3})/g, '$1$2').match(/-?\d+(\.\d+)?(\s*\/\s*\d+(\.\d+)?)?/)?.[0];
  if (!m) return undefined;
  const [a, b] = m.split('/').map(Number);
  return String(b ? a / b : a);
};
for (const q of bank) {
  if (q.options) continue;
  const nums = q.answer.replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(\.\d+)?/g) ?? [];
  if (new Set(nums).size < 2) continue;
  const first = nums[0];
  const forms = [q.answer, ...(q.accept ?? [])];
  const unitOnly = new RegExp(`^\\s*[₦$N]?\\s*${first.replace('.', '\\.')}\\s*[a-zA-Z°%³²/ .]*$`);
  if (!forms.some(f => unitOnly.test(f.replace(/(\d),(\d{3})/g, '$1$2'))) && checkTyped(first, q)) fail(q, `wrong answer accepted: "${first}"`);
}

// 4b. another typed question's answer must not count when its number differs from every accepted form's number
//     (a wrong unit with the right number is allowed: units are optional)
const typed = bank.filter(q => !q.options);
let cross = 0;
for (const q of typed) {
  if ([q.answer, ...(q.accept ?? [])].some(f => /[%:]/.test(f))) continue;   // 150% and 1.5, or 5 : 4 and 1.25, are the same number on purpose
  const leads = new Set([q.answer, ...(q.accept ?? [])].map(lead).filter(Boolean).map(Number));
  for (const o of typed) {
    if (o === q || /%/.test(o.answer)) continue;
    const l = lead(o.answer);
    if (!l || leads.has(Number(l))) continue;
    if (checkTyped(o.answer, q)) { cross++; if (cross <= 30) fail(q, `another question's answer accepted: "${o.answer}" (${o.id})`); }
  }
}

console.log(`${mathBits} maths pieces rendered; ${CASES.length} fixed cases; ${bank.length} questions, ${typed.length} typed. ${fails.length} problem(s)${cross > 30 ? ` (${cross} cross-question cases, first 30 shown)` : ''}.`);
for (const f of fails) console.log('  ' + f);
process.exitCode = fails.length ? 1 : 0;
