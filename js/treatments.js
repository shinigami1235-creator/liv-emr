import * as db from './db.js';
import { $, $$, esc, openModal, toast, dateStr, addDays, addMonths, fmtDate, num, fmtNum, icons, segHTML, bindSeg, segValue, confirmBox } from './ui.js';
import { syncTreatmentStock, shortfalls, plural } from './stock.js';

export const TYPES = {
  toxin: { label: 'Toxin', color: '#6b4fa0' },
  filler: { label: 'Filler', color: '#c0577a' },
  device: { label: 'Laser / device', color: '#cf7419' },
  medication: { label: 'Medication', color: '#2f7d6d' },
  product: { label: 'Product sold', color: '#3f6aa8' },
  other: { label: 'Other procedure', color: '#707773' },
};

const TOXIN_AREAS = ['Forehead', 'Glabella', "Crow's feet left", "Crow's feet right", 'Bunny lines', 'Brow lift', 'Gummy smile', 'Lip flip', 'DAO', 'Chin', 'Masseter left', 'Masseter right', 'Platysma', 'Underarm', 'Trapezius', 'Calf'];
const FILLER_AREAS = ['Lips', 'Tear trough', 'Cheek', 'Temple', 'Nasolabial fold', 'Marionette lines', 'Chin', 'Jawline', 'Nose', 'Forehead', 'Hand'];
const DEVICE_AREAS = ['Full face', 'Forehead', 'Cheeks', 'Nose', 'Upper lip', 'Chin', 'Neck', 'Decolletage', 'Underarm', 'Back', 'Arms', 'Legs'];
const ROUTES = ['Oral', 'Topical', 'IM', 'IV', 'SC', 'Intradermal', 'Inhaled'];
const FREQS = ['Once daily', 'Twice daily', 'Three times daily', 'Every 8 hours', 'At night', 'Every morning', 'As needed', 'Once a week', 'Single dose'];

const TOXIN_CATS = ['Toxin'];
const FILLER_CATS = ['Filler', 'Skin booster'];
const MED_CATS = ['Medication'];
const ALL_CATS = null;

export function typeDot(type) {
  return `<span class="tdot" style="background:${(TYPES[type] || TYPES.other).color}"></span>`;
}

export function summarize(t) {
  const d = t.data || {};
  const rows = d.rows || [];
  switch (t.type) {
    case 'toxin': {
      const total = rows.reduce((s, r) => s + (num(r.units) || 0), 0);
      return { title: `${d.productName || 'Toxin'} ${fmtNum(total)} U`, detail: rows.filter(r => r.area || r.units).map(r => `${r.area || 'Area'} ${fmtNum(num(r.units))}`).join(', ') };
    }
    case 'filler': {
      const total = rows.reduce((s, r) => s + (num(r.ml) || 0), 0);
      return { title: `${d.productName || 'Filler'} ${fmtNum(total)} ml`, detail: rows.filter(r => r.area || r.ml).map(r => `${r.area || 'Area'} ${fmtNum(num(r.ml))} ml`).join(', ') };
    }
    case 'device':
      return {
        title: d.deviceName || 'Laser / device',
        detail: rows.map(r => [r.area, r.wavelength && `${r.wavelength} nm`, r.fluence && `${r.fluence} J/cm²`, r.spot && `${r.spot} mm`, r.pulse && `${r.pulse} ms`, r.passes && `${r.passes} passes`].filter(Boolean).join(' ')).join('; '),
      };
    case 'medication':
      return { title: [d.drug, d.dose].filter(Boolean).join(' ') || 'Medication', detail: [d.route, d.frequency, d.duration, d.qty && `qty ${d.qty}`].filter(Boolean).join(', ') };
    case 'product':
      return { title: rows.map(r => `${r.name || 'Product'} ×${fmtNum(num(r.qty) || 1)}`).join(', ') || 'Product sold', detail: '' };
    default:
      return { title: d.name || 'Procedure', detail: d.details || '' };
  }
}

