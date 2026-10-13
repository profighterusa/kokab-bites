// Shared validation helpers (ported from the Node server, runtime-agnostic).

export function cleanString(v, max = 400) {
  return String(v ?? '').trim().slice(0, max);
}

export function normKey(s) {
  return String(s || '').trim().toLowerCase();
}

// Pakistani mobile: 03XXXXXXXXX, +92..., 92... all accepted -> true/false
export function validPkPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^(92|0)/, '');
  return /^3\d{9}$/.test(digits);
}

export function num(v, def = 0, min = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : def;
}

// Env helper: Cloudflare exposes bindings on context env, Vercel/Node on process.env
export function getEnv(c, key) {
  if (c && c.env && c.env[key] !== undefined) return c.env[key];
  if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
    return process.env[key];
  }
  return undefined;
}

export function clientIp(c) {
  const h = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || '';
  return h.split(',')[0].trim() || 'unknown';
}
