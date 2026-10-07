// IndexedDB storage. Every record carries an id and updatedAt so a later
// sync to the clinic's central computer can merge by record.
const DB_NAME = 'liv-emr';
const DB_VER = 1;
export const STORES = ['meta', 'patients', 'visits', 'appts', 'treatments', 'photos', 'items', 'stocklog', 'devices'];
const BY_PATIENT = ['visits', 'appts', 'treatments', 'photos'];

let dbp = null;

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of STORES) {
        if (d.objectStoreNames.contains(s)) continue;
        const os = d.createObjectStore(s, { keyPath: s === 'meta' ? 'k' : 'id' });
        if (BY_PATIENT.includes(s)) os.createIndex('patientId', 'patientId');
        if (s === 'stocklog') os.createIndex('itemId', 'itemId');
        if (s === 'visits' || s === 'treatments') os.createIndex('visitId', 'visitId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const d = await openDB();
  return d.transaction(name, mode).objectStore(name);
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export async function get(name, id) {
  if (id == null) return undefined;
  return wrap((await store(name)).get(id));
}
export async function all(name) {
  return wrap((await store(name)).getAll());
}
export async function byIndex(name, index, value) {
  return wrap((await store(name)).index(index).getAll(value));
}
export async function put(name, obj) {
  if (name !== 'meta') {
    if (!obj.id) obj.id = uid();
    if (!obj.createdAt) obj.createdAt = new Date().toISOString();
    obj.updatedAt = new Date().toISOString();
  }
  await wrap((await store(name, 'readwrite')).put(obj));
  return obj;
}
export async function del(name, id) {
  return wrap((await store(name, 'readwrite')).delete(id));
}
export async function clear(name) {
  return wrap((await store(name, 'readwrite')).clear());
}

const DEFAULT_SETTINGS = { k: 'settings', clinicName: 'Liv Clinic', doctor: '', nextMember: 1, lastBackup: null };

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await get('meta', 'settings')) || {}) };
}
export async function saveSettings(s) {
  s.k = 'settings';
  await put('meta', s);
  return s;
}
