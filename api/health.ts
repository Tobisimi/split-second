// Open /api/health in the browser (after the password prompt) to see whether sync storage is set up.
// It lists the names of the storage settings Vercel gave this project, never their values.
import { creds, json, NOT_CONNECTED, ping } from './_redis.js';

export async function GET() {
  const found = Object.keys(process.env)
    .filter(n => /(REST_API_URL|REST_API_TOKEN|REDIS_REST_URL|REDIS_REST_TOKEN)$|^(KV_URL|REDIS_URL)$/.test(n)).sort();
  const c = creds();
  if (!c) return json({ storage: 'not connected', settingsFound: found, fix: NOT_CONNECTED }, 503);
  try {
    return json({ storage: 'connected and answering', using: c.name, settingsFound: found, ping: await ping() });
  } catch (e) {
    return json({ storage: 'connected but not answering', using: c.name, settingsFound: found, error: (e as Error).message }, 502);
  }
}
