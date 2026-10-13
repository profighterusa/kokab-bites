// End-to-end test: mock PostgREST + Storage, then exercise the real Hono app.
// Usage: node test/e2e.mjs
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

// ---------- Mock Supabase (PostgREST + Storage surface used by src/) ----------
const store = {
  app_state: {},
  orders: [],
  rate_limits: {},
};
const menuDoc = JSON.parse(readFileSync(new URL('../../kokab-bites-advanced/menu-data.json', import.meta.url), 'utf-8'));
store.app_state['menu_data'] = menuDoc;

function parseQuery(url) {
  const q = {};
  for (const [k, v] of new URL(url, 'http://x').searchParams) q[k] = v;
  return q;
}
const eqVal = (s) => (s && s.startsWith('eq.') ? decodeURIComponent(s.slice(3)) : undefined);

const mock = createServer(async (req, res) => {
  const send = (code, obj, headers = {}) => {
    res.writeHead(code, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(obj));
  };
  let bodyRaw = '';
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE') {
    bodyRaw = await new Promise((r) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => r(s)); });
  }
  const u = new URL(req.url, 'http://x');
  const q = parseQuery(req.url);
  const single = (req.headers['accept'] || '').includes('vnd.pgrst.object');

  // --- storage upload ---
  if (u.pathname.startsWith('/storage/v1/object/uploads/')) {
    if (req.method === 'POST') return send(200, { Key: u.pathname });
    return send(404, {});
  }

  // --- app_state ---
  if (u.pathname === '/rest/v1/app_state') {
    if (req.method === 'GET') {
      const k = eqVal(q.key);
      const row = k && store.app_state[k] ? [{ value: store.app_state[k] }] : [];
      if (single) return row.length ? send(200, row[0]) : send(406, { message: 'no rows' });
      return send(200, row);
    }
    if (req.method === 'POST') {
      const rows = Array.isArray(JSON.parse(bodyRaw || '[]')) ? JSON.parse(bodyRaw) : [JSON.parse(bodyRaw)];
      for (const r of rows) store.app_state[r.key] = r.value;
      return send(201, rows, { Prefer: 'return=representation' });
    }
  }

  // --- orders ---
  if (u.pathname === '/rest/v1/orders') {
    if (req.method === 'GET') {
      let rows = [...store.orders];
      const id = eqVal(q.id);
      if (id) rows = rows.filter((r) => r.id === id);
      rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      if (q.limit) rows = rows.slice(0, Number(q.limit));
      const out = rows.map((r) => ({ id: r.id, payload: r.payload, status: r.status }));
      if (single) return out.length ? send(200, out[0]) : send(406, { message: 'no rows' });
      return send(200, out);
    }
    if (req.method === 'POST') {
      const b = JSON.parse(bodyRaw || '{}');
      const row = { id: b.id, payload: b.payload, status: b.status || 'New', created_at: new Date().toISOString() };
      store.orders.push(row);
      return send(201, [row]);
    }
    if (req.method === 'PATCH') {
      const id = eqVal(q.id);
      const b = JSON.parse(bodyRaw || '{}');
      const row = store.orders.find((r) => r.id === id);
      if (!row) return send(404, { message: 'not found' });
      Object.assign(row, b);
      return send(200, [row]);
    }
  }

  // --- rate_limits ---
  if (u.pathname === '/rest/v1/rate_limits') {
    if (req.method === 'GET') {
      const k = `${eqVal(q.ip)}|${eqVal(q.window_start)}`;
      const row = store.rate_limits[k];
      const out = row ? [{ count: row }] : [];
      if (single) return out.length ? send(200, out[0]) : send(406, { message: 'no rows' });
      return send(200, out);
    }
    if (req.method === 'POST') {
      const b = JSON.parse(bodyRaw || '{}');
      store.rate_limits[`${b.ip}|${b.window_start}`] = b.count;
      return send(201, [b]);
    }
    if (req.method === 'DELETE') return send(200, []);
  }

  send(404, { mock: 'unknown route', path: u.pathname });
});

// ---------- Test runner ----------
const results = [];
function check(name, cond, extra = '') {
  results.push([cond ? 'PASS' : 'FAIL', name, extra]);
  if (!cond) console.error('FAIL:', name, extra);
}

