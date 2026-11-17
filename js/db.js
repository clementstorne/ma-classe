const NAME = 'ma-classe', VER = 1;
let dbp;
function open() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VER);
    r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('kv'); db.createObjectStore('photos'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => res(r && r.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
export const kvGet = k => tx('kv', 'readonly', s => s.get(k));
export const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));
export const photoSet = (id, dataUrl) => tx('photos', 'readwrite', s => s.put(dataUrl, id));
export const photoDel = id => tx('photos', 'readwrite', s => s.delete(id));
export const photoClear = () => tx('photos', 'readwrite', s => s.clear());
export async function photoAll() {
  const db = await open();
  return new Promise((res, rej) => {
    const out = {};
    const t = db.transaction('photos', 'readonly');
    const c = t.objectStore('photos').openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
  });
}
