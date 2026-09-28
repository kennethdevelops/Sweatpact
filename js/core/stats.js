// Stats & calendar, derived from the game model (pure functions, no DOM).
import { addDays, fromDayKey, nextWeek, prevWeek, toDayKey, weekStartKey } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');
export const monthKeyOf = (dayKey) => dayKey.slice(0, 7); // 'YYYY-MM'

export function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1, 12);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Map uid -> Set of day keys with an approved check-in. */
export function workoutDays(model) {
  const out = {};
  for (const uid of [model.meUid, model.partnerUid].filter(Boolean)) out[uid] = new Set();
  for (const c of model.feed) {
    if (c.status === 'ok' && out[c.uid]) out[c.uid].add(c.dayKey);
  }
  return out;
}

/** Month grid aligned to the pact's week start. Each cell: { dayKey, inMonth, me, partner, isToday, future }. */
export function monthCalendar(model, monthKey) {
  const days = workoutDays(model);
  const first = `${monthKey}-01`;
  const lastDay = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0, 12).getDate();
  const last = `${monthKey}-${pad(lastDay)}`;
  const weeks = [];
  for (let wk = weekStartKey(first, model.ws); wk <= last; wk = nextWeek(wk)) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(wk, i);
      row.push({
        dayKey: d,
        inMonth: d.startsWith(monthKey),
        me: days[model.meUid]?.has(d) || false,
        partner: model.partnerUid ? days[model.partnerUid]?.has(d) || false : false,
        isToday: d === model.today,
        future: d > model.today,
      });
    }
    weeks.push(row);
  }
  const inMonth = weeks.flat().filter((c) => c.inMonth);
  return {
    monthKey,
    title: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(fromDayKey(first)),
    weekdayLetters: weeks[0].map((c) => new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(fromDayKey(c.dayKey))),
    weeks,
    counts: {
      me: inMonth.filter((c) => c.me).length,
      partner: inMonth.filter((c) => c.partner).length,
      together: inMonth.filter((c) => c.me && c.partner).length,
    },
  };
}

function memberStats(model, uid, days) {
  const set = days[uid] || new Set();
  const month = monthKeyOf(model.today);
  const thisMonth = [...set].filter((d) => d.startsWith(month)).length;

  // Average per week over completed weeks since this person's first workout (or the pact start).
  const first = [...set].sort()[0];
  let avgPerWeek = 0;
  if (first) {
    const from = weekStartKey(first, model.ws);
    let weeks = 0;
    let total = 0;
    for (let wk = from; wk < model.currentWeek; wk = nextWeek(wk)) {
      weeks++;
      for (let i = 0; i < 7; i++) if (set.has(addDays(wk, i))) total++;
    }
    avgPerWeek = weeks ? Math.round((total / weeks) * 10) / 10 : set.size;
  }

  // Goal hit rate over completed weeks that counted.
  let hit = 0;
  let of = 0;
  if (model.startWeek) {
    for (let wk = model.startWeek; wk < model.currentWeek; wk = nextWeek(wk)) {
      const s = model.summary(wk);
      if (!s.counted || !s.members[uid]) continue;
      of++;
      if (s.members[uid].hit) hit++;
    }
  }

  // Favorite activity
  const counts = {};
  for (const c of model.feed) if (c.uid === uid && c.status === 'ok' && c.activity) counts[c.activity] = (counts[c.activity] || 0) + 1;
  const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || null;

  // Longest personal run of consecutive weeks hitting the goal
  let best = 0;
  let run = 0;
  if (model.startWeek) {
    for (let wk = model.startWeek; wk <= model.currentWeek; wk = nextWeek(wk)) {
      const s = model.summary(wk);
      if (s.members[uid]?.hit) run++;
      else if (!s.isCurrent) run = 0;
      best = Math.max(best, run);
    }
  }

  return {
    uid,
    total: set.size,
    thisMonth,
    avgPerWeek,
    hit,
    of,
    hitRate: of ? Math.round((hit / of) * 100) : null,
    favorite: fav ? { id: fav[0], count: fav[1] } : null,
    bestRun: best,
  };
}

export function buildStats(model) {
  const days = workoutDays(model);
  const me = memberStats(model, model.meUid, days);
  const partner = model.partnerUid ? memberStats(model, model.partnerUid, days) : null;
  const together = partner ? [...days[model.meUid]].filter((d) => days[model.partnerUid].has(d)).length : 0;
  const owedToMe = model.debts.filter((d) => d.creditor === model.meUid);
  const owedByMe = model.debts.filter((d) => d.debtor === model.meUid);
  let leader = null;
  if (partner && me.total !== partner.total) leader = me.total > partner.total ? model.meUid : model.partnerUid;
  return {
    me,
    partner,
    together,
    teamStreak: model.streak,
    bestTeamStreak: model.bestStreak,
    leader,
    stakes: {
      wonCount: owedToMe.length,
      lostCount: owedByMe.length,
      unpaidToMe: owedToMe.filter((d) => !d.paid).length,
      unpaidByMe: owedByMe.filter((d) => !d.paid).length,
    },
  };
}

/** Everything the weekly recap card needs for a completed week. */
export function weekRecap(model, weekKey) {
  const s = model.summary(weekKey);
  const photos = s.checkins.filter((c) => c.status === 'ok' && c.hasPhoto).slice(0, 6);
  const debts = model.debts.filter((d) => d.weekKey === weekKey);
  return { week: s, photos, debts };
}

export const lastWeekKey = (model) => prevWeek(model.currentWeek);
export { toDayKey };
