import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ItemRec, Progress, Question, SessionRec, Setup, Subject } from './types';
import { STAGE_NAMES, SUBJECT_NAMES } from './types';
import { BANK, mmss, ordered, poolFor, questionStates, ytLink } from './lib/bank';
import { addProfile, downloadJson, listProfiles, loadLocal, rememberProfile, savedProfile, saveLocal, slug, sync } from './lib/store';
import { RULE_NAMES } from './lib/scoring';
import { MathText } from './lib/math';
import Quiz from './screens/Quiz';

type Screen = 'profile' | 'home' | 'quiz' | 'results' | 'stats' | 'rules';
type SyncState = 'local' | 'syncing' | 'synced' | 'failed';

const DEFAULTS: Setup = { mode: 'practice', subject: 'AM', level: 0, count: 20, secs: 10, answerMode: 'say', skips: true, skipsCount: false, scoring: 'practice', quarterSecs: 120, missesOnly: false };
const SUBJECTS: Subject[] = ['AM', 'DA', 'VR', 'GK'];
const BYID = new Map(BANK.map(q => [q.id, q]));

const TAG_TEXT: Record<Question['tag'], string> = {
  confirmed: 'Confirmed by the show.',
  disputed: 'The show\'s answer looks wrong; this is the worked answer.',
  worked_out: 'Not confirmed: the show\'s answer wasn\'t captured, so this was worked out.',
};
const RESULT_TEXT = { right: 'got it right', wrong: 'got it wrong', none: 'nobody answered' } as const;
function onShow(q: Question): string {
  if (!q.result) return '';
  if (q.result === 'none') return 'On the show, nobody answered.';
  const who = q.player ? `${q.player}${q.school ? ` (${q.school})` : ''}` : (q.school || 'The contestant');
  return `On the show, ${who} ${RESULT_TEXT[q.result]}.`;
}

function loadSetup(): Setup { try { const s = localStorage.getItem('ss.setup'); if (s) return { ...DEFAULTS, ...JSON.parse(s) }; } catch { /* */ } return DEFAULTS; }
function saveSetup(s: Setup) { try { localStorage.setItem('ss.setup', JSON.stringify(s)); } catch { /* */ } }
function savedName(id: string) { try { return localStorage.getItem(`ss.name.${id}`) || id; } catch { return id; } }
function rememberName(id: string, name: string) { try { localStorage.setItem(`ss.name.${id}`, name); } catch { /* */ } }

