import * as db from './db.js';
import { $, esc, toast } from './ui.js';

const IDLE_MS = 5 * 60 * 1000;
const AWAY_MS = 60 * 1000;
let onUnlock = () => {};
let idleTimer = null;
let hiddenAt = 0;

export async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function setPin(settings, pin) {
  settings.pinSalt = db.uid();
  settings.pinHash = await hashPin(pin, settings.pinSalt);
  settings.pinLength = pin.length;
  await db.saveSettings(settings);
}

export async function startLock(cb) {
  onUnlock = cb;
  const s = await db.getSettings();
  if (!s.pinHash) showSetup(s);
  else lockNow();
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, bumpIdle, { passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) lockNow();
  });
}

function bumpIdle() {
  clearTimeout(idleTimer);
  if (document.body.dataset.locked === '1') return;
  idleTimer = setTimeout(lockNow, IDLE_MS);
}

function unlocked() {
  const el = $('#lock');
  el.hidden = true;
  el.innerHTML = '';
  document.body.dataset.locked = '0';
  bumpIdle();
  onUnlock();
}

function showSetup(s) {
  document.body.dataset.locked = '1';
  const el = $('#lock');
  el.hidden = false;
  el.innerHTML = `
    <form class="setup form">
      <div><h1>Set up Liv EMR</h1>
      <p>Records are kept on this iPad. Pick a PIN of 4 to 6 digits to open the app since it locks after 5 minutes idle.</p></div>
      <div class="field"><label>Clinic name</label><input name="clinic" value="${esc(s.clinicName)}" required></div>
      <div class="field"><label>Doctor's name</label><input name="doctor" placeholder="Dr. Somchai Rattanakul" value="${esc(s.doctor)}"></div>
      <div class="field"><label>PIN</label><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="new-password" required></div>
      <div class="field"><label>PIN again</label><input name="pin2" type="password" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="new-password" required></div>
      <button class="btn primary">Start</button>
    </form>`;
  const f = el.querySelector('form');
  f.onsubmit = async e => {
    e.preventDefault();
    if (f.pin.value !== f.pin2.value) { toast('The two PINs are different.'); return; }
    s.clinicName = f.clinic.value.trim() || 'Liv Clinic';
    s.doctor = f.doctor.value.trim();
    await setPin(s, f.pin.value);
    unlocked();
  };
}

export async function lockNow() {
  const s = await db.getSettings();
  if (!s.pinHash) return;
  clearTimeout(idleTimer);
  document.body.dataset.locked = '1';
  const len = s.pinLength || 4;
  const el = $('#lock');
  el.hidden = false;
  el.innerHTML = `
    <div class="lockbox">
      <h1>${esc(s.clinicName)}</h1>
      <p>Enter PIN</p>
      <div class="pindots">${'<i></i>'.repeat(len)}</div>
      <div class="keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join('')}
        <span></span><button type="button" data-k="0">0</button><button type="button" class="txt" data-k="del">Delete</button>
      </div>
    </div>`;
  let pin = '';
  const dots = el.querySelector('.pindots');
  const paint = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < pin.length));
  const press = async k => {
    if (k === 'del') pin = pin.slice(0, -1);
    else if (pin.length < len) pin += k;
    paint();
    if (pin.length === len) {
      const ok = (await hashPin(pin, s.pinSalt)) === s.pinHash;
      if (ok) { document.removeEventListener('keydown', onKey); unlocked(); }
      else { dots.classList.add('shake'); setTimeout(() => { dots.classList.remove('shake'); pin = ''; paint(); }, 380); }
    }
  };
  el.querySelector('.keypad').onclick = e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); };
  const onKey = e => {
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
  };
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = onKey;
  document.addEventListener('keydown', onKey);
}
let keyHandler = null;
