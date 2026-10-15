// KOKAB BITES API — Hono app shared by Vercel and Cloudflare adapters.
// Runtime-agnostic: WebCrypto, fetch, no Node-only APIs.
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { getDb, getState, setState, rateOk } from './lib/db.js';
import { verifyOrderItems } from './lib/pricing.js';
import { cleanString, num, validPkPhone, getEnv, clientIp } from './lib/validate.js';
import { signToken, verifyToken, safeEq, randomHex } from './lib/auth.js';

const ORDER_STATUSES = ['New', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
const MENU_KEY = 'menu_data';

function isProd(c) {
  return getEnv(c, 'NODE_ENV') === 'production';
}
function isSecure(c) {
  const proto = c.req.header('x-forwarded-proto') || '';
  return isProd(c) || proto === 'https';
}
function json(c, status, obj) {
  return c.json(obj, status, { 'Cache-Control': 'no-store' });
}
function err(c, status, message) {
  return json(c, status, { error: message });
}

function validatePromo(menu, code, subtotal) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return { ok: false };
  const promos = Array.isArray(menu.promos) ? menu.promos : [];
  const p = promos.find((x) => x && x.active !== false && String(x.code || '').trim().toUpperCase() === c);
  if (!p) return { ok: false, error: 'Invalid promo code.' };
  if (p.expiresAt && Number.isFinite(new Date(p.expiresAt).getTime()) && new Date(p.expiresAt).getTime() < Date.now())
    return { ok: false, error: 'This promo code has expired.' };
  if (Number(p.maxUses) > 0 && (Number(p.uses) || 0) >= Number(p.maxUses))
    return { ok: false, error: 'This promo code has reached its usage limit.' };
  const min = Math.max(0, Number(p.minOrder) || 0);
  if (subtotal < min) return { ok: false, error: 'This code needs a minimum order of Rs. ' + min.toLocaleString('en-PK') + '.' };
  let discount = p.type === 'pct' ? Math.round(subtotal * Math.max(0, Number(p.value) || 0) / 100) : Math.round(Math.max(0, Number(p.value) || 0));
  discount = Math.max(0, Math.min(discount, subtotal));
  if (!discount) return { ok: false, error: 'This promo code gives no discount on this order.' };
  return { ok: true, promo: p, discount };
}

// P3: basic shape validation so a bad admin write cannot silently corrupt the live menu
function validateMenuShape(m) {
  if (m.items !== undefined) {
    if (!m.items || typeof m.items !== 'object' || Array.isArray(m.items)) return 'items must be an object';
    for (const [k, v] of Object.entries(m.items)) {
      if (v !== null && v !== undefined && !(typeof v === 'number' && v >= 0)) return 'price for "' + k + '" must be a non-negative number';
    }
  }
  if (m.deals !== undefined) {
    if (!m.deals || typeof m.deals !== 'object' || Array.isArray(m.deals)) return 'deals must be an object';
    for (const [k, d] of Object.entries(m.deals)) {
      if (d && d.price !== undefined && d.price !== null && !(typeof d.price === 'number' && d.price >= 0)) return 'deal price for "' + k + '" must be a non-negative number';
    }
  }
  if (m.categories !== undefined) {
    if (!Array.isArray(m.categories)) return 'categories must be an array';
    if (m.categories.length > 50) return 'too many categories';
    for (const cat of m.categories) {
      if (!cat || typeof cat.name !== 'string' || !cat.name.trim() || cat.name.length > 40) return 'category name must be 1-40 chars';
    }
  }
  if (m.settings !== undefined) {
    const s = m.settings;
    if (!s || typeof s !== 'object') return 'settings must be an object';
    for (const k of ['deliveryFee', 'freeDeliveryAbove', 'prepMinutes']) {
      if (s[k] !== undefined && s[k] !== null && !(typeof s[k] === 'number' && s[k] >= 0)) return 'settings.' + k + ' must be a non-negative number';
    }
  }
  return null;
}

