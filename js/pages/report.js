import * as db from '../db.js';
import { $, esc, toast, openModal, confirmBox, dateStr, fmtDate, monthTitle, num, baht, fmtNum, icons } from '../ui.js';
import { displayName } from '../common.js';
import { TYPES, summarize, typeDot, openTreatment } from '../treatments.js';
import { plural } from '../stock.js';
import { go, refresh } from '../router.js';

const EXPENSE_KINDS = ['Rent', 'Staff', 'Electricity', 'Water', 'Internet and phone', 'Marketing', 'Equipment', 'Repairs', 'Supplies', 'Other'];

function expenseForm(ym, ex = null) {
  return new Promise(resolve => {
    let saved = null;
    const today = dateStr();
    const d = ex || { date: today.startsWith(ym) ? today : `${ym}-01` };
    const m = openModal(`
      <form class="form" novalidate>
        <div class="sheet-head"><h2>${ex ? 'Edit expense' : 'Add expense'}</h2></div>
        <div class="sheet-body"><div class="form-grid">
          <div class="field s4"><label>Date</label><input name="date" type="date" value="${esc(d.date)}"></div>
          <div class="field s8"><label>Expense</label><input name="what" list="exp-kinds" value="${esc(d.what || '')}" placeholder="Rent" autofocus>
            <datalist id="exp-kinds">${EXPENSE_KINDS.map(k => `<option value="${k}">`).join('')}</datalist></div>
          <div class="field s4"><label>Amount (฿)</label><input name="amount" type="number" inputmode="decimal" step="any" value="${esc(d.amount ?? '')}" placeholder="25000"></div>
          <div class="field s8"><label>Note</label><input name="note" value="${esc(d.note || '')}" placeholder="October rent"></div>
        </div></div>
        <div class="sheet-foot">${ex ? '<button type="button" class="btn danger left" data-del>Delete</button>' : ''}
          <button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
      </form>`, { onClose: () => resolve(saved) });
    const f = $('form', m.el);
    const del = $('[data-del]', m.el);
    if (del) del.onclick = async () => {
      if (await confirmBox(`Delete this ${baht(ex.amount)} expense?`)) { await db.del('expenses', ex.id); saved = { deleted: true }; m.close(); }
    };
    f.onsubmit = async e => {
      e.preventDefault();
      if (!f.what.value.trim()) { toast('Name the expense.'); return; }
      if (num(f.amount.value) == null) { toast('Enter the amount.'); return; }
      Object.assign(d, { date: f.date.value || today, what: f.what.value.trim(), amount: num(f.amount.value), note: f.note.value.trim() });
      saved = await db.put('expenses', d);
      m.close();
    };
  });
}

