# KOKAB BITES — Deploy Guide (Render)

## Option A: Quick test (free, $0)
1. Push this folder to a GitHub repo.
2. Go to https://dashboard.render.com → New → Web Service → select the repo.
3. Render auto-detects `render.yaml`. Keep plan **Free**.
4. Environment → add `ADMIN_PASSWORD` = a strong private password (14+ characters).
   `NODE_ENV=production` and `DATA_DIR=/var/data` are already in render.yaml.
5. Create Web Service → you get `https://kokab-bites.onrender.com`.

Limits on Free: service sleeps after 15 min idle (first visit takes ~30-60s
to wake); **no persistent disk** — menu edits, orders and uploads are wiped
on every redeploy/restart. Fine for testing, NOT for real customers.

## Option B: Production (recommended)
1. Same as above, but change `plan: free` → `plan: starter` in render.yaml
   (about $7/month, always on, no sleep).
2. Uncomment the `disk:` block in render.yaml (1 GB, about $0.25/month) so
   menu-data.json, orders.json and uploads/ survive restarts.
3. Set `ADMIN_PASSWORD` (14+ chars, unique) in the dashboard, never in code.

## After deploy — verify
- Open `https://<your-app>.onrender.com` → menu loads.
- `/api/menu` returns 200.
- `/README.txt`, `/server.js`, `/menu-data.json`, `/orders.json` → 404.
- `/admin.html` → login works with your ADMIN_PASSWORD; save a price change
  and confirm it persists after a manual redeploy (disk check).
- In admin: Menu manager → Store settings → set WhatsApp number, hours,
  delivery fee for the real shop.
- Check the open/closed badge shows correctly for Asia/Karachi time.

## Notes
- The server reads `PORT` from the environment (Render sets it automatically).
- All data lives under `DATA_DIR` (default: the app folder). Back up with
  the admin "Download backup" button regularly.
- For a custom domain: Render dashboard → service → Settings → Custom Domain,
  then add the DNS records at your domain registrar.