export function treatmentLi(t, { showPatient = null } = {}) {
  const s = summarize(t);
  const due = t.nextDue ? `<span class="chip ${t.nextDue < dateStr() ? 'warn' : ''}">Next ${fmtDate(t.nextDue)}</span>` : '';
  return `<li class="tap" data-treatment="${t.id}">
    <div class="grow">
      <div class="title">${typeDot(t.type)}${esc(s.title)}</div>
      <div class="meta">${showPatient ? esc(showPatient) + ' · ' : ''}${fmtDate(t.date)}${s.detail ? ' · ' + esc(s.detail) : ''}</div>
    </div>${due}</li>`;
}

function itemOptions(items, cats, selected) {
  const list = items.filter(i => !cats || cats.includes(i.category)).sort((a, b) => a.name.localeCompare(b.name));
  return `<option value="">${list.length ? 'Choose from stock' : 'Nothing in stock yet'}</option>` +
    list.map(i => `<option value="${i.id}" ${i.id === selected ? 'selected' : ''}>${esc(i.name)}${i.brand ? ' · ' + esc(i.brand) : ''}${i.track === 'units' ? ' (per unit)' : i.unitLabel === 'vial' ? ' (per vial)' : ''}</option>`).join('');
}

function rowsHTML(fields, rows, minRows = 1) {
  const list = rows.length ? rows : Array.from({ length: minRows }, () => ({}));
  return list.map(r => rowHTML(fields, r)).join('');
}
function rowHTML(fields, r) {
  const cols = fields.map(f => f.w || '1fr').join(' ') + ' 44px';
  return `<div class="row-line" style="grid-template-columns:${cols}">
    ${fields.map(f => `<div class="field">${f.label ? `<label>${f.label}</label>` : ''}
      ${f.options
        ? `<select data-k="${f.k}">${f.options}</select>`
        : `<input data-k="${f.k}" ${f.type === 'number' ? 'type="number" inputmode="decimal" step="any"' : ''} ${f.list ? `list="${f.list}"` : ''} value="${esc(r[f.k] ?? '')}" placeholder="${esc(f.ph || '')}">`}
    </div>`).join('')}
    <button type="button" class="icon-btn del" data-delrow aria-label="Remove row">${icons.x}</button>
  </div>`;
}
function readRows(box) {
  return $$('.row-line', box).map(line => {
    const o = {};
    $$('[data-k]', line).forEach(i => { o[i.dataset.k] = i.value.trim(); });
    if (o.itemId !== undefined) {
      const sel = line.querySelector('[data-k=itemId]');
      o.name = sel.value ? sel.options[sel.selectedIndex].text.split(' · ')[0].replace(/ \(per (unit|vial)\)$/, '') : '';
    }
    return o;
  }).filter(o => Object.entries(o).some(([k, v]) => k !== 'name' && v));
}

function datalist(id, arr) {
  return `<datalist id="${id}">${arr.map(a => `<option value="${esc(a)}">`).join('')}</datalist>`;
}

