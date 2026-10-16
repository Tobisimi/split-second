import type { Flag, Progress, SessionRec } from '../types';

const KEY = (p: string) => `ss.progress.${p}`;
const PROFILE_KEY = 'ss.profile';
const KEEP_FULL = 60;          // the most recent sessions keep answer times and typed answers
const LIMIT = 700_000;         // bytes; the server takes records up to 900 KB
const TIMEOUT_MS = 20_000;

export const slug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
export const emptyProgress = (profile: string): Progress => ({ v: 1, profile, updated: 0, sessions: [], flags: {} });

export function loadLocal(profile: string): Progress {
  try {
    const s = localStorage.getItem(KEY(profile));
    if (s) { const p = JSON.parse(s); if (p && p.v === 1 && Array.isArray(p.sessions)) return { ...p, profile, flags: p.flags ?? {} }; }
  } catch { /* storage unavailable or damaged */ }
  return emptyProgress(profile);
}
export function saveLocal(p: Progress) { try { localStorage.setItem(KEY(p.profile), JSON.stringify(p)); } catch { /* ignore */ } }
export function savedProfile(): string | null { try { return localStorage.getItem(PROFILE_KEY); } catch { return null; } }
export function rememberProfile(p: string | null) { try { if (p) localStorage.setItem(PROFILE_KEY, p); else localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ } }

// Changes always start from what is saved on this device, so nothing written meanwhile (by a sync) is lost.
export function addSession(profile: string, rec: SessionRec): Progress {
  const cur = loadLocal(profile);
  const p = compact({ ...cur, updated: Date.now(), sessions: [...cur.sessions.filter(s => s.id !== rec.id), rec] });
  saveLocal(p);
  return p;
}
export function setFlag(profile: string, id: string, flag: Flag): Progress {
  const cur = loadLocal(profile);
  const p = { ...cur, updated: Date.now(), flags: { ...cur.flags, [id]: flag } };
  saveLocal(p);
  return p;
}

const detail = (s: SessionRec) => s.items.some(i => i.ms != null || i.given != null);

// Keep the record small enough to sync. Older sessions keep which questions were asked and the result (that is what
// decides which questions come up next); only the most recent keep answer times and typed answers. If it is still too
// big, the oldest sessions keep just their date and score. Pure: returns new objects.
export function compact(p: Progress): Progress {
  const n = p.sessions.length;
  const sessions = p.sessions.map((s, i) => (i < n - KEEP_FULL && detail(s) ? { ...s, items: s.items.map(({ id, r }) => ({ id, r })) } : s));
  let size = JSON.stringify({ ...p, sessions }).length;
  for (let i = 0; size > LIMIT && i < n - KEEP_FULL; i++) {
    if (!sessions[i].items.length) continue;
    size -= JSON.stringify(sessions[i].items).length - 2;
    sessions[i] = { ...sessions[i], items: [] };
  }
  return { ...p, sessions };
}

export function merge(a: Progress, b: Progress): Progress {
  const byId = new Map<string, SessionRec>();
  for (const s of [...a.sessions, ...b.sessions]) {
    const prev = byId.get(s.id);
    if (!prev || s.items.length > prev.items.length || (s.items.length === prev.items.length && detail(s) && !detail(prev))) byId.set(s.id, s);
  }
  const sessions = [...byId.values()].sort((x, y) => x.at - y.at);
  const flags: Record<string, Flag> = { ...a.flags };
  for (const [k, f] of Object.entries(b.flags ?? {})) if (!flags[k] || flags[k].at < f.at) flags[k] = f;
  return compact({ v: 1, profile: a.profile, updated: Math.max(a.updated, b.updated), sessions, flags });
}

async function api(path: string, init?: RequestInit) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(path, { cache: 'no-store', ...init, signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => '')}`.trim());
    return await r.json();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('timeout');
    throw e;
  } finally { clearTimeout(timer); }
}

// One sync at a time. Each one merges the server's copy with what this device has saved at that moment, then sends the
// result back, so a session finished while an earlier sync was still waiting on the network is never overwritten.
let chain: Promise<unknown> = Promise.resolve();
export function sync(profile: string): Promise<Progress> {
  const run = chain.then(async () => {
    const path = `/api/progress?profile=${encodeURIComponent(profile)}`;
    const remote = await api(path);
    const local = loadLocal(profile);
    const merged = remote && remote.v === 1 && remote.profile === profile && Array.isArray(remote.sessions) ? merge(local, remote) : compact(local);
    merged.updated = Date.now();
    saveLocal(merged);
    await api(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merged) });
    return merged;
  });
  chain = run.catch(() => undefined);
  return run;
}

// A short, plain reason for a failed sync, from the error api() throws ("<status> <body>").
export function syncProblem(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  if (/Storage not connected/i.test(m)) return 'Sync is not set up yet: the Upstash database is not connected to this Vercel project.';
  if (/Storage error/i.test(m)) return 'The sync storage did not answer.';
  if (/^timeout/.test(m)) return 'The sync server took too long to answer.';
  if (/^413/.test(m)) return 'Your progress record is too large to sync.';
  if (/^40[34]/.test(m)) return 'This copy of the app has no sync server.';
  if (/^401/.test(m)) return 'The password check failed. Reload the page and sign in again.';
  if (/fetch|network|load failed/i.test(m)) return 'No connection to the sync server right now.';
  return `The sync server had a problem (${m.slice(0, 60)}).`;
}

export async function listProfiles(): Promise<{ id: string; name: string }[]> {
  const j = await api('/api/profiles');
  return Array.isArray(j.profiles) ? j.profiles : [];
}
export async function addProfile(name: string): Promise<{ id: string; name: string }[]> {
  const j = await api('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  return Array.isArray(j.profiles) ? j.profiles : [];
}

export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
}
