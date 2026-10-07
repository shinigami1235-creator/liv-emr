import * as db from '../db.js';
import { $, $$, esc, toast, dateStr, fmtDate, fmtTime, age, num, icons, segHTML, bindSeg, segValue, confirmBox } from '../ui.js';
import { displayName, patientMeta, alertBanners, nextMemberNo, searchPatients, checkIn, bookAppt, statusChip, initialsOf } from '../common.js';
import { treatmentLi, openTreatment } from '../treatments.js';
import { thumbsHTML, hydrateThumbs, bindPhotoGrid, capturePhoto, newChart, chooseChartView } from '../photos.js';
import { go, refresh } from '../router.js';

let lastQuery = '';

export async function patientList(root) {
  const [patients, visits] = await Promise.all([db.all('patients'), db.all('visits')]);
  const lastVisit = {};
  for (const v of visits) if (!lastVisit[v.patientId] || v.date > lastVisit[v.patientId]) lastVisit[v.patientId] = v.date;
  root.innerHTML = `
    <header class="top">
      <div><h1>Patients</h1><p class="sub">${patients.length} on record</p></div>
      <div class="actions"><a class="btn primary" href="#/patient/new">${icons.plus}New patient</a></div>
    </header>
    <div class="filters"><div class="search">${icons.search}<input type="search" placeholder="Name, nickname, phone, LINE or member no." value="${esc(lastQuery)}"></div></div>
    <section class="card flush"><ul class="list"></ul></section>`;
  const ul = $('ul', root);
  const input = $('input', root);
  const paint = () => {
    lastQuery = input.value;
    const found = searchPatients(patients, input.value);
    ul.innerHTML = found.length ? found.map(p => `
      <li class="tap" data-id="${p.id}">
        <div class="avatar" style="width:44px;height:44px;font-size:16px">${esc(initialsOf(p))}</div>
        <div class="grow"><div class="title">${esc(displayName(p))}${p.allergies ? ' <span class="chip danger">Allergy</span>' : ''}</div>
          <div class="meta">${esc(patientMeta(p))}</div></div>
        <span class="muted small">${lastVisit[p.id] ? 'Last visit ' + fmtDate(lastVisit[p.id]) : 'No visits'}</span>
        <button class="btn sm" data-checkin="${p.id}">Check in</button>
      </li>`).join('') : `<li class="empty" style="padding:16px 20px">${patients.length ? 'No patient matches that search.' : 'No patients yet. Add the first one with New patient.'}</li>`;
  };
  paint();
  input.oninput = paint;
  ul.onclick = async e => {
    const c = e.target.closest('[data-checkin]');
    if (c) { const v = await checkIn(c.dataset.checkin); go(`#/visit/${v.id}`); return; }
    const li = e.target.closest('[data-id]');
    if (li) go(`#/patient/${li.dataset.id}`);
  };
}

const CERT = 'I certify that the above information is true and accurate in all respects. If there are any changes to the above-listed information, I will report them to the clinic immediately.';

