// Onboarding: intro → (install tip) → name → weekly goal → create or join a pact.
import { html, cx, raw } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { logo } from '../components.js';
import { APP_NAME, APP_TAGLINE, DEMO_PARTNER_NAME, MAX_NAME, MAX_STAKES, STAKES_SUGGESTIONS } from '../../config.js';
import { isIOS, isStandalone, local } from '../../core/platform.js';

const STEPS_FIREBASE = ['name', 'goal', 'pair'];
const STEPS_DEMO = ['name', 'goal'];

function dots(ob) {
  const steps = ob.path === 'demo' ? STEPS_DEMO : STEPS_FIREBASE;
  const current = ['create', 'join'].includes(ob.step) ? 'pair' : ob.step;
  const idx = steps.indexOf(current);
  if (idx < 0) return '';
  return html`<div class="ob-dots" aria-label=${`Step ${idx + 1} of ${steps.length}`}>
    ${steps.map((s, i) => html`<span class=${cx('ob-dot', { on: i <= idx })}></span>`)}
  </div>`;
}

function topNav(ob, back = true) {
  return html`<div class="ob-top">
    ${back ? html`<button type="button" class="icon-btn" data-action="obBack" aria-label="Back">${icon('chevronLeft', { size: 26 })}</button>` : html`<span></span>`}
    ${dots(ob)}
    <span class="icon-btn-spacer"></span>
  </div>`;
}

function errorLine(ob) {
  return ob.error ? html`<p class="form-error" role="alert">${ob.error}</p>` : '';
}

function busyLabel(ob, label, busyText) {
  return ob.busy ? html`<span class="spinner" aria-hidden="true"></span> ${busyText}` : label;
}

