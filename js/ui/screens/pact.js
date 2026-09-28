// Pact: streak, the shared reward ("treat yourselves"), stakes, weekly goals and who owes what.
import { html, cx } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { monthDay, toDayKey } from '../../core/dates.js';
import { debtLine, emptyState } from '../components.js';

function streakHero(m) {
  return html`<section class=${cx('card streak-hero', { cold: m.streak === 0 })}>
    <div class="streak-flame" aria-hidden="true">🔥</div>
    <div class="streak-body">
      <div class="streak-num"><b>${m.streak}</b><span>${m.streak === 1 ? 'week' : 'weeks'} in a row</span></div>
      <p>${m.streak ? 'Both of you hit your goals.' : !m.hasPartner ? 'Invite your partner to start a streak.' : m.isWarmup ? `Warm-up week – your streak starts counting ${monthDay(m.startWeek)}.` : 'Hit your goals together this week to start a streak.'}${m.bestStreak > m.streak ? ` Best: ${m.bestStreak}.` : ''}</p>
    </div>
  </section>`;
}

function rewardCard(m) {
  const r = m.reward;
  if (!r) {
    return html`<section class="card reward-card is-empty">
      <div class="card-title-row"><h2 class="card-title">🎁 Treat yourselves</h2></div>
      <p class="muted">Pick a reward you'll earn together by hitting your goals several weeks in a row.</p>
      <button type="button" class="btn btn-primary btn-block" data-action="openSheet" data-sheet="reward">Set a reward</button>
    </section>`;
  }
  const segs = Array.from({ length: r.target }, (_, i) => i < r.progress);
  const left = r.target - r.progress;
  return html`<section class=${cx('card reward-card', { unlocked: r.unlocked })}>
    <div class="card-title-row"><h2 class="card-title">🎁 Treat yourselves</h2>
      <button type="button" class="icon-btn small" data-action="openSheet" data-sheet="reward" aria-label="Change reward">${icon('edit', { size: 18 })}</button>
    </div>
    <p class="reward-text">${r.text}</p>
    <div class="segments" role="progressbar" aria-valuemin="0" aria-valuemax=${r.target} aria-valuenow=${r.progress} aria-label="Weeks in a row">
      ${segs.map((on) => html`<span class=${cx('seg-bit', { on })}></span>`)}
    </div>
    <p class="muted small">${r.unlocked ? `You did it – ${r.target} ${r.target === 1 ? 'week' : 'weeks'} in a row!` : `${r.progress} of ${r.target} weeks in a row · ${left} to go`}</p>
    ${r.unlocked ? html`<button type="button" class="btn btn-primary btn-block btn-lg" data-action="claimReward">Cash it in 🎉</button>` : ''}
  </section>`;
}

function stakesCard(m) {
  const pending = m.nextStakes !== m.stakes;
  return html`<section class="card setting-card">
    <div class="card-title-row"><h2 class="card-title">🎯 What's at stake</h2>
      <button type="button" class="btn btn-sm btn-outline" data-action="openSheet" data-sheet="stakes">Edit</button>
    </div>
    <p class="setting-value">${m.stakes || html`<span class="muted">Nothing yet</span>`}</p>
    ${pending ? html`<p class="muted small">Changes to “${m.nextStakes || 'nothing'}” next week.</p>` : html`<p class="muted small">Whoever misses their weekly goal owes this to the other.</p>`}
  </section>`;
}

function goalsCard(m) {
  const line = (label, now, next, mine) => html`<div class="goal-line">
    <span>${label}</span>
    <b>${now} ${now === 1 ? 'day' : 'days'}/week${next !== now ? html` <span class="muted small">→ ${next} next week</span>` : ''}</b>
    ${mine ? html`<button type="button" class="btn btn-sm btn-outline" data-action="openSheet" data-sheet="goal">Change</button>` : html`<span></span>`}
  </div>`;
  return html`<section class="card setting-card">
    <div class="card-title-row"><h2 class="card-title">📅 Weekly goals</h2></div>
    ${line('You', m.goals.me, m.nextGoals.me, true)}
    ${m.hasPartner ? line(m.names.partner, m.goals.partner, m.nextGoals.partner, false) : ''}
    <p class="muted small">${m.week.counted ? 'Goal changes start next week, so nobody can dodge the stakes.' : 'Changes apply right away during a warm-up week.'}</p>
  </section>`;
}

function ledger(m) {
  return html`<section class="card ledger">
    <div class="card-title-row"><h2 class="card-title">🧾 Who owes what</h2></div>
    ${m.debts.length ? m.debts.map((d) => debtLine(d, m)) : html`<p class="muted">No debts. Keep it that way 😇</p>`}
  </section>`;
}

function earned(m) {
  if (!m.rewardHistory.length) return '';
  return html`<section class="card earned">
    <div class="card-title-row"><h2 class="card-title">🏆 Treats you've earned</h2></div>
    ${m.rewardHistory.map(
      (r) => html`<div class="earned-line"><span>🎁</span><b>${r.text}</b><small>${r.target} ${r.target === 1 ? 'week' : 'weeks'} · ${r.claimedAt ? monthDay(toDayKey(new Date(r.claimedAt))) : ''}</small></div>`,
    )}
  </section>`;
}

export function render(state, m) {
  return html`<main class="screen pact" data-key="screen-pact">
    <header class="topbar">
      <div class="topbar-text"><p class="eyebrow">${m.hasPartner ? `You & ${m.names.partner}` : 'Just you so far'}</p><h1 class="title">Your pact</h1></div>
    </header>
    ${streakHero(m)}
    ${rewardCard(m)}
    ${stakesCard(m)}
    ${goalsCard(m)}
    ${m.hasPartner ? ledger(m) : emptyState('🤝', 'Better together', 'Invite your partner to unlock stakes, streaks and rewards.', html`<button type="button" class="btn btn-primary" data-action="shareInvite">${icon('share', { size: 18 })} Invite partner</button>`)}
    ${earned(m)}
  </main>`;
}

export const actions = {};
