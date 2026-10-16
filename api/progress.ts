// Local imports need the .js extension: the project is an ES module, and Vercel runs each function file as is.
import { guard, json, rget, rset } from './_redis.js';

const okId = (s: string | null) => !!s && /^[a-z0-9-]{1,32}$/.test(s);
const MAX = 900_000; // stay under Upstash's 1 MB request limit

export function GET(req: Request) {
  return guard(async () => {
    const id = new URL(req.url).searchParams.get('profile');
    if (!okId(id)) return json({ error: 'Bad profile id' }, 400);
    const v = await rget(`ss:progress:${id}`);
    return json(v ? JSON.parse(v) : null);
  });
}

export function PUT(req: Request) {
  return guard(async () => {
    const id = new URL(req.url).searchParams.get('profile');
    if (!okId(id)) return json({ error: 'Bad profile id' }, 400);
    const body = await req.text();
    if (body.length > MAX) return json({ error: 'Progress record too large' }, 413);
    const p = JSON.parse(body);
    if (!p || p.v !== 1 || p.profile !== id || !Array.isArray(p.sessions)) return json({ error: 'Bad progress record' }, 400);
    await rset(`ss:progress:${id}`, body);
    return json({ ok: true });
  });
}
