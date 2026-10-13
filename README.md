# KOKAB BITES — Serverless Edition

Menu + WhatsApp ordering platform rebuilt for serverless hosting:
**one codebase deploys to Vercel and Cloudflare Pages**, with **Supabase**
(Postgres + Storage) replacing the old JSON-file storage.

## Architecture

```
index.html / admin.html / *.css   → static (served by Vercel / Cloudflare Pages)
api/[[...route]].js               → Vercel Edge Function entry
functions/api/[[route]].js       → Cloudflare Pages Function entry
src/app.js                        → Hono API (shared by both)
src/lib/                          → db, auth (JWT), pricing, validation
supabase/schema.sql               → tables + storage bucket + RLS
supabase/seed.mjs                 → one-time menu import
```

- **No server to keep awake, no disk to lose.** Orders live in Postgres,
  images in Supabase Storage, admin sessions are stateless JWT cookies.
- **Server-side price verification** is preserved: browser prices are never
  trusted; totals are recomputed from the canonical menu.
- The browser never talks to Supabase directly — everything goes through
  `/api/*`, and RLS denies all public access.

## Setup (one time)

1. **Supabase** — create a free project at supabase.com, then in the SQL
   editor run `supabase/schema.sql`. In Project Settings → API copy:
   - Project URL → `SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_KEY` (server only, never public)
2. **Seed the menu**: 
   `SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run seed`
   (imports the original `menu-data.json` from the v1 build folder)
3. **Admin password**: set `ADMIN_PASSWORD` (14+ chars). Optional
   `ADMIN_JWT_SECRET` for session signing (defaults to the password).

## Deploy — Vercel

1. Import the repo at vercel.com (no build command needed).
2. Environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
   `ADMIN_PASSWORD`, `NODE_ENV=production`.
3. Deploy. API runs as an Edge Function at `/api/*`.

## Deploy — Cloudflare Pages

1. Pages → Create → Connect to Git → select the repo.
2. Build command: empty. Build output directory: `/` (project root).
3. Environment variables (Production): same four as Vercel.
4. Deploy. `functions/api/[[route]].js` serves `/api/*`.

## Local dev

```bash
npm install
cp .env.example .env   # fill in real values
npm run dev            # API on :3000 (serve the html files with any static server)
npm test               # 20 end-to-end tests against a mocked Supabase
```

## Notes

- Free tiers: Vercel Hobby (no card), Cloudflare Pages (no card),
  Supabase free (no card) — the whole stack runs at $0.
- Serverless functions have no shared memory: rate limiting is backed by
  Supabase (`rate_limits` table), sessions are JWTs, uploads go to Storage.
- To enable the admin dashboard after deploy, set `ADMIN_PASSWORD` in the
  project dashboard (it takes effect immediately, no redeploy needed on
  Vercel; Cloudflare needs no redeploy either — env is read per request).
