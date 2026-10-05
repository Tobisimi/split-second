import { next } from '@vercel/functions';

// Password gate for the whole site, questions file and API included (checked on the server).
// Set SITE_PASSWORD in Vercel > Project > Settings > Environment Variables. Any username works.
export default function middleware(request: Request) {
  const password = process.env.SITE_PASSWORD;
  if (!password) {
    return new Response('Locked: set SITE_PASSWORD in this Vercel project\'s environment variables, then redeploy.', { status: 503 });
  }
  const header = request.headers.get('authorization') || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    try {
      const decoded = atob(encoded);
      if (decoded.slice(decoded.indexOf(':') + 1) === password) return next();
    } catch { /* fall through */ }
  }
  return new Response('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Split Second", charset="UTF-8"' },
  });
}
