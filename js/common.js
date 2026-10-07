import * as db from './db.js';
import { $, esc, openModal, toast, dateStr, fmtDate, age, icons, segHTML, bindSeg, segValue, confirmBox } from './ui.js';

export const REASONS = ['Consultation', 'Follow-up', 'Toxin', 'Filler', 'Laser', 'Skin booster', 'Facial treatment', 'Procedure', 'Review results'];

export function displayName(p) {
  if (!p) return 'Unknown patient';
  return p.nickname ? `${p.fullName} (${p.nickname})` : p.fullName;
}

export function patientMeta(p) {
  const bits = [];
  const a = age(p.dob);
  if (a != null) bits.push(`${a} y`);
  if (p.sex) bits.push(p.sex);
  if (p.phone) bits.push(p.phone);
  if (p.memberNo) bits.push(`No. ${p.memberNo}`);
  return bits.join(' · ');
}

export function alertBanners(p) {
  let h = '';
  if (p.allergies && p.allergies.trim()) {
    h += `<div class="banner allergy">${icons.alert}<div>Allergies: ${esc(p.allergies)}</div></div>`;
  }
  if (p.disease && p.disease.trim()) {
    h += `<div class="banner disease">${icons.alert}<div>Underlying disease: ${esc(p.disease)}</div></div>`;
  }
  return h;
}

export async function nextMemberNo() {
  const s = await db.getSettings();
  const no = String(s.nextMember || 1).padStart(5, '0');
  s.nextMember = (s.nextMember || 1) + 1;
  await db.saveSettings(s);
  return no;
}

function matches(p, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return [p.fullName, p.nickname, p.phone, p.memberNo, p.line].some(v => v && String(v).toLowerCase().includes(q));
}

