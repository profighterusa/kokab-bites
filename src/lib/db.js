// Supabase access. Server-side only: uses the service_role key, which
// bypasses RLS. The browser never talks to Supabase directly.
import { createClient } from '@supabase/supabase-js';
import { getEnv } from './validate.js';

let cached = null;

export function getDb(c) {
  const url = getEnv(c, 'SUPABASE_URL');
  const key = getEnv(c, 'SUPABASE_SERVICE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY are not configured.');
  if (!cached || cached.url !== url || cached.key !== key) {
    cached = { url, key, client: createClient(url, key, { auth: { persistSession: false } }) };
  }
  return cached.client;
}

// app_state table: key TEXT PK, value JSONB. Holds 'menu' and 'settings' docs.
export async function getState(db, key, fallback) {
  const { data, error } = await db.from('app_state').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data ? data.value : fallback;
}

export async function setState(db, key, value) {
  const { error } = await db.from('app_state').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
}

// Full public menu payload (same shape the frontend already expects).
export async function getMenuPayload(db) {
  const [menu, settings] = await Promise.all([
    getState(db, 'menu', {}),
    getState(db, 'settings', {}),
  ]);
  return { ...menu, settings };
}

// Fixed-window rate limiter backed by Supabase (serverless-safe).
export async function rateOk(db, ip, limit = 8, windowMs = 60000) {
  const now = Date.now();
  const windowStart = new Date(now - (now % windowMs)).toISOString();
  const { data } = await db.from('rate_limits').select('count').eq('ip', ip).eq('window_start', windowStart).maybeSingle();
  const count = data ? data.count : 0;
  if (count >= limit) return false;
  const { error } = await db.from('rate_limits').upsert(
    { ip, window_start: windowStart, count: count + 1 },
    { onConflict: 'ip,window_start' }
  );
  if (error) return true; // fail open on limiter errors; validation still applies
  // opportunistic cleanup of old windows (best-effort)
  db.from('rate_limits').delete().lt('window_start', new Date(now - windowMs).toISOString()).then(() => {}, () => {});
  return true;
}
