// App shell: routing, rendering, event delegation and the shared action context.
import { html, morph } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { getModel } from '../core/model.js';
import { now, todayKey } from '../core/dates.js';
import { buildModel, checkinCelebration } from '../core/logic.js';
import { appUrl, copyText, haptic, shareOrCopy, clearUrlParams } from '../core/platform.js';
import { APP_NAME } from '../config.js';
import * as welcome from './screens/welcome.js';
import * as home from './screens/home.js';
import * as historyScreen from './screens/history.js';
import * as pact from './screens/pact.js';
import * as settings from './screens/settings.js';
import * as sheets from './sheets.js';
import { celebrateView, splash, tabbar, toastView } from './components.js';
import { closeCamera, isCameraOpen, openCamera } from './camera.js';

const SCREENS = { home, history: historyScreen, pact, settings };
const ROUTES = Object.keys(SCREENS);

export function routeFromHash() {
  const r = (location.hash || '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES.includes(r) ? r : 'home';
}

export function needsOnboarding(state) {
  if (!state.user) return true;
  if (state.ui.ob?.hold) return true;
  if (state.pairError) return true;
  if (!state.profile || !state.profile.pairId) return true;
  return false;
}

export function createApp({ root, store }) {
  let toastTimer = null;
  let celebrateTimer = null;

  // Closing a sheet/camera goes "back" in browser history, which happens asynchronously.
  // Navigation requested meanwhile waits until that back step has landed.
  let backPending = false;
  const afterBack = [];
  const flushBack = () => {
    backPending = false;
    while (afterBack.length) afterBack.shift()();
  };
  const historyBack = () => {
    backPending = true;
    history.back();
    setTimeout(() => backPending && flushBack(), 600);
  };
  const whenSettled = (fn) => (backPending ? afterBack.push(fn) : fn());
  let lastView = null;
  let lastSheet = '';

  const ctx = {
    store,
    backend: null,
    model: () => getModel(store.get()),

    toast(text) {
      const id = Date.now() + Math.random();
      store.ui({ toast: { id, text } });
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => store.ui((ui) => (ui.toast?.id === id ? { toast: null } : null)), 2800);
    },

    celebrate(c) {
      const id = Math.floor(Math.random() * 1e6) + 1;
      store.ui({ celebrate: { id, ...c } });
      haptic([12, 60, 24]);
      clearTimeout(celebrateTimer);
      celebrateTimer = setTimeout(() => store.ui((ui) => (ui.celebrate?.id === id ? { celebrate: null } : null)), 5000);
    },

    go(route) {
      whenSettled(() => {
        const target = `#/${ROUTES.includes(route) ? route : 'home'}`;
        if (location.hash !== target) location.hash = target;
        store.ui({ route: routeFromHash() });
      });
    },

    openSheet(sheet, { replace = false } = {}) {
      whenSettled(() => {
        const had = Boolean(store.get().ui.sheet);
        store.ui({ sheet });
        if (!had && !replace) history.pushState({ sheet: true }, '');
      });
    },

    closeSheet() {
      if (!store.get().ui.sheet) return;
      store.ui({ sheet: null });
      if (history.state?.sheet) historyBack();
    },

    openCamera() {
      if (!store.get().pair) return;
      ctx.closeSheet();
      whenSettled(() => {
        history.pushState({ camera: true }, '');
        openCamera(ctx);
      });
    },

    onCameraClosed() {
      if (history.state?.camera) historyBack();
    },

    async submitCheckin({ kind, dayKey, activity, note, photo }) {
      const state = store.get();
      const m = getModel(state);
      const day = dayKey || todayKey();
      try {
        const id = await ctx.backend.addCheckin({ kind, dayKey: day, activity, note, photo });
        if (kind === 'promise') {
          haptic(15);
          ctx.toast(`Pinky promise sent to ${m.names.partner} 🤙`);
          return;
        }
        const optimistic = { id, uid: m.meUid, dayKey: day, clientAt: now(), kind, status: 'ok' };
        const after = buildModel({
          pair: state.pair,
          checkins: [...state.checkins.filter((c) => c.id !== id), optimistic],
          meUid: m.meUid,
          today: todayKey(),
        });
        const cel = checkinCelebration(m.week, after.week, m.meUid);
        const justHit = after.week.members[m.meUid].hit && !m.week.members[m.meUid].hit;
        ctx.go('home');
        ctx.celebrate({ emoji: justHit ? '🏆' : '💪', ...cel });
      } catch (err) {
        console.error(err);
        ctx.toast(err.message || 'Could not save your check-in');
      }
    },

    clearJoinParam() {
      clearUrlParams();
    },

    // Replaced by main.js
    async useDemo() {},
    async exitDemo() {},
  };

  const common = {
    openCamera: () => ctx.openCamera(),
    openPromise(c, { day }) {
      ctx.openSheet({ type: 'promise', day: day || null });
    },
    openViewer(c, { id }) {
      ctx.openSheet({ type: 'viewer', id, swapped: false });
    },
    openSheet(c, { sheet, mode }) {
      ctx.openSheet({ type: sheet, mode: mode || null });
    },
    closeSheet: () => ctx.closeSheet(),
    closeCelebrate: () => store.ui({ celebrate: null }),
    react(c, { id, emoji }) {
      const s = store.get();
      const item = s.checkins.find((x) => x.id === id);
      const mine = item?.reactions?.[s.user.uid];
      haptic(8);
      return ctx.backend.react(id, mine === emoji ? null : emoji);
    },
    async review(c, { id, ok }) {
      const approve = ok === '1';
      await ctx.backend.review(id, approve);
      if (store.get().ui.sheet?.type === 'viewer') ctx.closeSheet();
      ctx.toast(approve ? 'Counted! 🤙' : "Marked as doesn't count");
    },
    togglePaid(c, { key, paid }) {
      return ctx.backend.setPaid(key, paid === '1');
    },
    async claimReward() {
      const m = ctx.model();
      const text = m?.reward?.text;
      await ctx.backend.claimReward();
      ctx.celebrate({ emoji: '🎁', title: 'Treat unlocked!', subtitle: `Enjoy ${text}. You earned it – together.`, cta: 'Yay!' });
    },
    async shareInvite() {
      const s = store.get();
      const code = s.ui.ob?.created?.code || s.pair?.code;
      if (!code) return;
      const res = await shareOrCopy({ title: APP_NAME, text: `Join my ${APP_NAME} pact! Code: ${code}`, url: `${appUrl()}?join=${code}` });
      if (res === 'copied') ctx.toast('Invite link copied');
    },
    async copyCode(c, { code }) {
      if (await copyText(code)) ctx.toast('Code copied');
    },
    fillInput(c, { name, value }, ev, el) {
      const form = el.closest('form');
      const input = form?.elements?.[name];
      if (input) {
        input.value = value;
        input.focus();
      }
    },
    dismissFatal: () => store.set({ fatal: null }),
    reload: () => location.reload(),
  };

  const actions = { ...common };
  for (const group of [welcome.actions, home.actions, historyScreen.actions, pact.actions, settings.actions, sheets.actions]) {
    for (const [k, fn] of Object.entries(group)) {
      if (k in actions) console.warn(`Duplicate action "${k}"`);
      else actions[k] = fn;
    }
  }

  function run(name, data, ev, el) {
    const fn = actions[name];
    if (!fn) return console.warn(`No action "${name}"`);
    try {
      const r = fn(ctx, data, ev, el);
      if (r && typeof r.catch === 'function') {
        r.catch((err) => {
          console.error(err);
          ctx.toast(err.message || 'Something went wrong');
        });
      }
    } catch (err) {
      console.error(err);
      ctx.toast(err.message || 'Something went wrong');
    }
  }

  root.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || !root.contains(el) || el.disabled) return;
    if (el.tagName === 'A') ev.preventDefault();
    run(el.dataset.action, { ...el.dataset }, ev, el);
  });
  root.addEventListener('submit', (ev) => {
    const form = ev.target.closest('form[data-submit]');
    if (!form) return;
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    run(form.dataset.submit, data, ev, form);
  });
  root.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-change]');
    if (el) run(el.dataset.change, { ...el.dataset }, ev, el);
  });

  window.addEventListener('hashchange', () => store.ui({ route: routeFromHash() }));
  window.addEventListener('popstate', () => {
    if (!history.state?.camera && isCameraOpen()) closeCamera();
    if (!history.state?.sheet && store.get().ui.sheet) store.ui({ sheet: null });
    if (backPending) flushBack();
  });

  function fatalBanner(msg) {
    return html`<div class="fatal" role="alert" data-key="fatal">
      <span>${icon('info', { size: 18 })}</span><p>${msg}</p>
      <button type="button" class="icon-btn small" data-action="dismissFatal" aria-label="Dismiss">${icon('x', { size: 18 })}</button>
    </div>`;
  }

  function offlineBanner(state) {
    if (state.online !== false || state.mode !== 'firebase') return '';
    return html`<div class="offline" data-key="offline">${icon('wifiOff', { size: 16 })} Offline – changes will sync when you're back</div>`;
  }

  function render(state) {
    const m = getModel(state);
    const route = state.ui.route;
    let view;
    let main;
    if (state.boot !== 'ready') {
      view = 'splash';
      main = splash();
    } else if (needsOnboarding(state)) {
      view = 'onboarding';
      main = welcome.render(state);
    } else if (!state.pair || !m) {
      view = 'loading';
      main = splash('Loading your pact…');
    } else {
      view = route;
      main = html`${(SCREENS[route] || home).render(state, m)}${tabbar(route, m)}`;
    }
    const inApp = view === route;
    const sheet = inApp || state.ui.sheet?.type === 'account' ? sheets.render(state, m) : '';
    morph(
      root,
      html`${state.fatal ? fatalBanner(state.fatal) : ''}${offlineBanner(state)}${main}${sheet}${toastView(state.ui.toast)}${celebrateView(state.ui.celebrate)}`,
    );
    document.body.classList.toggle('has-overlay', Boolean(sheet));

    const viewKey = view === 'onboarding' ? `ob-${state.ui.ob.step}` : view;
    if (viewKey !== lastView) {
      window.scrollTo(0, 0);
      if (view === 'onboarding') root.querySelector('.ob [autofocus]')?.focus({ preventScroll: true });
    }
    const sheetKey = sheet ? `${state.ui.sheet.type}:${state.ui.sheet.id || ''}` : '';
    if (sheetKey && sheetKey !== lastSheet) root.querySelector('.sheet [autofocus]')?.focus({ preventScroll: true });
    lastView = viewKey;
    lastSheet = sheetKey;
  }

  store.subscribe(render);
  render(store.get());
  return ctx;
}
