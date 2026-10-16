// Tiny Upstash Redis REST client.
// Vercel's Upstash integration adds KV_REST_API_URL and KV_REST_API_TOKEN, or the same names behind a custom prefix
// (for example STORAGE_KV_REST_API_URL); a database made on upstash.com gives UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN. Any of these works. Only the names are ever reported, never the values.
type Creds = { url: string; token: string; name: string };

export function creds(): Creds | null {
  const env = process.env;
  const names = ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL',
    ...Object.keys(env).filter(n => /_REST_API_URL$|_REDIS_REST_URL$/.test(n)).sort()];
  for (const name of names) {
    const url = env[name], token = env[name.replace(/URL$/, 'TOKEN')];
    if (url && token) return { url: url.replace(/\/+$/, ''), token, name };
  }
  return null;
}

export const configured = () => creds() !== null;

export const NOT_CONNECTED = 'Storage not connected. Connect the Upstash database to this Vercel project, then redeploy.';

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const c = creds();
  if (!c) throw new Error(NOT_CONNECTED);
  const r = await fetch(`${c.url}/${path}`, { ...init, headers: { Authorization: `Bearer ${c.token}` } });
  if (!r.ok) throw new Error(`Upstash answered ${r.status} to ${path.split('/')[0]}`);
  return ((await r.json()) as { result: unknown }).result;
}

export async function rget(key: string): Promise<string | null> {
  return (await call(`get/${encodeURIComponent(key)}`)) as string | null;
}

export async function rset(key: string, value: string): Promise<void> {
  await call(`set/${encodeURIComponent(key)}`, { method: 'POST', body: value });
}

export const ping = () => call('ping');

export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// Run a handler and turn a storage failure into a JSON error the app can show, instead of a crash.
export async function guard(fn: () => Promise<Response>): Promise<Response> {
  if (!configured()) return json({ error: NOT_CONNECTED }, 503);
  try { return await fn(); }
  catch (e) { return json({ error: `Storage error: ${(e as Error).message}` }, 502); }
}
