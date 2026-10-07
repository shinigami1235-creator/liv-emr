export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2400);
}

export function debounce(fn, ms = 500) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// Dates are stored as local YYYY-MM-DD strings so the timezone never shifts a booking.
const pad = n => String(n).padStart(2, '0');
export function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d);
}
export function addMonths(s, n) {
  const d = parseDate(s); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return dateStr(d);
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function fmtDate(s) {
  if (!s) return '';
  const d = parseDate(s.slice(0, 10));
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtDateShort(s) {
  if (!s) return '';
  const d = parseDate(s.slice(0, 10));
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}
export function fmtDateLong(s) {
  const d = parseDate(s);
  return `${DAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}
export function monthTitle(y, m) { return `${MONTH[m]} ${y}`; }
export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
export function age(dob) {
  if (!dob) return null;
  const b = parseDate(dob), t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}
export function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}
export function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function fmtNum(n) {
  if (n == null) return '';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// Modal sheets
export function openModal(inner, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'backdrop';
  wrap.innerHTML = `<div class="sheet ${opts.wide ? 'wide' : ''}">${inner}</div>`;
  $('#modals').append(wrap);
  const close = () => { wrap.remove(); opts.onClose && opts.onClose(); };
  wrap.addEventListener('click', e => {
    if (e.target === wrap && !opts.sticky) close();
    if (e.target.closest('[data-close]')) close();
  });
  const first = wrap.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 60);
  return { el: wrap.querySelector('.sheet'), close };
}

export function confirmBox(message, { ok = 'Delete', danger = true, title = 'Are you sure?' } = {}) {
  return new Promise(resolve => {
    let answered = false;
    const m = openModal(`
      <div class="sheet-head"><h2>${esc(title)}</h2></div>
      <div class="sheet-body"><p>${esc(message)}</p></div>
      <div class="sheet-foot">
        <button class="btn" data-close>Cancel</button>
        <button class="btn ${danger ? 'danger solid' : 'primary'}" data-ok>${esc(ok)}</button>
      </div>`, { onClose: () => { if (!answered) resolve(false); } });
    m.el.querySelector('[data-ok]').onclick = () => { answered = true; m.close(); resolve(true); };
  });
}

export function promptBox(title, { value = '', label = '', type = 'text', ok = 'Save', hint = '', extra = '' } = {}) {
  return new Promise(resolve => {
    let answered = false;
    const m = openModal(`
      <form class="form">
        <div class="sheet-head"><h2>${esc(title)}</h2></div>
        <div class="sheet-body form">
          <div class="field">${label ? `<label>${esc(label)}</label>` : ''}
            <input type="${type}" name="v" value="${esc(value)}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''} autofocus>
            ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}
          </div>
        </div>
        <div class="sheet-foot">${extra}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary">${esc(ok)}</button></div>
      </form>`, { onClose: () => { if (!answered) resolve(null); } });
    const f = m.el.querySelector('form');
    f.onsubmit = e => { e.preventDefault(); answered = true; const v = f.v.value; m.close(); resolve(v); };
    m.el.querySelectorAll('[data-extra]').forEach(b => b.onclick = () => { answered = true; m.close(); resolve({ extra: b.dataset.extra }); });
  });
}

export function segHTML(name, options, value) {
  return `<div class="seg" data-seg="${name}">${options.map(([v, l]) =>
    `<button type="button" data-v="${esc(v)}" class="${v === value ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
}
export function bindSeg(root, onChange) {
  root.querySelectorAll('[data-seg]').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      onChange && onChange(seg.dataset.seg, b.dataset.v);
    });
  });
}
export function segValue(root, name) {
  const b = root.querySelector(`[data-seg="${name}"] button.on`);
  return b ? b.dataset.v : '';
}

const p = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const icons = {
  today: p('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  patients: p('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.4.2 4 1.8 4.5 4.5"/>'),
  calendar: p('<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  inventory: p('<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5l9 4.5 9-4.5M12 12v9"/>'),
  settings: p('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  lock: p('<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 018 0v3.5"/>'),
  search: p('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  back: p('<path d="M15 5l-7 7 7 7"/>'),
  plus: p('<path d="M12 5v14M5 12h14"/>'),
  camera: p('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  face: p('<ellipse cx="12" cy="11" rx="7" ry="8.5"/><path d="M9 10h.01M15 10h.01M9.5 15c1.5 1.2 3.5 1.2 5 0"/>'),
  alert: p('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5h.01"/>'),
  check: p('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  trash: p('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  copy: p('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>'),
  undo: p('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>'),
  x: p('<path d="M6 6l12 12M18 6L6 18"/>'),
  chev: p('<path d="M9 5l7 7-7 7"/>'),
  left: p('<path d="M15 5l-7 7 7 7"/>'),
  right: p('<path d="M9 5l7 7-7 7"/>'),
};
