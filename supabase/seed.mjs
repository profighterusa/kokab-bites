// One-time seed: imports menu-data.json into Supabase app_state.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node supabase/seed.mjs [menu-data.json]
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY first.');
  process.exit(1);
}
const menuPath = process.argv[2] || new URL('../../kokab-bites-advanced/menu-data.json', import.meta.url).pathname;
let menu;
try {
  menu = JSON.parse(readFileSync(menuPath, 'utf-8'));
} catch (e) {
  console.error('Cannot read menu JSON:', menuPath, e.message);
  process.exit(1);
}
// Strip any local-only leftovers the admin UI may have added
const clean = { ...menu };
delete clean._local;

const db = createClient(url, key, { auth: { persistSession: false } });
const { error } = await db.from('app_state').upsert({ key: 'menu_data', value: clean }, { onConflict: 'key' });
if (error) {
  console.error('Seed failed:', error.message);
  process.exit(1);
}
console.log('Seeded menu_data (' + Object.keys(clean.items || {}).length + ' items, ' +
  Object.keys(clean.deals || {}).length + ' deals) into', url);
