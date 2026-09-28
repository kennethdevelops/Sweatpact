// Bottom sheets and the full-screen photo viewer.
import { html, raw, cx } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { fullDay, relativeDay, dowShort, timeOfDay, fromDayKey, weekStartKey } from '../core/dates.js';
import { promiseDays } from '../core/logic.js';
import { photoCache } from '../core/photo-cache.js';
import { ACTIVITIES, MAX_NAME, MAX_NOTE, MAX_REWARD, MAX_STAKES, REWARD_SUGGESTIONS, STAKES_SUGGESTIONS } from '../config.js';
import { activityText, nameOf, photoView, promiseBlock, reactionsBar, who } from './components.js';

function frame(key, content, { label = '' } = {}) {
  return html`<div class="sheet-layer" data-key=${`sheet-${key}`}>
    <div class="sheet-backdrop" data-action="closeSheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label=${label}>
      <div class="sheet-handle" aria-hidden="true"></div>
      <button type="button" class="sheet-close icon-btn" data-action="closeSheet" aria-label="Close">${icon('x', { size: 22 })}</button>
      ${content}
    </div>
  </div>`;
}

function activityChips(selected, name = 'activity') {
  return html`<div class="chips">
    ${ACTIVITIES.map(
      (a) => html`<label class="chip"><input type="radio" name=${name} value=${a.id} ${a.id === selected ? raw('checked') : ''}><span>${a.emoji} ${a.label}</span></label>`,
    )}
  </div>`;
}

function dayLabel(d, today) {
  const rel = relativeDay(d, today);
  return rel === 'Today' || rel === 'Yesterday' ? rel : `${dowShort(d)} ${fromDayKey(d).getDate()}`;
}

function promiseSheet(state, m, sheet) {
  if (!m.hasPartner) {
    return frame('promise', html`<h2>Pinky promise 🤙</h2>
      <p class="muted">Pinky promises need your partner to approve them. Invite them first!</p>
      <button type="button" class="btn btn-primary btn-block" data-action="shareInvite">${icon('share', { size: 18 })} Invite partner</button>`, { label: 'Pinky promise' });
  }
  const days = promiseDays(m);
  const done = (d) => {
    const e = m.summary(weekStartKey(d, m.ws)).members[m.meUid]?.dayMap[d];
    return e && (e.status === 'ok' || e.status === 'pending') ? e.status : null;
  };
  const firstOpen = sheet.day && !done(sheet.day) ? sheet.day : days.find((d) => !done(d));
  return frame('promise', html`<form data-submit="sendPromise">
    <h2>Pinky promise 🤙</h2>
    <p class="muted">Forgot to snap a photo? Promise ${m.names.partner} you worked out – they decide if it counts.</p>
    <div class="field"><span>Which day?</span>
      <div class="chips">
        ${days.map((d) => {
          const st = done(d);
          return html`<label class="chip"><input type="radio" name="day" value=${d} ${d === firstOpen ? raw('checked') : ''} ${st ? raw('disabled') : ''}><span>${dayLabel(d, m.today)}${st === 'ok' ? ' ✓' : st === 'pending' ? ' ⏳' : ''}</span></label>`;
        })}
      </div>
    </div>
    <div class="field"><span>What did you do?</span>${activityChips(sheet.activity || 'gym')}</div>
    <label class="field"><span>Note (optional)</span><input class="input" name="note" maxlength=${MAX_NOTE} placeholder="e.g. Left my phone in the locker"></label>
    <button class="btn btn-primary btn-block btn-lg" type="submit" ${firstOpen ? '' : raw('disabled')}>Send to ${m.names.partner}</button>
  </form>`, { label: 'Pinky promise' });
}

function stakesSheet(state, m) {
  return frame('stakes', html`<form data-submit="saveStakes">
    <h2>What's at stake?</h2>
    <p class="muted">Whoever misses their weekly goal owes this to the other.${m.week.counted ? ' Changes start next week.' : ''}</p>
    <label class="field"><span>Stakes</span><input class="input" name="stakes" maxlength=${MAX_STAKES} value=${m.nextStakes} placeholder="e.g. Loser buys dinner" autofocus></label>
    <div class="chips suggestions">${STAKES_SUGGESTIONS.map((s) => html`<button type="button" class="chip-btn" data-action="fillInput" data-name="stakes" data-value=${s}>${s}</button>`)}</div>
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" data-action="fillInput" data-name="stakes" data-value="">Clear</button>
      <button class="btn btn-primary" type="submit">Save</button>
    </div>
  </form>`, { label: 'Stakes' });
}

