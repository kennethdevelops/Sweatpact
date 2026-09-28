// Pure game logic: weeks, goals, stakes, streaks, rewards and debts.
// Everything here is derived from two things: the pair document and the list of check-ins.
// No DOM, no storage – so it runs in Node tests too.

import { dayIndexInWeek, nextWeek, prevWeek, weekDays, weekStartKey } from './dates.js';

export const DEFAULT_GOAL = 3;

/**
 * Settings that change over time (goals, stakes) are stored as a history:
 * [{ from: '2026-09-28', value: 3 }, { from: '2026-10-05', value: 4 }]
 * The value for a week is the latest entry whose `from` is on or before that week.
 */
export function historyValue(hist, weekKey, fallback) {
  if (!Array.isArray(hist) || hist.length === 0) return fallback;
  let best = null;
  for (const e of hist) {
    if (e && e.from <= weekKey && (!best || e.from >= best.from)) best = e;
  }
  if (!best) best = hist.reduce((a, b) => (a.from <= b.from ? a : b)); // before first entry
  return best.value;
}

/** Returns a new history where `value` applies from `fromWeek` onwards. */
export function withHistoryValue(hist, value, fromWeek) {
  const kept = (Array.isArray(hist) ? hist : []).filter((e) => e && e.from < fromWeek);
  if (kept.length && historyValue(kept, fromWeek) === value) return kept; // no real change
  return [...kept, { from: fromWeek, value }].sort((a, b) => (a.from < b.from ? -1 : 1));
}

/** First week that counts for stakes & streaks. Joining late in the week gives a warm-up week. */
export function computeStartWeek(today, weekStartsOn = 1) {
  const wk = weekStartKey(today, weekStartsOn);
  return dayIndexInWeek(today, weekStartsOn) <= 2 ? wk : nextWeek(wk);
}

export function debtKey(weekKey, uid) {
  return `w${weekKey.replaceAll('-', '')}_${uid}`;
}

const STATUS_RANK = { ok: 3, pending: 2, rejected: 1 };

function summarizeMember(uid, list, weekKey, pair) {
  const goal = Number(historyValue(pair.goals?.[uid], weekKey, DEFAULT_GOAL)) || DEFAULT_GOAL;
  const dayMap = {};
  for (const c of list) {
    if (c.uid !== uid) continue;
    const entry = (dayMap[c.dayKey] ||= { status: c.status, checkins: [] });
    entry.checkins.push(c);
    if ((STATUS_RANK[c.status] || 0) > (STATUS_RANK[entry.status] || 0)) entry.status = c.status;
  }
  for (const entry of Object.values(dayMap)) {
    entry.checkins.sort((a, b) => (STATUS_RANK[b.status] || 0) - (STATUS_RANK[a.status] || 0) || a.clientAt - b.clientAt);
    entry.cover = entry.checkins[0];
  }
  const count = Object.values(dayMap).filter((e) => e.status === 'ok').length;
  return { uid, goal, count, hit: count >= goal, remaining: Math.max(0, goal - count), dayMap };
}

/**
 * Builds everything the UI needs.
 * @param {{pair: object, checkins: object[], meUid: string, today: string}} input
 */
