import * as db from '../db.js';
import { $, esc, toast, openModal, confirmBox, dateStr, fmtDate, daysBetween, icons } from '../ui.js';
import { hashPin, setPin, lockNow } from '../lock.js';
import { refresh } from '../router.js';

export const VERSION = '1.0.0';
const DEVICE_TYPES = ['Laser', 'IPL', 'Radiofrequency', 'HIFU', 'Microneedling RF', 'LED', 'Cryolipolysis', 'Other'];

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
async function dataURLToBlob(url) {
  return (await fetch(url)).blob();
}

async function exportBackup() {
  const out = { app: 'liv-emr', version: 1, exportedAt: new Date().toISOString(), stores: {} };
  for (const s of db.STORES) {
    const rows = await db.all(s);
    if (s === 'photos') {
      for (const r of rows) if (r.blob) { r.blob = await blobToDataURL(r.blob); r.blobEncoded = true; }
    }
    out.stores[s] = rows;
  }
  const settings = out.stores.meta.find(m => m.k === 'settings');
  const name = `liv-emr-backup-${dateStr()}.json`;
  const file = new File([JSON.stringify(out)], name, { type: 'application/json' });
  let done = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); done = true; }
    catch (e) { if (e.name === 'AbortError') return false; }
  }
  if (!done) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const s = await db.getSettings();
  s.lastBackup = new Date().toISOString();
  await db.saveSettings(s);
  return true;
}

async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'liv-emr' || !data.stores) throw new Error('This file is not a Liv EMR backup.');
  for (const s of db.STORES) await db.clear(s);
  for (const s of db.STORES) {
    for (const r of data.stores[s] || []) {
      if (s === 'photos' && r.blobEncoded) { r.blob = await dataURLToBlob(r.blob); delete r.blobEncoded; }
      const d = await db.openDB();
      await new Promise((res, rej) => { const q = d.transaction(s, 'readwrite').objectStore(s).put(r); q.onsuccess = res; q.onerror = () => rej(q.error); });
    }
  }
}

