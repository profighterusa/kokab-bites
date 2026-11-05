// Stateless admin sessions: HMAC-SHA256 JWT via WebCrypto.
// Works identically in Node 18+, Vercel Functions and Cloudflare Workers.
const enc = new TextEncoder();

function b64url(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function importKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signToken(payload, secret) {
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(header + '.' + body));
  return header + '.' + body + '.' + b64url(sig);
}

export async function verifyToken(token, secret) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const key = await importKey(secret);
    const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    if (payload.exp && Date.now() > payload.exp * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getCookie(header, name) {
  const m = String(header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

export function sessionCookie(token, secure) {
  return `kb_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure) {
  return `kb_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}

// Constant-time password compare (L4): SHA-256 both sides with WebCrypto
// and compare the 32-byte digests in constant time. No credential is
// changed — the same admin password still verifies; only the comparison
// mechanism changed (was a 32-bit FNV-1a hash).
export async function safeEq(a, b) {
  const da = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(a))));
  const db = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(b))));
  let d = 0;
  for (let i = 0; i < da.length; i++) d |= da[i] ^ db[i];
  return d === 0;
}

export function randomHex(n) {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}
