import * as db from './db.js';
import { $, icons } from './ui.js';
import { startLock } from './lock.js';
import { route, refresh } from './router.js';

const NAV = [
  ['today', 'Today', icons.today],
  ['patients', 'Patients', icons.patients],
  ['calendar', 'Calendar', icons.calendar],
  ['inventory', 'Stock', icons.inventory],
  ['report', 'Report', icons.report],
];

function buildNav() {
  $('#nav').innerHTML = `
    <div class="brand">LIV</div>
    ${NAV.map(([k, l, i]) => `<a href="#/${k}" data-nav="${k}">${i}<span>${l}</span></a>`).join('')}
    <div class="spacer"></div>
    <a href="#/settings" data-nav="settings">${icons.settings}<span>Settings</span></a>`;
}

async function init() {
  await db.openDB();
  buildNav();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.addEventListener('hashchange', route);
  await startLock(() => { if (!location.hash || location.hash === '#/') location.hash = '#/today'; else refresh(); });
}

init();
