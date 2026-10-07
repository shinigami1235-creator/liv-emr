// Clinical photos and face charts. The drawing is kept as vector strokes and
// injection points over the untouched photo, so it can be hidden, edited or
// compared against the raw picture at any time.
import * as db from './db.js';
import { $, $$, esc, openModal, toast, confirmBox, promptBox, dateStr, fmtDate, num, fmtNum, icons } from './ui.js';

export const VIEWS = ['Front', 'Left side', 'Right side', 'Left 45°', 'Right 45°', 'Close-up', 'Other'];
const COLORS = ['#e5383b', '#2f80ed', '#27ae60', '#f2c94c', '#ffffff', '#111111'];
const SIZES = [['S', 3], ['M', 6], ['L', 11]];
const MAX_SIDE = 2000;

const FACE_FRONT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
<rect width="600" height="800" fill="#ffffff"/>
<g fill="none" stroke="#7d8783" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
<path d="M300 70C165 70 112 190 116 330C120 470 170 600 300 652C430 600 480 470 484 330C488 190 435 70 300 70Z"/>
<path d="M118 318C88 306 80 372 94 412C104 442 126 444 134 428"/>
<path d="M482 318C512 306 520 372 506 412C496 442 474 444 466 428"/>
<path d="M140 250C175 150 425 150 460 250" stroke-dasharray="6 8" stroke-width="1.6"/>
<path d="M168 298C200 278 240 278 268 292"/><path d="M332 292C360 278 400 278 432 298"/>
<path d="M180 342C205 323 245 323 268 342C245 356 205 356 180 342Z"/><circle cx="224" cy="341" r="10"/>
<path d="M332 342C355 323 395 323 420 342C395 356 355 356 332 342Z"/><circle cx="376" cy="341" r="10"/>
<path d="M190 372C212 386 246 386 262 374" stroke-width="1.4"/><path d="M338 374C354 386 388 386 410 372" stroke-width="1.4"/>
<path d="M286 344L276 432"/><path d="M314 344L324 432"/>
<path d="M262 440C268 462 288 462 300 466C312 462 332 462 338 440"/>
<path d="M276 452C282 446 290 448 292 454"/><path d="M308 454C310 448 318 446 324 452"/>
<path d="M268 466C248 486 240 506 244 524" stroke-width="1.4"/><path d="M332 466C352 486 360 506 356 524" stroke-width="1.4"/>
<path d="M246 522C270 506 290 510 300 516C310 510 330 506 354 522"/>
<path d="M246 522C280 530 320 530 354 522"/>
<path d="M246 522C270 556 330 556 354 522"/>
<path d="M240 540C232 566 238 590 250 604" stroke-width="1.4"/><path d="M360 540C368 566 362 590 350 604" stroke-width="1.4"/>
<path d="M268 600C285 612 315 612 332 600" stroke-width="1.4"/>
<path d="M222 628L214 780"/><path d="M378 628L386 780"/>
</g></svg>`;

const FACE_SIDE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">
<rect width="600" height="800" fill="#ffffff"/>
<g fill="none" stroke="#7d8783" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
<path d="M372 70C262 70 210 132 200 210C195 258 202 290 208 306C198 318 200 330 212 338C204 378 186 418 168 444C162 456 172 464 188 462C200 464 210 466 218 472C212 488 210 500 206 510C202 520 210 528 216 530C206 544 210 558 216 566C230 576 230 590 222 602C218 626 228 646 258 652C298 656 338 640 366 622"/>
<path d="M372 70C468 76 508 170 500 290C495 380 480 432 452 470C440 520 428 560 418 604L424 780"/>
<path d="M258 652C268 700 274 740 278 780"/>
<path d="M366 622C390 600 404 578 410 556"/>
<path d="M392 326C432 314 454 366 444 408C436 440 412 446 396 430C390 400 388 360 392 326Z"/>
<path d="M406 352C420 352 428 372 424 392" stroke-width="1.6"/>
<path d="M226 300C252 290 278 292 300 302"/>
<path d="M234 338C250 330 266 332 274 342C262 348 246 347 234 338Z"/>
<path d="M226 470C214 496 214 512 220 528" stroke-width="1.4"/>
<path d="M262 380C300 420 340 450 380 470" stroke-width="1.2" stroke-dasharray="5 7"/>
<path d="M150 250C200 140 330 110 420 150" stroke-dasharray="6 8" stroke-width="1.6"/>
</g></svg>`;

const svgURL = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be read'));
    img.src = src;
  });
}