export async function patientForm(root, id) {
  const p = id ? await db.get('patients', id) : { memberSince: dateStr(), sex: '' };
  if (id && !p) { root.innerHTML = '<div class="card">This patient no longer exists.</div>'; return; }
  const settings = await db.getSettings();
  const f = (name, label, opts = {}) => `<div class="field ${opts.cls || ''}"><label>${label}</label>
    ${opts.area ? `<textarea name="${name}" placeholder="${esc(opts.ph || '')}">${esc(p[name] || '')}</textarea>`
      : `<input name="${name}" type="${opts.type || 'text'}" ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ''} ${opts.step ? `step="${opts.step}"` : ''} value="${esc(p[name] ?? '')}" placeholder="${esc(opts.ph || '')}" ${opts.req ? 'required' : ''}>`}
    ${opts.hint ? `<span class="hint" data-hint="${name}">${opts.hint}</span>` : ''}</div>`;
  root.innerHTML = `
    <a class="back" href="${id ? `#/patient/${id}/details` : '#/patients'}">${icons.back}${id ? esc(displayName(p)) : 'Patients'}</a>
    <header class="top"><div><h1>${id ? 'Edit patient' : 'New patient'}</h1><p class="sub">OPD card · ${esc(settings.clinicName)}</p></div></header>
    <form class="form" novalidate>
      <section class="card"><div class="form-grid">
        <div class="section-label">Patient</div>
        ${f('fullName', 'Full name', { cls: 's8', req: true, ph: 'Siriporn Chaiyaporn' })}
        ${f('nickname', 'Nickname', { cls: 's4', ph: 'Ploy' })}
        ${f('idNo', 'ID or passport no.', { cls: 's8' })}
        <div class="field s4"><label>Sex</label>${segHTML('sex', [['Female', 'Female'], ['Male', 'Male']], p.sex)}</div>
        ${f('dob', 'Date of birth', { cls: 's4', type: 'date', hint: p.dob ? `Age ${age(p.dob)}` : ' ' })}
        ${f('weight', 'Weight (kg)', { cls: 's4', type: 'number', inputmode: 'decimal', step: 'any' })}
        ${f('height', 'Height (cm)', { cls: 's4', type: 'number', inputmode: 'decimal', step: 'any', hint: ' ' })}

        <div class="section-label">Contact</div>
        ${f('address', 'Address', { cls: 's12', ph: '45/12 Soi Naklua 16, Bang Lamung, Chonburi 20150' })}
        ${f('phone', 'Phone', { cls: 's4', type: 'tel', inputmode: 'tel', ph: '099-326-1926' })}
        ${f('line', 'LINE ID', { cls: 's4' })}
        ${f('email', 'Email', { cls: 's4', type: 'email', inputmode: 'email' })}
        ${f('emergencyName', 'Emergency contact', { cls: 's8', ph: 'Name and relationship' })}
        ${f('emergencyPhone', 'Emergency contact phone', { cls: 's4', type: 'tel', inputmode: 'tel' })}

        <div class="section-label">Medical history</div>
        ${f('disease', 'Underlying disease', { cls: 's12', ph: 'Hypertension, diabetes, thyroid, keloid tendency' })}
        ${f('allergies', 'Drug or food allergies', { cls: 's12', ph: 'Penicillin, lidocaine, shellfish' })}
        ${f('meds', 'Current medications and supplements', { cls: 's12', area: true, ph: 'Aspirin 81 mg daily, fish oil' })}
        ${f('pastHx', 'Past surgery and aesthetic treatments', { cls: 's12', area: true, ph: 'Rhinoplasty 2021. Botox forehead every 4 months.' })}

        <div class="section-label">Membership</div>
        ${f('memberNo', 'Member no.', { cls: 's4', hint: id ? '' : 'Filled in on save' })}
        ${f('memberSince', 'Member since', { cls: 's4', type: 'date' })}
        <div class="field s4"><label>Clinical photos</label>
          <label class="check"><input type="checkbox" name="photoConsent" ${p.photoConsent ? 'checked' : ''}>Agrees to photos</label></div>
      </div></section>

      <section class="card">
        <h2>Patient signature</h2>
        <p class="cert" style="margin-bottom:12px">${CERT}</p>
        ${p.signature ? `<div data-sigview><img class="sigimg" src="${p.signature}" alt="Signature"><p class="muted small" style="margin:6px 0 10px">Signed ${fmtDate(p.signedAt)}</p>
          <button type="button" class="btn sm" data-resign>Sign again</button></div>` : ''}
        <div class="sigpad ${p.signature ? 'hidden' : ''}"><canvas></canvas><div class="line"></div><button type="button" class="btn sm clear" data-sigclear>Clear</button></div>
      </section>

      <div class="actions" style="justify-content:flex-end">
        <a class="btn" href="${id ? `#/patient/${id}/details` : '#/patients'}">Cancel</a>
        <button class="btn primary">Save patient</button>
      </div>
    </form>`;
  bindSeg(root);
  const form = $('form', root);

  const ageHint = () => { const h = $('[data-hint=dob]', root); if (h) h.textContent = form.dob.value ? `Age ${age(form.dob.value)}` : ' '; };
  const bmiHint = () => {
    const w = num(form.weight.value), h = num(form.height.value);
    const el = $('[data-hint=height]', root);
    if (el) el.textContent = w && h ? `BMI ${(w / ((h / 100) ** 2)).toFixed(1)}` : ' ';
  };
  form.dob.oninput = ageHint; form.weight.oninput = bmiHint; form.height.oninput = bmiHint; bmiHint();

  // Signature pad
  const pad = $('.sigpad', root), canvas = $('canvas', pad);
  let signed = false;
  const setupPad = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1c2422';
  };
  if (!pad.classList.contains('hidden')) requestAnimationFrame(setupPad);
  let drawing = false;
  const pt = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    drawing = true; signed = true; canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext('2d'); const [x, y] = pt(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + .1, y); ctx.stroke();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const ctx = canvas.getContext('2d');
    for (const ev of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) { const [x, y] = pt(ev); ctx.lineTo(x, y); }
    ctx.stroke();
  });
  ['pointerup', 'pointercancel'].forEach(ev => canvas.addEventListener(ev, () => { drawing = false; }));
  $('[data-sigclear]', root).onclick = () => { setupPad(); signed = false; };
  const resign = $('[data-resign]', root);
  if (resign) resign.onclick = () => { $('[data-sigview]', root).classList.add('hidden'); pad.classList.remove('hidden'); setupPad(); };

  form.onsubmit = async e => {
    e.preventDefault();
    if (!form.fullName.value.trim()) { toast('Enter the full name.'); form.fullName.focus(); return; }
    const fields = ['fullName', 'nickname', 'idNo', 'dob', 'weight', 'height', 'address', 'phone', 'line', 'email', 'emergencyName', 'emergencyPhone', 'disease', 'allergies', 'meds', 'pastHx', 'memberNo', 'memberSince'];
    for (const k of fields) p[k] = form[k].value.trim();
    p.sex = segValue(root, 'sex');
    p.photoConsent = form.photoConsent.checked;
    if (!p.memberNo) p.memberNo = await nextMemberNo();
    if (signed) { p.signature = canvas.toDataURL('image/png'); p.signedAt = dateStr(); }
    const saved = await db.put('patients', p);
    toast('Patient saved.');
    go(`#/patient/${saved.id}`);
  };
}