function goalSheet(state, m) {
  const current = m.nextGoals.me || m.goals.me;
  return frame('goal', html`<form data-submit="saveGoal">
    <h2>Your weekly goal</h2>
    <p class="muted">${m.week.counted ? 'Your new goal starts next week. This week stays as it is.' : 'This applies right away.'}</p>
    <div class="goal-grid compact">
      ${[1, 2, 3, 4, 5, 6, 7].map((n) => html`<label class="goal-opt"><input type="radio" name="goal" value=${n} ${n === current ? raw('checked') : ''}><span><b>${n}</b><small>${n === 1 ? 'day' : 'days'}</small></span></label>`)}
    </div>
    <button class="btn btn-primary btn-block btn-lg" type="submit">Save</button>
  </form>`, { label: 'Weekly goal' });
}

function rewardSheet(state, m) {
  const r = state.pair?.reward;
  const target = r?.target || 4;
  return frame('reward', html`<form data-submit="saveReward">
    <h2>Treat yourselves 🎁</h2>
    <p class="muted">Earn it together: both hit your goals this many weeks in a row.</p>
    <label class="field"><span>Reward</span><input class="input" name="text" maxlength=${MAX_REWARD} value=${r?.text || ''} placeholder="e.g. Fancy brunch" autofocus></label>
    <div class="chips suggestions">${REWARD_SUGGESTIONS.map((s) => html`<button type="button" class="chip-btn" data-action="fillInput" data-name="text" data-value=${s}>${s}</button>`)}</div>
    <div class="field"><span>Weeks in a row</span>
      <div class="chips">${[2, 3, 4, 6, 8, 12].map((n) => html`<label class="chip"><input type="radio" name="target" value=${n} ${n === target ? raw('checked') : ''}><span>${n} weeks</span></label>`)}</div>
    </div>
    ${r ? html`<p class="muted small">Saving restarts the count from this week.</p>` : ''}
    <div class="sheet-actions">
      ${r ? html`<button type="button" class="btn btn-ghost" data-action="removeReward">Remove</button>` : html`<span></span>`}
      <button class="btn btn-primary" type="submit">Save reward</button>
    </div>
  </form>`, { label: 'Reward' });
}

function nameSheet(state, m) {
  return frame('name', html`<form data-submit="saveName">
    <h2>Your name</h2>
    <label class="field"><span>What your partner sees</span><input class="input" name="name" maxlength=${MAX_NAME} value=${m.names.me} autocomplete="given-name" autofocus></label>
    <button class="btn btn-primary btn-block btn-lg" type="submit">Save</button>
  </form>`, { label: 'Your name' });
}

function accountSheet(state, sheet) {
  return frame('account', html`<form data-submit="protectAccount" novalidate>
    <h2>Protect your account 🔒</h2>
    <p class="muted">Add an email and password. Then you can sign in on any phone and keep your streak, check-ins and pact.</p>
    <label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="email" required autofocus></label>
    <label class="field"><span>Password (6+ characters)</span><input class="input" type="password" name="password" autocomplete="new-password" minlength="6" required></label>
    ${sheet.error ? html`<p class="form-error" role="alert">${sheet.error}</p>` : ''}
    <button class="btn btn-primary btn-block btn-lg" type="submit" ${sheet.busy ? raw('disabled') : ''}>${sheet.busy ? html`<span class="spinner"></span> Saving…` : 'Protect account'}</button>
  </form>`, { label: 'Protect your account' });
}