const cache = new Map();
async function baseImage(photo) {
  const key = photo.id + (photo.kind === 'chart' ? photo.view : '');
  if (cache.has(key)) return cache.get(key);
  let img;
  if (photo.kind === 'chart') img = await loadImg(svgURL(photo.view === 'side' ? FACE_SIDE : FACE_FRONT));
  else {
    const url = URL.createObjectURL(photo.blob);
    try { img = await loadImg(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  cache.set(key, img);
  return img;
}

export function totalUnits(photo) {
  return (photo.marks || []).reduce((s, m) => s + (num(m.u) || 0), 0);
}

function drawOverlay(ctx, photo, w, h) {
  const k = w / 1000;
  for (const st of photo.strokes || []) {
    if (!st.p.length) continue;
    ctx.strokeStyle = st.c;
    ctx.lineWidth = Math.max(1, st.s * k);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(st.p[0][0] * w, st.p[0][1] * h);
    if (st.p.length === 1) ctx.lineTo(st.p[0][0] * w + 0.1, st.p[0][1] * h);
    for (let i = 1; i < st.p.length; i++) ctx.lineTo(st.p[i][0] * w, st.p[i][1] * h);
    ctx.stroke();
  }
  const r = Math.max(10, 24 * k);
  for (const mk of photo.marks || []) {
    const x = mk.x * w, y = mk.y * h;
    ctx.fillStyle = mk.c || '#e5383b';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(1.5, 2.5 * k); ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = mk.c === '#ffffff' || mk.c === '#f2c94c' ? '#111' : '#fff';
    ctx.font = `700 ${Math.round(r * 1.05)}px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(fmtNum(num(mk.u)) || '·', x, y + 1);
  }
}

// Draws photo plus drawing into a canvas at the given width.
export async function renderComposite(photo, canvas, width, { overlay = true } = {}) {
  const img = await baseImage(photo);
  const w = Math.round(width), h = Math.round(width * img.height / img.width);
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  if (overlay) drawOverlay(ctx, photo, w, h);
}

export function photoLabel(p) {
  if (p.kind === 'chart') return p.view === 'side' ? 'Side chart' : 'Front chart';
  return p.label || 'Photo';
}

export function thumbsHTML(photos, { selectable = false } = {}) {
  return photos.map(p => `
    <div class="thumb" data-photo="${p.id}">
      <canvas></canvas>
      <div class="tick">✓</div>
      <div class="cap">${esc(photoLabel(p))} · ${fmtDate(p.date)}${totalUnits(p) ? ` · ${fmtNum(totalUnits(p))} U` : ''}</div>
    </div>`).join('');
}

export async function hydrateThumbs(root, photos) {
  for (const el of $$('[data-photo]', root)) {
    const p = photos.find(x => x.id === el.dataset.photo);
    if (p) renderComposite(p, el.querySelector('canvas'), 360).catch(() => {});
  }
}

async function downscale(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const s = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86));
    return { blob, w: c.width, h: c.height };
  } finally { URL.revokeObjectURL(url); }
}

// Must be called straight from a tap, since iPad Safari only opens the camera from a user gesture.
export function capturePhoto({ patientId, visitId = null }) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.append(input);
    input.onchange = async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) { resolve(null); return; }
      try {
        const { blob, w, h } = await downscale(file);
        const photo = { id: db.uid(), patientId, visitId, kind: 'photo', label: 'Front', blob, w, h, date: dateStr(), takenAt: new Date().toISOString(), strokes: [], marks: [] };
        resolve(await openEditor(photo, { isNew: true }));
      } catch (e) {
        toast('That file could not be opened as a photo.');
        resolve(null);
      }
    };
    input.click();
  });
}

export function newChart({ patientId, visitId = null, view = 'front' }) {
  const photo = { id: db.uid(), patientId, visitId, kind: 'chart', view, date: dateStr(), takenAt: new Date().toISOString(), strokes: [], marks: [] };
  return openEditor(photo, { isNew: true });
}

export async function chooseChartView() {
  return new Promise(resolve => {
    let v = null;
    const m = openModal(`
      <div class="sheet-head"><h2>Face chart</h2><button class="btn ghost" data-close>Cancel</button></div>
      <div class="sheet-body"><div class="type-pick" style="grid-template-columns:1fr 1fr">
        <button data-v="front">Front view</button><button data-v="side">Side view</button>
      </div></div>`, { onClose: () => resolve(v) });
    m.el.querySelector('.type-pick').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { v = b.dataset.v; m.close(); } };
  });
}

// Full-screen drawing editor. Resolves with the saved photo, {deleted:true}, or null.
export function openEditor(photo, { isNew = false } = {}) {
  return new Promise(async resolve => {
    const work = { ...photo, strokes: (photo.strokes || []).map(s => ({ ...s, p: [...s.p] })), marks: (photo.marks || []).map(m => ({ ...m })) };
    const img = await baseImage(work);
    let tool = 'pen', color = COLORS[0], size = 6, showInk = true, penSeen = false;
    const ops = [];
    let lastUnits = '';

    const el = document.createElement('div');
    el.className = 'editor';
    el.innerHTML = `
      <div class="bar">
        <button class="btn" data-a="cancel">Cancel</button>
        ${!isNew ? `<button class="btn" data-a="delete">${icons.trash}</button>` : ''}
        <div class="title">${work.kind === 'chart' ? (work.view === 'side' ? 'Side chart' : 'Front chart') : 'Photo'} · ${fmtDate(work.date)}</div>
        ${work.kind === 'photo' ? `<select data-a="view">${VIEWS.map(v => `<option ${v === work.label ? 'selected' : ''}>${v}</option>`).join('')}</select>` : ''}
        <button class="btn primary" data-a="save">Save</button>
      </div>
      <div class="stage"><div class="layers" style="position:relative">
        <canvas class="base"></canvas><canvas class="ink" style="position:absolute;inset:0"></canvas>
      </div></div>
      <div class="tools">
        <button class="btn on" data-tool="pen">Draw</button>
        <button class="btn" data-tool="mark">Units</button>
        <div class="sep"></div>
        ${COLORS.map(c => `<button class="sw ${c === color ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="Colour"></button>`).join('')}
        <div class="sep"></div>
        ${SIZES.map(([l, s]) => `<button class="btn sm ${s === size ? 'on' : ''}" data-size="${s}">${l}</button>`).join('')}
        <div class="sep"></div>
        <button class="btn" data-a="undo">${icons.undo}Undo</button>
        <button class="btn" data-a="clear">Clear</button>
        <button class="btn" data-a="toggle">Hide drawing</button>
        <span class="total"></span>
      </div>`;
    document.body.append(el);
    const stage = el.querySelector('.stage');
    const base = el.querySelector('.base'), ink = el.querySelector('.ink');
    const layers = el.querySelector('.layers');
    let W = 0, H = 0, dpr = 1;

    const layout = () => {
      const sw = stage.clientWidth - 16, sh = stage.clientHeight - 16;
      const s = Math.min(sw / img.width, sh / img.height);
      W = Math.max(50, Math.floor(img.width * s)); H = Math.max(50, Math.floor(img.height * s));
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (const c of [base, ink]) { c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px'; }
      layers.style.width = W + 'px'; layers.style.height = H + 'px';
      base.getContext('2d').drawImage(img, 0, 0, W * dpr, H * dpr);
      paint();
    };
    const paint = () => {
      const ctx = ink.getContext('2d');
      ctx.clearRect(0, 0, ink.width, ink.height);
      if (showInk) drawOverlay(ctx, work, ink.width, ink.height);
      const t = totalUnits(work);
      el.querySelector('.total').textContent = t ? `Total ${fmtNum(t)} U` : '';
    };
    requestAnimationFrame(layout);
    const onResize = () => layout();
    window.addEventListener('resize', onResize);

    const pos = e => {
      const r = ink.getBoundingClientRect();
      return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
    };
    let cur = null;
    ink.addEventListener('pointerdown', e => {
      if (e.pointerType === 'pen') penSeen = true;
      if (penSeen && e.pointerType === 'touch') return; // palm rests while using Apple Pencil
      if (!showInk) { showInk = true; el.querySelector('[data-a=toggle]').textContent = 'Hide drawing'; }
      if (tool === 'pen') {
        ink.setPointerCapture(e.pointerId);
        cur = { c: color, s: size, p: [pos(e)] };
        work.strokes.push(cur);
        ops.push('s');
        paint();
      }
    });
    ink.addEventListener('pointermove', e => {
      if (!cur) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) cur.p.push(pos(ev));
      paint();
    });
    const endStroke = () => {
      if (cur) cur.p = cur.p.map(([x, y]) => [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000]);
      cur = null;
    };
    ink.addEventListener('pointerup', async e => {
      if (tool === 'mark' && !(penSeen && e.pointerType === 'touch')) {
        const [x, y] = pos(e);
        const hitR = 22 / W;
        const hit = work.marks.findIndex(m => Math.hypot(m.x - x, (m.y - y) * H / W) < hitR);
        if (hit >= 0) {
          const v = await promptBox('Units at this point', { value: work.marks[hit].u, type: 'number', label: 'Units', extra: '<button type="button" class="btn danger left" data-extra="remove">Remove point</button>' });
          if (v && v.extra === 'remove') work.marks.splice(hit, 1);
          else if (v !== null) work.marks[hit].u = v;
        } else {
          const v = await promptBox('Units at this point', { value: lastUnits, type: 'number', label: 'Units' });
          if (v !== null && typeof v === 'string') {
            lastUnits = v;
            work.marks.push({ x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000, u: v, c: color });
            ops.push('m');
          }
        }
        paint();
      }
      endStroke();
    });
    ink.addEventListener('pointercancel', endStroke);

    const finish = val => {
      window.removeEventListener('resize', onResize);
      el.remove();
      resolve(val);
    };
    const dirty = () => isNew || JSON.stringify([work.strokes, work.marks, work.label]) !== JSON.stringify([photo.strokes || [], photo.marks || [], photo.label]);

    el.addEventListener('click', async e => {
      const t = e.target.closest('[data-tool]');
      if (t) { tool = t.dataset.tool; $$('[data-tool]', el).forEach(b => b.classList.toggle('on', b === t)); return; }
      const c = e.target.closest('[data-color]');
      if (c) { color = c.dataset.color; $$('[data-color]', el).forEach(b => b.classList.toggle('on', b === c)); return; }
      const s = e.target.closest('[data-size]');
      if (s) { size = Number(s.dataset.size); $$('[data-size]', el).forEach(b => b.classList.toggle('on', b === s)); return; }
      const a = e.target.closest('[data-a]');
      if (!a || a.tagName === 'SELECT') return;
      switch (a.dataset.a) {
        case 'undo': {
          const op = ops.pop();
          if (op === 's') work.strokes.pop();
          else if (op === 'm') work.marks.pop();
          paint(); break;
        }
        case 'clear':
          if (work.strokes.length || work.marks.length) {
            if (await confirmBox('Clear all drawing and unit points on this picture?', { ok: 'Clear' })) {
              work.strokes = []; work.marks = []; ops.length = 0; paint();
            }
          }
          break;
        case 'toggle':
          showInk = !showInk; a.textContent = showInk ? 'Hide drawing' : 'Show drawing'; paint(); break;
        case 'cancel':
          if (!dirty() || await confirmBox(isNew ? 'Discard this picture?' : 'Discard the changes to this drawing?', { ok: 'Discard' })) finish(null);
          break;
        case 'delete':
          if (await confirmBox('Delete this picture and its drawing?')) {
            await db.del('photos', photo.id); cache.delete(photo.id); toast('Picture deleted.'); finish({ deleted: true });
          }
          break;
        case 'save': {
          const sel = el.querySelector('[data-a=view]');
          if (sel) work.label = sel.value;
          const saved = await db.put('photos', work);
          toast('Saved.');
          finish(saved);
          break;
        }
      }
    });
  });
}

export function openCompare(a, b) {
  const m = openModal(`
    <div class="sheet-head"><h2>Compare</h2><button class="btn" data-ink>Hide drawing</button><button class="btn ghost" data-close>Done</button></div>
    <div class="sheet-body">
      <div class="compare">
        <div><canvas data-c="a"></canvas><p class="small muted" style="margin-top:6px">${esc(photoLabel(a))} · ${fmtDate(a.date)}</p></div>
        <div><canvas data-c="b"></canvas><p class="small muted" style="margin-top:6px">${esc(photoLabel(b))} · ${fmtDate(b.date)}</p></div>
      </div>
    </div>`, { wide: true });
  let ink = true;
  const draw = () => {
    renderComposite(a, m.el.querySelector('[data-c=a]'), 900, { overlay: ink });
    renderComposite(b, m.el.querySelector('[data-c=b]'), 900, { overlay: ink });
  };
  draw();
  m.el.querySelector('[data-ink]').onclick = e => { ink = !ink; e.target.textContent = ink ? 'Hide drawing' : 'Show drawing'; draw(); };
}

// Photos grid with tap to edit and select-two-to-compare.
export function bindPhotoGrid(root, photos, onChanged) {
  let selecting = false;
  const sel = new Set();
  const cmpBtn = root.querySelector('[data-compare]');
  const updateBtn = () => {
    if (!cmpBtn) return;
    cmpBtn.textContent = !selecting ? 'Compare' : sel.size === 2 ? 'Show comparison' : `Pick ${2 - sel.size} more`;
    cmpBtn.classList.toggle('primary', selecting);
  };
  if (cmpBtn) cmpBtn.onclick = () => {
    if (selecting && sel.size === 2) {
      const [a, b] = [...sel].map(id => photos.find(p => p.id === id)).sort((x, y) => x.takenAt.localeCompare(y.takenAt));
      openCompare(a, b);
      return;
    }
    selecting = !selecting;
    if (!selecting) { sel.clear(); $$('.thumb.sel', root).forEach(t => t.classList.remove('sel')); }
    updateBtn();
  };
  root.addEventListener('click', async e => {
    const th = e.target.closest('[data-photo]');
    if (!th) return;
    const id = th.dataset.photo;
    if (selecting) {
      if (sel.has(id)) sel.delete(id);
      else if (sel.size < 2) sel.add(id);
      th.classList.toggle('sel', sel.has(id));
      updateBtn();
      return;
    }
    const p = photos.find(x => x.id === id);
    const res = await openEditor(p);
    if (res) { cache.delete(p.id); onChanged && onChanged(); }
  });
  updateBtn();
}