const csvCell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function shareCSV(name, rows) {
  const text = rows.map(r => r.map(csvCell).join(',')).join('\n');
  const file = new File(['﻿' + text], name, { type: 'text/csv' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export default async function reportPage(root, ym) {
  const today = dateStr();
  ym = ym || today.slice(0, 7);
  const [y, mo] = ym.split('-').map(Number);
  const prev = dateStr(new Date(y, mo - 2, 1)).slice(0, 7);
  const next = dateStr(new Date(y, mo, 1)).slice(0, 7);

  const [treatments, log, items, expensesAll, patients] = await Promise.all([
    db.all('treatments'), db.all('stocklog'), db.all('items'), db.all('expenses'), db.all('patients'),
  ]);
  const P = Object.fromEntries(patients.map(p => [p.id, p]));
  const I = Object.fromEntries(items.map(i => [i.id, i]));

  const tx = treatments.filter(t => t.date && t.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const income = tx.reduce((s, t) => s + (t.price || 0), 0);
  const costUsed = tx.reduce((s, t) => s + (t.cost || 0), 0);
  const noCharge = tx.filter(t => t.price == null).length;
  const noCost = tx.filter(t => t.costMissing).length;

  const byType = {};
  for (const t of tx) {
    const b = byType[t.type] || (byType[t.type] = { n: 0, amt: 0 });
    b.n++; b.amt += t.price || 0;
  }

  const buys = log.filter(l => l.kind === 'receive' && !l.opening && dateStr(new Date(l.at)).startsWith(ym));
  const bought = buys.reduce((s, l) => s + (l.spent || 0), 0);
  const noPrice = buys.filter(l => l.spent == null).length;
  const byItem = {};
  for (const l of buys) {
    const b = byItem[l.itemId] || (byItem[l.itemId] = { qty: 0, amt: 0 });
    const it = I[l.itemId];
    b.qty += it && it.track === 'units' ? l.change / (it.upv || 100) : l.change;
    b.amt += l.spent || 0;
  }

  const expenses = expensesAll.filter(e => e.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date));
  const spentOther = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  const net = income - bought - spentOther;
  const usedProfit = income - costUsed - spentOther;

  const tone = n => n < 0 ? 'var(--danger)' : 'var(--ok)';
  const tile = (label, value, sub = '', color = '') => `<div class="card" style="margin:0">
    <div class="label">${label}</div>
    <div class="num" style="font-size:26px;font-weight:700;margin-top:4px;${color ? `color:${color}` : ''}">${baht(value)}</div>
    ${sub ? `<div class="muted small" style="margin-top:2px">${sub}</div>` : ''}</div>`;

  root.innerHTML = `
    <header class="top">
      <div><h1>Report</h1><p class="sub">${monthTitle(y, mo - 1)}</p></div>
      <div class="actions">
        <a class="icon-btn" href="#/report/${prev}" aria-label="Previous month">${icons.left}</a>
        ${ym !== today.slice(0, 7) ? '<a class="btn" href="#/report">This month</a>' : ''}
        <a class="icon-btn" href="#/report/${next}" aria-label="Next month">${icons.right}</a>
        <button class="btn" data-act="csv">Download CSV</button>
      </div>
    </header>

    ${noCharge || noCost || noPrice ? `<div class="banner warn">${icons.alert}<div>${[
      noCharge && `${noCharge} treatment${noCharge > 1 ? 's have' : ' has'} no charge entered.`,
      noCost && `${noCost} treatment${noCost > 1 ? 's use' : ' uses'} stock with no buying price, so the stock used figure is short.`,
      noPrice && `${noPrice} deliver${noPrice > 1 ? 'ies have' : 'y has'} no price paid, so stock bought is short.`,
    ].filter(Boolean).join(' ')}</div></div>` : ''}

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:16px">
      ${tile('Gross income', income, `${tx.length} treatment${tx.length === 1 ? '' : 's'} charged`)}
      ${tile('Stock bought', bought, `${buys.length} deliver${buys.length === 1 ? 'y' : 'ies'}`)}
      ${tile('Other expenses', spentOther, `${expenses.length} item${expenses.length === 1 ? '' : 's'}`)}
      ${tile('Net profit', net, 'Gross income minus stock bought and other expenses', tone(net))}
    </div>

    <section class="card"><h2>Profit on stock used</h2>
      <div style="display:flex;gap:28px;flex-wrap:wrap;align-items:flex-end">
        <div><div class="label">Cost of stock used</div><div class="num" style="font-size:20px;font-weight:700">${baht(costUsed)}</div></div>
        <div><div class="label">Profit on stock used</div><div class="num" style="font-size:20px;font-weight:700;color:${tone(usedProfit)}">${baht(usedProfit)}</div></div>
      </div>
      <p class="muted small" style="margin-top:10px">Gross income minus the buying price of the stock used on patients this month and other expenses. Stock still on the shelf is left out of this figure.</p>
    </section>

    <div class="grid2">
      <section class="card"><h2>Income by treatment</h2>
        <table class="tbl"><tbody>
          ${Object.keys(byType).length ? Object.entries(byType).sort((a, b) => b[1].amt - a[1].amt).map(([k, b]) => `<tr>
            <td>${typeDot(k)}${TYPES[k].label}</td><td class="num muted">${b.n}</td><td class="num" style="text-align:right">${baht(b.amt)}</td></tr>`).join('')
            : '<tr><td class="empty">No treatments this month.</td></tr>'}
        </tbody></table>
      </section>
      <section class="card"><h2>Stock bought</h2>
        <table class="tbl"><tbody>
          ${Object.keys(byItem).length ? Object.entries(byItem).sort((a, b) => b[1].amt - a[1].amt).map(([id, b]) => {
            const it = I[id];
            const word = it ? (it.track === 'units' ? 'vial' : it.unitLabel || 'piece') : 'piece';
            return `<tr class="tap" data-item="${id}"><td>${esc(it ? it.name : 'Deleted item')}</td><td class="num muted">${fmtNum(b.qty)} ${plural(word, b.qty)}</td><td class="num" style="text-align:right">${baht(b.amt)}</td></tr>`;
          }).join('') : '<tr><td class="empty">No deliveries this month.</td></tr>'}
        </tbody></table>
      </section>
    </div>

    <section class="card" style="margin-top:16px"><h2>Other expenses <button class="btn sm" data-act="addexp">${icons.plus}Add expense</button></h2>
      <ul class="list">${expenses.length ? expenses.map(e => `<li class="tap" data-exp="${e.id}">
        <div class="grow"><div class="title">${esc(e.what)}</div><div class="meta">${fmtDate(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
        <span class="num">${baht(e.amount)}</span></li>`).join('') : '<li class="empty">No expenses this month. Add rent, staff and bills here to include them in net profit.</li>'}</ul>
    </section>

    <section class="card flush scroll-x"><h2>Treatments</h2>
      <table class="tbl" style="margin-top:8px">
        <thead><tr><th>Date</th><th>Patient</th><th>Treatment</th><th style="text-align:right">Charged</th><th style="text-align:right">Stock cost</th></tr></thead>
        <tbody>${tx.length ? tx.map(t => `<tr class="tap" data-treatment="${t.id}" data-patient="${t.patientId}">
          <td class="num">${fmtDate(t.date)}</td><td>${esc(displayName(P[t.patientId]))}</td>
          <td>${typeDot(t.type)}${esc(summarize(t).title)}</td>
          <td class="num" style="text-align:right">${t.price != null ? baht(t.price) : '<span class="chip warn">Not set</span>'}</td>
          <td class="num muted" style="text-align:right">${t.cost ? baht(t.cost) : ''}</td></tr>`).join('')
          : '<tr><td colspan="5" class="empty" style="padding:16px 20px">No treatments this month.</td></tr>'}</tbody>
      </table>
    </section>`;

  root.onclick = async e => {
    const a = e.target.closest('[data-act], [data-exp], [data-treatment], [data-item]');
    if (!a) return;
    if (a.dataset.act === 'addexp') { if (await expenseForm(ym)) refresh(); }
    else if (a.dataset.exp) { if (await expenseForm(ym, expenses.find(x => x.id === a.dataset.exp))) refresh(); }
    else if (a.dataset.treatment) { if (await openTreatment({ patientId: a.dataset.patient, id: a.dataset.treatment })) refresh(); }
    else if (a.dataset.item) go(`#/item/${a.dataset.item}`);
    else if (a.dataset.act === 'csv') {
      const rows = [
        [`Liv EMR report`, monthTitle(y, mo - 1)], [],
        ['Gross income', income], ['Stock bought', bought], ['Other expenses', spentOther], ['Net profit', net],
        ['Cost of stock used', costUsed], ['Profit on stock used', usedProfit], [],
        ['Treatments'], ['Date', 'Patient', 'Type', 'Treatment', 'Details', 'Charged', 'Stock cost'],
        ...tx.map(t => { const s = summarize(t); return [t.date, P[t.patientId] ? P[t.patientId].fullName : '', TYPES[t.type].label, s.title, s.detail, t.price ?? '', t.cost ?? '']; }),
        [], ['Stock bought'], ['Date', 'Item', 'Quantity', 'Price paid each', 'Total', 'Note'],
        ...buys.map(l => { const it = I[l.itemId]; const q = it && it.track === 'units' ? l.change / (it.upv || 100) : l.change;
          return [dateStr(new Date(l.at)), it ? it.name : '', q, l.unitCost ?? '', l.spent ?? '', l.note || '']; }),
        [], ['Other expenses'], ['Date', 'Expense', 'Amount', 'Note'],
        ...expenses.map(x => [x.date, x.what, x.amount, x.note || '']),
      ];
      shareCSV(`liv-report-${ym}.csv`, rows);
    }
  };
}
