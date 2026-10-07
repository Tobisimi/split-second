# Split Second

Private practice app for University Duel. Not affiliated with the show or its organisers; keep this repository private.

## Run locally
npm install, then npm run dev (the sync API only runs on Vercel or with `vercel dev`).

## Deploy (Vercel)
1. Import this repo in Vercel (framework preset: Vite).
2. Storage tab: add Upstash for Redis (free) and connect it to the project. It adds KV_REST_API_URL and KV_REST_API_TOKEN.
3. Settings > Environment Variables: add SITE_PASSWORD (any username works at the prompt).
4. Redeploy.

## Custom domain
In Vercel: Settings > Domains > add `duel.oluwatobisimi.me`. At Namecheap: Domain List > Manage > Advanced DNS > Add New Record: type CNAME, host `duel`, value `cname.vercel-dns.com.` (use the value Vercel shows if it differs).

## Question bank
Reviewed questions live in `bank/master/*.json` (one file per match) and worked solutions in `bank/solutions/*.json`. `npm run bank` builds `src/data/questions.json` for the app, the CSV files in `bank/csv/` (one per subject and level, plus all questions and the left-out ones) and `bank/SUMMARY.md`. Maths inside questions is written between \( and \).
