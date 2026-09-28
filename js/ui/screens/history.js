// History: every week, who hit their goal, what was at stake, and all the check-ins.
import { html, cx, raw } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { buildStats, monthCalendar, monthKeyOf, shiftMonth } from '../../core/stats.js';
import { weekRange, dowShort } from '../../core/dates.js';
import * as body from './body.js';
import { activityOf, avatar, emptyState, thumbImg, who } from '../components.js';

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
    ${avatar(m.nameOf(uid), k, 'xs', m.avatarOf(uid))}
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
      <div class="week-head-right">
        ${outcome(w, m)}
        ${w.complete && w.checkins.length ? html`<button type="button" class="icon-btn small" data-action="openRecap" data-week=${w.weekKey} aria-label="Week recap and share">${icon('share', { size: 18 })}</button>` : ''}
      </div>
    </div>
    <div class="week-members">${uids.map((u) => memberLine(w, m, u))}</div>
    ${list.length ? html`<div class="thumbs">${list.map((c) => thumb(c, m))}</div>` : html`<p class="muted small no-checkins">No check-ins this week.</p>`}
    ${stakesLine(w, m)}
  </section>`;
}

function statsView(state, m) {
  const st = buildStats(m);
  const monthKey = state.ui.statsMonth || monthKeyOf(m.today);
  const cal = monthCalendar(m, monthKey);
  const canNext = monthKey < monthKeyOf(m.today);
  const partner = m.hasPartner;
  const row = (label, a, b, fmt = (v) => v) => html`<div class="h2h-row">
    <b class=${cx('h2h-val', { lead: partner && a != null && b != null && a > b })} data-who="me">${a == null ? '–' : fmt(a)}</b>
    <span class="h2h-label">${label}</span>
    ${partner ? html`<b class=${cx('h2h-val', { lead: a != null && b != null && b > a })} data-who="partner">${b == null ? '–' : fmt(b)}</b>` : html`<span></span>`}
  </div>`;
  const fav = (f) => (f ? `${activityOf(f.id)?.emoji || ''} ${activityOf(f.id)?.label || f.id}` : null);
  return html`
    <section class="card cal-card">
      <div class="cal-head">
        <button type="button" class="icon-btn small" data-action="statsMonth" data-delta="-1" aria-label="Previous month">${icon('chevronLeft', { size: 20 })}</button>
        <b>${cal.title}</b>
        <button type="button" class="icon-btn small" data-action="statsMonth" data-delta="1" aria-label="Next month" ${canNext ? '' : raw('disabled')}>${icon('chevronRight', { size: 20 })}</button>
      </div>
      <div class="cal-grid">
        ${cal.weekdayLetters.map((l) => html`<span class="cal-dow">${l}</span>`)}
        ${cal.weeks.flat().map(
          (c) => html`<span class=${cx('cal-day', { out: !c.inMonth, today: c.isToday, future: c.future, me: c.me, partner: c.partner, both: c.me && c.partner })}
            title=${c.dayKey}>${Number(c.dayKey.slice(8))}</span>`,
        )}
      </div>
      <div class="cal-legend">
        <span><i class="dot me"></i>You ${cal.counts.me}</span>
        ${partner ? html`<span><i class="dot partner"></i>${m.names.partner} ${cal.counts.partner}</span><span><i class="dot both"></i>Both ${cal.counts.together}</span>` : ''}
      </div>
    </section>
    <section class="card h2h">
      <div class="h2h-row h2h-head">
        <span class="h2h-who" data-who="me">${avatar(m.names.me, 'me', 'xs', m.avatarOf(m.meUid))} You</span>
        <span></span>
        ${partner ? html`<span class="h2h-who" data-who="partner">${m.names.partner} ${avatar(m.names.partner, 'partner', 'xs', m.avatarOf(m.partnerUid))}</span>` : html`<span></span>`}
      </div>
      ${row('Workouts', st.me.total, st.partner?.total)}
      ${row('This month', st.me.thisMonth, st.partner?.thisMonth)}
      ${row('Per week', st.me.avgPerWeek, st.partner?.avgPerWeek)}
      ${row('Goal hit rate', st.me.hitRate, st.partner?.hitRate, (v) => `${v}%`)}
      ${row('Best run (weeks)', st.me.bestRun, st.partner?.bestRun)}
      <div class="h2h-row">
        <span class="h2h-fav">${fav(st.me.favorite) || '–'}</span><span class="h2h-label">Favorite</span>${partner ? html`<span class="h2h-fav right">${fav(st.partner.favorite) || '–'}</span>` : html`<span></span>`}
      </div>
      ${st.leader ? html`<p class="h2h-note">${st.leader === m.meUid ? "You're ahead 🏅" : `${m.names.partner} is ahead – time to catch up 😤`}</p>` : partner && st.me.total ? html`<p class="h2h-note">Dead even 🤝</p>` : ''}
    </section>
    ${partner
      ? html`<section class="card stat-tiles">
          <div class="tile"><b>${st.together}</b><span>days you both worked out</span></div>
          <div class="tile"><b>🔥 ${st.teamStreak}</b><span>team streak · best ${st.bestTeamStreak}</span></div>
          <div class="tile"><b>${st.stakes.wonCount}</b><span>stakes won${st.stakes.unpaidToMe ? ` · ${st.stakes.unpaidToMe} unpaid` : ''}</span></div>
          <div class="tile"><b>${st.stakes.lostCount}</b><span>stakes lost${st.stakes.unpaidByMe ? ` · ${st.stakes.unpaidByMe} to pay` : ''}</span></div>
        </section>`
      : ''}`;
}

export function render(state, m) {
  const total = m.feed.filter((c) => c.status === 'ok').length;
  const weeks = m.weeks.filter((w) => w.isCurrent || w.checkins.length || w.counted);
  const tab = state.ui.historyTab || 'weeks';
  return html`<main class="screen history" data-key="screen-history">
    <header class="topbar">
      <div class="topbar-text"><p class="eyebrow">${total} ${total === 1 ? 'workout' : 'workouts'} logged together</p><h1 class="title">History</h1></div>
    </header>
    <div class="seg history-seg" role="tablist">
      <label><input type="radio" name="htab" value="weeks" data-change="historyTab" ${tab === 'weeks' ? raw('checked') : ''}><span>Weeks</span></label>
      <label><input type="radio" name="htab" value="stats" data-change="historyTab" ${tab === 'stats' ? raw('checked') : ''}><span>Stats</span></label>
      <label><input type="radio" name="htab" value="body" data-change="historyTab" ${tab === 'body' ? raw('checked') : ''}><span>Body</span></label>
    </div>
    ${tab === 'body'
      ? body.render(state, m)
      : tab === 'stats'
      ? statsView(state, m)
      : weeks.length
        ? weeks.map((w) => weekCard(w, m))
        : emptyState('🗓️', 'Nothing here yet', 'Your weeks will show up here as you check in.')}
  </main>`;
}

export const actions = {
  openRecap(ctx, { week }) {
    ctx.openSheet({ type: 'recap', weekKey: week });
  },
  historyTab(ctx, data, ev) {
    const v = ev.target.value;
    ctx.store.ui({ historyTab: v === 'stats' || v === 'body' ? v : 'weeks' });
  },
  statsMonth(ctx, { delta }) {
    const s = ctx.store.get();
    const m = ctx.model();
    const cur = s.ui.statsMonth || monthKeyOf(m.today);
    const next = shiftMonth(cur, Number(delta));
    if (next > monthKeyOf(m.today)) return;
    ctx.store.ui({ statsMonth: next });
  },
};
