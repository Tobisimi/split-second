# Split Second

Private practice app for University Duel. Not affiliated with the show or its organisers; keep this repository private.

## Run locally
npm install, then npm run dev (the sync API only runs on Vercel or with `vercel dev`).

## Deploy (Vercel)
1. Import this repo in Vercel (framework preset: Vite).
2. Storage tab: add Upstash for Redis (free) and connect it to the project. It adds KV_REST_API_URL and KV_REST_API_TOKEN.
3. Settings > Environment Variables: add SITE_PASSWORD (any username works at the prompt).
4. Redeploy.

## Question bank
`src/data/questions.json` is generated from the master file by `npm run bank`. Maths inside questions is written between \( and \).