function typeForm(type, d, items, devices) {
  const rows = d.rows || [];
  switch (type) {
    case 'toxin': return `
      <div class="form-grid">
        <div class="field s8"><label>Product</label><select name="itemId">${itemOptions(items, TOXIN_CATS, d.itemId)}</select></div>
        <div class="field s4"><label>Dilution (ml saline per vial)</label><input name="dilution" type="number" inputmode="decimal" step="any" value="${esc(d.dilution ?? '')}" placeholder="2.5"></div>
        <div class="field s12 freeprod ${d.itemId ? 'hidden' : ''}"><label>Brand if not in stock</label><input name="productName" value="${d.itemId ? '' : esc(d.productName || '')}" placeholder="Botox"></div>
      </div>
      <div class="field"><label>Units by area</label>
        <div class="rows" data-rows="toxin">${rowsHTML(TOXIN_FIELDS, rows, 2)}</div>
        <div class="total-line"><button type="button" class="btn sm" data-addrow="toxin">${icons.plus}Area</button><span data-total="toxin"></span></div>
      </div>
      <div class="form-grid">
        <div class="field s4 vials-field"><label>Vials used</label><input name="vials" type="number" inputmode="numeric" step="1" value="${esc(d.vials ?? 1)}"></div>
        <div class="field s4"><label>Lot no.</label><input name="lot" value="${esc(d.lot || '')}"></div>
        <div class="field s4"><label>Expiry</label><input name="expiry" type="date" value="${esc(d.expiry || '')}"></div>
      </div>${datalist('toxin-areas', TOXIN_AREAS)}`;
    case 'filler': return `
      <div class="form-grid">
        <div class="field s8"><label>Product</label><select name="itemId">${itemOptions(items, FILLER_CATS, d.itemId)}</select></div>
        <div class="field s4"><label>Syringes used</label><input name="syringes" type="number" inputmode="numeric" step="1" value="${esc(d.syringes ?? 1)}"></div>
        <div class="field s12 freeprod ${d.itemId ? 'hidden' : ''}"><label>Brand if not in stock</label><input name="productName" value="${d.itemId ? '' : esc(d.productName || '')}" placeholder="Juvederm Volift"></div>
      </div>
      <div class="field"><label>Amount by area</label>
        <div class="rows" data-rows="filler">${rowsHTML(FILLER_FIELDS, rows, 1)}</div>
        <div class="total-line"><button type="button" class="btn sm" data-addrow="filler">${icons.plus}Area</button><span data-total="filler"></span></div>
      </div>
      <div class="form-grid">
        <div class="field s3"><label>Technique</label><select name="technique">${['', 'Needle', 'Cannula', 'Both'].map(o => `<option ${o === d.technique ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="field s3"><label>Gauge</label><input name="gauge" value="${esc(d.gauge || '')}" placeholder="25G 38 mm"></div>
        <div class="field s3"><label>Lot no.</label><input name="lot" value="${esc(d.lot || '')}"></div>
        <div class="field s3"><label>Expiry</label><input name="expiry" type="date" value="${esc(d.expiry || '')}"></div>
      </div>${datalist('filler-areas', FILLER_AREAS)}`;
    case 'device': return `
      <div class="field"><label>Device</label>
        ${devices.length
          ? `<select name="deviceId"><option value="">Choose device</option>${devices.map(x => `<option value="${x.id}" ${x.id === d.deviceId ? 'selected' : ''}>${esc(x.name)}${x.brand ? ' · ' + esc(x.brand) : ''}</option>`).join('')}</select>`
          : `<input name="deviceName" value="${esc(d.deviceName || '')}" placeholder="PicoWay"><span class="hint">Add his lasers in Settings to pick them from a list.</span>`}
      </div>
      <div class="field"><label>Settings by area</label>
        <div class="rows" data-rows="device">${(rows.length ? rows : [{}]).map(r => deviceRow(r)).join('')}</div>
        <div class="total-line"><button type="button" class="btn sm" data-addrow="device">${icons.plus}Area</button></div>
      </div>
      <div class="field"><label>Endpoint and skin reaction</label><input name="endpoint" value="${esc(d.endpoint || '')}" placeholder="Mild erythema, no blistering"></div>
      ${datalist('device-areas', DEVICE_AREAS)}`;
    case 'medication': return `
      <div class="form-grid">
        <div class="field s8"><label>Drug</label><input name="drug" value="${esc(d.drug || '')}" placeholder="Isotretinoin" list="med-names"></div>
        <div class="field s4"><label>Dose</label><input name="dose" value="${esc(d.dose || '')}" placeholder="20 mg"></div>
        <div class="field s4"><label>Route</label><select name="route">${['', ...ROUTES].map(o => `<option ${o === d.route ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="field s4"><label>Frequency</label><input name="frequency" value="${esc(d.frequency || '')}" list="freq-list" placeholder="Once daily"></div>
        <div class="field s4"><label>Duration</label><input name="duration" value="${esc(d.duration || '')}" placeholder="1 month"></div>
        <div class="field s8"><label>Dispensed from stock</label><select name="itemId">${itemOptions(items, MED_CATS, d.itemId)}</select></div>
        <div class="field s4"><label>Quantity dispensed</label><input name="qty" type="number" inputmode="decimal" step="any" value="${esc(d.qty ?? '')}"></div>
      </div>
      ${datalist('freq-list', FREQS)}${datalist('med-names', items.filter(i => i.category === 'Medication').map(i => i.name))}`;
    case 'product': return `
      <div class="field"><label>Products</label>
        <div class="rows" data-rows="product">${rowsHTML(productFields(items), rows, 1)}</div>
        <div class="total-line"><button type="button" class="btn sm" data-addrow="product">${icons.plus}Product</button></div>
      </div>`;
    default: return `
      <div class="field"><label>Procedure</label><input name="name" value="${esc(d.name || '')}" placeholder="Thread lift"></div>
      <div class="field"><label>Details</label><textarea name="details">${esc(d.details || '')}</textarea></div>`;
  }
}

const TOXIN_FIELDS = [{ k: 'area', ph: 'Area', list: 'toxin-areas', w: '2fr' }, { k: 'units', ph: 'Units', type: 'number', w: '1fr' }];
const FILLER_FIELDS = [{ k: 'area', ph: 'Area', list: 'filler-areas', w: '2fr' }, { k: 'ml', ph: 'ml', type: 'number', w: '1fr' }];
const productFields = (items, sel) => [{ k: 'itemId', w: '3fr', options: itemOptions(items, ALL_CATS, sel) }, { k: 'qty', ph: 'Qty', type: 'number', w: '1fr' }];

function deviceRow(r) {
  const f = (k, label, ph) => `<div class="field"><label>${label}</label><input data-k="${k}" type="${k === 'area' ? 'text' : 'number'}" ${k === 'area' ? 'list="device-areas"' : 'inputmode="decimal" step="any"'} value="${esc(r[k] ?? '')}" placeholder="${ph}"></div>`;
  return `<div class="row-line row-card" style="grid-template-columns:1fr">
    <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
      ${f('area', 'Area', 'Full face')}${f('wavelength', 'Wavelength nm', '1064')}${f('fluence', 'Fluence J/cm²', '2.5')}${f('spot', 'Spot mm', '8')}
      ${f('pulse', 'Pulse width ms', '0.3')}${f('hz', 'Rate Hz', '10')}${f('passes', 'Passes', '2')}${f('shots', 'Shots', '1500')}
    </div>
    <button type="button" class="btn sm danger" data-delrow style="justify-self:end">Remove area</button>
  </div>`;
}

const DUE = [['', 'None'], ['2w', '2 weeks'], ['1m', '1 month'], ['3m', '3 months'], ['4m', '4 months'], ['6m', '6 months']];
function dueFrom(base, code) {
  if (code === '2w') return addDays(base, 14);
  if (code.endsWith('m')) return addMonths(base, Number(code.slice(0, -1)));
  return '';
}

export function chooseType() {
  return new Promise(resolve => {
    let picked = null;
    const m = openModal(`
      <div class="sheet-head"><h2>Add treatment</h2><button class="btn ghost" data-close>Cancel</button></div>
      <div class="sheet-body"><div class="type-pick">
        ${Object.entries(TYPES).map(([k, v]) => `<button data-type="${k}"><i style="background:${v.color}"></i>${v.label}</button>`).join('')}
      </div></div>`, { onClose: () => resolve(picked) });
    m.el.querySelector('.type-pick').onclick = e => {
      const b = e.target.closest('[data-type]'); if (!b) return;
      picked = b.dataset.type; m.close();
    };
  });
}

// Opens the treatment sheet. Resolves with the saved treatment, {deleted:true}, or null.
export function openTreatment({ patientId, visitId = null, type = null, id = null }) {
  return new Promise(async resolve => {
    let result = null;
    const existing = id ? await db.get('treatments', id) : null;
    if (!existing && !type) type = await chooseType();
    if (!existing && !type) { resolve(null); return; }
    const t = existing || { patientId, visitId, type, date: dateStr(), data: {}, extras: [], nextDue: '', notes: '' };
    const items = await db.all('items');
    const devices = (await db.all('devices')).sort((a, b) => a.name.localeCompare(b.name));
    const itemById = id2 => items.find(i => i.id === id2);
    const m = openModal(`
      <form class="form" novalidate>
        <div class="sheet-head">${typeDot(t.type)}<h2>${TYPES[t.type].label}</h2></div>
        <div class="sheet-body form">
          <div class="form-grid"><div class="field s4"><label>Date</label><input type="date" name="date" value="${t.date}"></div></div>
          ${typeForm(t.type, t.data || {}, items, devices)}
          <div class="field"><label>Consumables used</label>
            <div class="rows" data-rows="extras">${(t.extras || []).map(r => rowHTML(productFields(items, r.itemId), r)).join('')}</div>
            <div><button type="button" class="btn sm" data-addrow="extras">${icons.plus}Consumable</button></div>
          </div>
          <div class="field"><label>Next due</label>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">${segHTML('due', DUE, t.nextDue ? 'custom' : '')}
            <input type="date" name="nextDue" value="${esc(t.nextDue || '')}" style="width:auto"></div>
          </div>
          <div class="field"><label>Notes</label><textarea name="notes" placeholder="Patient tolerated well. Review in 2 weeks.">${esc(t.notes || '')}</textarea></div>
        </div>
        <div class="sheet-foot">
          ${existing ? '<button type="button" class="btn danger left" data-del>Delete</button>' : ''}
          <button type="button" class="btn" data-close>Cancel</button>
          <button class="btn primary">Save</button>
        </div>
      </form>`, { wide: true, sticky: true, onClose: () => resolve(result) });
    const f = m.el.querySelector('form');
    bindSeg(m.el, (name, v) => { if (name === 'due') f.nextDue.value = dueFrom(f.date.value || dateStr(), v); });
    f.nextDue.oninput = () => $$('[data-seg=due] button', m.el).forEach(b => b.classList.remove('on'));

    // Product choice shows or hides the free brand field, the vial count, and fills lot and expiry.
    const prodSel = f.itemId && f.itemId.tagName === 'SELECT' ? f.itemId : null;
    const syncProduct = (fill) => {
      if (!prodSel) return;
      const it = itemById(prodSel.value);
      const free = m.el.querySelector('.freeprod');
      if (free) free.classList.toggle('hidden', !!prodSel.value);
      const vf = m.el.querySelector('.vials-field');
      if (vf) vf.classList.toggle('hidden', !!(it && it.track === 'units'));
      if (fill && it) {
        if (f.lot && it.lot) f.lot.value = it.lot;
        if (f.expiry && it.expiry) f.expiry.value = it.expiry;
        if (f.dilution && it.dilution && !f.dilution.value) f.dilution.value = it.dilution;
      }
    };
    if (prodSel) { prodSel.onchange = () => syncProduct(true); syncProduct(false); }

    const paintTotals = () => {
      const tox = m.el.querySelector('[data-total=toxin]');
      if (tox) tox.textContent = `Total ${fmtNum(readRows(m.el.querySelector('[data-rows=toxin]')).reduce((s, r) => s + (num(r.units) || 0), 0))} U`;
      const fil = m.el.querySelector('[data-total=filler]');
      if (fil) fil.textContent = `Total ${fmtNum(readRows(m.el.querySelector('[data-rows=filler]')).reduce((s, r) => s + (num(r.ml) || 0), 0))} ml`;
    };
    paintTotals();
    m.el.addEventListener('input', paintTotals);
    m.el.addEventListener('click', e => {
      const add = e.target.closest('[data-addrow]');
      if (add) {
        const k = add.dataset.addrow;
        const box = m.el.querySelector(`[data-rows=${k}]`);
        const html = k === 'toxin' ? rowHTML(TOXIN_FIELDS, {}) : k === 'filler' ? rowHTML(FILLER_FIELDS, {})
          : k === 'device' ? deviceRow({}) : rowHTML(productFields(items), {});
        box.insertAdjacentHTML('beforeend', html);
        const first = box.lastElementChild.querySelector('input, select');
        if (first) first.focus();
      }
      const del = e.target.closest('[data-delrow]');
      if (del) { del.closest('.row-line').remove(); paintTotals(); }
    });

    const delBtn = m.el.querySelector('[data-del]');
    if (delBtn) delBtn.onclick = async () => {
      if (!(await confirmBox('Delete this treatment? Stock it used goes back on the shelf.'))) return;
      await syncTreatmentStock(t.moves, [], { note: 'Treatment deleted', patientId: t.patientId, treatmentId: t.id });
      await db.del('treatments', t.id);
      result = { deleted: true };
      m.close();
      toast('Treatment deleted.');
    };

    f.onsubmit = async e => {
      e.preventDefault();
      const d = {};
      const val = n => (f[n] ? f[n].value.trim() : '');
      const uses = [];
      if (t.type === 'toxin') {
        Object.assign(d, { itemId: val('itemId'), dilution: val('dilution'), vials: val('vials'), lot: val('lot'), expiry: val('expiry'), rows: readRows(m.el.querySelector('[data-rows=toxin]')) });
        const it = itemById(d.itemId);
        d.productName = it ? it.name : val('productName');
        const total = d.rows.reduce((s, r) => s + (num(r.units) || 0), 0);
        if (it) uses.push({ itemId: it.id, amount: it.track === 'units' ? total : (num(d.vials) || 0) });
      } else if (t.type === 'filler') {
        Object.assign(d, { itemId: val('itemId'), syringes: val('syringes'), technique: val('technique'), gauge: val('gauge'), lot: val('lot'), expiry: val('expiry'), rows: readRows(m.el.querySelector('[data-rows=filler]')) });
        const it = itemById(d.itemId);
        d.productName = it ? it.name : val('productName');
        if (it) uses.push({ itemId: it.id, amount: it.track === 'units' ? d.rows.reduce((s, r) => s + (num(r.ml) || 0), 0) : (num(d.syringes) || 0) });
      } else if (t.type === 'device') {
        d.deviceId = val('deviceId');
        const dev = devices.find(x => x.id === d.deviceId);
        d.deviceName = dev ? dev.name : val('deviceName');
        d.rows = $$('[data-rows=device] .row-line', m.el).map(line => {
          const o = {}; $$('[data-k]', line).forEach(i => { if (i.value.trim()) o[i.dataset.k] = i.value.trim(); }); return o;
        }).filter(o => Object.keys(o).length);
        d.endpoint = val('endpoint');
      } else if (t.type === 'medication') {
        Object.assign(d, { drug: val('drug'), dose: val('dose'), route: val('route'), frequency: val('frequency'), duration: val('duration'), itemId: val('itemId'), qty: val('qty') });
        const it = itemById(d.itemId);
        if (it && !d.drug) d.drug = it.name;
        if (it && num(d.qty)) uses.push({ itemId: it.id, amount: num(d.qty) });
      } else if (t.type === 'product') {
        d.rows = readRows(m.el.querySelector('[data-rows=product]'));
        for (const r of d.rows) if (r.itemId) uses.push({ itemId: r.itemId, amount: num(r.qty) || 1 });
      } else {
        d.name = val('name'); d.details = val('details');
        if (!d.name) { toast('Name the procedure.'); return; }
      }
      const extras = readRows(m.el.querySelector('[data-rows=extras]'));
      for (const r of extras) if (r.itemId) uses.push({ itemId: r.itemId, amount: num(r.qty) || 1 });

      const short = await shortfalls(t.moves, uses);
      if (short.length && !(await confirmBox(`${short.join('. ')}. Save anyway and let the count go below zero?`, { ok: 'Save anyway', danger: false, title: 'Not enough stock' }))) return;

      Object.assign(t, { date: f.date.value || dateStr(), data: d, extras, nextDue: f.nextDue.value, notes: f.notes.value.trim() });
      if (!t.id) t.id = db.uid();
      t.moves = await syncTreatmentStock(t.moves, uses, { note: TYPES[t.type].label, patientId: t.patientId, treatmentId: t.id });
      result = await db.put('treatments', t);
      // Remember dilution per product for next time.
      if (t.type === 'toxin' && d.itemId && d.dilution) {
        const it = await db.get('items', d.itemId);
        if (it && it.dilution !== d.dilution) { it.dilution = d.dilution; await db.put('items', it); }
      }
      m.close();
      toast('Treatment saved.');
    };
  });
}
