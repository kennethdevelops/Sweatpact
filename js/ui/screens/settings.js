// Settings: profile, partner & invite code, account protection, install, backup, demo controls.
import { html, raw } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { APP_NAME, APP_VERSION } from '../../config.js';
import { canPromptInstall, isIOS, isStandalone, promptInstall, saveFile } from '../../core/platform.js';
import { getClockOffsetDays, fullDay, todayKey, toDayKey, now } from '../../core/dates.js';
import { buildAvatar } from '../../core/photos.js';
import { avatar } from '../components.js';

const row = (label, value, action = '') =>
  html`<div class="list-row"><span class="list-label">${label}</span><span class="list-value">${value}</span>${action}</div>`;

function photoRow(state, m) {
  const src = m.avatarOf(m.meUid);
  const busy = state.ui.avatarBusy;
  return html`<div class="list-row photo-row">
    ${avatar(m.names.me, 'me', 'lg', src)}
    <span class="list-label">Profile picture</span>
    ${src && !busy ? html`<button type="button" class="btn btn-sm btn-ghost" data-action="removeAvatar">Remove</button>` : ''}
    <label class="btn btn-sm btn-outline">
      ${busy ? 'Saving…' : src ? 'Change' : html`${icon('camera', { size: 16 })} Add`}
      <input type="file" accept="image/*" hidden data-change="pickAvatar" ${busy ? raw('disabled') : ''}>
    </label>
  </div>`;
}

function profileCard(state, m) {
  const ws = state.pair?.weekStartsOn ?? 1;
  return html`<section class="card list-card">
    <h2 class="card-title">You</h2>
    ${photoRow(state, m)}
    ${row('Name', m.names.me, html`<button type="button" class="btn btn-sm btn-outline" data-action="openSheet" data-sheet="name">Edit</button>`)}
    ${row('Weekly goal', `${m.goals.me} ${m.goals.me === 1 ? 'day' : 'days'}`, html`<button type="button" class="btn btn-sm btn-outline" data-action="openSheet" data-sheet="goal">Change</button>`)}
    <div class="list-row">
      <span class="list-label">Weeks start on</span>
      <div class="seg compact" role="radiogroup" aria-label="Weeks start on">
        <label><input type="radio" name="ws" value="1" data-change="setWeekStart" ${ws === 1 ? raw('checked') : ''}><span>Mon</span></label>
        <label><input type="radio" name="ws" value="0" data-change="setWeekStart" ${ws === 0 ? raw('checked') : ''}><span>Sun</span></label>
      </div>
    </div>
  </section>`;
}

function partnerCard(state, m) {
  if (state.mode === 'demo') {
    return html`<section class="card list-card">
      <h2 class="card-title">Partner</h2>
      ${row('Partner', `${m.names.partner} (pretend)`)}
      <p class="muted small">In the real app your partner joins with a code you share from here.</p>
    </section>`;
  }
  const code = state.pair?.code || '';
  return html`<section class="card list-card">
    <h2 class="card-title">Partner</h2>
    ${m.hasPartner ? row('Partner', m.names.partner) : row('Partner', html`<span class="muted">Not joined yet</span>`)}
    ${row('Pact code', html`<b class="mono">${code}</b>`, html`<button type="button" class="btn btn-sm btn-primary" data-action="shareInvite">${icon('share', { size: 16 })} Share</button>`)}
    <div class="list-actions">
      ${m.hasPartner ? html`<button type="button" class="btn btn-sm btn-ghost" data-action="confirm" data-kind="removePartner">Remove partner</button>` : ''}
      <button type="button" class="btn btn-sm btn-danger" data-action="confirm" data-kind="leavePair">Leave pact</button>
    </div>
    ${m.hasPartner ? html`<p class="muted small">Partner lost their phone? Remove them and they can re-join with the code.</p>` : ''}
  </section>`;
}

function accountCard(state) {
  if (state.mode !== 'firebase') return '';
  const u = state.user;
  return html`<section class="card list-card">
    <h2 class="card-title">Account</h2>
    ${u?.isAnonymous
      ? html`${row('Status', html`<span class="pill warn">Guest</span>`)}
          <p class="muted small">Guest accounts live on this phone only. Add an email and password to sign in on another phone.</p>
          <button type="button" class="btn btn-primary btn-block" data-action="openSheet" data-sheet="account" data-mode="protect">${icon('lock', { size: 18 })} Protect my account</button>`
      : html`${row('Signed in as', u?.email || '')}
          <button type="button" class="btn btn-outline btn-block" data-action="confirm" data-kind="signOut">${icon('logout', { size: 18 })} Sign out</button>`}
  </section>`;
}

