import * as db from '../db.js';
import { $, esc, toast, fmtDate, fmtTime, debounce, baht, icons, confirmBox } from '../ui.js';
import { displayName, patientMeta, alertBanners, finishVisit, bookAppt, statusChip } from '../common.js';
import { treatmentLi, openTreatment } from '../treatments.js';
import { thumbsHTML, hydrateThumbs, bindPhotoGrid, capturePhoto, newChart, chooseChartView } from '../photos.js';
import { go, refresh } from '../router.js';

const NOTES = [
  ['complaint', 'Chief complaint', 'Wants to soften forehead lines before a wedding in 3 weeks'],
  ['hpi', 'History of present illness', 'Lines noticed 2 years ago. Last toxin 6 months ago at another clinic.'],
  ['exam', 'Examination', 'Dynamic forehead and glabellar lines, no static lines at rest. Fitzpatrick III.'],
  ['diagnosis', 'Diagnosis', 'Dynamic rhytids, upper face'],
  ['plan', 'Plan', 'Toxin upper face today. Review at 2 weeks.'],
];

export default async function visitPage(root, id) {
  const v = await db.get('visits', id);
  if (!v) { root.innerHTML = '<a class="back" href="#/patients">Patients</a><div class="card">This visit no longer exists.</div>'; return; }
  const p = await db.get('patients', v.patientId);
  const [treatments, photos] = await Promise.all([db.byIndex('treatments', 'visitId', id), db.byIndex('photos', 'patientId', v.patientId)]);
  const vPhotos = photos.filter(x => x.visitId === id).sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  treatments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const isOpen = v.status === 'in';

  const hist = [['Underlying disease', p.disease], ['Allergies', p.allergies], ['Current medications', p.meds], ['Past surgery and treatments', p.pastHx]];

  root.innerHTML = `
    <a class="back" href="#/patient/${p.id}">${icons.back}${esc(displayName(p))}</a>
    <header class="top">
      <div><h1>Visit · ${fmtDate(v.date)}</h1>
        <p class="sub">${esc(patientMeta(p))} · checked in ${fmtTime(v.checkInAt)}${v.finishedAt ? ', finished ' + fmtTime(v.finishedAt) : ''} ${isOpen ? statusChip('in') : statusChip('done')}</p></div>
      <div class="actions">
        <button class="btn" data-act="book">${icons.calendar}Book next</button>
        ${isOpen ? `<button class="btn primary" data-act="finish">${icons.check}Finish visit</button>` : '<button class="btn" data-act="reopen">Reopen</button>'}
      </div>
    </header>
    ${alertBanners(p)}
    <div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:16px" class="visit-grid">
      <section class="card" style="margin:0"><h2>Notes <span class="saved-flag"></span></h2>
        <div class="note-grid">
          ${NOTES.map(([k, l, ph]) => `<div class="field"><label>${l}</label><textarea data-note="${k}" placeholder="${esc(ph)}">${esc(v[k] || '')}</textarea></div>`).join('')}
        </div>
      </section>
      <section class="card" style="margin:0;align-self:start"><h2>Medical history <a class="btn sm" href="#/patient/${p.id}/edit">Edit</a></h2>
        <dl class="kv" style="grid-template-columns:1fr">
          ${hist.map(([l, val]) => `<dt>${l}</dt><dd style="margin-bottom:8px">${val ? esc(val) : '<span class="muted">None recorded</span>'}</dd>`).join('')}
        </dl>
      </section>
    </div>

    <section class="card" style="margin-top:16px"><h2>Treatments ${treatments.some(t => t.price != null) ? `<span class="num muted small" style="margin-left:auto">Total ${baht(treatments.reduce((s, t) => s + (t.price || 0), 0))}</span>` : ''}<button class="btn sm" data-act="addtreat">${icons.plus}Add treatment</button></h2>
      <ul class="list">${treatments.length ? treatments.map(t => treatmentLi(t)).join('') : '<li class="empty">No treatment recorded on this visit.</li>'}</ul>
    </section>

    <section class="card" data-photos><h2>Photos and charts
      <span class="actions">${vPhotos.length > 1 ? '<button class="btn sm" data-compare>Compare</button>' : ''}
      <button class="btn sm" data-act="chart">${icons.face}Face chart</button>
      <button class="btn sm" data-act="photo">${icons.camera}Take photo</button></span></h2>
      ${vPhotos.length ? `<div class="thumbs">${thumbsHTML(vPhotos)}</div>` : `<p class="empty">${p.photoConsent ? 'No pictures on this visit.' : 'Photo consent is not ticked on the OPD card. Use the face chart instead or update the card.'}</p>`}
    </section>

    <div class="actions"><button class="btn danger" data-act="delete">${icons.trash}Delete visit</button></div>`;

  if (window.matchMedia('(max-width: 900px)').matches) $('.visit-grid', root).style.gridTemplateColumns = '1fr';

  const flag = $('.saved-flag', root);
  const save = debounce(async () => {
    const cur = await db.get('visits', id);
    root.querySelectorAll('[data-note]').forEach(t => { cur[t.dataset.note] = t.value; });
    await db.put('visits', cur);
    flag.textContent = 'Saved';
  }, 600);
  root.querySelectorAll('[data-note]').forEach(t => t.addEventListener('input', () => { flag.textContent = 'Saving'; save(); }));

  const photoBox = $('[data-photos]', root);
  hydrateThumbs(photoBox, vPhotos);
  bindPhotoGrid(photoBox, vPhotos, refresh);

  root.onclick = async e => {
    const a = e.target.closest('[data-act], [data-treatment]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'photo') { if (await capturePhoto({ patientId: p.id, visitId: id })) refresh(); }
    else if (act === 'chart') { const view = await chooseChartView(); if (view && await newChart({ patientId: p.id, visitId: id, view })) refresh(); }
    else if (act === 'addtreat') { if (await openTreatment({ patientId: p.id, visitId: id })) refresh(); }
    else if (act === 'book') { await bookAppt({ patientId: p.id }); }
    else if (act === 'finish') {
      const cur = await db.get('visits', id);
      root.querySelectorAll('[data-note]').forEach(t => { cur[t.dataset.note] = t.value; });
      await finishVisit(cur);
      toast('Visit finished.');
      go(`#/patient/${p.id}`);
    } else if (act === 'reopen') {
      const cur = await db.get('visits', id); cur.status = 'in'; cur.finishedAt = null; await db.put('visits', cur); refresh();
    } else if (act === 'delete') {
      if (treatments.length || vPhotos.length) { toast('Delete the treatments and pictures on this visit first.'); return; }
      if (await confirmBox('Delete this visit and its notes?')) {
        await db.del('visits', id);
        if (v.apptId) { const ap = await db.get('appts', v.apptId); if (ap) { ap.status = 'booked'; ap.visitId = null; await db.put('appts', ap); } }
        toast('Visit deleted.');
        go(`#/patient/${p.id}`);
      }
    } else if (a.dataset.treatment) { if (await openTreatment({ patientId: p.id, id: a.dataset.treatment })) refresh(); }
  };
}
