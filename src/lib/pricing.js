// Server-side price verification (ported 1:1 from the Node server).
// Recomputes every order total from the canonical menu document so
// tampered browser prices are corrected, never trusted.
import { normKey } from './validate.js';

const PIZZA_SPECIAL_RE = /creamy|malai boti|kebabish|bbq|doner|cheese-stuffed/i;

export function buildPriceTable(menu) {
  const t = new Map();
  const put = (n, o, p) => t.set(normKey(n) + '|' + normKey(o || ''), p === null || p === undefined ? null : Number(p));
  for (const [n, p] of Object.entries(menu.items || {})) put(n, '', p);
  const allNames = new Set([...Object.keys(menu.items || {}), ...Object.keys(menu.itemMeta || {})]);
  for (const n of allNames) {
    const cat = menu.itemMeta && menu.itemMeta[n] && menu.itemMeta[n].category;
    if (cat === 'Pizza' || /pizza/i.test(n)) {
      const grp = PIZZA_SPECIAL_RE.test(n) ? (menu.specialPizza || {}) : (menu.classicPizza || {});
      for (const [k, v] of Object.entries(grp)) { put(n, k, v && v.price); put(n, (v && v.label) || k, v && v.price); }
    }
    if (n === 'Loaded Fries' || n === 'Wings') { const g = (menu.sides || {})[n] || {}; for (const [k, v] of Object.entries(g)) put(n, k, v); }
  }
  for (const [n, m] of Object.entries(menu.itemMeta || {})) {
    if (!m) continue;
    for (const v of m.variants || []) { if (v && v.active !== false) put(m.displayName || n, v.name || v.label, v.price); }
  }
  for (const p of menu.customItems || []) {
    if (!p || p.active === false) continue;
    put(p.name, '', p.price);
    for (const v of p.variants || []) { if (v && v.active !== false) put(p.name, v.name || v.label, v.price); }
  }
  for (const [n, d] of Object.entries(menu.deals || {})) { if (d && d.active !== false) put(n, '', d.price); }
  return t;
}

// Returns { items (annotated), serverTotal, unverifiedCount }
export function verifyOrderItems(rawItems, menu) {
  const table = buildPriceTable(menu);
  const alias = {};
  for (const [k, v] of Object.entries(menu.itemMeta || {})) {
    if (v && v.displayName) alias[normKey(v.displayName)] = k;
  }
  let serverTotal = 0, unverified = 0;
  const items = rawItems.map((it) => {
    let key = normKey(it.name) + '|' + normKey(it.option);
    let hit = table.has(key) ? table.get(key) : undefined;
    if (hit === undefined) {
      const ak = alias[normKey(it.name)];
      if (ak) { key = normKey(ak) + '|' + normKey(it.option); hit = table.has(key) ? table.get(key) : undefined; }
    }
    const verified = hit !== undefined;
    const unit = verified ? hit : null;
    const line = unit === null ? null : unit * it.qty;
    if (verified && unit !== null) serverTotal += line; else unverified += it.qty;
    return { ...it, serverUnitPrice: unit, serverLineTotal: line, verified };
  });
  return { items, serverTotal, unverifiedCount: unverified };
}
