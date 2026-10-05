import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ItemRec, Question, Result, SessionRec, Setup } from '../types';
import { SUBJECT_NAMES } from '../types';
import { MathText } from '../lib/math';
import { checkTyped } from '../lib/check';
import { scoreItems } from '../lib/scoring';
import { mmss, shuffleOptions } from '../lib/bank';

interface Props {
  setup: Setup;
  queue: Question[];
  reserve: Question[];
  onFinish: (rec: SessionRec) => void;
  onQuit: () => void;
  onFlag: (q: Question) => void;
  flagged: (id: string) => boolean;
}

type Phase = 'ask' | 'mark' | 'feedback';
const FEEDBACK_MS = 1500;

export default function Quiz({ setup, queue: initialQueue, reserve: initialReserve, onFinish, onQuit, onFlag, flagged }: Props) {
  const brain = setup.mode === 'brain';
  const timed = brain || setup.secs > 0;
  const secs = brain ? setup.secs || 10 : setup.secs;
  const [queue, setQueue] = useState(initialQueue);
  const queueRef = useRef(initialQueue);
  const reserve = useRef([...initialReserve]);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const [phase, setPhase] = useState<Phase>('ask');
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [last, setLast] = useState<{ r: Result; given?: string } | null>(null);
  const items = useRef<ItemRec[]>([]);
  const qStart = useRef(performance.now());
  const stopped = useRef<number | null>(null);
  const quarterEnd = useRef(performance.now() + setup.quarterSecs * 1000);
  const fuseRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = queue[idx];
  const nextQ = queue[idx + 1];
  const opts = useMemo(() => (q?.options ? shuffleOptions(q.options) : null), [q]);
  const nextOpts = useMemo(() => (nextQ?.options ? shuffleOptions(nextQ.options) : null), [nextQ]);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    const its = items.current;
    onFinish({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(), mode: setup.mode, subject: setup.subject, level: setup.level, secs,
      scoring: setup.scoring, score: scoreItems(its, setup.scoring), items: its,
    });
  }, [onFinish, setup, secs]);

  const advance = useCallback(() => {
    setTyped(''); setChosen(null); setLast(null); stopped.current = null;
    if (brain && performance.now() >= quarterEnd.current) return finish();
    if (idxRef.current + 1 >= queueRef.current.length) return finish();
    idxRef.current += 1;
    setIdx(idxRef.current);
    setPhase('ask');
    qStart.current = performance.now();
  }, [brain, finish]);

  const record = useCallback((r: Result, given?: string) => {
    const ms = Math.round((stopped.current ?? performance.now()) - qStart.current);
    items.current = [...items.current, { id: q.id, r, ms: r === 'skip' ? undefined : ms, given }];
    setLast({ r, given });
    const showFeedback = !brain && (r !== 'skip') && (setup.answerMode === 'type' || !!q.options || r === 'none' || setup.secs === 0);
    if (showFeedback) {
      setPhase('feedback');
      if (setup.secs > 0) window.setTimeout(advance, FEEDBACK_MS);
    } else advance();
  }, [q, brain, setup.answerMode, setup.secs, advance]);

  const choose = (o: string) => { if (phase !== 'ask') return; setChosen(o); record(o === q.answer ? 'right' : 'wrong', o); };
  const submitTyped = () => { if (phase !== 'ask') return; record(typed.trim() ? (checkTyped(typed, q) ? 'right' : 'wrong') : 'none', typed.trim() || undefined); };
  const gotIt = () => { if (phase !== 'ask' || q.options) return; stopped.current = performance.now(); setPhase('mark'); };
  const mark = (r: 'right' | 'wrong') => { if (phase !== 'mark') return; record(r); };
  const skip = () => {
    if (!setup.skips || phase !== 'ask' || brain) return;
    if (!setup.skipsCount && reserve.current.length) {
      const extra = reserve.current.shift()!;
      queueRef.current = [...queueRef.current, extra];
      setQueue(queueRef.current);
    }
    record(setup.skipsCount ? 'none' : 'skip');
  };

  // timeout and clock drawing
  useEffect(() => {
    if (!q) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      if (brain && clockRef.current) clockRef.current.textContent = mmss(Math.max(0, (quarterEnd.current - now) / 1000));
      if (brain && now >= quarterEnd.current && !done.current) { finish(); return; }
      if (timed && phase === 'ask') {
        const left = Math.max(0, secs * 1000 - (now - qStart.current));
        if (fuseRef.current) fuseRef.current.style.transform = `scaleX(${left / (secs * 1000)})`;
        if (numRef.current) numRef.current.textContent = String(Math.ceil(left / 1000));
        if (padRef.current) padRef.current.classList.toggle('hot', left <= 3000);
        if (left <= 0) {
          if (setup.answerMode === 'type' && !q.options && typed.trim()) record(checkTyped(typed, q) ? 'right' : 'wrong', typed.trim());
          else record('none');
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [q, phase, timed, secs, brain, typed, record, finish, setup.answerMode]);

  useEffect(() => { if (phase === 'ask' && setup.answerMode === 'type' && q && !q.options) inputRef.current?.focus(); }, [q, phase, setup.answerMode]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q) return;
      const typing = e.target instanceof HTMLInputElement;
      if (typing && e.key !== 'Enter' && e.key !== 'Escape') return;
      if (e.key === 'Escape') { if (confirm('Quit this session? Answers so far are kept.')) finish(); return; }
      if (phase === 'ask') {
        if (opts && ['1', '2', '3'].includes(e.key)) { const o = opts[Number(e.key) - 1]; if (o) choose(o); }
        else if (!q.options && setup.answerMode === 'say' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); gotIt(); }
        else if (!q.options && setup.answerMode === 'type' && e.key === 'Enter') submitTyped();
        else if (e.key.toLowerCase() === 's') skip();
      } else if (phase === 'mark') {
        if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'r') mark('right');
        if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'w') mark('wrong');
      } else if (phase === 'feedback' && setup.secs === 0 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); advance(); }
      if (e.key.toLowerCase() === 'f' && !typing) onFlag(q);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!q) return null;
  const n = items.current.filter(i => i.r !== 'skip').length;
  const total = initialQueue.length;
  const showAnswer = phase === 'mark' || phase === 'feedback';
  const optClass = (o: string) => {
    if (phase !== 'feedback') return 'opt';
    if (o === q.answer) return 'opt right';
    if (o === chosen) return 'opt wrong';
    return 'opt dim';
  };

  return (
    <div className="quiz">
      <div className="quiz-bar">
        <span className="quiz-what">{brain ? 'Brain Match' : 'Practice'} · {SUBJECT_NAMES[setup.subject]}{setup.level ? ` · Level ${setup.level}` : ''}</span>
        {brain
          ? <span className="quarter-clock" aria-label="Quarter clock"><span ref={clockRef}>{mmss(setup.quarterSecs)}</span></span>
          : <span className="count">{Math.max(1, Math.min(phase === 'feedback' ? n : n + 1, total))} of {total} · <b>{scoreItems(items.current, setup.scoring)}</b></span>}
      </div>

      <div ref={padRef} className={`pad${phase === 'feedback' ? ` fb-${last?.r}` : ''}`}>
        {timed && (
          <div className="fuse-row" aria-hidden="true">
            <div className="fuse"><div ref={fuseRef} className="fuse-fill" /></div>
            <span ref={numRef} className="secs">{secs}</span>
          </div>
        )}
        <div className="q-text"><MathText text={q.q} /></div>

        {opts && (
          <div className="opts">
            {opts.map((o, i) => (
              <button key={o} className={optClass(o)} onClick={() => choose(o)} disabled={phase !== 'ask'}>
                <span className="key">{i + 1}</span><MathText text={o} />
              </button>
            ))}
          </div>
        )}

        {!opts && phase === 'ask' && setup.answerMode === 'say' && (
          <button className="primary big" onClick={gotIt}>Got it <span className="hint">Space</span></button>
        )}
        {!opts && phase === 'ask' && setup.answerMode === 'type' && (
          <form className="type-row" onSubmit={e => { e.preventDefault(); submitTyped(); }}>
            <input ref={inputRef} value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type your answer" autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="text" aria-label="Your answer" />
            <button className="primary" type="submit">Enter</button>
          </form>
        )}

        {showAnswer && !opts && (
          <div className={`answer-strip ${phase === 'feedback' && last ? last.r : ''}`}>
            <span className="answer-label">Answer</span> <MathText text={q.answer} />
            {phase === 'feedback' && last?.given && last.r === 'wrong' && <span className="given">you typed <s>{last.given}</s></span>}
          </div>
        )}
        {phase === 'mark' && (
          <div className="mark-row">
            <button className="mark wrong" onClick={() => mark('wrong')}>I was wrong <span className="hint">W</span></button>
            <button className="mark right" onClick={() => mark('right')}>I was right <span className="hint">R</span></button>
          </div>
        )}
        {phase === 'feedback' && setup.secs === 0 && (
          <div className="untimed-more">
            {q.solution && <div className="solution"><MathText text={q.solution} /></div>}
            {q.trick && <div className="trick"><b>Faster:</b> <MathText text={q.trick} /></div>}
            <button className="primary" onClick={advance}>Next <span className="hint">Enter</span></button>
          </div>
        )}
      </div>

      {nextQ && (
        <div className="next" aria-hidden="true">
          <MathText text={nextQ.q} />
          {nextOpts && <div className="next-opts">{nextOpts.map(o => <span key={o}><MathText text={o} /></span>)}</div>}
        </div>
      )}

      <div className="quiz-foot">
        {setup.skips && !brain ? <button className="ghost" onClick={skip} disabled={phase !== 'ask'}>Skip <span className="hint">S</span></button> : <span />}
        <button className="ghost" onClick={() => onFlag(q)}>{flagged(q.id) ? 'Flagged' : 'Flag'} <span className="hint">F</span></button>
        <button className="ghost" onClick={() => { if (confirm('Quit this session? Answers so far are kept.')) { items.current.length ? finish() : onQuit(); } }}>Quit</button>
      </div>
    </div>
  );
}
