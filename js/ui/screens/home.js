// Home: this week's board for both of you, stakes, things to review, and the latest check-ins.
import { html, cx } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { weekRange, relativeDay, monthDay, timeAgo } from '../../core/dates.js';
import { promiseDays } from '../../core/logic.js';
import { local } from '../../core/platform.js';
import {
  activityText, commentsByCheckin, debtLine, dayCell, emptyState, incomingPoke, nameOf, postCard, ring, sectionHead, statusPill,
} from '../components.js';

function header(m) {
  return html`<header class="topbar">
    <div class="topbar-text">
      <p class="eyebrow">${m.isWarmup ? 'Warm-up week' : 'This week'} · ${weekRange(m.currentWeek)}</p>
      <h1 class="title">${m.names.me}${m.hasPartner ? html` <span class="amp">&amp;</span> ${m.names.partner}` : ''}</h1>
    </div>
    <a class=${cx('streak-chip', { hot: m.streak > 0 })} href="#/pact" aria-label=${`Team streak: ${m.streak} weeks`}>
      <span aria-hidden="true">🔥</span><b>${m.streak}</b>
    </a>
  </header>`;
}

function boardRow(m, uid, promiseSet) {
  const mem = m.week.members[uid];
  const w = uid === m.meUid ? 'me' : 'partner';
  const name = uid === m.meUid ? 'You' : m.names.partner;
  return html`<div class="board-row" data-who=${w}>
    <div class="board-head">
      ${ring({ count: mem.count, goal: mem.goal, name: nameOf(m, uid), whoKey: w, src: m.avatarOf(uid) })}
      <div class="board-name"><b>${name}</b><span>${mem.count} of ${mem.goal} ${mem.goal === 1 ? 'day' : 'days'}</span></div>
      ${statusPill(m.week, uid, m.today)}
      ${uid !== m.meUid ? html`<button type="button" class="poke-btn" data-action="openSheet" data-sheet="poke" aria-label=${`Poke ${m.names.partner}`}>👉</button>` : ''}
    </div>
    <div class="days">
      ${m.week.days.map((d) => dayCell(m, uid, d, { canPromise: promiseSet.has(d) }))}
    </div>
  </div>`;
}

function waitingRow(state) {
  const code = state.pair?.code || '';
  return html`<div class="board-row waiting" data-who="partner">
    <div class="board-head">
      <span class="ring ghost" aria-hidden="true"><span class="ring-initial">?</span></span>
      <div class="board-name"><b>Waiting for your partner</b><span>Pact code <b class="mono">${code}</b></span></div>
      <button type="button" class="btn btn-sm btn-primary" data-action="shareInvite">${icon('share', { size: 16 })} Invite</button>
    </div>
  </div>`;
}

function board(m, state) {
  const promiseSet = new Set(promiseDays(m));
  return html`<section class="card board" aria-label="This week">
    ${boardRow(m, m.meUid, promiseSet)}
    <div class="board-divider"></div>
    ${m.hasPartner ? boardRow(m, m.partnerUid, promiseSet) : waitingRow(state)}
  </section>`;
}

function stakesCard(m) {
  if (!m.hasPartner) return '';
  if (m.isWarmup) {
    return html`<section class="card stakes-card warmup">
      <span class="stakes-emoji" aria-hidden="true">🌤️</span>
      <div><b>Warm-up week</b><p>You teamed up mid-week, so stakes and streaks start ${relativeDay(m.startWeek, m.today) === 'Tomorrow' ? 'tomorrow' : `on ${monthDay(m.startWeek)}`}. Check-ins still show up for each other.</p></div>
    </section>`;
  }
  const me = m.week.members[m.meUid];
  const you = m.week.members[m.partnerUid];
  let line;
  if (me.hit && you.hit) line = "You're both safe this week 🎉";
  else if (me.hit) line = `You're safe ✓ · ${m.names.partner} needs ${you.remaining} more`;
  else if (you.hit) line = `${m.names.partner} is safe · you need ${me.remaining} more`;
  else line = `You need ${me.remaining} more · ${m.names.partner} needs ${you.remaining} more`;
  if (!m.stakes) {
    return html`<a class="card stakes-card empty-stakes" href="#/pact">
      <span class="stakes-emoji" aria-hidden="true">🎲</span>
      <div><b>No stakes yet</b><p>Add something fun to play for, like “loser buys dinner”.</p></div>
      ${icon('chevronRight', { size: 20 })}
    </a>`;
  }
  return html`<section class="card stakes-card">
    <span class="stakes-emoji" aria-hidden="true">🎯</span>
    <div><span class="eyebrow">At stake this week</span><b class="stakes-text">${m.stakes}</b><p>${line}</p></div>
  </section>`;
}

