// Bottom sheets and the full-screen photo viewer.
import { html, raw, cx } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { fullDay, relativeDay, dowShort, timeOfDay, fromDayKey, weekStartKey, timeAgo, now, weekRange, prevWeek, todayKey } from '../core/dates.js';
import { weekRecap } from '../core/stats.js';
import { renderCheckinImage, renderRecapImage, shareToWhatsApp } from '../core/share-card.js';
import { promiseDays } from '../core/logic.js';
import { photoCache } from '../core/photo-cache.js';
import {
  cmToFtIn, derive, formatWeight, fromDisplay, parseNumber, sortEntries, toDisplay, validateEntry, validateProfile, weightUnit,
} from '../core/body.js';
import { ACTIVITIES, APP_NAME, MAX_COMMENT, MAX_NAME, MAX_NOTE, MAX_POKE, MAX_REWARD, MAX_STAKES, MAX_WEIGHT_NOTE, POKE_COOLDOWN_MIN, POKE_PRESETS, REWARD_SUGGESTIONS, STAKES_SUGGESTIONS } from '../config.js';
import { activityText, avatar, commentsByCheckin, nameOf, photoView, promiseBlock, reactionsBar, thumbImg, who } from './components.js';

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
  deleteWeight: () => ({ title: 'Delete this weigh-in?', text: '', cta: 'Delete', danger: true }),
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
      <div class="viewer-actions">
        ${c.hasPhoto && c.status === 'ok' ? html`<button type="button" class="viewer-btn" data-action="shareCheckin" data-id=${c.id} aria-label="Share to WhatsApp">${icon('share', { size: 22 })}</button>` : ''}
        ${mine ? html`<button type="button" class="viewer-btn" data-action="confirm" data-kind="deleteCheckin" data-id=${c.id} aria-label="Delete">${icon('trash', { size: 22 })}</button>` : ''}
      </div>
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
        ${c.source === 'gallery' ? html`<span class="pill muted">🖼️ From gallery</span>` : ''}
        ${statusText ? html`<span class=${cx('pill', c.status === 'ok' ? 'ok' : c.status === 'pending' ? 'warn' : 'bad')}>${statusText}</span>` : ''}
      </div>
      ${c.note ? html`<p class="viewer-note">${c.note}</p>` : ''}
      ${c.status === 'pending' && !mine
        ? html`<div class="review-actions">
            <button type="button" class="btn btn-outline-light" data-action="review" data-id=${c.id} data-ok="0">Doesn't count</button>
            <button type="button" class="btn btn-primary" data-action="review" data-id=${c.id} data-ok="1">Count it 🤙</button>
          </div>`
        : html`<div class="viewer-reactions">${reactionsBar(c, m)}</div>`}
      ${commentsThread(state, m, c, sheet)}
    </div>
  </div>`;
}

function commentsThread(state, m, c, sheet) {
  const list = commentsByCheckin(state).get(c.id) || [];
  const seen = state.ui.seenBefore || 0;
  return html`<section class="comments" aria-label="Comments">
    ${list.map((x) => {
      const mine = x.uid === m.meUid;
      return html`<div class=${cx('comment', { 'is-new': !mine && seen && x.clientAt > seen })} data-key=${`cm-${x.id}`}>
        ${avatar(m.nameOf(x.uid), who(m, x.uid), 'xs')}
        <div class="comment-body"><b>${mine ? 'You' : m.nameOf(x.uid)}</b> <span>${x.text}</span><small>${timeAgo(x.clientAt)}</small></div>
        ${mine ? html`<button type="button" class="comment-del" data-action="deleteComment" data-id=${x.id} aria-label="Delete comment">${icon('x', { size: 14 })}</button>` : ''}
      </div>`;
    })}
    <form class="comment-form" data-submit="addComment" autocomplete="off">
      <input type="hidden" name="checkinId" value=${c.id}>
      <input class="input dark" name="text" maxlength=${MAX_COMMENT} placeholder=${list.length ? 'Reply…' : 'Add a comment…'} ${sheet.focus === 'comments' ? raw('autofocus') : ''}>
      <button type="submit" class="btn btn-primary btn-sm" aria-label="Send comment">${icon('send', { size: 18 })}</button>
    </form>
  </section>`;
}

/** Texts and rows for a week's recap (names are real names – this gets shared). */
export function recapView(m, weekKey) {
  const r = weekRecap(m, weekKey);
  const w = r.week;
  const uids = [m.meUid, m.partnerUid].filter(Boolean);
  const rows = uids.map((u) => ({ uid: u, name: m.nameOf(u), who: who(m, u), ...w.members[u] }));
  let outcome;
  if (!w.counted) outcome = 'Warm-up week – just for fun.';
  else if (w.bothHit) outcome = 'We both hit our goals! 🎉';
  else if (r.debts.length) outcome = r.debts.map((d) => `${m.nameOf(d.debtor)} owes ${m.nameOf(d.creditor)}: ${d.stakes}`).join(' · ');
  else outcome = rows.filter((x) => !x.hit).map((x) => `${x.name} missed`).join(' · ') || 'Nice week!';
  const streak = weekKey === prevWeek(m.currentWeek) ? m.streak : 0;
  const shareText = `Our week on ${APP_NAME} (${weekRange(weekKey)}): ${rows.map((x) => `${x.name} ${x.count}/${x.goal} ${x.hit ? '✅' : '❌'}`).join(', ')}. ${outcome}${streak ? ` Streak: ${streak} 🔥` : ''}`;
  return { r, w, rows, outcome, streak, shareText };
}

function recapSheet(state, m, sheet) {
  const v = recapView(m, sheet.weekKey);
  return frame('recap', html`<div class="recap">
    <p class="eyebrow">Week recap · ${weekRange(sheet.weekKey)}</p>
    <h2>${v.w.counted ? (v.w.bothHit ? 'You both crushed it! 🎉' : 'Week in review') : 'Warm-up week'}</h2>
    <div class="recap-rows">
      ${v.rows.map((x) => html`<div class="recap-row" data-who=${x.who}>
        ${avatar(x.name, x.who, 'sm')}<b>${x.uid === m.meUid ? 'You' : x.name}</b>
        <span class=${cx('recap-score', x.hit ? 'ok' : 'bad')}>${x.count}/${x.goal} ${x.hit ? '✓' : '✗'}</span>
      </div>`)}
    </div>
    <p class="recap-outcome">${v.outcome}</p>
    ${v.streak ? html`<p class="recap-streak">🔥 ${v.streak}-week streak</p>` : ''}
    ${v.r.photos.length ? html`<div class="recap-photos">${v.r.photos.map((c) => html`<span class="recap-photo" data-who=${who(m, c.uid)}>${thumbImg(c)}</span>`)}</div>` : ''}
    <button type="button" class="btn btn-whatsapp btn-block btn-lg" data-action="shareRecap" data-week=${sheet.weekKey} ${sheet.busy ? raw('disabled') : ''}>
      ${sheet.busy ? html`<span class="spinner"></span> Making the image…` : html`${icon('chat', { size: 20 })} Share to WhatsApp`}
    </button>
    <button type="button" class="btn btn-ghost btn-block" data-action="closeSheet">Close</button>
  </div>`, { label: 'Week recap' });
}

function pokeSheet(state, m) {
  const mine = state.pair?.pokes?.[m.meUid];
  const minsAgo = mine?.at ? Math.floor((now() - mine.at) / 60000) : Infinity;
  const wait = POKE_COOLDOWN_MIN - minsAgo;
  return frame('poke', html`<form data-submit="sendPoke">
    <h2>Poke ${m.names.partner} 👉</h2>
    <p class="muted">A friendly nudge. They'll see it at the top of their home screen.</p>
    ${wait > 0
      ? html`<p class="note">You poked ${m.names.partner} ${minsAgo < 1 ? 'just now' : `${minsAgo} min ago`}. You can poke again in ${wait} min.</p>`
      : html`<div class="chips suggestions">${POKE_PRESETS.map((t) => html`<button type="button" class="chip-btn" data-action="fillInput" data-name="text" data-value=${t}>${t}</button>`)}</div>
        <label class="field"><span>Message</span><input class="input" name="text" maxlength=${MAX_POKE} value=${POKE_PRESETS[0]}></label>
        <button class="btn btn-primary btn-block btn-lg" type="submit">Send poke 👉</button>`}
  </form>`, { label: 'Poke' });
}

// ----- weight & body composition -----

const numStr = (v) => (v == null ? '' : String(v));

function weightSheet(state, m, sheet) {
  const body = state.body || {};
  const units = body.units || 'metric';
  const u = weightUnit(units);
  const entries = sortEntries(state.weights);
  const entry = sheet.id ? entries.find((e) => e.id === sheet.id) : null;
  const last = entries[entries.length - 1];
  const today = todayKey();
  const disp = (kg) => (kg == null ? '' : String(toDisplay(kg, units)));
  const init = entry
    ? { dayKey: entry.dayKey, weight: disp(entry.weightKg), muscle: disp(entry.muscleKg), fat: disp(entry.fatKg), water: disp(entry.waterKg), note: entry.note || '' }
    : { dayKey: today, weight: disp(last?.weightKg), muscle: '', fat: '', water: '', note: '' };
  const v = { ...init, ...(sheet.draft || {}) };

  // Live hints from what's typed so far
  const kg = (x) => {
    const n = parseNumber(x);
    return n == null || Number.isNaN(n) ? null : fromDisplay(n, units);
  };
  const d = derive({ weightKg: kg(v.weight), muscleKg: kg(v.muscle), fatKg: kg(v.fat), waterKg: kg(v.water) }, body, v.dayKey || today);
  const clash = v.dayKey && v.dayKey !== entry?.id && entries.some((e) => e.id === v.dayKey);
  const compField = (name, label, hint) => html`<label class="field comp-field"><span>${label}</span>
      <span class="unit-input"><input class="input" name=${name} inputmode="decimal" autocomplete="off" value=${numStr(v[name])} placeholder="–"><i>${u}</i></span>
      <small class="field-hint">${hint || raw('&nbsp;')}</small></label>`;

  return frame('weight', html`<form data-submit="saveWeight" data-input="weightDraft" novalidate autocomplete="off">
    <h2>${entry ? 'Edit weigh-in' : 'Log weight ⚖️'}</h2>
    <label class="field"><span>Date</span><input class="input" type="date" name="dayKey" max=${today} value=${v.dayKey}></label>
    ${clash ? html`<p class="note small">You already logged ${relativeDay(v.dayKey, today).toLowerCase()}. Saving replaces that entry.</p>` : ''}
    <div class="field"><span>Weight</span>
      <div class="stepper">
        <button type="button" class="step-btn" data-action="stepWeight" data-delta="-0.1" aria-label="Minus 0.1">${icon('minus', { size: 20 })}</button>
        <span class="unit-input big"><input class="input input-lg" name="weight" inputmode="decimal" value=${numStr(v.weight)} placeholder="0.0" aria-label=${`Weight in ${u}`} ${entry ? '' : raw('autofocus')}><i>${u}</i></span>
        <button type="button" class="step-btn" data-action="stepWeight" data-delta="0.1" aria-label="Plus 0.1">${icon('plus', { size: 20 })}</button>
      </div>
      ${d.bmi != null ? html`<small class="field-hint">BMI ${d.bmi.toFixed(1)} · ${d.bmiCategory}</small>` : ''}
    </div>
    <button type="button" class="disclosure" data-action="toggleComp" aria-expanded=${sheet.showComp ? 'true' : 'false'}>
      <span>Body composition <small>optional</small></span>${icon(sheet.showComp ? 'minus' : 'plus', { size: 18 })}
    </button>
    ${sheet.showComp
      ? html`<div class="comp-fields">
          <p class="muted small">From a smart scale, watch or gym body-composition machine. Fill in whatever you have.</p>
          ${compField('muscle', 'Skeletal muscle', d.musclePct != null ? `${d.musclePct}% of weight` : '')}
          ${compField('fat', 'Fat mass', d.fatPct != null ? `${d.fatPct}% body fat${d.fatCategory ? ` · ${d.fatCategory}` : ''}` : '')}
          ${compField('water', 'Body water', d.waterPct != null ? `${d.waterPct}% of weight` : '')}
          ${d.bmr != null && d.bmrMethod === 'katch' ? html`<p class="muted small">BMR ≈ ${d.bmr.toLocaleString('en-US')} kcal/day</p>` : ''}
        </div>`
      : ''}
    <label class="field"><span>Note (optional)</span><input class="input" name="note" maxlength=${MAX_WEIGHT_NOTE} value=${v.note} placeholder="e.g. after holidays"></label>
    ${sheet.error ? html`<p class="form-error" role="alert">${sheet.error}</p>` : ''}
    <div class="sheet-actions">
      ${entry ? html`<button type="button" class="btn btn-ghost" data-action="confirm" data-kind="deleteWeight" data-id=${entry.id}>${icon('trash', { size: 18 })} Delete</button>` : html`<span></span>`}
      <button class="btn btn-primary" type="submit">Save</button>
    </div>
    <p class="footnote">${icon('lock', { size: 13 })} Only you can see this.</p>
  </form>`, { label: 'Log weight' });
}

function bodyProfileSheet(state, m, sheet) {
  const body = state.body || {};
  const units = sheet.units || body.units || 'metric';
  const imperial = units === 'imperial';
  const fi = body.heightCm ? cmToFtIn(body.heightCm) : null;
  const radio = (name, value, label, checked, change = '') =>
    html`<label><input type="radio" name=${name} value=${value} ${change ? raw(`data-change="${change}"`) : ''} ${checked ? raw('checked') : ''}><span>${label}</span></label>`;
  return frame('bodyProfile', html`<form data-submit="saveBody" novalidate autocomplete="off">
    <h2>Body settings</h2>
    <p class="muted">All optional. Height gives you BMI. Sex and birth year give a BMR estimate and body fat ranges.</p>
    <div class="field"><span>Units</span>
      <div class="seg" role="radiogroup" aria-label="Units">
        ${radio('units', 'metric', 'kg · cm', !imperial, 'bodyUnits')}${radio('units', 'imperial', 'lb · ft/in', imperial, 'bodyUnits')}
      </div>
    </div>
    ${imperial
      ? html`<div class="field" data-key="h-imp"><span>Height</span><div class="pair-inputs">
          <span class="unit-input"><input class="input" name="heightFt" inputmode="numeric" value=${fi ? fi.ft : ''} placeholder="5"><i>ft</i></span>
          <span class="unit-input"><input class="input" name="heightIn" inputmode="numeric" value=${fi ? fi.in : ''} placeholder="9"><i>in</i></span>
        </div></div>`
      : html`<label class="field" data-key="h-met"><span>Height</span><span class="unit-input"><input class="input" name="heightCm" inputmode="decimal" value=${body.heightCm ? Math.round(body.heightCm) : ''} placeholder="175"><i>cm</i></span></label>`}
    <label class="field" data-key=${`goal-${units}`}><span>Goal weight</span><span class="unit-input"><input class="input" name="goal" inputmode="decimal" value=${body.goalKg ? toDisplay(body.goalKg, units) : ''} placeholder="–"><i>${weightUnit(units)}</i></span></label>
    <div class="field"><span>Sex</span>
      <div class="seg" role="radiogroup" aria-label="Sex">
        ${radio('sex', '', 'Not set', !body.sex)}${radio('sex', 'f', 'Female', body.sex === 'f')}${radio('sex', 'm', 'Male', body.sex === 'm')}
      </div>
    </div>
    <label class="field"><span>Birth year</span><input class="input" name="birthYear" inputmode="numeric" value=${body.birthYear || ''} placeholder="e.g. 1994"></label>
    <label class="toggle-row">
      <input type="checkbox" name="share" ${body.share ? raw('checked') : ''}>
      <span><b>Share my progress${m.hasPartner ? ` with ${m.names.partner}` : ''}</b>
      <small>${m.hasPartner ? m.names.partner : 'Your partner'} sees only your change since your first weigh-in and your weekly rate – never your weight or body composition.</small></span>
    </label>
    ${sheet.error ? html`<p class="form-error" role="alert">${sheet.error}</p>` : ''}
    <button class="btn btn-primary btn-block btn-lg" type="submit">Save</button>
  </form>`, { label: 'Body settings' });
}

export function render(state, m) {
  const sheet = state.ui.sheet;
  if (!sheet) return '';
  switch (sheet.type) {
    case 'viewer': return m ? viewer(state, m, sheet) : '';
    case 'promise': return m ? promiseSheet(state, m, sheet) : '';
    case 'poke': return m ? pokeSheet(state, m) : '';
    case 'recap': return m ? recapSheet(state, m, sheet) : '';
    case 'stakes': return m ? stakesSheet(state, m) : '';
    case 'goal': return m ? goalSheet(state, m) : '';
    case 'reward': return m ? rewardSheet(state, m) : '';
    case 'name': return m ? nameSheet(state, m) : '';
    case 'weight': return m ? weightSheet(state, m, sheet) : '';
    case 'bodyProfile': return m ? bodyProfileSheet(state, m, sheet) : '';
    case 'account': return accountSheet(state, sheet);
    case 'confirm': return confirmSheet(state, m, sheet);
    default: return '';
  }
}

// ---------------- actions ----------------

// Poking back also dismisses their poke.
function incomingPokeAt(ctx) {
  const s = ctx.store.get();
  const m = ctx.model();
  const p = m?.partnerUid ? s.pair?.pokes?.[m.partnerUid] : null;
  return p?.at && p.at > (s.pair?.pokeSeen?.[m.meUid] || 0) ? p.at : 0;
}

export const actions = {
  async shareRecap(ctx, { week }) {
    const m = ctx.model();
    const v = recapView(m, week);
    const setSheet = (patch) => ctx.store.ui((ui) => ({ sheet: ui.sheet ? { ...ui.sheet, ...patch } : ui.sheet }));
    setSheet({ busy: true });
    try {
      const photos = [];
      for (const c of v.r.photos) {
        const u = await photoCache.ensure(c.id);
        if (u?.main) photos.push(u.main);
      }
      const blob = await renderRecapImage({
        title: `${m.names.me}${m.hasPartner ? ` & ${m.names.partner}` : ''}`,
        subtitle: `Week of ${weekRange(week)}`,
        rows: v.rows.map((x) => ({ name: x.name, count: x.count, goal: x.goal, hit: x.hit, who: x.who })),
        outcome: v.outcome,
        streak: v.streak,
        photos,
      });
      await shareToWhatsApp({ blob, text: v.shareText, filename: `sweatpact-week-${week}.jpg` });
    } catch (err) {
      console.error(err);
      ctx.toast("Couldn't make the image");
    } finally {
      setSheet({ busy: false });
    }
  },
  async shareCheckin(ctx, { id }) {
    const s = ctx.store.get();
    const m = ctx.model();
    const c = s.checkins.find((x) => x.id === id);
    if (!c) return;
    const u = await photoCache.ensure(c.id);
    const name = m.nameOf(c.uid);
    const line = [activityText(c.activity), fullDay(c.dayKey)].filter(Boolean).join(' · ');
    const blob = await renderCheckinImage({ name, line, note: c.note, main: u?.main, inset: u?.inset });
    await shareToWhatsApp({ blob, text: `${name} checked in 💪 ${line}${c.note ? ` – “${c.note}”` : ''}`, filename: 'sweatpact-checkin.jpg' });
  },
  async sendPoke(ctx, data) {
    const text = String(data.text || '').trim().slice(0, MAX_POKE);
    if (!text) return ctx.toast('Write a message first');
    const m = ctx.model();
    const seen = incomingPokeAt(ctx);
    await ctx.backend.poke(text);
    if (seen) ctx.backend.markPokeSeen(seen);
    ctx.closeSheet();
    ctx.toast(`Poked ${m.names.partner} 👉`);
  },
  async addComment(ctx, data, ev, form) {
    const text = String(data.text || '').trim().slice(0, MAX_COMMENT);
    if (!text) return;
    await ctx.backend.addComment(data.checkinId, text);
    form.elements.text.value = '';
  },
  async deleteComment(ctx, { id }) {
    await ctx.backend.deleteComment(id);
  },
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
  weightDraft(ctx, data, ev, form) {
    const f = form.elements;
    const draft = { dayKey: f.dayKey?.value, weight: f.weight?.value, note: f.note?.value };
    for (const k of ['muscle', 'fat', 'water']) if (f[k]) draft[k] = f[k].value;
    ctx.store.ui((ui) => (ui.sheet?.type === 'weight' ? { sheet: { ...ui.sheet, draft: { ...(ui.sheet.draft || {}), ...draft } } } : null));
  },
  stepWeight(ctx, { delta }, ev, el) {
    const form = el.closest('form');
    const input = form?.elements?.weight;
    if (!input) return;
    const cur = parseNumber(input.value);
    const next = Math.max(0, (Number.isFinite(cur) ? cur : 0) + Number(delta));
    input.value = next.toFixed(1);
    actions.weightDraft(ctx, {}, ev, form);
  },
  toggleComp(ctx, data, ev, el) {
    const form = el.closest('form');
    if (form) actions.weightDraft(ctx, {}, ev, form);
    ctx.store.ui((ui) => (ui.sheet ? { sheet: { ...ui.sheet, showComp: !ui.sheet.showComp } } : null));
  },
  async saveWeight(ctx, data) {
    const s = ctx.store.get();
    const units = s.body?.units || 'metric';
    const res = validateEntry(data, units, todayKey());
    if (res.error) return ctx.store.ui((ui) => ({ sheet: { ...ui.sheet, error: res.error } }));
    const first = !(s.weights || []).length;
    await ctx.backend.saveWeight(res.entry, { replaceId: s.ui.sheet?.id || null });
    ctx.closeSheet();
    ctx.toast(first ? `Logged ${formatWeight(res.entry.weightKg, units)}. Come back whenever you like ⚖️` : `Logged ${formatWeight(res.entry.weightKg, units)}`);
  },
  bodyUnits(ctx, data, ev) {
    const units = ev.target.value === 'imperial' ? 'imperial' : 'metric';
    ctx.store.ui((ui) => (ui.sheet ? { sheet: { ...ui.sheet, units } } : null));
  },
  async saveBody(ctx, data) {
    const res = validateProfile(data);
    if (res.error) return ctx.store.ui((ui) => ({ sheet: { ...ui.sheet, error: res.error } }));
    await ctx.backend.setBody(res.body);
    ctx.closeSheet();
    ctx.toast('Saved');
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
      case 'deleteWeight':
        await b.deleteWeight(id);
        ctx.toast('Weigh-in deleted');
        break;
      default:
        break;
    }
  },
};