async function main() {
  await new Promise((r) => mock.listen(0, r));
  const mockPort = mock.address().port;
  const SUPABASE_URL = `http://localhost:${mockPort}`;
  const { spawn } = await import('node:child_process');

  // start dev API
  const api = spawn('node', ['dev.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: '3219', SUPABASE_URL, SUPABASE_SERVICE_KEY: 'test-key', ADMIN_PASSWORD: 'test-admin-password-12345', NODE_ENV: 'production' },
    stdio: 'pipe',
  });
  await new Promise((r) => setTimeout(r, 1200));
  const base = 'http://localhost:3219';
  const j = async (path, opts = {}) => {
    const r = await fetch(base + path, opts);
    let body = null;
    try { body = await r.json(); } catch {}
    return { status: r.status, body, headers: r.headers };
  };

  // 1. pure logic: pricing tamper test
  const { verifyOrderItems } = await import('../src/lib/pricing.js');
  const v = verifyOrderItems(
    [{ name: 'Shami Burger', option: '', qty: 2, unitPrice: 1, lineTotal: 2 },
     { name: 'Fajita Pizza', option: 'Large', qty: 1, unitPrice: 1, lineTotal: 1 }],
    menuDoc
  );
  check('tampered prices corrected', v.serverTotal === 340 + 790 && v.items.every((i) => i.verified), JSON.stringify(v.serverTotal));

  // 2. JWT round-trip
  const { signToken, verifyToken } = await import('../src/lib/auth.js');
  const tok = await signToken({ admin: true, exp: Math.floor(Date.now() / 1000) + 60 }, 's3cret');
  const pv = await verifyToken(tok, 's3cret');
  check('jwt sign/verify', pv && pv.admin === true);
  check('jwt wrong secret rejected', (await verifyToken(tok, 'nope')) === null);
  check('jwt tampered rejected', (await verifyToken(tok.slice(0, -2) + 'xx', 's3cret')) === null);

  // 3. GET /api/menu
  let r = await j('/api/menu');
  check('GET /api/menu 200', r.status === 200 && r.body.settings && r.body.settings.whatsappNumber === '923255791010');

  // 4. POST /api/orders (valid)
  r = await j('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', phone: '03215551234', address: 'Test St', items: [{ name: 'Shami Burger', qty: 2, unitPrice: 1, lineTotal: 2 }] }) });
  check('POST /api/orders 201 + server total', r.status === 201 && r.body.orderId && r.body.orderId.startsWith('KB-'), JSON.stringify(r.body));
  const orderId = r.body.orderId;

  // 5. POST /api/orders (bad phone)
  r = await j('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'X', phone: '123', items: [{ name: 'Shami Burger', qty: 1 }] }) });
  check('bad phone rejected', r.status === 400);

  // 6. GET /api/track/:id
  r = await j('/api/track/' + orderId);
  check('track ok, no PII leak', r.status === 200 && r.body.status === 'New' && r.body.phone === undefined && r.body.address === undefined && r.body.serverTotal === 340);
  r = await j('/api/track/NOPE');
  check('track 404', r.status === 404);

  // 7. admin login wrong/right
  r = await j('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) });
  check('admin login wrong -> 401', r.status === 401);
  r = await j('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-admin-password-12345' }) });
  const cookie = r.headers.get('set-cookie') || '';
  check('admin login ok + httpOnly cookie', r.status === 200 && cookie.includes('kb_admin=') && /httponly/i.test(cookie), cookie.slice(0, 60));

  // 8. admin guard
  r = await j('/api/admin/menu');
  check('admin menu without cookie -> 401', r.status === 401);
  const authH = { Cookie: cookie.split(';')[0] };
  r = await j('/api/admin/menu', { headers: authH });
  check('admin menu with cookie', r.status === 200 && r.body.items && r.body.settings);

  // 9. admin orders + patch
  r = await j('/api/admin/orders', { headers: authH });
  check('admin orders list', r.status === 200 && Array.isArray(r.body) && r.body.length >= 1 && r.body[0].phone === '03215551234');
  r = await j('/api/admin/orders/' + encodeURIComponent(orderId), { method: 'PATCH', headers: { ...authH, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Confirmed', adminNote: 'test note' }) });
  check('admin order patch', r.status === 200 && r.body.ok === true);
  r = await j('/api/track/' + orderId);
  check('track shows Confirmed', r.body.status === 'Confirmed');

  // 10. upload validation
  r = await j('/api/admin/upload', { method: 'POST', headers: { ...authH, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'not-an-image' }) });
  check('upload rejects bad data', r.status === 400);
  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  r = await j('/api/admin/upload', { method: 'POST', headers: { ...authH, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: tinyPng }) });
  check('upload ok -> https url', r.status === 201 && r.body.url && r.body.url.startsWith('http'), r.body.url);

  // 11. PUT menu persists
  const menu = (await j('/api/admin/menu', { headers: authH })).body;
  menu.settings.prepMinutes = 45;
  r = await j('/api/admin/menu', { method: 'PUT', headers: { ...authH, 'Content-Type': 'application/json' }, body: JSON.stringify(menu) });
  check('PUT menu persists', r.status === 200 && r.body.settings.prepMinutes === 45 && !!r.body.lastUpdated);

  // 12. security headers on API
  r = await j('/api/menu');
  check('security headers', r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('x-frame-options') === 'DENY');

  api.kill();
  mock.close();
  const fails = results.filter(([s]) => s === 'FAIL').length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });
