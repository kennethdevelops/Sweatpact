// Shared state for the fake Firebase SDK used in tests.
// In a browser it uses localStorage (shared "server") + sessionStorage (per-tab signed-in user),
// so two tabs behave like two phones. In Node it uses in-memory maps.

export const hasWindow = typeof window !== 'undefined' && typeof localStorage !== 'undefined';
// Each document lives under its own key, like a real per-document database,
// so two tabs writing different documents never overwrite each other.
const DOC_PREFIX = 'fakefs:';
const ACCOUNTS_KEY = 'fakeauth.accounts';

export const config = { rules: true, latency: 0 };

let memState = { docs: {} };
let cache = null;
const changeListeners = new Set();

/** Snapshot of all documents (cached per tab, refreshed when another tab writes). */
export function readState() {
  if (!hasWindow) return memState;
  if (!cache) {
    const docs = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DOC_PREFIX)) {
        try {
          docs[k.slice(DOC_PREFIX.length)] = JSON.parse(localStorage.getItem(k));
        } catch {
          /* ignore */
        }
      }
    }
    cache = { docs };
  }
  return cache;
}

/** Always-fresh read of one document (used when writing, like a server would). */
export function readDoc(path) {
  if (!hasWindow) return memState.docs[path] ?? null;
  const v = localStorage.getItem(DOC_PREFIX + path);
  return v == null ? null : JSON.parse(v);
}

/** Writes only the given documents: { path: data | null (delete) }. */
export function writeDocs(changes) {
  const base = hasWindow ? readState() : memState;
  const docs = { ...base.docs };
  for (const [path, data] of Object.entries(changes)) {
    if (data == null) {
      delete docs[path];
      if (hasWindow) localStorage.removeItem(DOC_PREFIX + path);
    } else {
      docs[path] = data;
      if (hasWindow) localStorage.setItem(DOC_PREFIX + path, JSON.stringify(data));
    }
  }
  if (hasWindow) cache = { docs };
  else memState = { docs };
  emitChange();
}

export function onChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

function emitChange() {
  setTimeout(() => {
    for (const fn of [...changeListeners]) fn();
  }, 0);
}

if (hasWindow) {
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key.startsWith(DOC_PREFIX)) {
      cache = null;
      emitChange();
    }
  });
}

const mem = { session: new Map(), shared: new Map() };
export const sessionKV = {
  get(k) {
    if (!hasWindow) return mem.session.has(k) ? JSON.parse(mem.session.get(k)) : null;
    const v = sessionStorage.getItem(k);
    return v ? JSON.parse(v) : null;
  },
  set(k, v) {
    if (!hasWindow) mem.session.set(k, JSON.stringify(v));
    else sessionStorage.setItem(k, JSON.stringify(v));
  },
  del(k) {
    if (!hasWindow) mem.session.delete(k);
    else sessionStorage.removeItem(k);
  },
};

export const accounts = {
  all() {
    if (!hasWindow) return mem.shared.has(ACCOUNTS_KEY) ? JSON.parse(mem.shared.get(ACCOUNTS_KEY)) : {};
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}');
  },
  save(all) {
    if (!hasWindow) mem.shared.set(ACCOUNTS_KEY, JSON.stringify(all));
    else localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(all));
  },
};

// appName -> auth instance, so Firestore can find request.auth for the rules
export const authByApp = new Map();
export const currentUid = (appName) => authByApp.get(appName)?.currentUser?.uid || null;

export const tick = () => new Promise((r) => setTimeout(r, config.latency));

export function fbError(code, message) {
  const e = new Error(message || code);
  e.code = code;
  e.name = 'FirebaseError';
  return e;
}

export function resetAll() {
  memState = { docs: {} };
  cache = null;
  mem.session.clear();
  mem.shared.clear();
  if (hasWindow) {
    for (const k of Object.keys(localStorage)) if (k.startsWith(DOC_PREFIX)) localStorage.removeItem(k);
    localStorage.removeItem(ACCOUNTS_KEY);
    sessionStorage.clear();
  }
}

let uidCounter = 0;
export function newUid() {
  uidCounter++;
  const rand = Math.random().toString(36).slice(2, 10);
  return `u${uidCounter}${rand}`.padEnd(28, 'x').slice(0, 28);
}

// Test hooks available in the browser console / Playwright
if (typeof globalThis !== 'undefined') {
  globalThis.__fakeFirebase = {
    config,
    dump: () => JSON.parse(JSON.stringify(readState())),
    reset: resetAll,
  };
}