export default function App() {
  const [profile, setProfile] = useState<string | null>(savedProfile());
  const [progress, setProgress] = useState<Progress | null>(profile ? loadLocal(profile) : null);
  const [screen, setScreen] = useState<Screen>(profile ? 'home' : 'profile');
  const [setup, setSetup] = useState<Setup>(loadSetup());
  const [syncState, setSyncState] = useState<SyncState>('local');
  const [run, setRun] = useState<{ queue: Question[]; reserve: Question[]; key: number } | null>(null);
  const [lastSession, setLastSession] = useState<SessionRec | null>(null);

  const doSync = useCallback(async (p: Progress) => {
    setSyncState('syncing');
    try { const merged = await sync(p); setProgress(merged); setSyncState('synced'); }
    catch { setSyncState('failed'); }
  }, []);

  useEffect(() => { if (profile) { const p = loadLocal(profile); setProgress(p); doSync(p); } }, [profile, doSync]);

  const states = useMemo(() => questionStates(progress ?? { v: 1, profile: '', updated: 0, sessions: [], flags: {} }), [progress]);
  const update = (s: Partial<Setup>) => setSetup(prev => { const n = { ...prev, ...s }; saveSetup(n); return n; });

  const choose = (id: string, name: string) => { rememberProfile(id); rememberName(id, name); setProfile(id); setScreen('home'); };

  const start = () => {
    const pool = ordered(poolFor(setup, states), states);
    if (!pool.length) return;
    const n = setup.mode === 'brain' ? pool.length : Math.min(setup.count, pool.length);
    setRun({ queue: pool.slice(0, n), reserve: pool.slice(n), key: Date.now() });
    setScreen('quiz');
  };

  const finishSession = (rec: SessionRec) => {
    if (!progress) return;
    const p: Progress = { ...progress, updated: Date.now(), sessions: [...progress.sessions, rec] };
    saveLocal(p); setProgress(p); setLastSession(rec); setScreen('results'); doSync(p);
  };

  const toggleFlag = (q: Question) => {
    if (!progress) return;
    const flags = { ...progress.flags };
    const on = flags[q.id] && flags[q.id].note !== '__off__';
    if (on) flags[q.id] = { note: '__off__', at: Date.now() };
    else { const note = prompt('What looks wrong with this question? (optional)') ?? ''; flags[q.id] = { note: note || 'flagged', at: Date.now() }; }
    const p = { ...progress, flags, updated: Date.now() };
    saveLocal(p); setProgress(p);
  };
  const isFlagged = (id: string) => !!progress?.flags[id] && progress.flags[id].note !== '__off__';

  if (screen === 'profile' || !profile || !progress) return <ProfileScreen onChoose={choose} />;

  if (screen === 'quiz' && run) {
    return <Quiz key={run.key} setup={setup} queue={run.queue} reserve={run.reserve} onFinish={finishSession}
      onQuit={() => setScreen('home')} onFlag={toggleFlag} flagged={isFlagged} />;
  }

  const syncText = { local: 'Saved on this device', syncing: 'Syncing…', synced: 'Synced', failed: 'Not synced, saved on this device' }[syncState];
  const header = (
    <header className="top">
      <button className="wordmark" onClick={() => setScreen('home')}>Split Second</button>
      <div className="who">
        <span>{savedName(profile)}</span>
        <button className={`sync ${syncState}`} onClick={() => doSync(progress)} title="Sync now">{syncText}</button>
      </div>
    </header>
  );

  if (screen === 'results' && lastSession) return <div className="page">{header}<Results rec={lastSession} onAgain={start} onHome={() => setScreen('home')} onFlag={toggleFlag} flagged={isFlagged} /></div>;
  if (screen === 'stats') return <div className="page">{header}<Stats progress={progress} onSwitch={() => { rememberProfile(null); setProfile(null); setScreen('profile'); }} onBack={() => setScreen('home')} /></div>;
  if (screen === 'rules') return <div className="page">{header}<Rules onBack={() => setScreen('home')} /></div>;

  const available = poolFor(setup, states).length;
  const brain = setup.mode === 'brain';
  return (
    <div className="page">
      {header}
      <main className="home">
        <div className="seg big" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={!brain} className={!brain ? 'on' : ''} onClick={() => update({ mode: 'practice', scoring: 'practice', subject: setup.subject })}>
            <b>Practice</b><span>Set questions at your pace</span>
          </button>
          <button role="tab" aria-selected={brain} className={brain ? 'on' : ''} onClick={() => update({ mode: 'brain', scoring: 'ladder', subject: setup.subject === 'MIX' ? 'AM' : setup.subject, secs: setup.secs || 10 })}>
            <b>Brain Match</b><span>A {mmss(setup.quarterSecs)} quarter, one subject</span>
          </button>
        </div>

        <Field label="Subject">
          <Seg value={setup.subject} onChange={v => update({ subject: v as Setup['subject'] })}
            options={[...SUBJECTS.map(s => [s, SUBJECT_NAMES[s]] as [string, string]), ...(brain ? [] : [['MIX', 'Mixed'] as [string, string]])]} />
        </Field>
        <Field label="Level">
          <Seg value={String(setup.level)} onChange={v => update({ level: Number(v) as Setup['level'] })}
            options={[['0', 'All'], ['1', 'Group stage'], ['2', 'Quarter-finals'], ['3', 'Semis and final']]} />
        </Field>
        {!brain && (
          <Field label="Questions">
            <Seg value={String(setup.count)} onChange={v => update({ count: Number(v) })} options={[['10', '10'], ['20', '20'], ['50', '50'], ['100', '100']]} />
          </Field>
        )}
        <Field label="Seconds per question">
          <Seg value={String(setup.secs)} onChange={v => update({ secs: Number(v) })}
            options={[['10', '10'], ['8', '8'], ['6', '6'], ['5', '5'], ...(brain ? [] : [['0', 'Untimed'] as [string, string]])]} />
        </Field>
        <Field label="How you answer">
          <Seg value={setup.answerMode} onChange={v => update({ answerMode: v as Setup['answerMode'] })}
            options={[['say', 'Say it, then mark it'], ['type', 'Type it']]} />
        </Field>
        <Field label="Scoring">
          <Seg value={setup.scoring} onChange={v => update({ scoring: v as Setup['scoring'] })}
            options={brain ? [['ladder', 'Brain Match ladder'], ['practice', '+10 / minus 5']] : [['practice', '+10 / minus 5'], ['show_qb', 'Quick Buzz rules']]} />
          {setup.scoring === 'ladder' && <p className="note">Each right answer climbs 2, 2, 3, 3, 3 … 6; a wrong answer drops you to the bottom. This rule isn't confirmed yet.</p>}
        </Field>
        {!brain && (
          <Field label="Skips">
            <Seg value={!setup.skips ? 'off' : setup.skipsCount ? 'count' : 'replace'} onChange={v => update({ skips: v !== 'off', skipsCount: v === 'count' })}
              options={[['replace', 'Allowed, replaced'], ['count', 'Allowed, count as unanswered'], ['off', 'Off']]} />
          </Field>
        )}
        <label className="check"><input type="checkbox" checked={setup.missesOnly} onChange={e => update({ missesOnly: e.target.checked })} /> Only questions I missed before</label>

        <div className="start-row">
          <button className="primary start" onClick={start} disabled={!available}>{brain ? 'Start quarter' : 'Start practice'}</button>
          <span className="avail">{available ? `${available} question${available === 1 ? '' : 's'} in this set` : setup.missesOnly ? 'No missed questions here yet' : 'No questions in this set yet'}</span>
        </div>
        <nav className="links"><button onClick={() => setScreen('stats')}>Your stats</button><button onClick={() => setScreen('rules')}>How answers are checked</button></nav>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><div className="field-label">{label}</div>{children}</div>;
}
function Seg({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return <div className="seg">{options.map(([v, l]) => <button key={v} className={v === value ? 'on' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

function ProfileScreen({ onChoose }: { onChoose: (id: string, name: string) => void }) {
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  useEffect(() => { listProfiles().then(setList).catch(() => { setList([]); setErr('Can\'t reach saved players right now. You can still add yourself; progress stays on this device until sync works.'); }); }, []);
  const add = async () => {
    const clean = name.trim(); if (!clean) return;
    try { const l = await addProfile(clean); setList(l); } catch { /* offline */ }
    onChoose(slug(clean), clean);
  };
  return (
    <div className="page">
      <header className="top"><span className="wordmark">Split Second</span></header>
      <main className="profile">
        <h1>Who's practising?</h1>
        {list === null ? <p className="note">Loading players…</p> : (
          <div className="players">{list.map(p => <button key={p.id} className="player" onClick={() => onChoose(p.id, p.name)}>{p.name}</button>)}</div>
        )}
        {err && <p className="note">{err}</p>}
        <form className="type-row" onSubmit={e => { e.preventDefault(); add(); }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your first name" aria-label="Your first name" maxLength={40} />
          <button className="primary" type="submit">Add player</button>
        </form>
      </main>
    </div>
  );
}

function ReviewItem({ it, onFlag, flagged }: { it: ItemRec; onFlag: (q: Question) => void; flagged: (id: string) => boolean }) {
  const q = BYID.get(it.id);
  if (!q) return null;
  const label = { right: 'Right', wrong: 'Wrong', none: 'No answer', skip: 'Skipped' }[it.r];
  return (
    <li className={`rev ${it.r}`}>
      <div className="rev-head"><span className={`badge ${it.r}`}>{label}</span><span className="rev-meta">{SUBJECT_NAMES[q.subject]} · {STAGE_NAMES[q.stage]} · {q.match}</span></div>
      <div className="rev-q"><MathText text={q.q} /></div>
      {q.options && <div className="rev-opts">{q.options.map(o => <span key={o} className={o === q.answer ? 'right' : o === it.given ? 'wrong' : ''}><MathText text={o} /></span>)}</div>}
      <div className="rev-a"><b>Answer:</b> <MathText text={q.answer} />{it.given && it.r === 'wrong' && !q.options && <> · you: <s>{it.given}</s></>}</div>
      <div className="rev-tag">{TAG_TEXT[q.tag]}{q.tag === 'disputed' && q.showKey ? <> Shown: <MathText text={q.showKey} />.</> : null}{q.showNote ? ` ${q.showNote}` : ''} {onShow(q)}</div>
      {q.solution && <div className="solution"><MathText text={q.solution} /></div>}
      {q.trick && <div className="trick"><b>Faster:</b> <MathText text={q.trick} /></div>}
      <div className="rev-links"><a href={ytLink(q)} target="_blank" rel="noreferrer">Watch it on the show ({mmss(q.t)})</a><button className="ghost small" onClick={() => onFlag(q)}>{flagged(q.id) ? 'Flagged' : 'Flag'}</button></div>
    </li>
  );
}

function Results({ rec, onAgain, onHome, onFlag, flagged }: { rec: SessionRec; onAgain: () => void; onHome: () => void; onFlag: (q: Question) => void; flagged: (id: string) => boolean }) {
  const [all, setAll] = useState(false);
  const c = { right: 0, wrong: 0, none: 0, skip: 0 };
  rec.items.forEach(i => { c[i.r]++; });
  const attempted = c.right + c.wrong + c.none;
  const times = rec.items.filter(i => i.r === 'right' || i.r === 'wrong').map(i => i.ms ?? 0);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length / 1000 : 0;
  const shown = rec.items.filter(i => all || i.r !== 'right');
  return (
    <main className="results">
      <div className="score-line"><span className="score">{rec.score}</span><span className="score-rule">{RULE_NAMES[rec.scoring]}</span></div>
      <dl className="tally">
        <div><dt>Right</dt><dd>{c.right}</dd></div><div><dt>Wrong</dt><dd>{c.wrong}</dd></div>
        <div><dt>No answer</dt><dd>{c.none}</dd></div><div><dt>Skipped</dt><dd>{c.skip}</dd></div>
        <div><dt>Accuracy</dt><dd>{attempted ? Math.round(100 * c.right / attempted) : 0}%</dd></div>
        <div><dt>Average answer</dt><dd>{avg.toFixed(1)} s</dd></div>
      </dl>
      <div className="start-row"><button className="primary" onClick={onAgain}>Go again</button><button className="ghost" onClick={onHome}>Change settings</button></div>
      <div className="rev-bar"><h2>{all ? 'Every question' : 'Questions to review'}</h2><button className="ghost small" onClick={() => setAll(a => !a)}>{all ? 'Only the misses' : 'Show all'}</button></div>
      {shown.length ? <ul className="review">{shown.map((it, k) => <ReviewItem key={k} it={it} onFlag={onFlag} flagged={flagged} />)}</ul> : <p className="note">Nothing missed. Try fewer seconds next time.</p>}
    </main>
  );
}

function Stats({ progress, onSwitch, onBack }: { progress: Progress; onSwitch: () => void; onBack: () => void }) {
  const rows = SUBJECTS.map(s => {
    const its = progress.sessions.flatMap(x => x.items).filter(i => BYID.get(i.id)?.subject === s && i.r !== 'skip');
    const right = its.filter(i => i.r === 'right').length;
    const ms = its.filter(i => i.r !== 'none' && i.ms != null).map(i => i.ms!);
    return { s, n: its.length, acc: its.length ? Math.round(100 * right / its.length) : null, avg: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length / 1000 : null };
  });
  const flags = Object.entries(progress.flags).filter(([, f]) => f.note !== '__off__');
  const recent = [...progress.sessions].reverse().slice(0, 12);
  return (
    <main className="stats">
      <h1>Your stats</h1>
      <table className="tbl"><thead><tr><th>Subject</th><th>Answered</th><th>Accuracy</th><th>Average time</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.s}><td>{SUBJECT_NAMES[r.s]}</td><td>{r.n}</td><td>{r.acc == null ? '–' : `${r.acc}%`}</td><td>{r.avg == null ? '–' : `${r.avg.toFixed(1)} s`}</td></tr>)}</tbody></table>
      <h2>Recent sessions</h2>
      {recent.length ? <table className="tbl"><thead><tr><th>When</th><th>Mode</th><th>Subject</th><th>Score</th><th>Right</th></tr></thead>
        <tbody>{recent.map(s => { const r = s.items.filter(i => i.r === 'right').length; const a = s.items.filter(i => i.r !== 'skip').length; return <tr key={s.id}><td>{new Date(s.at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</td><td>{s.mode === 'brain' ? 'Brain Match' : 'Practice'}</td><td>{SUBJECT_NAMES[s.subject]}</td><td>{s.score}</td><td>{r} of {a}</td></tr>; })}</tbody></table>
        : <p className="note">No sessions yet.</p>}
      <h2>Flagged questions</h2>
      <p className="note">{flags.length ? `${flags.length} flagged. Download the list and send it to Claude to check.` : 'Nothing flagged.'}</p>
      <div className="start-row">
        {flags.length > 0 && <button className="ghost" onClick={() => downloadJson(`flags-${progress.profile}.json`, flags.map(([id, f]) => ({ id, note: f.note, q: BYID.get(id)?.q })))}>Download flags</button>}
        <button className="ghost" onClick={() => downloadJson(`progress-${progress.profile}.json`, progress)}>Download my progress</button>
        <button className="ghost" onClick={onSwitch}>Switch player</button>
        <button className="primary" onClick={onBack}>Back</button>
      </div>
    </main>
  );
}

function Rules({ onBack }: { onBack: () => void }) {
  return (
    <main className="rules">
      <h1>How answers are checked</h1>
      <h2>Say it, then mark it</h2>
      <p>Answer out loud, as on the show, and press Got it (or Space) the moment you've said it. That stops the clock and records your time. The answer appears; mark yourself honestly with I was right (R) or I was wrong (W).</p>
      <h2>Type it</h2>
      <ul>
        <li>Capitals, extra spaces and a full stop at the end don't matter.</li>
        <li>Equal numbers count: 1/2, 0.5 and 50% where a percentage makes sense.</li>
        <li>Rounded answers count within each question's tolerance.</li>
        <li>Units are optional unless the question is about the unit.</li>
        <li>If time runs out while you're typing, what you've typed is checked.</li>
      </ul>
      <h2>Options</h2>
      <p>Questions with three options show them in a new order each time. Press 1, 2 or 3, or tap.</p>
      <h2>Brain Match</h2>
      <p>One subject, a quarter clock, and the next question waiting underneath. Nothing tells you right or wrong until the quarter ends, just like the show.</p>
      <h2>Where answers come from</h2>
      <p>Each answer says whether the show accepted it, whether it has been checked, or whether it was worked out because nobody on the show got it. Flag anything that looks wrong (F).</p>
      <button className="primary" onClick={onBack}>Back</button>
    </main>
  );
}