export function createApp() {
  const app = new Hono();

  // Security headers on every API response
  app.use('/api/*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  });

  // ---------- Public ----------

  app.get('/api/menu', async (c) => {
    try {
      const db = getDb(c);
      const menu = await getState(db, MENU_KEY, {});
      return json(c, 200, menu);
    } catch (e) {
      return err(c, 500, 'Menu unavailable. ' + e.message);
    }
  });

  app.post('/api/orders', async (c) => {
    let db;
    try {
      db = getDb(c);
    } catch (e) {
      return err(c, 500, e.message);
    }
    const ip = clientIp(c);
    if (!(await rateOk(db, ip))) return err(c, 429, 'Too many order attempts. Please try again shortly.');
    let b;
    try {
      b = await c.req.json();
    } catch {
      return err(c, 400, 'Invalid order data.');
    }
    const rawItems = Array.isArray(b.items) ? b.items.slice(0, 40) : [];
    const items = rawItems.map((i) => ({
      name: cleanString(i.name, 120),
      option: cleanString(i.option, 80),
      qty: Math.max(1, Math.min(99, num(i.qty, 1, 1))),
      unitPrice: i.unitPrice === null || i.unitPrice === undefined ? null : (Number.isFinite(Number(i.unitPrice)) && Number(i.unitPrice) >= 0 ? Number(i.unitPrice) : null),
      lineTotal: i.lineTotal === null || i.lineTotal === undefined ? null : (Number.isFinite(Number(i.lineTotal)) && Number(i.lineTotal) >= 0 ? Number(i.lineTotal) : null),
    }));
    if (!items.length) return err(c, 400, 'Order needs at least one item.');
    const name = cleanString(b.name, 100);
    const phone = cleanString(b.phone, 40);
    if (!name) return err(c, 400, 'Please enter your name.');
    if (phone && !validPkPhone(phone)) return err(c, 400, 'Please enter a valid Pakistani mobile number, e.g. 03XXXXXXXXX.');
    const address = cleanString(b.address, 500);
    const notes = cleanString(b.notes, 800);

    let menu;
    try {
      menu = await getState(db, MENU_KEY, {});
    } catch (e) {
      return err(c, 500, 'Menu unavailable. ' + e.message);
    }
    const { items: verifiedItems, serverTotal, unverifiedCount } = verifyOrderItems(items, menu);
    // P1 FIX: compute delivery fee server-side, never trust client value
    const settings = (menu && menu.settings) || {};
    const baseFee = Math.max(0, Number(settings.deliveryFee) || 0);
    const freeAbove = Math.max(0, Number(settings.freeDeliveryAbove) || 0);
    const deliveryFee = (freeAbove > 0 && serverTotal >= freeAbove) ? 0 : baseFee;
    const deliveryZone = cleanString(b.deliveryZone, 80);
    const promoCode = cleanString(b.promoCode, 40);
    let promoDiscount = 0, promoApplied = '';
    if (promoCode) {
      const v = validatePromo(menu, promoCode, serverTotal);
      if (!v.ok) return err(c, 400, v.error || 'Invalid promo code.');
      promoDiscount = v.discount; promoApplied = String(v.promo.code || '').trim().toUpperCase();
    }
    const orderId = 'KB-' + Date.now().toString(36).toUpperCase() + '-' + randomHex(2).toUpperCase();
    const order = {
      id: orderId,
      createdAt: new Date().toISOString(),
      status: 'New',
      name, phone, address, notes,
      targetBudget: Number.isFinite(Number(b.targetBudget)) && Number(b.targetBudget) > 0 ? Number(b.targetBudget) : null,
      clientTotal: Number.isFinite(Number(b.estimatedTotal)) ? Math.max(0, Number(b.estimatedTotal)) : 0,
      estimatedTotal: serverTotal,
      serverTotal,
      deliveryFee,
      deliveryZone,
      promoCode: promoApplied,
      promoDiscount,
      unverifiedCount,
      items: verifiedItems,
    };
    const { error } = await db.from('orders').insert({ id: orderId, payload: order, status: 'New' });
    if (error) return err(c, 500, 'Could not save the order. Please try again.');
    if (promoApplied && menu && Array.isArray(menu.promos)) {
      const pp = menu.promos.find((x) => x && String(x.code || '').trim().toUpperCase() === promoApplied);
      if (pp) { pp.uses = (Number(pp.uses) || 0) + 1; try { await setState(db, MENU_KEY, menu); } catch (e) { /* non-fatal */ } }
    }
    return json(c, 201, { ok: true, orderId });
  });

  app.get('/api/track/:id', async (c) => {
    let db;
    try {
      db = getDb(c);
    } catch (e) {
      return err(c, 500, e.message);
    }
    const id = decodeURIComponent(c.req.param('id') || '');
    const { data, error } = await db.from('orders').select('payload,status').eq('id', id).maybeSingle();
    if (error || !data) return err(c, 404, 'Order not found. Please check the order ID and try again.');
    const o = data.payload || {};
    let prep = 30;
    try {
      const menu = await getState(db, MENU_KEY, {});
      prep = (menu.settings && menu.settings.prepMinutes) || 30;
    } catch {}
    return json(c, 200, {
      id: o.id,
      status: data.status || o.status || 'New',
      createdAt: o.createdAt,
      serverTotal: o.serverTotal ?? o.estimatedTotal,
      deliveryFee: o.deliveryFee || 0,
      unverifiedCount: o.unverifiedCount || 0,
      prepMinutes: prep,
      items: (o.items || []).map((i) => ({
        name: i.name, option: i.option, qty: i.qty,
        lineTotal: i.verified === false ? null : (i.serverLineTotal ?? i.lineTotal),
        verified: i.verified !== false,
      })),
    });
  });

  // ---------- Admin auth ----------

  function adminPassword(c) {
    return getEnv(c, 'ADMIN_PASSWORD') || '';
  }

  app.post('/api/admin/login', async (c) => {
    // P2 FIX: rate-limit login attempts (5 per 5 min per IP)
    try {
      const db0 = getDb(c);
      const lip = clientIp(c);
      if (!(await rateOk(db0, 'login:' + lip, 5, 300000))) return err(c, 429, 'Too many login attempts. Try again in a few minutes.');
    } catch { /* fail open if DB unavailable */ }
    const pw = adminPassword(c);
    if (!pw) return err(c, 503, 'Admin login is disabled. Set ADMIN_PASSWORD in the server environment first.');
    if (isProd(c) && pw.length < 14) return err(c, 503, 'Server misconfigured: ADMIN_PASSWORD must be at least 14 characters in production.');
    let body;
    try {
      body = await c.req.json();
    } catch {
      return err(c, 400, 'Invalid request.');
    }
    if (!safeEq(cleanString(body.password, 256), pw)) {
      // small delay to slow brute force
      await new Promise((r) => setTimeout(r, 400));
      return err(c, 401, 'Incorrect password.');
    }
    const secret = getEnv(c, 'ADMIN_JWT_SECRET') || pw;
    const token = await signToken({ admin: true, exp: Math.floor(Date.now() / 1000) + 12 * 3600 }, secret);
    setCookie(c, 'kb_admin', token, {
      httpOnly: true, sameSite: 'Strict', path: '/', maxAge: 43200, secure: isSecure(c),
    });
    return json(c, 200, { ok: true });
  });

  app.post('/api/admin/logout', async (c) => {
    deleteCookie(c, 'kb_admin', { path: '/', secure: isSecure(c) });
    return json(c, 200, { ok: true });
  });

  // Admin guard
  app.use('/api/admin/*', async (c, next) => {
    if (c.req.path === '/api/admin/login' || c.req.path === '/api/admin/logout') return next();
    const token = getCookie(c, 'kb_admin');
    const secret = getEnv(c, 'ADMIN_JWT_SECRET') || adminPassword(c);
    const payload = token && secret ? await verifyToken(token, secret) : null;
    if (!payload || !payload.admin) return err(c, 401, 'Admin login required.');
    await next();
  });

  // ---------- Admin API ----------

  // P3: session check for page refresh (returns 200 if cookie valid, 401 otherwise)
  app.get('/api/admin/me', async (c) => {
    return json(c, 200, { ok: true, admin: true });
  });

  app.get('/api/admin/menu', async (c) => {
    try {
      const db = getDb(c);
      return json(c, 200, await getState(db, MENU_KEY, {}));
    } catch (e) {
      return err(c, 500, e.message);
    }
  });

  app.put('/api/admin/menu', async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return err(c, 400, 'Invalid menu data.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return err(c, 400, 'Invalid menu data.');
    // P3 FIX: sanity-check menu shape before overwriting the live menu
    const bad = validateMenuShape(body);
    if (bad) return err(c, 400, bad);
    try {
      const db = getDb(c);
      body.lastUpdated = new Date().toISOString();
      await setState(db, MENU_KEY, body);
      return json(c, 200, await getState(db, MENU_KEY, {}));
    } catch (e) {
      return err(c, 500, e.message);
    }
  });

  app.get('/api/admin/orders', async (c) => {
    try {
      const db = getDb(c);
      const { data, error } = await db.from('orders').select('payload,status').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return json(c, 200, (data || []).map((r) => ({ ...(r.payload || {}), status: r.status || (r.payload || {}).status || 'New' })));
    } catch (e) {
      return err(c, 500, e.message);
    }
  });

  app.patch('/api/admin/orders/:id', async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return err(c, 400, 'Invalid request.');
    }
    const id = decodeURIComponent(c.req.param('id') || '');
    try {
      const db = getDb(c);
      const { data, error } = await db.from('orders').select('payload').eq('id', id).maybeSingle();
      if (error || !data) return err(c, 404, 'Order not found.');
      const payload = data.payload || {};
      if (body.status !== undefined && !ORDER_STATUSES.includes(body.status)) return err(c, 400, 'Invalid status.');
      if (ORDER_STATUSES.includes(body.status)) payload.status = body.status;
      payload.adminNote = cleanString(body.adminNote, 500);
      const { error: upErr } = await db.from('orders').update({ payload, status: payload.status || 'New' }).eq('id', id);
      if (upErr) throw upErr;
      return json(c, 200, { ok: true });
    } catch (e) {
      return err(c, 500, e.message);
    }
  });

  app.post('/api/admin/upload', async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return err(c, 400, 'Invalid request.');
    }
    const m = String(body.data || '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return err(c, 400, 'Upload must be a JPG, PNG or WebP image.');
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    // P2 FIX: reject oversized payloads BEFORE base64 decode (avoid huge allocation)
    if (m[2].length > 7 * 1024 * 1024) return err(c, 400, 'Image must be smaller than 5 MB.');
    const bin = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
    if (!bin.length || bin.length > 5 * 1024 * 1024) return err(c, 400, 'Image must be smaller than 5 MB.');
    const sigOk =
      ext === 'jpg' ? bin[0] === 0xff && bin[1] === 0xd8 && bin[2] === 0xff :
      ext === 'png' ? bin[0] === 137 && bin[1] === 80 && bin[2] === 78 && bin[3] === 71 :
      String.fromCharCode(...bin.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bin.subarray(8, 12)) === 'WEBP';
    if (!sigOk) return err(c, 400, 'Image file does not match its file type.');
    try {
      const db = getDb(c);
      const name = 'product-' + Date.now().toString(36) + '-' + randomHex(5) + '.' + ext;
      const { error } = await db.storage.from('uploads').upload(name, bin, { contentType: 'image/' + (ext === 'jpg' ? 'jpeg' : ext), upsert: false });
      if (error) throw error;
      const { data } = db.storage.from('uploads').getPublicUrl(name);
      return json(c, 201, { ok: true, url: data.publicUrl });
    } catch (e) {
      return err(c, 500, 'Upload failed. ' + e.message);
    }
  });

  app.notFound((c) => err(c, 404, 'Not found.'));
  return app;
}