function deviceForm(dev = null) {
  return new Promise(resolve => {
    let saved = null;
    const d = dev || { type: 'Laser' };
    const m = openModal(`
      <form class="form" novalidate>
        <div class="sheet-head"><h2>${dev ? 'Edit device' : 'Add device'}</h2></div>
        <div class="sheet-body"><div class="form-grid">
          <div class="field s8"><label>Name</label><input name="name" value="${esc(d.name || '')}" placeholder="PicoWay" autofocus></div>
          <div class="field s4"><label>Brand</label><input name="brand" value="${esc(d.brand || '')}" placeholder="Candela"></div>
          <div class="field s12"><label>Type</label><select name="type">${DEVICE_TYPES.map(t => `<option ${t === d.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field s12"><label>Wavelengths or handpieces</label><input name="spec" value="${esc(d.spec || '')}" placeholder="532, 785, 1064 nm. Resolve fractional handpiece."></div>
        </div></div>
        <div class="sheet-foot">${dev ? '<button type="button" class="btn danger left" data-del>Delete</button>' : ''}
          <button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
      </form>`, { onClose: () => resolve(saved) });
    const f = $('form', m.el);
    const del = $('[data-del]', m.el);
    if (del) del.onclick = async () => {
      if (await confirmBox(`Delete ${dev.name}? Past treatments keep the device name.`)) { await db.del('devices', dev.id); saved = { deleted: true }; m.close(); }
    };
    f.onsubmit = async e => {
      e.preventDefault();
      if (!f.name.value.trim()) { toast('Enter the device name.'); return; }
      Object.assign(d, { name: f.name.value.trim(), brand: f.brand.value.trim(), type: f.type.value, spec: f.spec.value.trim() });
      saved = await db.put('devices', d);
      m.close();
    };
  });
}

function changePin() {
  const m = openModal(`
    <form class="form" novalidate>
      <div class="sheet-head"><h2>Change PIN</h2></div>
      <div class="sheet-body form">
        <div class="field"><label>Current PIN</label><input name="old" type="password" inputmode="numeric" maxlength="6" autofocus></div>
        <div class="field"><label>New PIN, 4 to 6 digits</label><input name="pin" type="password" inputmode="numeric" maxlength="6"></div>
        <div class="field"><label>New PIN again</label><input name="pin2" type="password" inputmode="numeric" maxlength="6"></div>
      </div>
      <div class="sheet-foot"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Change PIN</button></div>
    </form>`);
  const f = $('form', m.el);
  f.onsubmit = async e => {
    e.preventDefault();
    const s = await db.getSettings();
    if ((await hashPin(f.old.value, s.pinSalt)) !== s.pinHash) { toast('Current PIN is wrong.'); return; }
    if (!/^\d{4,6}$/.test(f.pin.value)) { toast('The new PIN needs 4 to 6 digits.'); return; }
    if (f.pin.value !== f.pin2.value) { toast('The two new PINs are different.'); return; }
    await setPin(s, f.pin.value);
    m.close();
    toast('PIN changed.');
  };
}

export default async function settingsPage(root) {
  const s = await db.getSettings();
  const devices = (await db.all('devices')).sort((a, b) => a.name.localeCompare(b.name));
  let usage = '';
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    usage = `${(est.usage / 1048576).toFixed(1)} MB used`;
  }
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
  const age = s.lastBackup ? daysBetween(s.lastBackup.slice(0, 10), dateStr()) : null;

  root.innerHTML = `
    <header class="top"><div><h1>Settings</h1><p class="sub">Liv EMR ${VERSION}</p></div>
      <div class="actions"><button class="btn" data-act="lock">${icons.lock}Lock now</button></div></header>

    <section class="card"><h2>Backup</h2>
      <p style="margin-bottom:12px">${s.lastBackup ? `Last backup ${fmtDate(s.lastBackup.slice(0, 10))}${age ? `, ${age} day${age === 1 ? '' : 's'} ago` : ', today'}.` : 'No backup saved yet.'}
        Save the backup file to iCloud Drive or another device since records and photos are kept on this iPad only.</p>
      <div class="actions"><button class="btn primary" data-act="backup">Save backup</button><button class="btn" data-act="restore">Restore from backup</button></div>
      <p class="muted small" style="margin-top:10px">${usage}${persisted === true ? ' · Safari is told to keep this data' : persisted === false ? ' · Add the app to the Home Screen so Safari keeps this data' : ''}</p>
    </section>

    <section class="card"><h2>Lasers and devices <button class="btn sm" data-act="adddev">${icons.plus}Add device</button></h2>
      <ul class="list">${devices.length ? devices.map(d => `<li class="tap" data-dev="${d.id}"><div class="grow"><div class="title">${esc(d.name)}</div>
        <div class="meta">${esc([d.brand, d.type, d.spec].filter(Boolean).join(' · '))}</div></div>${icons.chev.replace('<svg', '<svg style="width:18px;height:18px;color:var(--muted)"')}</li>`).join('')
        : '<li class="empty">No devices yet. Laser treatments pick from this list.</li>'}</ul>
    </section>

    <section class="card"><h2>Clinic</h2>
      <form class="form-grid" data-clinic>
        <div class="field"><label>Clinic name</label><input name="clinic" value="${esc(s.clinicName)}"></div>
        <div class="field"><label>Doctor's name</label><input name="doctor" value="${esc(s.doctor)}"></div>
        <div class="field s12"><button class="btn" style="justify-self:start">Save clinic details</button></div>
      </form>
    </section>

    <section class="card"><h2>PIN</h2>
      <p style="margin-bottom:12px">The app locks after 5 minutes idle or 1 minute in the background. A forgotten PIN locks the records too, so keep it somewhere safe.</p>
      <button class="btn" data-act="pin">Change PIN</button>
    </section>`;

  $('[data-clinic]', root).onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    const cur = await db.getSettings();
    cur.clinicName = f.clinic.value.trim() || 'Liv Clinic';
    cur.doctor = f.doctor.value.trim();
    await db.saveSettings(cur);
    toast('Clinic details saved.');
  };

  root.onclick = async e => {
    const a = e.target.closest('[data-act], [data-dev]');
    if (!a) return;
    if (a.dataset.dev) { if (await deviceForm(devices.find(d => d.id === a.dataset.dev))) refresh(); return; }
    switch (a.dataset.act) {
      case 'lock': lockNow(); break;
      case 'pin': changePin(); break;
      case 'adddev': if (await deviceForm()) refresh(); break;
      case 'backup':
        a.disabled = true; a.textContent = 'Preparing';
        try { if (await exportBackup()) toast('Backup saved.'); }
        catch (err) { toast('Backup failed: ' + err.message); }
        refresh();
        break;
      case 'restore': {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json';
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          if (!(await confirmBox('Restoring replaces every record on this iPad with the backup, PIN included.', { ok: 'Restore', title: 'Restore backup?' }))) return;
          try { await importBackup(file); toast('Backup restored.'); setTimeout(() => location.reload(), 800); }
          catch (err) { toast(err.message || 'That file could not be restored.'); }
        };
        input.click();
        break;
      }
    }
  };
}
