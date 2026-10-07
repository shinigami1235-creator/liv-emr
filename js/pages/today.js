import * as db from '../db.js';
import { $, esc, dateStr, addDays, fmtDate, fmtDateLong, fmtTime, daysBetween, baht, icons } from '../ui.js';
import { displayName, pickPatient, checkIn, bookAppt, statusChip, endTime, copyText } from '../common.js';
import { summarize, TYPES } from '../treatments.js';
import { isLow, expiryState, shortStock } from '../stock.js';
import { go, refresh } from '../router.js';

export default async function today(root) {
  const t = dateStr();
  const [settings, patients, appts, visits, treatments, items] = await Promise.all([
    db.getSettings(), db.all('patients'), db.all('appts'), db.all('visits'), db.all('treatments'), db.all('items'),
  ]);
  const P = Object.fromEntries(patients.map(p => [p.id, p]));

  const todays = appts.filter(a => a.date === t).sort((a, b) => a.time.localeCompare(b.time));
  const open = visits.filter(v => v.status === 'in').sort((a, b) => a.checkInAt.localeCompare(b.checkInAt));

  // Follow-ups: latest due treatment per patient within two weeks, skipping anyone already booked.
  const booked = new Set(appts.filter(a => a.date >= t && a.status === 'booked').map(a => a.patientId));
  const dueBy = addDays(t, 14);
  const due = {};
  for (const tr of treatments) {
    if (!tr.nextDue || tr.nextDue > dueBy || booked.has(tr.patientId) || !P[tr.patientId]) continue;
    if (!due[tr.patientId] || tr.nextDue > due[tr.patientId].nextDue) due[tr.patientId] = tr;
  }
  const followups = Object.values(due).filter(tr => tr.nextDue >= addDays(t, -120)).sort((a, b) => a.nextDue.localeCompare(b.nextDue));

  const chargedToday = treatments.filter(tr => tr.date === t && tr.price != null).reduce((s, tr) => s + tr.price, 0);
  const stockAlerts = items.filter(i => isLow(i) || expiryState(i)).sort((a, b) => a.name.localeCompare(b.name));

  const backupAge = settings.lastBackup ? daysBetween(settings.lastBackup.slice(0, 10), t) : null;
  const needBackup = patients.length > 0 && (backupAge === null || backupAge >= 7);

  root.innerHTML = `
    <header class="top">
      <div><h1>Today</h1><p class="sub">${fmtDateLong(t)}${settings.doctor ? ' · ' + esc(settings.doctor) : ''}${chargedToday ? ` · charged today ${baht(chargedToday)}` : ''}</p></div>
      <div class="actions">
        <button class="btn" data-act="book">${icons.calendar}Book</button>
        <button class="btn primary" data-act="walkin">${icons.check}Check in</button>
      </div>
    </header>

    ${needBackup ? `<div class="banner warn">${icons.alert}<div>${backupAge === null ? 'No backup saved yet.' : `Last backup was ${backupAge} days ago.`} A lost or reset iPad takes every record with it.</div>
      <a class="btn sm" href="#/settings">Back up</a></div>` : ''}

    ${open.length ? `<section class="card"><h2>In clinic now</h2><ul class="list">
      ${open.map(v => `<li class="tap" data-visit="${v.id}">
        <div class="time">${fmtTime(v.checkInAt)}</div>
        <div class="grow"><div class="title">${esc(displayName(P[v.patientId]))}</div>
        <div class="meta">${v.date !== t ? `Checked in ${fmtDate(v.date)} · ` : ''}${esc(v.reason || v.complaint || 'Visit open')}</div></div>
        <button class="btn sm">Open visit</button></li>`).join('')}
    </ul></section>` : ''}

    <section class="card"><h2>Appointments <span class="muted small">${todays.length || ''}</span></h2>
      <ul class="list">
      ${todays.length ? todays.map(a => `<li class="tap" data-appt="${a.id}">
        <div class="time">${a.time}</div>
        <div class="grow"><div class="title">${esc(displayName(P[a.patientId]))}</div>
          <div class="meta">${a.time} to ${endTime(a.time, a.duration)}${a.reason ? ' · ' + esc(a.reason) : ''}${a.note ? ' · ' + esc(a.note) : ''}</div></div>
        ${a.status === 'booked' ? `<button class="btn sm primary" data-checkin="${a.id}">Check in</button>` : statusChip(a.status)}
        ${a.status === 'in' && a.visitId ? `<button class="btn sm" data-openvisit="${a.visitId}">Open visit</button>` : ''}
      </li>`).join('') : '<li class="empty">Nothing booked today.</li>'}
      </ul>
    </section>

    <div class="grid2">
      <section class="card"><h2>Follow-ups due</h2><ul class="list">
        ${followups.length ? followups.map(tr => {
          const p = P[tr.patientId];
          const late = tr.nextDue < t;
          return `<li>
            <div class="grow tap" data-patient="${p.id}"><div class="title">${esc(displayName(p))}</div>
              <div class="meta">${esc(summarize(tr).title)} · ${TYPES[tr.type].label}</div></div>
            <span class="chip ${late ? 'warn' : ''}">${late ? 'Overdue ' : ''}${fmtDate(tr.nextDue)}</span>
            <button class="icon-btn" data-line="${tr.id}" aria-label="Copy LINE message">${icons.copy}</button>
            <button class="btn sm" data-bookfor="${p.id}" data-reason="${TYPES[tr.type].label} follow-up">Book</button>
          </li>`;
        }).join('') : '<li class="empty">No follow-ups due in the next 2 weeks.</li>'}
      </ul></section>

      <section class="card"><h2>Stock to check</h2><ul class="list">
        ${stockAlerts.length ? stockAlerts.map(i => {
          const ex = expiryState(i);
          return `<li class="tap" data-item="${i.id}"><div class="grow"><div class="title">${esc(i.name)}</div>
            <div class="meta">${shortStock(i)}${i.expiry ? ' · expires ' + fmtDate(i.expiry) : ''}</div></div>
            ${isLow(i) ? '<span class="chip danger">Reorder</span>' : ''}
            ${ex === 'expired' ? '<span class="chip danger">Expired</span>' : ex === 'soon' ? '<span class="chip warn">Expiring</span>' : ''}</li>`;
        }).join('') : `<li class="empty">${items.length ? 'Every item is above its reorder level.' : 'No stock items yet.'}</li>`}
      </ul></section>
    </div>`;

  root.onclick = async e => {
    const a = e.target.closest('[data-act], [data-checkin], [data-openvisit], [data-visit], [data-appt], [data-patient], [data-bookfor], [data-line], [data-item]');
    if (!a) return;
    if (a.dataset.act === 'walkin') {
      const p = await pickPatient('Check in patient');
      if (p) { const v = await checkIn(p.id); go(`#/visit/${v.id}`); }
    } else if (a.dataset.act === 'book') {
      if (await bookAppt({ date: t })) refresh();
    } else if (a.dataset.checkin) {
      const ap = todays.find(x => x.id === a.dataset.checkin);
      const v = await checkIn(ap.patientId, ap.id);
      go(`#/visit/${v.id}`);
    } else if (a.dataset.openvisit) {
      go(`#/visit/${a.dataset.openvisit}`);
    } else if (a.dataset.visit) {
      go(`#/visit/${a.dataset.visit}`);
    } else if (a.dataset.appt) {
      const ap = todays.find(x => x.id === a.dataset.appt);
      if (await bookAppt({ appt: ap })) refresh();
    } else if (a.dataset.bookfor) {
      if (await bookAppt({ patientId: a.dataset.bookfor, reason: a.dataset.reason })) refresh();
    } else if (a.dataset.line) {
      const tr = treatments.find(x => x.id === a.dataset.line);
      const p = P[tr.patientId];
      const name = p.nickname || p.fullName.split(' ')[0];
      copyText(`Hello ${name}, this is ${settings.clinicName}. Your ${TYPES[tr.type].label.toLowerCase()} follow-up is due on ${fmtDate(tr.nextDue)}. Reply here to book a time.`);
    } else if (a.dataset.patient) {
      go(`#/patient/${a.dataset.patient}`);
    } else if (a.dataset.item) {
      go(`#/item/${a.dataset.item}`);
    }
  };
}
