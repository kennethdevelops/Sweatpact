// Minimal IndexedDB key-value helper with an in-memory fallback
// (for browsers/modes where IndexedDB is unavailable).

const DB_NAME = 'sweatpact';
const DB_VERSION = 1;
const STORES = ['photos', 'demo'];

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  return dbPromise;
}

function memoryStore() {
  const m = new Map();
  return {
    get: async (k) => m.get(k),
    set: async (k, v) => void m.set(k, v),
    del: async (k) => void m.delete(k),
    clear: async () => m.clear(),
    keys: async () => [...m.keys()],
  };
}

export function kvStore(storeName) {
  let fallback = null;
  const run = async (mode, fn) => {
    if (fallback) return fn(fallback);
    let db;
    try {
      db = await openDB();
    } catch (err) {
      console.warn('Using in-memory storage:', err?.message || err);
      fallback = memoryStore();
      return fn(fallback);
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = fn(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    get: (k) => run('readonly', (s) => s.get(k)),
    set: (k, v) => run('readwrite', (s) => (s.put ? s.put(v, k) : s.set(k, v))),
    del: (k) => run('readwrite', (s) => (s.delete ? s.delete(k) : s.del(k))),
    clear: () => run('readwrite', (s) => s.clear()),
    keys: () => run('readonly', (s) => (s.getAllKeys ? s.getAllKeys() : s.keys())),
  };
}