export function buildModel({ pair, checkins = [], meUid, today }) {
  const ws = pair.weekStartsOn ?? 1;
  const currentWeek = weekStartKey(today, ws);
  const members = Array.isArray(pair.members) ? pair.members : [];
  const partnerUid = members.find((u) => u !== meUid) || null;
  const uids = [meUid, partnerUid].filter(Boolean);
  const startWeek = partnerUid ? pair.startWeek || null : null;

  const byWeek = new Map();
  let earliestWeek = currentWeek;
  for (const c of checkins) {
    if (!c || !c.dayKey) continue;
    const wk = weekStartKey(c.dayKey, ws);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk).push(c);
    if (wk < earliestWeek) earliestWeek = wk;
  }
  if (startWeek && startWeek < earliestWeek) earliestWeek = startWeek;

  const cache = new Map();
  const summary = (wk) => {
    if (cache.has(wk)) return cache.get(wk);
    const list = (byWeek.get(wk) || []).slice().sort((a, b) => a.clientAt - b.clientAt);
    const m = {};
    for (const uid of uids) m[uid] = summarizeMember(uid, list, wk, pair);
    const counted = Boolean(startWeek && partnerUid && wk >= startWeek && wk <= currentWeek);
    const s = {
      weekKey: wk,
      days: weekDays(wk),
      isCurrent: wk === currentWeek,
      complete: wk < currentWeek,
      counted,
      stakes: historyValue(pair.stakes, wk, '') || '',
      members: m,
      bothHit: uids.length === 2 && uids.every((u) => m[u].hit),
      checkins: list,
    };
    cache.set(wk, s);
    return s;
  };

  const week = summary(currentWeek);

  // Weeks for history, newest first
  const weeks = [];
  for (let wk = currentWeek; wk >= earliestWeek; wk = prevWeek(wk)) weeks.push(summary(wk));

  // Team streak: consecutive counted weeks where both hit their goal.
  // The current week only adds to the streak once both have hit it (it never breaks it).
  let streak = 0;
  if (startWeek) {
    for (let wk = prevWeek(currentWeek); wk >= startWeek; wk = prevWeek(wk)) {
      if (summary(wk).bothHit) streak++;
      else break;
    }
    if (week.counted && week.bothHit) streak++;
  }
  let bestStreak = 0;
  if (startWeek) {
    let run = 0;
    for (let wk = startWeek; wk <= currentWeek; wk = nextWeek(wk)) {
      const s = summary(wk);
      if (s.bothHit) run++;
      else if (!s.isCurrent) run = 0;
      if (run > bestStreak) bestStreak = run;
    }
  }

  // Debts: whoever missed a completed week owes the stakes to the other.
  const debts = [];
  if (startWeek && partnerUid) {
    for (let wk = prevWeek(currentWeek); wk >= startWeek; wk = prevWeek(wk)) {
      const s = summary(wk);
      if (!s.counted || !s.stakes) continue;
      for (const uid of uids) {
        if (s.members[uid].hit) continue;
        const key = debtKey(wk, uid);
        const paidInfo = pair.paid?.[key] || null;
        debts.push({
          key,
          weekKey: wk,
          debtor: uid,
          creditor: uid === meUid ? partnerUid : meUid,
          stakes: s.stakes,
          count: s.members[uid].count,
          goal: s.members[uid].goal,
          paid: Boolean(paidInfo),
          paidInfo,
        });
      }
    }
  }

  // Reward ("treat yourselves"): consecutive both-hit weeks since the reward was set.
  let reward = null;
  if (pair.reward && pair.reward.text) {
    const r = pair.reward;
    const target = Math.max(1, Number(r.target) || 1);
    let progress = 0;
    if (startWeek) {
      const from = r.fromWeek > startWeek ? r.fromWeek : startWeek;
      if (week.counted && week.bothHit && currentWeek >= from) progress++;
      for (let wk = prevWeek(currentWeek); wk >= from; wk = prevWeek(wk)) {
        if (summary(wk).bothHit) progress++;
        else break;
      }
    }
    reward = { ...r, target, progress: Math.min(progress, target), unlocked: progress >= target };
  }

  const sortedFeed = checkins.filter((c) => c && c.dayKey).slice().sort((a, b) => b.clientAt - a.clientAt);

  // Changes to goals/stakes apply from next week once the current week counts (no dodging the stakes).
  const effectiveFrom = week.counted ? nextWeek(currentWeek) : currentWeek;
  const goalNow = (uid) => (uid ? week.members[uid]?.goal ?? DEFAULT_GOAL : null);
  const goalNext = (uid) => (uid ? Number(historyValue(pair.goals?.[uid], nextWeek(currentWeek), DEFAULT_GOAL)) : null);

  return {
    ws,
    today,
    currentWeek,
    meUid,
    partnerUid,
    hasPartner: Boolean(partnerUid),
    startWeek,
    isWarmup: Boolean(partnerUid && startWeek && currentWeek < startWeek),
    names: {
      me: pair.names?.[meUid] || 'You',
      partner: partnerUid ? pair.names?.[partnerUid] || 'Partner' : 'Partner',
    },
    nameOf: (uid) => (uid === meUid ? pair.names?.[meUid] || 'You' : pair.names?.[uid] || 'Partner'),
    week,
    weeks,
    summary,
    streak,
    bestStreak,
    debts,
    unpaidDebts: debts.filter((d) => !d.paid),
    reward,
    rewardHistory: Array.isArray(pair.rewardHistory) ? pair.rewardHistory.slice().sort((a, b) => (b.claimedAt || 0) - (a.claimedAt || 0)) : [],
    toReview: sortedFeed.filter((c) => c.status === 'pending' && c.uid !== meUid && c.uid === partnerUid),
    myPending: sortedFeed.filter((c) => c.status === 'pending' && c.uid === meUid),
    feed: sortedFeed,
    effectiveFrom,
    goals: { me: goalNow(meUid), partner: goalNow(partnerUid) },
    nextGoals: { me: goalNext(meUid), partner: goalNext(partnerUid) },
    stakes: week.stakes,
    nextStakes: historyValue(pair.stakes, nextWeek(currentWeek), '') || '',
  };
}

/** Days you can send a pinky promise for: this week up to today, plus last week during the first two days. */
export function promiseDays(model) {
  const { today, currentWeek, ws } = model;
  const days = [];
  if (dayIndexInWeek(today, ws) <= 1) {
    for (const d of weekDays(prevWeek(currentWeek))) days.push(d);
  }
  for (const d of weekDays(currentWeek)) if (d <= today) days.push(d);
  return days.reverse(); // most recent first
}

/**
 * Short status for a member in a week: "Safe", "2 to go", "Missed".
 * tone: ok | warn | bad (bad = can no longer make it this week)
 */
export function memberStatus(summaryWeek, uid, today) {
  const m = summaryWeek.members[uid];
  if (!m) return { tone: 'muted', text: '' };
  if (m.hit) return { tone: 'ok', text: summaryWeek.complete ? 'Hit it' : 'Safe' };
  if (summaryWeek.complete) return { tone: 'bad', text: 'Missed' };
  const open = summaryWeek.days.filter((d) => d >= today && m.dayMap[d]?.status !== 'ok').length;
  return { tone: m.remaining > open ? 'bad' : 'warn', text: `${m.remaining} to go` };
}

/** Message shown after a check-in. */
export function checkinCelebration(before, after, uid) {
  const b = before?.members?.[uid];
  const a = after?.members?.[uid];
  if (!a) return { title: 'Checked in!', subtitle: 'Nice work.' };
  if (b && b.count === a.count) return { title: 'Logged!', subtitle: 'Already counted today – bonus points for effort.' };
  if (a.hit && (!b || !b.hit)) return { title: 'Goal hit! 🎉', subtitle: "You're safe this week." };
  if (a.hit) return { title: `Day ${a.count}!`, subtitle: 'Over-achiever. Love it.' };
  return { title: `Day ${a.count} of ${a.goal}`, subtitle: a.remaining === 1 ? 'One more to go!' : `${a.remaining} more to go.` };
}
