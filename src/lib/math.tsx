import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Maths in the bank is written between \( and \) so that money like $10,000 stays plain text.
export function renderMathText(s: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const a = s.indexOf('\\(', i);
    if (a < 0) { out.push(esc(s.slice(i))); break; }
    const b = s.indexOf('\\)', a + 2);
    if (b < 0) { out.push(esc(s.slice(i))); break; }
    out.push(esc(s.slice(i, a)));
    out.push(katex.renderToString(s.slice(a + 2, b), { throwOnError: false, output: 'html' }));
    i = b + 2;
  }
  return out.join('');
}

export function MathText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderMathText(text), [text]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

// Plain-text version of a bank string, for comparing typed answers.
export const plain = (s: string) => s.replace(/\\\(|\\\)/g, '').replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2').replace(/\\(text|mathrm)\{([^}]*)\}/g, '$2').replace(/[{}\\]/g, '');
