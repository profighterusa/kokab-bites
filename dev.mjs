// Local dev server: adapts Node http <-> Web Request for the Hono app.
// Usage: PORT=3000 SUPABASE_URL=... SUPABASE_SERVICE_KEY=... ADMIN_PASSWORD=... node dev.mjs
// (Without Supabase keys, only pure-logic tests run; API routes need the DB.)
import { createServer } from 'node:http';
import { createApp } from './src/app.js';

const app = createApp();
const PORT = Number(process.env.PORT) || 3000;

const server = createServer(async (req, res) => {
  try {
    const url = `http://${req.headers.host || 'localhost'}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
      else headers.set(k, v);
    }
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
      });
    }
    const request = new Request(url, { method: req.method, headers, body });
    const response = await app.fetch(request);
    const outHeaders = {};
    response.headers.forEach((v, k) => { outHeaders[k] = v; });
    res.writeHead(response.status, outHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Dev server error: ' + e.message }));
  }
});

server.listen(PORT, () => console.log(`dev API on http://localhost:${PORT}`));
