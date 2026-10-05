// Tiny Upstash Redis REST client. Works with the env vars Vercel adds when you connect Upstash for Redis.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export const configured = () => Boolean(URL_ && TOKEN);

export async function rget(key: string): Promise<string | null> {
  const r = await fetch(`${URL_}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`redis get ${r.status}`);
  const j = await r.json() as { result: string | null };
  return j.result;
}

export async function rset(key: string, value: string): Promise<void> {
  const r = await fetch(`${URL_}/set/${encodeURIComponent(key)}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: value });
  if (!r.ok) throw new Error(`redis set ${r.status}`);
}

export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