const CONFIRM = {
  leavePair: (m) => ({ title: 'Leave this pact?', text: "You'll stop seeing each other's check-ins. You can join again later with the code.", cta: 'Leave pact', danger: true }),
  removePartner: (m) => ({ title: `Remove ${m.names.partner}?`, text: 'They will be taken out of the pact and can re-join with the code. Your streak starts over.', cta: 'Remove', danger: true }),
  signOut: () => ({ title: 'Sign out?', text: 'You can sign back in with your email and password.', cta: 'Sign out' }),
  resetDemo: () => ({ title: 'Reset the demo?', text: 'Start over with fresh sample data.', cta: 'Reset', danger: true }),
  exitDemo: () => ({ title: 'Exit the demo?', text: 'Demo data will be deleted from this device.', cta: 'Exit demo' }),
  deleteCheckin: () => ({ title: 'Delete this check-in?', text: 'It will be removed for both of you.', cta: 'Delete', danger: true }),
};

function confirmSheet(state, m, sheet) {
  const c = (CONFIRM[sheet.kind] || (() => ({ title: 'Are you sure?', text: '', cta: 'OK' })))(m);
  return frame('confirm', html`<div>
    <h2>${c.title}</h2>
    ${c.text ? html`<p class="muted">${c.text}</p>` : ''}
    <div class="sheet-actions">
      <button type="button" class="btn btn-ghost" data-action="closeSheet">Cancel</button>
      <button type="button" class=${cx('btn', c.danger ? 'btn-danger-solid' : 'btn-primary')} data-action="doConfirm" data-kind=${sheet.kind} data-id=${sheet.id || ''}>${c.cta}</button>
    </div>
  </div>`, { label: c.title });
}

function viewer(state, m, sheet) {
  const c = state.checkins.find((x) => x.id === sheet.id);
  if (!c) {
    return html`<div class="viewer" data-key="viewer" role="dialog" aria-modal="true">
      <div class="viewer-top"><button type="button" class="viewer-btn" data-action="closeSheet" aria-label="Close">${icon('x', { size: 24 })}</button></div>
      <p class="viewer-gone">This check-in was deleted.</p>
    </div>`;
  }
  const mine = c.uid === m.meUid;
  const name = nameOf(m, c.uid);
  const w = who(m, c.uid);
  const p = photoCache.peek(c.id);
  const statusText = c.status === 'pending' ? 'Waiting for approval' : c.status === 'rejected' ? "Didn't count" : c.kind === 'promise' ? 'Pinky promise · counted' : '';
  return html`<div class="viewer" data-key="viewer" role="dialog" aria-modal="true" aria-label="Check-in">
    <div class="viewer-top">
      <button type="button" class="viewer-btn" data-action="closeSheet" aria-label="Close">${icon('x', { size: 24 })}</button>
      <div class="viewer-title"><b>${mine ? 'You' : name}</b><span>${fullDay(c.dayKey)} · ${timeOfDay(c.clientAt)}</span></div>
      ${mine ? html`<button type="button" class="viewer-btn" data-action="confirm" data-kind="deleteCheckin" data-id=${c.id} aria-label="Delete">${icon('trash', { size: 22 })}</button>` : html`<span class="viewer-btn-spacer"></span>`}
    </div>
    <div class="viewer-stage" data-who=${w}>
      ${c.hasPhoto
        ? html`<div class="viewer-photo">${photoView(c, { swapped: sheet.swapped, cls: 'photo-full' })}
            ${p?.inset ? html`<button type="button" class="inset-hit" data-action="swapPhoto" aria-label="Swap photos"></button>` : ''}</div>`
        : html`<div class="viewer-promise">${promiseBlock(c, m)}</div>`}
    </div>
    <div class="viewer-info">
      <div class="viewer-meta">
        ${c.activity ? html`<span class="pill muted">${activityText(c.activity)}</span>` : ''}
        ${statusText ? html`<span class=${cx('pill', c.status === 'ok' ? 'ok' : c.status === 'pending' ? 'warn' : 'bad')}>${statusText}</span>` : ''}
      </div>
      ${c.note ? html`<p class="viewer-note">${c.note}</p>` : ''}
      ${c.status === 'pending' && !mine
        ? html`<div class="review-actions">
            <button type="button" class="btn btn-outline-light" data-action="review" data-id=${c.id} data-ok="0">Doesn't count</button>
            <button type="button" class="btn btn-primary" data-action="review" data-id=${c.id} data-ok="1">Count it 🤙</button>
          </div>`
        : html`<div class="viewer-reactions">${reactionsBar(c, m)}</div>`}
    </div>
  </div>`;
}

