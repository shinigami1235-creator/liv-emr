// Stock logic. Two ways an item is counted:
//   track 'count'  whole vials, syringes, boxes or pieces; qty is the count.
//   track 'units'  toxin drawn by the unit from an opened vial; qty is total units,
//                  upv is units per vial, openLeft is what remains in the open vial.
import * as db from './db.js';
import { dateStr, addDays, fmtNum } from './ui.js';

export const CATEGORIES = ['Toxin', 'Filler', 'Skin booster', 'Medication', 'Skincare product', 'Consumable', 'Other'];
export const COUNT_LABELS = ['vial', 'syringe', 'ampoule', 'bottle', 'tube', 'box', 'pack', 'piece'];

export function plural(word, n) {
  if (n === 1) return word;
  if (word === 'box') return 'boxes';
  return word + 's';
}

export function sealedVials(it) {
  if (it.track !== 'units') return null;
  return Math.max(0, Math.floor((it.qty - (it.openLeft || 0)) / (it.upv || 100)));
}

export function stockText(it) {
  if (it.track === 'units') {
    const sealed = sealedVials(it);
    const open = it.openLeft ? `, ${fmtNum(it.openLeft)} U in open vial` : '';
    return `${fmtNum(it.qty)} U (${sealed} sealed ${plural('vial', sealed)}${open})`;
  }
  return `${fmtNum(it.qty)} ${plural(it.unitLabel || 'piece', it.qty)}`;
}

export function shortStock(it) {
  return it.track === 'units' ? `${fmtNum(it.qty)} U` : `${fmtNum(it.qty)} ${plural(it.unitLabel || 'piece', it.qty)}`;
}

// Buying price is per vial or piece. Cost and selling price are per unit of use:
// per U for toxin used by the unit, per vial or piece otherwise.
export function costPerUse(it) {
  if (it.buyPrice == null || it.buyPrice === '') return null;
  return it.track === 'units' ? it.buyPrice / (it.upv || 100) : it.buyPrice;
}
export function pricePerUse(it) {
  return it.sellPrice == null || it.sellPrice === '' ? null : it.sellPrice;
}
export function useWord(it) {
  return it.track === 'units' ? 'U' : (it.unitLabel || 'piece');
}

export function isLow(it) {
  if (it.reorderAt == null || it.reorderAt === '') return false;
  const level = it.track === 'units' ? it.reorderAt * (it.upv || 100) : it.reorderAt;
  return it.qty <= level;
}

export function expiryState(it) {
  if (!it.expiry) return null;
  const today = dateStr();
  if (it.expiry < today) return 'expired';
  if (it.expiry <= addDays(today, 60)) return 'soon';
  return null;
}

export function openVialAge(it) {
  if (it.track !== 'units' || !it.openLeft || !it.openedAt) return null;
  return Math.floor((Date.now() - new Date(it.openedAt)) / 86400000);
}

const KIND_LABEL = { use: 'Used', return: 'Returned', receive: 'Received', adjust: 'Count corrected', discard: 'Open vial discarded' };
export const kindLabel = k => KIND_LABEL[k] || k;

// change is in the item's own unit: units for 'units' items, count otherwise.
export async function applyChange(itemId, change, kind, extra = {}) {
  const it = await db.get('items', itemId);
  if (!it || !change) return null;
  if (it.track === 'units') {
    const upv = it.upv || 100;
    let open = it.openLeft || 0;
    if (kind === 'use') {
      const u = -change;
      if (open >= u) open -= u;
      else {
        const rem = u - open;
        open = Math.ceil(rem / upv) * upv - rem;
        it.openedAt = new Date().toISOString();
      }
    } else if (kind === 'return') {
      open = Math.min(open + change, upv);
    } else if (kind === 'discard') {
      change = -open;
      open = 0;
    }
    it.qty = Math.round((it.qty + change) * 100) / 100;
    open = Math.max(0, Math.min(open, Math.max(it.qty, 0)));
    it.openLeft = Math.round(open * 100) / 100;
    if (!it.openLeft) it.openedAt = null;
  } else {
    it.qty = Math.round((it.qty + change) * 100) / 100;
  }
  await db.put('items', it);
  await db.put('stocklog', {
    itemId, at: new Date().toISOString(), change, kind,
    note: extra.note || '', patientId: extra.patientId || null, treatmentId: extra.treatmentId || null,
    unitCost: extra.unitCost ?? null, spent: extra.spent ?? null, opening: !!extra.opening,
  });
  return it;
}

// Moves stock for a treatment. Only the difference from the last save is applied,
// so editing a treatment never double-counts.
export async function syncTreatmentStock(prevMoves, uses, extra) {
  const net = {};
  for (const m of prevMoves || []) net[m.itemId] = (net[m.itemId] || 0) - m.change; // what was taken before
  const want = {};
  for (const u of uses) if (u.itemId && u.amount > 0) want[u.itemId] = (want[u.itemId] || 0) + u.amount;
  const ids = new Set([...Object.keys(net), ...Object.keys(want)]);
  for (const id of ids) {
    const delta = (want[id] || 0) - (net[id] || 0);
    if (delta > 0) await applyChange(id, -delta, 'use', extra);
    else if (delta < 0) await applyChange(id, -delta, 'return', extra);
  }
  return Object.entries(want).map(([itemId, amt]) => ({ itemId, change: -amt }));
}

export async function shortfalls(prevMoves, uses) {
  const before = {};
  for (const m of prevMoves || []) before[m.itemId] = (before[m.itemId] || 0) - m.change;
  const want = {};
  for (const u of uses) if (u.itemId && u.amount > 0) want[u.itemId] = (want[u.itemId] || 0) + u.amount;
  const out = [];
  for (const [id, amt] of Object.entries(want)) {
    const it = await db.get('items', id);
    if (!it) continue;
    const available = it.qty + (before[id] || 0);
    if (amt > available) out.push(`${it.name} has ${fmtNum(Math.max(available, 0))} ${it.track === 'units' ? 'U' : plural(it.unitLabel || 'piece', available)} in stock`);
  }
  return out;
}