export function searchPatients(list, q) {
  return list.filter(p => matches(p, q.trim())).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

// Modal: search existing patients or register a new one with the minimum details.
export function pickPatient(title = 'Choose patient') {
  return new Promise(async resolve => {
    let picked = null;
    const patients = await db.all('patients');
    const m = openModal(`
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="btn ghost" data-close>Cancel</button></div>
      <div class="sheet-body">
        <div class="pick-search">
          <div class="search">${icons.search}<input type="search" placeholder="Name, nickname, phone or member no." autofocus></div>
          <ul class="list" style="margin-top:8px"></ul>
          <button class="btn" data-new style="margin-top:10px">${icons.plus}New patient</button>
        </div>
        <form class="pick-new form hidden">
          <div class="field"><label>Full name</label><input name="fullName" required></div>
          <div class="form-grid">
            <div class="field"><label>Nickname</label><input name="nickname"></div>
            <div class="field"><label>Phone</label><input name="phone" type="tel" inputmode="tel"></div>
          </div>
          <p class="muted small">Fill in the rest of the OPD card from the patient's record later.</p>
          <div class="actions"><button type="button" class="btn" data-backsearch>Back</button><button class="btn primary">Add patient</button></div>
        </form>
      </div>`, { onClose: () => resolve(picked) });
    const ul = m.el.querySelector('ul');
    const input = m.el.querySelector('input[type=search]');
    const paint = () => {
      const found = searchPatients(patients, input.value).slice(0, 40);
      ul.innerHTML = found.length ? found.map(p => `
        <li class="tap" data-id="${p.id}">
          <div class="avatar" style="width:40px;height:40px;font-size:15px">${esc(initialsOf(p))}</div>
          <div class="grow"><div class="title">${esc(displayName(p))}</div><div class="meta">${esc(patientMeta(p))}</div></div>
        </li>`).join('') : `<li class="empty">${patients.length ? 'No patient matches that search.' : 'No patients yet.'}</li>`;
    };
    paint();
    input.oninput = paint;
    ul.onclick = e => {
      const li = e.target.closest('[data-id]'); if (!li) return;
      picked = patients.find(p => p.id === li.dataset.id);
      m.close();
    };
    const form = m.el.querySelector('.pick-new');
    m.el.querySelector('[data-new]').onclick = () => {
      m.el.querySelector('.pick-search').classList.add('hidden');
      form.classList.remove('hidden');
      if (input.value && !/^\d/.test(input.value)) form.fullName.value = input.value;
      form.fullName.focus();
    };
    m.el.querySelector('[data-backsearch]').onclick = () => {
      form.classList.add('hidden');
      m.el.querySelector('.pick-search').classList.remove('hidden');
    };
    form.onsubmit = async e => {
      e.preventDefault();
      picked = await db.put('patients', {
        fullName: form.fullName.value.trim(), nickname: form.nickname.value.trim(), phone: form.phone.value.trim(),
        memberNo: await nextMemberNo(), memberSince: dateStr(),
      });
      m.close();
    };
  });
}

function initialsOf(p) {
  return (p.nickname || p.fullName || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
export { initialsOf };

// Opens a visit for the patient, or returns today's open one.
export async function checkIn(patientId, apptId = null) {
  const today = dateStr();
  const visits = await db.byIndex('visits', 'patientId', patientId);
  let v = visits.find(x => x.date === today && x.status === 'in');
  const appts = await db.byIndex('appts', 'patientId', patientId);
  const appt = apptId ? appts.find(a => a.id === apptId) : appts.find(a => a.date === today && a.status === 'booked');
  if (!v) {
    v = await db.put('visits', {
      patientId, date: today, checkInAt: new Date().toISOString(), status: 'in',
      apptId: appt ? appt.id : null, reason: appt ? appt.reason : '',
      complaint: '', hpi: '', exam: '', diagnosis: '', plan: '',
    });
  }
  if (appt && appt.status === 'booked') {
    appt.status = 'in';
    appt.visitId = v.id;
    await db.put('appts', appt);
  }
  return v;
}

export async function finishVisit(v) {
  v.status = 'done';
  v.finishedAt = new Date().toISOString();
  await db.put('visits', v);
  if (v.apptId) {
    const a = await db.get('appts', v.apptId);
    if (a) { a.status = 'done'; await db.put('appts', a); }
  }
}

function nextSlot() {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Booking sheet. Pass appt to edit an existing one.
export function bookAppt({ patientId = null, date = null, appt = null, reason = '' } = {}) {
  return new Promise(async resolve => {
    let saved = null;
    let pid = appt ? appt.patientId : patientId;
    let patient = pid ? await db.get('patients', pid) : null;
    const a = appt || { date: date || dateStr(), time: nextSlot(), duration: '30', reason, note: '' };
    const m = openModal(`
      <form class="form">
        <div class="sheet-head"><h2>${appt ? 'Edit booking' : 'Book appointment'}</h2></div>
        <div class="sheet-body form">
          <div class="field"><label>Patient</label>
            <button type="button" class="btn" data-patient style="justify-content:flex-start">${patient ? esc(displayName(patient)) : 'Choose patient'}</button>
          </div>
          <div class="form-grid">
            <div class="field"><label>Date</label><input type="date" name="date" value="${a.date}" required></div>
            <div class="field"><label>Time</label><input type="time" name="time" value="${a.time}" step="300" required></div>
          </div>
          <div class="field"><label>Length</label>${segHTML('duration', [['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '1 hr'], ['90', '1.5 hr'], ['120', '2 hr']], String(a.duration))}</div>
          <div class="field"><label>Reason</label>
            <input name="reason" list="reason-list" value="${esc(a.reason)}" placeholder="Toxin follow-up">
            <datalist id="reason-list">${REASONS.map(r => `<option value="${r}">`).join('')}</datalist>
          </div>
          <div class="field"><label>Note</label><input name="note" value="${esc(a.note || '')}" placeholder="Wants to discuss under-eye filler"></div>
          <div class="field"><label>Already booked that day</label><div class="dayload muted small"></div></div>
        </div>
        <div class="sheet-foot">
          ${appt ? '<button type="button" class="btn danger left" data-del>Cancel booking</button>' : ''}
          <button type="button" class="btn" data-close>Close</button>
          <button class="btn primary">Save</button>
        </div>
      </form>`, { onClose: () => resolve(saved) });
    const f = m.el.querySelector('form');
    bindSeg(m.el);
    const showLoad = async () => {
      const day = (await db.all('appts')).filter(x => x.date === f.date.value && x.id !== (appt && appt.id) && x.status !== 'noshow')
        .sort((x, y) => x.time.localeCompare(y.time));
      const pats = {};
      for (const x of day) pats[x.patientId] = pats[x.patientId] || await db.get('patients', x.patientId);
      m.el.querySelector('.dayload').innerHTML = day.length
        ? day.map(x => `${x.time} to ${endTime(x.time, x.duration)} ${esc(pats[x.patientId] ? displayName(pats[x.patientId]) : '')}`).join('<br>')
        : 'Nothing booked.';
    };
    showLoad();
    f.date.onchange = showLoad;
    m.el.querySelector('[data-patient]').onclick = async e => {
      const p = await pickPatient();
      if (p) { patient = p; pid = p.id; e.target.closest('button').textContent = displayName(p); }
    };
    const delBtn = m.el.querySelector('[data-del]');
    if (delBtn) delBtn.onclick = async () => {
      if (await confirmBox('Cancel this booking?', { ok: 'Cancel booking' })) {
        await db.del('appts', appt.id); saved = { deleted: true }; m.close(); toast('Booking cancelled.');
      }
    };
    f.onsubmit = async e => {
      e.preventDefault();
      if (!pid) { toast('Choose a patient first.'); return; }
      Object.assign(a, {
        patientId: pid, date: f.date.value, time: f.time.value, duration: Number(segValue(m.el, 'duration') || 30),
        reason: f.reason.value.trim(), note: f.note.value.trim(), status: a.status || 'booked',
      });
      saved = await db.put('appts', a);
      m.close();
      toast(`Booked for ${fmtDate(a.date)} at ${a.time}.`);
    };
  });
}

export function endTime(t, mins) {
  const [h, m] = t.split(':').map(Number);
  const total = h * 60 + m + Number(mins || 30);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function statusChip(s) {
  return {
    booked: '<span class="chip info">Booked</span>',
    in: '<span class="chip accent">Checked in</span>',
    done: '<span class="chip ok">Done</span>',
    noshow: '<span class="chip warn">No-show</span>',
  }[s] || '';
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into LINE.'); }
  catch { toast('Copy failed on this browser.'); }
}
