import type { Flag, Progress, SessionRec } from '../types';

const KEY = (p: string) => `ss.progress.${p}`;
const PROFILE_KEY = 'ss.profile';
const MAX_DETAILED_SESSIONS = 300;

export const slug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
export const emptyProgress = (profile: string): Progress => ({ v: 1, profile, updated: 0, sessions: [], flags: {} });

export function loadLocal(profile: string): Progress {
  try {
    const s = localStorage.getItem(KEY(profile));
    if (s) { const p = JSON.parse(s); if (p && p.v === 1) return p; }
  } catch { /* storage unavailable */ }
  return emptyProgress(profile);
}
export function saveLocal(p: Progress) { try { localStorage.setItem(KEY(p.profile), JSON.stringify(p)); } catch { /* ignore */ } }
export function savedProfile(): string | null { try { return localStorage.getItem(PROFILE_KEY); } catch { return null; } }
export function rememberProfile(p: string | null) { try { if (p) localStorage.setItem(PROFILE_KEY, p); else localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ } }

export function merge(a: Progress, b: Progress): Progress {
  const byId = new Map<string, SessionRec>();
  for (const s of [...a.sessions, ...b.sessions]) {
    const prev = byId.get(s.id);
    if (!prev || s.items.length > prev.items.length) byId.set(s.id, s);
  }
  const sessions = [...byId.values()].sort((x, y) => x.at - y.at);
  // keep per-question detail for recent sessions only, so the record stays small enough to sync
  sessions.slice(0, Math.max(0, sessions.length - MAX_DETAILED_SESSIONS)).forEach(s => { s.items = []; });
  const flags: Record<string, Flag> = { ...a.flags };
  for (const [k, f] of Object.entries(b.flags ?? {})) if (!flags[k] || flags[k].at < f.at) flags[k] = f;
  return { v: 1, profile: a.profile, updated: Math.max(a.updated, b.updated), sessions, flags };
}

async function api(path: string, init?: RequestInit) {
  const r = await fetch(path, { cache: 'no-store', ...init });
  if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => '')}`.trim());
  return r.json();
}

export async function sync(local: Progress): Promise<Progress> {
  const remote = await api(`/api/progress?profile=${encodeURIComponent(local.profile)}`);
  const merged = remote && remote.v === 1 ? merge(local, remote) : local;
  merged.updated = Date.now();
  saveLocal(merged);
  await api(`/api/progress?profile=${encodeURIComponent(local.profile)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(merged),
  });
  return merged;
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
