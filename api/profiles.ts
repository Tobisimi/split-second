import { configured, json, rget, rset } from './_redis';

type P = { id: string; name: string };
const slug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);

async function list(): Promise<P[]> { const v = await rget('ss:profiles'); return v ? JSON.parse(v) : []; }

export async function GET() {
  if (!configured()) return json({ error: 'Storage not connected. Add Upstash for Redis to this Vercel project.' }, 503);
  return json({ profiles: await list() });
}

export async function POST(req: Request) {
  if (!configured()) return json({ error: 'Storage not connected. Add Upstash for Redis to this Vercel project.' }, 503);
  const { name } = await req.json().catch(() => ({ name: '' }));
  const clean = String(name || '').trim().slice(0, 40);
  const id = slug(clean);
  if (!id) return json({ error: 'Enter a name' }, 400);
  const all = await list();
  if (!all.some(p => p.id === id)) { if (all.length >= 12) return json({ error: 'Too many profiles' }, 400); all.push({ id, name: clean }); await rset('ss:profiles', JSON.stringify(all)); }
  return json({ profiles: all });
}