function installCard() {
  if (isStandalone()) return '';
  const canPrompt = canPromptInstall();
  return html`<section class="card list-card">
    <h2 class="card-title">Install the app</h2>
    <p class="muted small">Add ${APP_NAME} to your Home Screen so it opens full-screen, works offline and keeps its data.</p>
    ${canPrompt
      ? html`<button type="button" class="btn btn-primary btn-block" data-action="install">${icon('download', { size: 18 })} Install</button>`
      : isIOS
        ? html`<ol class="mini-steps"><li>Tap <b>Share</b> ${icon('share', { size: 14 })} in Safari</li><li>Choose <b>Add to Home Screen</b></li><li>Open it from your Home Screen</li></ol>`
        : html`<p class="muted small">In Chrome: open the menu ⋮ and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>`}
  </section>`;
}

function dataCard() {
  return html`<section class="card list-card">
    <h2 class="card-title">Your data</h2>
    <p class="muted small">Download everything (check-ins, settings and photos) as a JSON file.</p>
    <button type="button" class="btn btn-outline btn-block" data-action="exportData">${icon('download', { size: 18 })} Download backup</button>
  </section>`;
}

function demoCard(state, m) {
  if (state.mode !== 'demo') return '';
  const offset = getClockOffsetDays();
  return html`<section class="card list-card demo-card">
    <h2 class="card-title">${icon('sparkle', { size: 18 })} Demo controls</h2>
    <p class="muted small">Make ${m.names.partner} do things, or fast-forward time to see stakes and streaks settle.${offset ? ` Pretend date: ${fullDay(todayKey())}.` : ''}</p>
    <div class="demo-grid">
      <button type="button" class="btn btn-sm btn-outline" data-action="demoPartnerCheckIn">📸 ${m.names.partner} checks in</button>
      <button type="button" class="btn btn-sm btn-outline" data-action="demoPartnerPromise">🤙 ${m.names.partner} pinky promises</button>
      <button type="button" class="btn btn-sm btn-outline" data-action="demoPartnerPoke">👉 ${m.names.partner} pokes you</button>
      <button type="button" class="btn btn-sm btn-outline" data-action="demoJumpWeek">⏭️ Skip to next week</button>
      <button type="button" class="btn btn-sm btn-danger" data-action="confirm" data-kind="resetDemo">Reset demo</button>
    </div>
    <button type="button" class="btn btn-ghost btn-block" data-action="confirm" data-kind="exitDemo">Exit demo</button>
  </section>`;
}

export function render(state, m) {
  const modeLabel = state.mode === 'demo' ? 'Demo mode (on this device)' : 'Synced with Firebase';
  return html`<main class="screen settings" data-key="screen-settings">
    <header class="topbar"><div class="topbar-text"><p class="eyebrow">${APP_NAME}</p><h1 class="title">Settings</h1></div></header>
    ${demoCard(state, m)}
    ${profileCard(state, m)}
    ${partnerCard(state, m)}
    ${accountCard(state)}
    ${installCard()}
    ${dataCard()}
    <p class="footnote">${APP_NAME} ${APP_VERSION} · ${modeLabel}</p>
  </main>`;
}

export const actions = {
  async pickAvatar(ctx, data, ev) {
    const input = ev.target;
    const file = input.files?.[0];
    input.value = ''; // so picking the same photo again still fires "change"
    if (!file) return;
    ctx.store.ui({ avatarBusy: true });
    try {
      await ctx.backend.setAvatar(await buildAvatar(file));
      ctx.toast('Looking good 📸');
    } catch (err) {
      console.error(err);
      ctx.toast("Couldn't read that photo");
    } finally {
      ctx.store.ui({ avatarBusy: false });
    }
  },
  async removeAvatar(ctx) {
    await ctx.backend.setAvatar(null);
    ctx.toast('Profile picture removed');
  },
  setWeekStart(ctx, data, ev) {
    const v = Number(ev.target.value) === 0 ? 0 : 1;
    ctx.backend.setWeekStart(v);
    ctx.toast(`Weeks now start on ${v ? 'Monday' : 'Sunday'}`);
  },
  async install(ctx) {
    const ok = await promptInstall();
    if (ok) ctx.toast('Installed! Open it from your Home Screen.');
    ctx.store.refresh();
  },
  async exportData(ctx) {
    ctx.toast('Preparing your backup…');
    try {
      const data = await ctx.backend.exportData();
      const payload = { app: APP_NAME, version: APP_VERSION, exportedAt: new Date(now()).toISOString(), mode: ctx.store.get().mode, ...data };
      const res = await saveFile(`${APP_NAME.toLowerCase()}-backup-${toDayKey(new Date())}.json`, JSON.stringify(payload, null, 2));
      if (res === 'downloaded') ctx.toast('Backup downloaded');
    } catch (err) {
      ctx.toast(`Backup failed: ${err.message}`);
    }
  },
  demoPartnerCheckIn(ctx) {
    ctx.backend.demo.partnerCheckIn();
  },
  demoPartnerPoke(ctx) {
    ctx.backend.demo.partnerPoke();
    ctx.go('home');
  },
  demoPartnerPromise(ctx) {
    ctx.backend.demo.partnerPromise();
    ctx.go('home');
  },
  demoJumpWeek(ctx) {
    const target = ctx.backend.demo.jumpToNextWeek();
    ctx.go('home');
    ctx.toast(`It's now ${fullDay(target)}`);
  },
};

