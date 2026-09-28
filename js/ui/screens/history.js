// History: every week, who hit their goal, what was at stake, and all the check-ins.
import { html, cx } from '../../lib/dom.js';
import { weekRange, dowShort } from '../../core/dates.js';
import { emptyState, thumbImg, initial, who } from '../components.js';

function outcome(w, m) {
  if (w.isCurrent) return html`<span class="pill muted">In progress</span>`;
  if (!w.counted) return html`<span class="pill muted">${m.hasPartner ? 'Warm-up' : 'Solo'}</span>`;
  const missed = Object.values(w.members).filter((x) => !x.hit);
  if (!missed.length) return html`<span class="pill ok">Both hit 🎉</span>`;
  if (missed.length === 2) return html`<span class="pill bad">Both missed</span>`;
  const name = missed[0].uid === m.meUid ? 'You' : m.names.partner;
  return html`<span class="pill warn">${name} missed</span>`;
}

function memberLine(w, m, uid) {
  const x = w.members[uid];
  if (!x) return '';
  const k = who(m, uid);
  const name = uid === m.meUid ? 'You' : m.names.partner;
  const mark = x.hit ? '✓' : w.complete ? '✗' : '';
  return html`<div class="wm" data-who=${k}>
    <span class="avatar xs" data-who=${k}>${initial(uid === m.meUid ? m.names.me : m.names.partner)}</span>
    <span class="wm-name">${name}</span>
    <b class=${cx('wm-count', { ok: x.hit, bad: !x.hit && w.complete })}>${x.count}/${x.goal} ${mark}</b>
  </div>`;
}

function thumb(c, m) {
  const k = who(m, c.uid);
  return html`<button type="button" class=${cx('thumb', `st-${c.status}`, { 'has-photo': c.hasPhoto })} data-who=${k} data-action="openViewer" data-id=${c.id}
      aria-label=${`${c.uid === m.meUid ? 'You' : m.names.partner}, ${dowShort(c.dayKey)}`}>
    ${c.hasPhoto ? thumbImg(c) : html`<span class="thumb-glyph">${c.status === 'pending' ? '⏳' : c.status === 'rejected' ? '✕' : '🤙'}</span>`}
    <span class="thumb-day">${dowShort(c.dayKey)}</span>
  </button>`;
}

function stakesLine(w, m) {
  if (!w.counted || !w.complete || !w.stakes) return '';
  const losers = Object.values(w.members).filter((x) => !x.hit);
  if (!losers.length) return html`<p class="week-foot">Nobody owed “${w.stakes}” 😇</p>`;
  return html`<p class="week-foot">${losers.map((x, i) => {
    const d = m.debts.find((dd) => dd.weekKey === w.weekKey && dd.debtor === x.uid);
    const name = x.uid === m.meUid ? 'You' : m.names.partner;
    return html`${i ? ' · ' : ''}${name} owed “${w.stakes}”${d?.paid ? ' – settled ✓' : ''}`;
  })}</p>`;
}

function weekCard(w, m) {
  const uids = [m.meUid, m.partnerUid].filter(Boolean);
  const list = w.checkins.slice().sort((a, b) => (a.dayKey === b.dayKey ? a.clientAt - b.clientAt : a.dayKey < b.dayKey ? -1 : 1));
  return html`<section class=${cx('card week-card', { current: w.isCurrent })} data-key=${`week-${w.weekKey}`}>
    <div class="week-head">
      <div><b>${weekRange(w.weekKey)}</b>${w.isCurrent ? html`<span class="muted small"> · this week</span>` : ''}</div>
      ${outcome(w, m)}
    </div>
    <div class="week-members">${uids.map((u) => memberLine(w, m, u))}</div>
    ${list.length ? html`<div class="thumbs">${list.map((c) => thumb(c, m))}</div>` : html`<p class="muted small no-checkins">No check-ins this week.</p>`}
    ${stakesLine(w, m)}
  </section>`;
}

export function render(state, m) {
  const total = m.feed.filter((c) => c.status === 'ok').length;
  const weeks = m.weeks.filter((w) => w.isCurrent || w.checkins.length || w.counted);
  return html`<main class="screen history" data-key="screen-history">
    <header class="topbar">
      <div class="topbar-text"><p class="eyebrow">${total} ${total === 1 ? 'workout' : 'workouts'} logged together</p><h1 class="title">History</h1></div>
    </header>
    ${weeks.length ? weeks.map((w) => weekCard(w, m)) : emptyState('🗓️', 'Nothing here yet', 'Your weeks will show up here as you check in.')}
  </main>`;
}

export const actions = {};