export async function patientDetail(root, id, tab) {
  const p = await db.get('patients', id);
  if (!p) { root.innerHTML = '<a class="back" href="#/patients">Patients</a><div class="card">This patient no longer exists.</div>'; return; }
  const [visits, treatments, photos, appts] = await Promise.all([
    db.byIndex('visits', 'patientId', id), db.byIndex('treatments', 'patientId', id),
    db.byIndex('photos', 'patientId', id), db.byIndex('appts', 'patientId', id),
  ]);
  visits.sort((a, b) => b.checkInAt.localeCompare(a.checkInAt));
  treatments.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  photos.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const openVisit = visits.find(v => v.status === 'in');
  const upcoming = appts.filter(a => a.date >= dateStr() && a.status === 'booked').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const tabs = [['visits', `Visits ${visits.length || ''}`], ['treatments', `Treatments ${treatments.length || ''}`], ['photos', `Photos ${photos.length || ''}`], ['details', 'OPD card']];

  root.innerHTML = `
    <a class="back" href="#/patients">${icons.back}Patients</a>
    <div class="phead">
      <div class="avatar">${esc(initialsOf(p))}</div>
      <div class="grow"><h1>${esc(displayName(p))}</h1><div class="meta">${esc(patientMeta(p))}${p.line ? ' · LINE ' + esc(p.line) : ''}</div></div>
      <div class="actions">
        <button class="btn" data-act="book">${icons.calendar}Book</button>
        ${openVisit ? `<a class="btn primary" href="#/visit/${openVisit.id}">Open visit</a>` : `<button class="btn primary" data-act="checkin">${icons.check}Check in</button>`}
      </div>
    </div>
    ${alertBanners(p)}
    ${upcoming.length ? `<p class="muted" style="margin:-4px 0 10px">Next booking ${fmtDate(upcoming[0].date)} at ${upcoming[0].time}${upcoming[0].reason ? ', ' + esc(upcoming[0].reason) : ''}</p>` : ''}
    <nav class="tabs">${tabs.map(([k, l]) => `<a href="#/patient/${id}/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div data-tab></div>`;
  const body = $('[data-tab]', root);

  if (tab === 'visits') {
    const tByVisit = {};
    for (const t of treatments) if (t.visitId) (tByVisit[t.visitId] = tByVisit[t.visitId] || []).push(t);
    body.innerHTML = `<section class="card flush"><ul class="list">
      ${visits.length ? visits.map(v => `<li class="tap" data-visit="${v.id}">
        <div class="grow"><div class="title">${fmtDate(v.date)} <span class="muted small">${fmtTime(v.checkInAt)}</span></div>
          <div class="meta">${esc([v.complaint, v.diagnosis].filter(Boolean).join(' · ') || v.reason || 'No notes')}</div></div>
        ${(tByVisit[v.id] || []).length ? `<span class="chip">${tByVisit[v.id].length} treatment${tByVisit[v.id].length > 1 ? 's' : ''}</span>` : ''}
        ${v.status === 'in' ? statusChip('in') : ''}
      </li>`).join('') : '<li class="empty" style="padding:16px 20px">No visits yet. Check the patient in to start one.</li>'}
    </ul></section>`;
  } else if (tab === 'treatments') {
    body.innerHTML = `
      <div class="actions" style="margin-bottom:12px"><button class="btn" data-act="addtreat">${icons.plus}Add treatment</button></div>
      <section class="card flush"><ul class="list">
      ${treatments.length ? treatments.map(t => treatmentLi(t)).join('') : '<li class="empty" style="padding:16px 20px">No treatments recorded.</li>'}
    </ul></section>`;
  } else if (tab === 'photos') {
    body.innerHTML = `
      ${p.photoConsent === false && !photos.length ? '<div class="banner warn">' + icons.alert + '<div>Photo consent is not ticked on the OPD card. Use the face chart instead or update the card.</div></div>' : ''}
      <div class="actions" style="margin-bottom:12px">
        <button class="btn" data-act="photo">${icons.camera}Take photo</button>
        <button class="btn" data-act="chart">${icons.face}Face chart</button>
        ${photos.length > 1 ? '<button class="btn" data-compare>Compare</button>' : ''}
      </div>
      <div class="thumbs">${thumbsHTML(photos)}</div>
      ${photos.length ? '' : '<p class="empty">No photos or charts yet.</p>'}`;
    hydrateThumbs(body, photos);
    bindPhotoGrid(body, photos, refresh);
  } else {
    const row = (l, v) => v ? `<dt>${l}</dt><dd>${esc(v)}</dd>` : '';
    const bmi = num(p.weight) && num(p.height) ? (num(p.weight) / ((num(p.height) / 100) ** 2)).toFixed(1) : '';
    body.innerHTML = `
      <section class="card"><h2>OPD card <a class="btn sm" href="#/patient/${id}/edit">Edit</a></h2><dl class="kv">
        ${row('Full name', p.fullName)}${row('Nickname', p.nickname)}${row('ID or passport no.', p.idNo)}
        ${row('Date of birth', p.dob ? `${fmtDate(p.dob)} (age ${age(p.dob)})` : '')}${row('Sex', p.sex)}
        ${row('Weight', p.weight ? p.weight + ' kg' : '')}${row('Height', p.height ? p.height + ' cm' : '')}${row('BMI', bmi)}
        ${row('Address', p.address)}${row('Phone', p.phone)}${row('LINE ID', p.line)}${row('Email', p.email)}
        ${row('Emergency contact', [p.emergencyName, p.emergencyPhone].filter(Boolean).join(', '))}
        ${row('Underlying disease', p.disease)}${row('Drug or food allergies', p.allergies)}
        ${row('Current medications', p.meds)}${row('Past surgery and treatments', p.pastHx)}
        ${row('Member no.', p.memberNo)}${row('Member since', p.memberSince ? fmtDate(p.memberSince) : '')}
        <dt>Clinical photos</dt><dd>${p.photoConsent ? 'Agrees' : 'Not agreed'}</dd>
      </dl></section>
      <section class="card"><h2>Signature</h2>
        ${p.signature ? `<img class="sigimg" src="${p.signature}" alt="Signature"><p class="muted small" style="margin-top:6px">Signed ${fmtDate(p.signedAt)}</p>` : '<p class="muted">Not signed. Hand the iPad over from Edit to collect it.</p>'}
      </section>
      <div class="actions"><button class="btn danger" data-act="delete">${icons.trash}Delete patient</button></div>`;
  }

  root.onclick = async e => {
    const a = e.target.closest('[data-act], [data-visit], [data-treatment]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'checkin') { const v = await checkIn(id); go(`#/visit/${v.id}`); }
    else if (act === 'book') { if (await bookAppt({ patientId: id })) refresh(); }
    else if (act === 'addtreat') { if (await openTreatment({ patientId: id, visitId: openVisit ? openVisit.id : null })) refresh(); }
    else if (act === 'photo') { if (await capturePhoto({ patientId: id, visitId: openVisit ? openVisit.id : null })) refresh(); }
    else if (act === 'chart') { const v = await chooseChartView(); if (v && await newChart({ patientId: id, visitId: openVisit ? openVisit.id : null, view: v })) refresh(); }
    else if (act === 'delete') {
      if (!(await confirmBox(`Delete ${p.fullName} with every visit, treatment, photo and booking? This cannot be undone.`, { ok: 'Delete patient' }))) return;
      for (const s of ['visits', 'treatments', 'photos', 'appts']) for (const r of await db.byIndex(s, 'patientId', id)) await db.del(s, r.id);
      await db.del('patients', id);
      toast('Patient deleted.');
      go('#/patients');
    }
    else if (a.dataset.visit) go(`#/visit/${a.dataset.visit}`);
    else if (a.dataset.treatment) { if (await openTreatment({ patientId: id, id: a.dataset.treatment })) refresh(); }
  };
}