function intro(state, ob) {
  const configured = state.configured;
  const invited = Boolean(ob.code) && configured;
  const needsInstall = isIOS && !isStandalone() && !local.get('dismissInstall');
  return html`<div class="ob ob-intro" data-key="ob-intro">
    <div class="ob-hero">
      ${logo(84)}
      <h1 class="ob-brand">${APP_NAME}</h1>
      <p class="ob-tagline">${invited ? "You've been invited to a pact 🎉" : APP_TAGLINE}</p>
    </div>
    <ul class="ob-features">
      <li><span class="feat-emoji">📸</span><div><b>Snap a photo when you work out</b><span>It takes ten seconds. Your partner sees it right away.</span></div></li>
      <li><span class="feat-emoji">👀</span><div><b>See each other's week</b><span>Set a weekly goal and keep each other going.</span></div></li>
      <li><span class="feat-emoji">🍝</span><div><b>Add a little something at stake</b><span>Miss your goal, buy dinner. Hit it together, earn a treat.</span></div></li>
    </ul>
    ${state.notice === 'removed' ? html`<div class="note warn-note">You're no longer in a pact. Start a new one or join your partner again.</div>` : ''}
    ${needsInstall
      ? html`<button type="button" class="install-tip" data-action="obGo" data-step="install">
          <span class="install-tip-icon">${icon('addSquare', { size: 22 })}</span>
          <span><b>Add it to your Home Screen first</b><small>So it opens like an app and keeps your data. Tap for how.</small></span>
          ${icon('chevronRight', { size: 20 })}
        </button>`
      : ''}
    <div class="ob-actions">
      ${configured
        ? html`
          <button type="button" class="btn btn-primary btn-lg btn-block" data-action="obStart" data-path="firebase">${invited ? 'Join the pact' : 'Get started'}</button>
          <button type="button" class="btn btn-outline btn-block" data-action="obGo" data-step="account">I already have an account</button>
          <button type="button" class="btn btn-ghost btn-block" data-action="obStart" data-path="demo">Explore the demo first</button>`
        : html`
          <button type="button" class="btn btn-primary btn-lg btn-block" data-action="obStart" data-path="demo">Try the demo</button>
          <p class="setup-note">${icon('info', { size: 16 })}<span>To use it with your partner, connect a free Firebase project – see <b>README.md</b>. The demo keeps everything on this device.</span></p>`}
    </div>
  </div>`;
}

function installGuide() {
  return html`<div class="ob" data-key="ob-install">
    <div class="ob-top"><button type="button" class="icon-btn" data-action="obGo" data-step="intro" aria-label="Back">${icon('chevronLeft', { size: 26 })}</button><span></span><span class="icon-btn-spacer"></span></div>
    <h1 class="ob-title">Install on your iPhone</h1>
    <p class="ob-sub">Home Screen apps open full-screen and keep their data safe. It takes 15 seconds.</p>
    <ol class="install-steps">
      <li><span class="step-n">1</span><div>Tap the <b>Share</b> button <span class="kbd">${icon('share', { size: 16 })}</span> in Safari's toolbar.</div></li>
      <li><span class="step-n">2</span><div>Scroll and choose <b>Add to Home Screen</b> <span class="kbd">${icon('addSquare', { size: 16 })}</span>.</div></li>
      <li><span class="step-n">3</span><div>Tap <b>Add</b>, then open <b>${APP_NAME}</b> from your Home Screen and set it up there.</div></li>
    </ol>
    <p class="note">Why first? On iPhone, the Home Screen app keeps its own storage – whatever you set up here in Safari won't carry over.</p>
    <div class="ob-actions">
      <button type="button" class="btn btn-outline btn-block" data-action="obDismissInstall">Continue in the browser anyway</button>
    </div>
  </div>`;
}

function nameStep(ob) {
  return html`<form class="ob" data-key="ob-name" data-submit="obName" novalidate>
    ${topNav(ob)}
    <h1 class="ob-title">What should your partner call you?</h1>
    <label class="field">
      <span>Your name</span>
      <input class="input input-lg" name="name" autocomplete="given-name" maxlength=${MAX_NAME} value=${ob.name || ''} placeholder="e.g. Sam" required autofocus>
    </label>
    ${errorLine(ob)}
    <div class="ob-actions"><button class="btn btn-primary btn-lg btn-block" type="submit">Continue</button></div>
  </form>`;
}

function goalStep(ob) {
  const goal = ob.goal || 3;
  return html`<form class="ob" data-key="ob-goal" data-submit="obGoal">
    ${topNav(ob)}
    <h1 class="ob-title">How many days a week will you work out?</h1>
    <p class="ob-sub">Pick something doable – you can change it later. Consistency beats intensity.</p>
    <div class="goal-grid" role="radiogroup" aria-label="Days per week">
      ${[1, 2, 3, 4, 5, 6, 7].map(
        (n) => html`<label class="goal-opt"><input type="radio" name="goal" value=${n} ${n === goal ? raw('checked') : ''}><span><b>${n}</b><small>${n === 1 ? 'day' : 'days'}</small></span></label>`,
      )}
    </div>
    ${errorLine(ob)}
    <div class="ob-actions">
      <button class="btn btn-primary btn-lg btn-block" type="submit" ${ob.busy ? raw('disabled') : ''}>${busyLabel(ob, ob.path === 'demo' ? 'Start the demo' : 'Continue', 'Setting up…')}</button>
    </div>
  </form>`;
}

function pairStep(ob) {
  return html`<div class="ob" data-key="ob-pair">
    ${topNav(ob)}
    <h1 class="ob-title">Team up with your partner</h1>
    <p class="ob-sub">One of you starts a pact and shares the code. The other one joins with it.</p>
    <div class="choice-list">
      <button type="button" class="choice" data-action="obGo" data-step="create">
        <span class="choice-emoji">✨</span>
        <span><b>Start a new pact</b><small>You'll get a code to send your partner</small></span>
        ${icon('chevronRight', { size: 20 })}
      </button>
      <button type="button" class="choice" data-action="obGo" data-step="join">
        <span class="choice-emoji">🤝</span>
        <span><b>Join my partner</b><small>I have a code</small></span>
        ${icon('chevronRight', { size: 20 })}
      </button>
    </div>
  </div>`;
}

function createStep(ob) {
  const ws = ob.weekStartsOn ?? 1;
  return html`<form class="ob" data-key="ob-create" data-submit="obCreate">
    ${topNav(ob)}
    <h1 class="ob-title">What's at stake each week?</h1>
    <p class="ob-sub">Whoever misses their goal owes this to the other. Keep it light and fun.</p>
    <label class="field">
      <span>Stakes (optional)</span>
      <input class="input" name="stakes" maxlength=${MAX_STAKES} value=${ob.stakes ?? STAKES_SUGGESTIONS[0]} placeholder="e.g. Loser buys dinner">
    </label>
    <div class="chips suggestions">
      ${STAKES_SUGGESTIONS.map((s) => html`<button type="button" class="chip-btn" data-action="fillInput" data-name="stakes" data-value=${s}>${s}</button>`)}
    </div>
    <div class="field">
      <span>Weeks start on</span>
      <div class="seg" role="radiogroup">
        <label><input type="radio" name="weekStartsOn" value="1" ${ws === 1 ? raw('checked') : ''}><span>Monday</span></label>
        <label><input type="radio" name="weekStartsOn" value="0" ${ws === 0 ? raw('checked') : ''}><span>Sunday</span></label>
      </div>
    </div>
    ${errorLine(ob)}
    <div class="ob-actions">
      <button class="btn btn-primary btn-lg btn-block" type="submit" ${ob.busy ? raw('disabled') : ''}>${busyLabel(ob, 'Create pact', 'Creating…')}</button>
    </div>
  </form>`;
}

function inviteStep(ob, state) {
  const code = ob.created?.code || state.pair?.code || '';
  const joined = (state.pair?.members?.length || 0) >= 2;
  return html`<div class="ob" data-key="ob-invite">
    <div class="ob-hero small">
      <div class="big-emoji">🎉</div>
      <h1 class="ob-title center">Your pact is ready!</h1>
      <p class="ob-sub center">Send this code to your partner. They open the app, tap <b>Join my partner</b> and enter it.</p>
    </div>
    <div class="code-box" aria-label=${`Pact code ${code.split('').join(' ')}`}>${code.split('').map((ch) => html`<span>${ch}</span>`)}</div>
    ${joined ? html`<p class="note ok-note">Your partner just joined! 🙌</p>` : ''}
    <div class="ob-actions">
      ${joined
        ? html`<button type="button" class="btn btn-primary btn-lg btn-block" data-action="obFinish">Let's go 🎉</button>`
        : html`<button type="button" class="btn btn-primary btn-lg btn-block" data-action="shareInvite">${icon('share', { size: 20 })} Share invite link</button>
            <button type="button" class="btn btn-outline btn-block" data-action="copyCode" data-code=${code}>${icon('copy', { size: 20 })} Copy code</button>
            <button type="button" class="btn btn-ghost btn-block" data-action="obFinish">I'll invite them later</button>`}
    </div>
  </div>`;
}

function joinStep(ob) {
  return html`<form class="ob" data-key="ob-join" data-submit="obJoin" novalidate>
    ${topNav(ob)}
    <h1 class="ob-title">Enter your partner's code</h1>
    <p class="ob-sub">They'll find it in their app under Settings → Partner.</p>
    <label class="field">
      <span>Pact code</span>
      <input class="input code-input" name="code" value=${ob.code || ''} maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234" required autofocus>
    </label>
    ${errorLine(ob)}
    <div class="ob-actions">
      <button class="btn btn-primary btn-lg btn-block" type="submit" ${ob.busy ? raw('disabled') : ''}>${busyLabel(ob, 'Join pact', 'Joining…')}</button>
    </div>
  </form>`;
}

function accountStep(ob) {
  return html`<form class="ob" data-key="ob-account" data-submit="obSignIn" novalidate>
    <div class="ob-top"><button type="button" class="icon-btn" data-action="obGo" data-step="intro" aria-label="Back">${icon('chevronLeft', { size: 26 })}</button><span></span><span class="icon-btn-spacer"></span></div>
    <h1 class="ob-title">Welcome back</h1>
    <p class="ob-sub">Sign in with the email and password you used to protect your account.</p>
    <label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="email" value=${ob.email || ''} required></label>
    <label class="field"><span>Password</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
    ${errorLine(ob)}
    ${ob.info ? html`<p class="note ok-note">${ob.info}</p>` : ''}
    <div class="ob-actions">
      <button class="btn btn-primary btn-lg btn-block" type="submit" ${ob.busy ? raw('disabled') : ''}>${busyLabel(ob, 'Sign in', 'Signing in…')}</button>
      <button type="button" class="btn btn-ghost btn-block" data-action="obResetPassword">Forgot password?</button>
    </div>
  </form>`;
}

export function render(state) {
  const ob = state.ui.ob;
  switch (ob.step) {
    case 'install': return installGuide();
    case 'name': return nameStep(ob);
    case 'goal': return goalStep(ob);
    case 'pair': return pairStep(ob);
    case 'create': return createStep(ob);
    case 'invite': return inviteStep(ob, state);
    case 'join': return joinStep(ob);
    case 'account': return accountStep(ob);
    default: return intro(state, ob);
  }
}

// ---------------- actions ----------------

const BACK = { name: 'intro', goal: 'name', pair: 'goal', create: 'pair', join: 'pair', account: 'intro', install: 'intro' };
const setOb = (ctx, patch) => ctx.store.ui((ui) => ({ ob: { ...ui.ob, error: '', info: '', ...patch } }));

export const actions = {
  obGo(ctx, { step }) {
    setOb(ctx, { step });
  },
  obBack(ctx) {
    const ob = ctx.store.get().ui.ob;
    let step = BACK[ob.step] || 'intro';
    if (ob.step === 'join' && ob.fromInvite) step = 'goal';
    setOb(ctx, { step });
  },
  obDismissInstall(ctx) {
    local.set('dismissInstall', true);
    setOb(ctx, { step: 'intro' });
  },
  async obStart(ctx, { path }) {
    if (path === 'demo') {
      await ctx.useDemo();
      const s = ctx.store.get();
      if (s.pair) return; // demo already set up
    }
    const profileName = ctx.store.get().profile?.name || '';
    setOb(ctx, { path, step: 'name', name: ctx.store.get().ui.ob.name || profileName });
  },
  obName(ctx, data) {
    const name = String(data.name || '').trim().slice(0, MAX_NAME);
    if (!name) return setOb(ctx, { error: 'Please enter a name.' });
    setOb(ctx, { name, step: 'goal' });
  },
  async obGoal(ctx, data) {
    const goal = Math.min(7, Math.max(1, Number(data.goal) || 3));
    const ob = ctx.store.get().ui.ob;
    if (ob.path === 'demo') {
      setOb(ctx, { goal, busy: true });
      try {
        await ctx.backend.startDemo({ name: ob.name, goal });
        setOb(ctx, { busy: false, step: 'intro' });
        ctx.go('home');
        ctx.celebrate({ emoji: '👋', title: `Welcome, ${ob.name}!`, subtitle: `This is a demo with a pretend partner, ${DEMO_PARTNER_NAME}. Try checking in!`, cta: "Let's go" });
      } catch (err) {
        setOb(ctx, { busy: false, error: err.message });
      }
      return;
    }
    setOb(ctx, { goal, step: ob.code ? 'join' : 'pair', fromInvite: Boolean(ob.code) });
  },
  async obCreate(ctx, data) {
    const ob = ctx.store.get().ui.ob;
    const stakes = String(data.stakes || '').trim().slice(0, MAX_STAKES);
    const weekStartsOn = Number(data.weekStartsOn) === 0 ? 0 : 1;
    setOb(ctx, { busy: true, stakes, weekStartsOn, hold: true });
    try {
      const res = await ctx.backend.createPair({ name: ob.name, goal: ob.goal || 3, stakes, weekStartsOn });
      setOb(ctx, { busy: false, created: res, step: 'invite', hold: true });
    } catch (err) {
      setOb(ctx, { busy: false, hold: false, error: err.message });
    }
  },
  async obJoin(ctx, data) {
    const ob = ctx.store.get().ui.ob;
    const code = String(data.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 6) return setOb(ctx, { code, error: 'Codes have 6 characters.' });
    setOb(ctx, { busy: true, code });
    try {
      const info = await ctx.backend.joinPair(code, { name: ob.name, goal: ob.goal || 3 });
      setOb(ctx, { busy: false, step: 'intro', code: '', hold: false });
      ctx.clearJoinParam();
      ctx.go('home');
      ctx.celebrate({ emoji: '🤝', title: "You're in!", subtitle: `You and ${info.creatorName} are officially a pact. Let's get moving.`, cta: "Let's go" });
    } catch (err) {
      setOb(ctx, { busy: false, error: err.message });
    }
  },
  obFinish(ctx) {
    setOb(ctx, { hold: false, step: 'intro', created: null });
    ctx.go('home');
  },
  async obSignIn(ctx, data) {
    const email = String(data.email || '').trim();
    const password = String(data.password || '');
    if (!email || !password) return setOb(ctx, { email, error: 'Enter your email and password.' });
    setOb(ctx, { busy: true, email });
    try {
      await ctx.backend.signInEmail(email, password);
      setOb(ctx, { busy: false, path: 'firebase', step: 'name' });
    } catch (err) {
      setOb(ctx, { busy: false, error: err.message });
    }
  },
  async obResetPassword(ctx) {
    const form = document.querySelector('form[data-submit="obSignIn"]');
    const email = String(form?.elements.email.value || '').trim();
    if (!email) return setOb(ctx, { error: 'Type your email above first.' });
    try {
      await ctx.backend.resetPassword(email);
      setOb(ctx, { email, info: `If ${email} has an account, a reset link is on its way.` });
    } catch (err) {
      setOb(ctx, { email, error: err.message });
    }
  },
};
