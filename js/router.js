import { $, $$ } from './ui.js';
import today from './pages/today.js';
import { patientList, patientForm, patientDetail } from './pages/patients.js';
import visitPage from './pages/visit.js';
import calendarPage from './pages/calendar.js';
import { inventoryPage, itemPage } from './pages/inventory.js';
import settingsPage from './pages/settings.js';
import reportPage from './pages/report.js';

const ROUTES = [
  [/^#\/today$/, (m) => today(m), 'today'],
  [/^#\/patients$/, (m) => patientList(m), 'patients'],
  [/^#\/patient\/new$/, (m) => patientForm(m, null), 'patients'],
  [/^#\/patient\/([^/]+)\/edit$/, (m, id) => patientForm(m, id), 'patients'],
  [/^#\/patient\/([^/]+)(?:\/(\w+))?$/, (m, id, tab) => patientDetail(m, id, tab || 'visits'), 'patients'],
  [/^#\/visit\/([^/]+)$/, (m, id) => visitPage(m, id), 'patients'],
  [/^#\/calendar(?:\/([\d-]+))?$/, (m, d) => calendarPage(m, d), 'calendar'],
  [/^#\/inventory$/, (m) => inventoryPage(m), 'inventory'],
  [/^#\/item\/([^/]+)$/, (m, id) => itemPage(m, id), 'inventory'],
  [/^#\/report(?:\/(\d{4}-\d{2}))?$/, (m, ym) => reportPage(m, ym), 'report'],
  [/^#\/settings$/, (m) => settingsPage(m), 'settings'],
];

let rendering = 0;

export async function route() {
  if (document.body.dataset.locked === '1') return;
  const hash = location.hash || '#/today';
  const main = $('#main');
  for (const [re, fn, nav] of ROUTES) {
    const m = hash.match(re);
    if (!m) continue;
    $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === nav));
    const ticket = ++rendering;
    const holder = document.createElement('div');
    holder.className = 'page';
    try {
      await fn(holder, ...m.slice(1));
    } catch (err) {
      console.error(err);
      holder.innerHTML = `<div class="card"><h2>This page could not load</h2><p class="muted">${String(err.message || err)}</p></div>`;
    }
    if (ticket !== rendering) return;
    const keepScroll = main.dataset.hash === hash ? main.scrollTop : 0;
    main.replaceChildren(holder);
    main.dataset.hash = hash;
    main.scrollTop = keepScroll;
    return;
  }
  location.hash = '#/today';
}

export const refresh = route;
export const go = h => { if (location.hash === h) route(); else location.hash = h; };
