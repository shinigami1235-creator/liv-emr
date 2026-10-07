import * as db from '../db.js';
import { $, esc, dateStr, parseDate, fmtDateLong, monthTitle, icons, toast } from '../ui.js';
import { displayName, bookAppt, checkIn, statusChip, endTime } from '../common.js';
import { go, refresh } from '../router.js';

export default async function calendarPage(root, sel) {
  const today = dateStr();
  sel = sel || today;
  const d = parseDate(sel);
  const y = d.getFullYear(), mo = d.getMonth();
  const [appts, patients] = await Promise.all([db.all('appts'), db.all('patients')]);
  const P = Object.fromEntries(patients.map(p => [p.id, p]));
  const count = {};
  for (const a of appts) if (a.status !== 'noshow') count[a.date] = (count[a.date] || 0) + 1;

  const first = new Date(y, mo, 1);
  const start = new Date(y, mo, 1 - ((first.getDay() + 6) % 7)); // weeks start Monday
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const c = new Date(start); c.setDate(start.getDate() + i);
    cells.push(c);
    if (i >= 34 && c.getMonth() !== mo && c.getDay() === 0) break;
  }
  const dayList = appts.filter(a => a.date === sel).sort((a, b) => a.time.localeCompare(b.time));
  const prev = dateStr(new Date(y, mo - 1, 1)), next = dateStr(new Date(y, mo + 1, 1));

  root.innerHTML = `
    <header class="top"><div><h1>Calendar</h1><p class="sub">${fmtDateLong(sel)}</p></div>
      <div class="actions">${sel !== today ? '<a class="btn" href="#/calendar">Today</a>' : ''}<button class="btn primary" data-act="book">${icons.plus}Book</button></div>
    </header>
    <div class="cal-wrap">
      <section class="card" style="margin:0">
        <div class="cal-head">
          <a class="icon-btn" href="#/calendar/${prev}" aria-label="Previous month">${icons.left}</a>
          <h2>${monthTitle(y, mo)}</h2>
          <a class="icon-btn" href="#/calendar/${next}" aria-label="Next month">${icons.right}</a>
        </div>
        <div class="cal-grid">
          ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<div class="dow">${x}</div>`).join('')}
          ${cells.map(c => {
            const ds = dateStr(c);
            const n = Math.min(count[ds] || 0, 4);
            return `<button data-day="${ds}" class="${c.getMonth() !== mo ? 'out' : ''} ${ds === today ? 'today' : ''} ${ds === sel ? 'sel' : ''}">
              ${c.getDate()}<span class="dots">${'<i></i>'.repeat(n)}</span></button>`;
          }).join('')}
        </div>
      </section>
      <section class="card" style="margin:0"><h2>${fmtDateLong(sel)} <span class="muted small">${dayList.length ? dayList.length + ' booked' : ''}</span></h2>
        <ul class="list">
          ${dayList.length ? dayList.map(a => `<li class="tap" data-appt="${a.id}">
            <div class="time">${a.time}</div>
            <div class="grow"><div class="title">${esc(displayName(P[a.patientId]))}</div>
              <div class="meta">to ${endTime(a.time, a.duration)}${a.reason ? ' · ' + esc(a.reason) : ''}${a.note ? ' · ' + esc(a.note) : ''}</div></div>
            ${statusChip(a.status)}
            ${a.status === 'booked' && a.date === today ? `<button class="btn sm primary" data-checkin="${a.id}">Check in</button>` : ''}
            ${a.status === 'booked' && a.date <= today ? `<button class="btn sm" data-noshow="${a.id}">No-show</button>` : ''}
            ${a.status === 'noshow' ? `<button class="btn sm" data-rebook="${a.id}">Undo</button>` : ''}
          </li>`).join('') : '<li class="empty">Nothing booked.</li>'}
        </ul>
      </section>
    </div>`;

  root.onclick = async e => {
    const a = e.target.closest('[data-day], [data-act], [data-checkin], [data-noshow], [data-rebook], [data-appt]');
    if (!a) return;
    if (a.dataset.day) go(`#/calendar/${a.dataset.day}`);
    else if (a.dataset.act === 'book') { if (await bookAppt({ date: sel < today ? today : sel })) refresh(); }
    else if (a.dataset.checkin) {
      const ap = dayList.find(x => x.id === a.dataset.checkin);
      const v = await checkIn(ap.patientId, ap.id);
      go(`#/visit/${v.id}`);
    } else if (a.dataset.noshow || a.dataset.rebook) {
      const ap = await db.get('appts', a.dataset.noshow || a.dataset.rebook);
      ap.status = a.dataset.noshow ? 'noshow' : 'booked';
      await db.put('appts', ap);
      toast(a.dataset.noshow ? 'Marked as no-show.' : 'Back to booked.');
      refresh();
    } else if (a.dataset.appt) {
      const ap = dayList.find(x => x.id === a.dataset.appt);
      if ((ap.status === 'in' || ap.status === 'done') && ap.visitId) { go(`#/visit/${ap.visitId}`); return; }
      if (await bookAppt({ appt: ap })) refresh();
    }
  };
}
