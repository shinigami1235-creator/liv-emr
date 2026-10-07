import * as db from '../db.js';
import { $, $$, esc, toast, openModal, confirmBox, fmtDate, fmtNum, num, baht, icons, segHTML, bindSeg, segValue } from '../ui.js';
import { CATEGORIES, COUNT_LABELS, stockText, shortStock, isLow, expiryState, openVialAge, applyChange, kindLabel, plural, sealedVials, costPerUse } from '../stock.js';
import { displayName } from '../common.js';
import { go, refresh } from '../router.js';

let filter = 'all';
let query = '';

function statusChips(i) {
  const ex = expiryState(i);
  return `${isLow(i) ? '<span class="chip danger">Reorder</span>' : ''}
    ${ex === 'expired' ? '<span class="chip danger">Expired</span>' : ex === 'soon' ? '<span class="chip warn">Expiring</span>' : ''}`;
}

export async function inventoryPage(root) {
  const items = (await db.all('items')).sort((a, b) => a.name.localeCompare(b.name));
  const cats = CATEGORIES.filter(c => items.some(i => i.category === c));
  root.innerHTML = `
    <header class="top"><div><h1>Stock</h1><p class="sub">${items.length} items · ${items.filter(isLow).length} to reorder</p></div>
      <div class="actions"><button class="btn primary" data-act="add">${icons.plus}Add item</button></div></header>
    <div class="filters">
      <div class="search">${icons.search}<input type="search" placeholder="Search name or brand" value="${esc(query)}"></div>
      ${[['all', 'All'], ['low', 'Reorder'], ['exp', 'Expiring'], ...cats.map(c => [c, c])].map(([k, l]) => `<button class="pillbtn ${filter === k ? 'on' : ''}" data-filter="${esc(k)}">${esc(l)}</button>`).join('')}
    </div>
    <section class="card flush scroll-x"><table class="tbl">
      <thead><tr><th>Item</th><th>Category</th><th>In stock</th><th>Reorder at</th><th>Expiry</th><th></th></tr></thead>
      <tbody></tbody></table></section>`;
  const tbody = $('tbody', root), input = $('input', root);
  const paint = () => {
    query = input.value;
    const q = query.trim().toLowerCase();
    const list = items.filter(i => {
      if (q && !`${i.name} ${i.brand || ''}`.toLowerCase().includes(q)) return false;
      if (filter === 'low') return isLow(i);
      if (filter === 'exp') return !!expiryState(i);
      if (filter !== 'all') return i.category === filter;
      return true;
    });
    tbody.innerHTML = list.length ? list.map(i => `<tr class="tap" data-item="${i.id}">
      <td><div class="title" style="font-weight:600">${esc(i.name)}</div><div class="muted small">${esc(i.brand || '')}${i.track === 'units' ? ' · per unit' : i.unitLabel === 'vial' ? ' · per vial' : ''}</div></td>
      <td>${esc(i.category)}</td>
      <td class="num">${shortStock(i)}${i.track === 'units' && i.openLeft ? `<div class="muted small">${fmtNum(i.openLeft)} U open</div>` : ''}</td>
      <td class="num">${i.reorderAt !== '' && i.reorderAt != null ? `${fmtNum(i.reorderAt)} ${plural(i.track === 'units' ? 'vial' : i.unitLabel || 'piece', i.reorderAt)}` : '<span class="muted">Not set</span>'}</td>
      <td class="num">${i.expiry ? fmtDate(i.expiry) : ''}</td>
      <td>${statusChips(i)}</td></tr>`).join('')
      : `<tr><td colspan="6" class="empty" style="padding:16px 20px">${items.length ? 'No item matches.' : 'No stock items yet. Add his toxins, fillers, medications and consumables with Add item.'}</td></tr>`;
  };
  paint();
  input.oninput = paint;
  root.onclick = async e => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; $$('[data-filter]', root).forEach(b => b.classList.toggle('on', b === f)); paint(); return; }
    if (e.target.closest('[data-act=add]')) { const it = await itemForm(); if (it) go(`#/item/${it.id}`); return; }
    const r = e.target.closest('[data-item]');
    if (r) go(`#/item/${r.dataset.item}`);
  };
}