export function render(state, m) {
  const sheet = state.ui.sheet;
  if (!sheet) return '';
  switch (sheet.type) {
    case 'viewer': return m ? viewer(state, m, sheet) : '';
    case 'promise': return m ? promiseSheet(state, m, sheet) : '';
    case 'stakes': return m ? stakesSheet(state, m) : '';
    case 'goal': return m ? goalSheet(state, m) : '';
    case 'reward': return m ? rewardSheet(state, m) : '';
    case 'name': return m ? nameSheet(state, m) : '';
    case 'account': return accountSheet(state, sheet);
    case 'confirm': return confirmSheet(state, m, sheet);
    default: return '';
  }
}

// ---------------- actions ----------------

export const actions = {
  async sendPromise(ctx, data) {
    if (!data.day) return ctx.toast('Pick a day first');
    ctx.closeSheet();
    await ctx.submitCheckin({ kind: 'promise', dayKey: data.day, activity: data.activity || null, note: String(data.note || '').trim().slice(0, MAX_NOTE) });
  },
  async saveStakes(ctx, data) {
    const text = String(data.stakes || '').trim().slice(0, MAX_STAKES);
    await ctx.backend.setStakes(text);
    ctx.closeSheet();
    const m = ctx.model();
    ctx.toast(m?.week.counted ? 'Saved – new stakes start next week' : 'Stakes saved');
  },
  async saveGoal(ctx, data) {
    const goal = Math.min(7, Math.max(1, Number(data.goal) || 3));
    await ctx.backend.setGoal(goal);
    ctx.closeSheet();
    const m = ctx.model();
    ctx.toast(m?.week.counted ? `Goal set to ${goal} from next week` : `Goal set to ${goal} days`);
  },
  async saveReward(ctx, data) {
    const text = String(data.text || '').trim().slice(0, MAX_REWARD);
    if (!text) return ctx.toast('Name your reward first');
    await ctx.backend.setReward({ text, target: Number(data.target) || 4 });
    ctx.closeSheet();
    ctx.toast('Reward set – go get it! 🎁');
  },
  async removeReward(ctx) {
    await ctx.backend.clearReward();
    ctx.closeSheet();
  },
  async saveName(ctx, data) {
    const name = String(data.name || '').trim().slice(0, MAX_NAME);
    if (!name) return ctx.toast('Name can’t be empty');
    await ctx.backend.setName(name);
    ctx.closeSheet();
  },
  async protectAccount(ctx, data) {
    const email = String(data.email || '').trim();
    const password = String(data.password || '');
    const setSheet = (patch) => ctx.store.ui((ui) => ({ sheet: ui.sheet ? { ...ui.sheet, ...patch } : ui.sheet }));
    if (!email || password.length < 6) return setSheet({ error: 'Enter an email and a password with at least 6 characters.' });
    setSheet({ busy: true, error: '' });
    try {
      await ctx.backend.linkEmail(email, password);
      ctx.closeSheet();
      ctx.toast('Account protected 🔒');
    } catch (err) {
      setSheet({ busy: false, error: err.message });
    }
  },
  swapPhoto(ctx) {
    ctx.store.ui((ui) => ({ sheet: ui.sheet ? { ...ui.sheet, swapped: !ui.sheet.swapped } : null }));
  },
  confirm(ctx, { kind, id }) {
    ctx.openSheet({ type: 'confirm', kind, id }, { replace: ctx.store.get().ui.sheet != null });
  },
  async doConfirm(ctx, { kind, id }) {
    ctx.closeSheet();
    const b = ctx.backend;
    switch (kind) {
      case 'leavePair':
        await b.leavePair();
        ctx.toast('You left the pact');
        break;
      case 'removePartner':
        await b.removePartner();
        ctx.toast('Partner removed');
        break;
      case 'signOut':
        await b.signOut();
        break;
      case 'resetDemo': {
        const name = ctx.model()?.names.me || 'You';
        const goal = ctx.model()?.goals.me || 3;
        await b.demo.reset();
        await b.startDemo({ name, goal });
        ctx.go('home');
        ctx.toast('Demo reset');
        break;
      }
      case 'exitDemo':
        await ctx.exitDemo();
        break;
      case 'deleteCheckin':
        await b.deleteCheckin(id);
        ctx.toast('Check-in deleted');
        break;
      default:
        break;
    }
  },
};

