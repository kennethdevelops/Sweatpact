// Entry point: picks a backend (Firebase or demo), starts the UI, registers the service worker.
import { createStore } from './core/store.js';
import { createApp, routeFromHash } from './ui/app.js';
import { photoCache } from './core/photo-cache.js';
import { now } from './core/dates.js';
import { firebaseConfig } from './firebase-config.js';
import { createFirebaseBackend, isFirebaseConfigured } from './backends/firebase.js';
import { createLocalBackend } from './backends/local.js';
import { appUrl, local, onInstallAvailabilityChange, readJoinCodeFromUrl, requestPersistentStorage } from './core/platform.js';

const configured = isFirebaseConfigured(firebaseConfig);
const joinCode = configured ? readJoinCodeFromUrl() : '';

const store = createStore({
  boot: 'loading',
  mode: null,
  configured,
  user: null,
  profile: null,
  pair: null,
  checkins: [],
  checkinsLoaded: false,
  pairError: null,
  notice: null,
  fatal: null,
  online: navigator.onLine,
  ui: {
    route: routeFromHash(),
    sheet: null,
    toast: null,
    celebrate: null,
    seenBefore: 0,
    ob: { step: 'intro', path: configured ? 'firebase' : 'demo', name: '', goal: 3, code: joinCode, hold: false },
  },
});

const ctx = createApp({ root: document.getElementById('app'), store });
photoCache.onChange(() => store.refresh());

ctx.useDemo = async () => {
  if (store.get().mode === 'demo') return;
  ctx.backend?.dispose?.();
  local.set('mode', 'demo');
  const demo = createLocalBackend({ store, toast: ctx.toast });
  ctx.backend = demo;
  store.set({ user: null, profile: null, pair: null, checkins: [], fatal: null, pairError: null, notice: null });
  await demo.init();
};

ctx.exitDemo = async () => {
  await ctx.backend?.demo?.reset();
  local.set('mode', null);
  location.replace(appUrl());
};

// "New" badges: remember when this person last looked at the app.
let seenUid = null;
store.subscribe((s) => {
  const uid = s.user?.uid;
  if (uid && uid !== seenUid) {
    seenUid = uid;
    store.ui({ seenBefore: local.get(`seen.${uid}`) || 0 });
  }
});
document.addEventListener('visibilitychange', () => {
  if (!seenUid) return;
  if (document.hidden) local.set(`seen.${seenUid}`, now());
  else store.ui({ seenBefore: local.get(`seen.${seenUid}`) || 0 });
});

window.addEventListener('online', () => store.set({ online: true }));
window.addEventListener('offline', () => store.set({ online: false }));
onInstallAvailabilityChange(() => store.refresh());
// Keep "5m ago" labels and the current day fresh.
setInterval(() => store.refresh(), 60_000);

async function boot() {
  let backend = null;
  if (local.get('mode') === 'demo') backend = createLocalBackend({ store, toast: ctx.toast });
  else if (configured) backend = createFirebaseBackend({ store, config: firebaseConfig, toast: ctx.toast });
  ctx.backend = backend;
  if (!backend) {
    store.set({ boot: 'ready', mode: 'none' });
    return;
  }
  try {
    await backend.init();
  } catch (err) {
    console.error(err);
    store.set({
      boot: 'ready',
      fatal:
        backend.kind === 'firebase'
          ? `Couldn't connect to Firebase (${err.message}). Check your internet connection and js/firebase-config.js.`
          : `Couldn't start: ${err.message}`,
    });
  }
}

boot();
requestPersistentStorage();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker not registered:', err));
  });
}