function reviewCards(m) {
  if (!m.toReview.length) return '';
  return m.toReview.map(
    (c) => html`<section class="card review-card" data-key=${`review-${c.id}`}>
      <div class="review-top">
        <span class="review-emoji" aria-hidden="true">🤙</span>
        <div>
          <b>${m.names.partner} pinky promises</b>
          <p>they worked out <b>${relativeDay(c.dayKey, m.today).toLowerCase() === 'today' ? 'today' : relativeDay(c.dayKey, m.today)}</b>${c.activity ? html` · ${activityText(c.activity)}` : ''}</p>
          ${c.note ? html`<p class="quote">“${c.note}”</p>` : ''}
        </div>
      </div>
      <div class="review-actions">
        <button type="button" class="btn btn-outline" data-action="review" data-id=${c.id} data-ok="0">Doesn't count</button>
        <button type="button" class="btn btn-primary" data-action="review" data-id=${c.id} data-ok="1">Count it 🤙</button>
      </div>
    </section>`,
  );
}

function debtsCard(m) {
  const list = m.unpaidDebts;
  if (!list.length) return '';
  return html`<section class="card debts-card">
    <div class="card-title-row"><h2 class="card-title">Settle up</h2>${list.length > 2 ? html`<a class="link" href="#/pact">All</a>` : ''}</div>
    ${list.slice(0, 2).map((d) => debtLine(d, m))}
  </section>`;
}

function rewardMini(m) {
  const r = m.reward;
  if (!r || !m.hasPartner) return '';
  const pct = Math.round((r.progress / r.target) * 100);
  return html`<a class=${cx('card reward-mini', { unlocked: r.unlocked })} href="#/pact">
    <span class="reward-mini-emoji" aria-hidden="true">${r.unlocked ? '🎉' : '🎁'}</span>
    <div class="reward-mini-body">
      <div class="reward-mini-top"><b>${r.unlocked ? 'Treat unlocked!' : r.text}</b><span>${r.progress}/${r.target} weeks</span></div>
      ${r.unlocked ? html`<p>${r.text} – tap to cash it in</p>` : html`<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax=${r.target} aria-valuenow=${r.progress}><span style=${`width:${pct}%`}></span></div>`}
    </div>
  </a>`;
}

function protectNudge(state, m) {
  if (state.mode !== 'firebase' || !state.user?.isAnonymous || local.get('dismissProtect')) return '';
  if (!m.feed.some((c) => c.uid === m.meUid)) return '';
  return html`<section class="card nudge">
    <span class="nudge-icon">${icon('lock', { size: 20 })}</span>
    <div><b>Protect your account</b><p>Add an email and password so you can sign in on a new phone without losing your streak.</p>
      <div class="nudge-actions">
        <button type="button" class="btn btn-sm btn-primary" data-action="openSheet" data-sheet="account" data-mode="protect">Protect</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="dismissProtect">Later</button>
      </div>
    </div>
  </section>`;
}

function demoBanner(state) {
  if (state.mode !== 'demo') return '';
  return html`<a class="demo-banner" href="#/settings">
    ${icon('sparkle', { size: 16 })}<span><b>Demo mode</b> · data stays on this device. Demo controls are in Settings.</span>
  </a>`;
}

function pokeBanner(state, m) {
  const p = incomingPoke(state, m);
  if (!p) return '';
  return html`<section class="card poke-banner" data-key=${`poke-${p.at}`}>
    <span class="poke-emoji" aria-hidden="true">👉</span>
    <div class="poke-body">
      <b>${m.names.partner} poked you</b>
      <p>“${p.text}” · ${timeAgo(p.at)}</p>
      <div class="poke-actions">
        <button type="button" class="btn btn-sm btn-primary" data-action="pokeSeen" data-at=${p.at} data-then="camera">${icon('camera', { size: 16 })} Check in</button>
        <button type="button" class="btn btn-sm btn-outline" data-action="openSheet" data-sheet="poke">Poke back</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="pokeSeen" data-at=${p.at}>Got it</button>
      </div>
    </div>
  </section>`;
}

function feed(m, state) {
  const items = m.feed.slice(0, 15);
  const seen = state.ui.seenBefore || 0;
  const byCheckin = commentsByCheckin(state);
  return html`<section class="feed" aria-label="Latest check-ins">
    ${sectionHead('Latest', m.feed.length > items.length ? '#/history' : '', 'See all')}
    ${items.length
      ? items.map((c) => postCard(c, m, { isNew: c.uid !== m.meUid && c.clientAt > seen && seen > 0, comments: byCheckin.get(c.id) || [], seen }))
      : emptyState('📸', 'No check-ins yet', 'Tap the camera button after your next workout. It takes ten seconds.', html`<button type="button" class="btn btn-primary" data-action="openCamera">${icon('camera', { size: 20 })} Check in now</button>`)}
  </section>`;
}

export function render(state, m) {
  return html`<main class="screen home" data-key="screen-home">
    ${header(m)}
    ${demoBanner(state)}
    ${pokeBanner(state, m)}
    ${reviewCards(m)}
    ${board(m, state)}
    ${stakesCard(m)}
    ${debtsCard(m)}
    ${rewardMini(m)}
    ${protectNudge(state, m)}
    <button type="button" class="promise-link" data-action="openPromise">No photo? Send a pinky promise 🤙</button>
    ${feed(m, state)}
  </main>`;
}

export const actions = {
  pokeSeen(ctx, { at, then }) {
    ctx.backend.markPokeSeen(Number(at));
    if (then === 'camera') ctx.openCamera();
  },
  dismissProtect(ctx) {
    local.set('dismissProtect', true);
    ctx.store.refresh();
  },
};