export function itemForm(item = null) {
  return new Promise(resolve => {
    let saved = null;
    const it = item || { category: 'Toxin', track: 'count', unitLabel: 'vial', upv: 100, qty: 0, reorderAt: '' };
    const m = openModal(`
      <form class="form" novalidate>
        <div class="sheet-head"><h2>${item ? 'Edit item' : 'Add item'}</h2></div>
        <div class="sheet-body"><div class="form-grid">
          <div class="field s8"><label>Name</label><input name="name" value="${esc(it.name || '')}" placeholder="Botox 100U" required autofocus></div>
          <div class="field s4"><label>Brand</label><input name="brand" value="${esc(it.brand || '')}" placeholder="Allergan"></div>
          <div class="field s12"><label>Category</label><select name="category">${CATEGORIES.map(c => `<option ${c === it.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="field s12"><label>How it is used up</label>
            ${segHTML('track', [['count', 'Whole vials or pieces'], ['units', 'By the unit from an opened vial']], it.track)}
            <span class="hint" data-trackhint></span></div>
          <div class="field s4 count-only"><label>Counted as</label><select name="unitLabel">${COUNT_LABELS.map(c => `<option ${c === it.unitLabel ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="field s4 units-only"><label>Units per vial</label><input name="upv" type="number" inputmode="numeric" value="${esc(it.upv || 100)}"></div>
          ${item ? '' : `<div class="field s4"><label data-startlabel>In stock now</label><input name="start" type="number" inputmode="decimal" step="any" value="" placeholder="0"></div>`}
          <div class="field s4"><label data-reorderlabel>Reorder at</label><input name="reorderAt" type="number" inputmode="decimal" step="any" value="${esc(it.reorderAt ?? '')}" placeholder="2"></div>
          <div class="field s4"><label>Lot no.</label><input name="lot" value="${esc(it.lot || '')}"></div>
          <div class="field s4"><label>Expiry</label><input name="expiry" type="date" value="${esc(it.expiry || '')}"></div>
          <div class="field s6"><label data-buylabel>Buying price (฿)</label><input name="buyPrice" type="number" inputmode="decimal" step="any" value="${esc(it.buyPrice ?? '')}" placeholder="9500"><span class="hint" data-buyhint></span></div>
          <div class="field s6"><label data-selllabel>Selling price (฿)</label><input name="sellPrice" type="number" inputmode="decimal" step="any" value="${esc(it.sellPrice ?? '')}" placeholder="350"><span class="hint" data-sellhint></span></div>
          <div class="field s12"><label>Notes</label><input name="notes" value="${esc(it.notes || '')}" placeholder="Supplier, storage"></div>
        </div></div>
        <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
      </form>`, { onClose: () => resolve(saved) });
    const f = $('form', m.el);
    const sync = () => {
      const tr = segValue(m.el, 'track');
      $$('.count-only', m.el).forEach(x => x.classList.toggle('hidden', tr !== 'count'));
      $$('.units-only', m.el).forEach(x => x.classList.toggle('hidden', tr !== 'units'));
      const word = tr === 'units' ? 'vials' : plural(f.unitLabel.value, 2);
      const sl = $('[data-startlabel]', m.el); if (sl) sl.textContent = `In stock now (${word})`;
      $('[data-reorderlabel]', m.el).textContent = `Reorder at (${word})`;
      const one = tr === 'units' ? 'vial' : f.unitLabel.value;
      $('[data-buylabel]', m.el).textContent = `Buying price per ${one} (฿)`;
      $('[data-selllabel]', m.el).textContent = tr === 'units' ? 'Selling price per unit (฿)' : `Selling price per ${one} (฿)`;
      const bp = num(f.buyPrice.value), upv = num(f.upv.value) || 100;
      $('[data-buyhint]', m.el).textContent = tr === 'units' && bp ? `Costs ${baht(bp / upv)} per unit` : ' ';
      $('[data-sellhint]', m.el).textContent = 'Fills the charge on treatments that use it.';
      $('[data-trackhint]', m.el).textContent = tr === 'units'
        ? 'Each treatment takes its units off the open vial and opens a new vial when that runs out.'
        : 'Each treatment takes off the number of vials or pieces used.';
    };
    bindSeg(m.el, sync);
    f.unitLabel.onchange = sync;
    f.buyPrice.oninput = sync; f.upv.oninput = sync;
    sync();
    f.onsubmit = async e => {
      e.preventDefault();
      if (!f.name.value.trim()) { toast('Enter a name.'); return; }
      const track = segValue(m.el, 'track');
      if (item && item.track !== track && item.qty) {
        toast('Correct the count to zero before changing how this item is used up.'); return;
      }
      Object.assign(it, {
        name: f.name.value.trim(), brand: f.brand.value.trim(), category: f.category.value, track,
        unitLabel: f.unitLabel.value, upv: num(f.upv.value) || 100,
        reorderAt: f.reorderAt.value === '' ? '' : num(f.reorderAt.value),
        lot: f.lot.value.trim(), expiry: f.expiry.value, notes: f.notes.value.trim(),
        buyPrice: f.buyPrice.value === '' ? null : num(f.buyPrice.value),
        sellPrice: f.sellPrice.value === '' ? null : num(f.sellPrice.value),
      });
      if (!item) {
        it.qty = 0; it.openLeft = 0;
        saved = await db.put('items', it);
        const start = num(f.start.value);
        if (start) await applyChange(saved.id, track === 'units' ? start * it.upv : start, 'receive', {
          note: 'Opening stock', opening: true, unitCost: it.buyPrice, spent: it.buyPrice != null ? start * it.buyPrice : null,
        });
        saved = await db.get('items', saved.id);
      } else saved = await db.put('items', it);
      m.close();
      toast('Item saved.');
    };
  });
}

function qtyModal({ title, label, hint = '', value = '', withLot = false, it }) {
  const per = it.track === 'units' ? 'vial' : it.unitLabel;
  return new Promise(resolve => {
    let out = null;
    const m = openModal(`
      <form class="form" novalidate>
        <div class="sheet-head"><h2>${esc(title)}</h2></div>
        <div class="sheet-body"><div class="form-grid">
          <div class="field s12"><label>${esc(label)}</label><input name="q" type="number" inputmode="decimal" step="any" value="${esc(value)}" autofocus>${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</div>
          ${withLot ? `<div class="field"><label>Price paid per ${esc(per)} (฿)</label><input name="cost" type="number" inputmode="decimal" step="any" value="${esc(it.buyPrice ?? '')}"><span class="hint" data-costtotal> </span></div>
            <div class="field"><label>Total paid</label><input data-totalshow disabled value=""></div>
            <div class="field"><label>Lot no.</label><input name="lot" value="${esc(it.lot || '')}"></div>
            <div class="field"><label>Expiry</label><input name="expiry" type="date" value="${esc(it.expiry || '')}"></div>` : ''}
          <div class="field s12"><label>Note</label><input name="note" placeholder="${withLot ? 'Supplier or invoice no.' : 'Reason'}"></div>
        </div></div>
        <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
      </form>`, { onClose: () => resolve(out) });
    const f = $('form', m.el);
    const total = () => { const t = $('[data-totalshow]', m.el); if (t) t.value = num(f.q.value) && num(f.cost.value) != null ? baht(num(f.q.value) * num(f.cost.value)) : ''; };
    if (f.cost) { f.q.oninput = total; f.cost.oninput = total; total(); }
    f.onsubmit = e => {
      e.preventDefault();
      const q = num(f.q.value);
      if (q == null) { toast('Enter a number.'); return; }
      out = { q, note: f.note.value.trim(), lot: f.lot ? f.lot.value.trim() : null, expiry: f.expiry ? f.expiry.value : null, cost: f.cost ? num(f.cost.value) : null };
      m.close();
    };
  });
}

export async function itemPage(root, id) {
  const it = await db.get('items', id);
  if (!it) { root.innerHTML = '<a class="back" href="#/inventory">Stock</a><div class="card">This item no longer exists.</div>'; return; }
  const [log, patients] = await Promise.all([db.byIndex('stocklog', 'itemId', id), db.all('patients')]);
  const P = Object.fromEntries(patients.map(p => [p.id, p]));
  log.sort((a, b) => b.at.localeCompare(a.at));
  const unitWord = n => it.track === 'units' ? 'U' : plural(it.unitLabel || 'piece', Math.abs(n));
  const vialAge = openVialAge(it);

  root.innerHTML = `
    <a class="back" href="#/inventory">${icons.back}Stock</a>
    <header class="top"><div><h1>${esc(it.name)}</h1><p class="sub">${esc([it.brand, it.category, it.track === 'units' ? 'used per unit' : `counted per ${it.unitLabel}`].filter(Boolean).join(' · '))}</p></div>
      <div class="actions">
        <button class="btn" data-act="edit">Edit</button>
        <button class="btn" data-act="adjust">Correct count</button>
        <button class="btn primary" data-act="receive">${icons.plus}Receive stock</button>
      </div></header>
    <div class="grid2">
      <section class="card"><h2>In stock ${statusChips(it)}</h2>
        <p style="font-size:24px;font-weight:700" class="num">${stockText(it)}</p>
        <dl class="kv" style="margin-top:14px;grid-template-columns:140px 1fr">
          <dt>Reorder at</dt><dd>${it.reorderAt !== '' && it.reorderAt != null ? `${fmtNum(it.reorderAt)} ${plural(it.track === 'units' ? 'vial' : it.unitLabel, it.reorderAt)}` : 'Not set'}</dd>
          <dt>Lot no.</dt><dd>${esc(it.lot || 'Not set')}</dd>
          <dt>Expiry</dt><dd>${it.expiry ? fmtDate(it.expiry) : 'Not set'}</dd>
          ${it.track === 'units' ? `<dt>Units per vial</dt><dd>${it.upv}</dd>` : ''}
          <dt>Buying price</dt><dd>${it.buyPrice != null ? `${baht(it.buyPrice)} per ${it.track === 'units' ? 'vial' : esc(it.unitLabel)}${it.track === 'units' ? `, ${baht(costPerUse(it))} per unit` : ''}` : 'Not set'}</dd>
          <dt>Selling price</dt><dd>${it.sellPrice != null ? `${baht(it.sellPrice)} per ${it.track === 'units' ? 'unit' : esc(it.unitLabel)}` : 'Not set'}</dd>
          ${it.notes ? `<dt>Notes</dt><dd>${esc(it.notes)}</dd>` : ''}
        </dl>
      </section>
      ${it.track === 'units' ? `<section class="card"><h2>Open vial</h2>
        ${it.openLeft ? `<p style="font-size:24px;font-weight:700" class="num">${fmtNum(it.openLeft)} U left</p>
          <p class="muted" style="margin:4px 0 14px">Opened ${fmtDate(it.openedAt)}${vialAge ? `, ${vialAge} day${vialAge === 1 ? "" : "s"} ago` : vialAge === 0 ? ", today" : ""}</p>
          <button class="btn danger" data-act="discard">Discard open vial</button>`
          : `<p class="muted">No vial open. The next treatment opens one of the ${sealedVials(it)} sealed ${plural('vial', sealedVials(it))}.</p>`}
      </section>` : '<div></div>'}
    </div>
    <section class="card flush" style="margin-top:16px"><h2>History</h2><ul class="list">
      ${log.length ? log.map(l => `<li>
        <div class="grow"><div class="title">${kindLabel(l.kind)} <span class="num" style="color:${l.change < 0 ? 'var(--danger)' : 'var(--ok)'}">${l.change > 0 ? '+' : ''}${fmtNum(l.change)} ${unitWord(l.change)}</span></div>
          <div class="meta">${fmtDate(l.at.slice(0, 10))}${l.patientId && P[l.patientId] ? ` · <a href="#/patient/${l.patientId}">${esc(displayName(P[l.patientId]))}</a>` : ''}${l.note ? ' · ' + esc(l.note) : ''}</div></div>
        ${l.spent != null ? `<span class="num ${l.opening ? 'muted' : ''}">${baht(l.spent)}</span>` : ''}
      </li>`).join('') : '<li class="empty">No movements yet.</li>'}
    </ul></section>
    <div class="actions"><button class="btn danger" data-act="delete">${icons.trash}Delete item</button></div>`;

  root.onclick = async e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'edit') { if (await itemForm(it)) refresh(); }
    else if (act === 'receive') {
      const r = await qtyModal({ title: 'Receive stock', label: it.track === 'units' ? 'Vials received' : `${plural(it.unitLabel, 2)} received`, withLot: true, it });
      if (!r) return;
      const cur = await db.get('items', id);
      if (r.lot) cur.lot = r.lot;
      if (r.expiry) cur.expiry = r.expiry;
      if (r.cost != null) cur.buyPrice = r.cost;
      await db.put('items', cur);
      await applyChange(id, it.track === 'units' ? r.q * it.upv : r.q, 'receive', {
        note: r.note, unitCost: r.cost, spent: r.cost != null ? r.q * r.cost : null,
      });
      toast('Stock added.'); refresh();
    } else if (act === 'adjust') {
      const r = await qtyModal({
        title: 'Correct count', label: it.track === 'units' ? 'Total units on the shelf, open vial included' : `${plural(it.unitLabel, 2)} on the shelf`,
        value: it.qty, it,
      });
      if (!r) return;
      const diff = r.q - it.qty;
      if (diff) await applyChange(id, diff, 'adjust', { note: r.note });
      toast('Count corrected.'); refresh();
    } else if (act === 'discard') {
      if (await confirmBox(`Discard the ${fmtNum(it.openLeft)} U left in the open vial?`, { ok: 'Discard' })) {
        await applyChange(id, -it.openLeft, 'discard', { note: 'Open vial discarded' });
        refresh();
      }
    } else if (act === 'delete') {
      if (await confirmBox(`Delete ${it.name} and its stock history? Past treatments keep the product name.`, { ok: 'Delete item' })) {
        for (const l of log) await db.del('stocklog', l.id);
        await db.del('items', id);
        toast('Item deleted.');
        go('#/inventory');
      }
    }
  };
}
