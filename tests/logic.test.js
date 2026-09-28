import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModel, checkinCelebration, computeStartWeek, debtKey, historyValue, memberStatus, promiseDays, withHistoryValue,
} from '../js/core/logic.js';

// Weeks start Monday. 2026-09-07, 09-14, 09-21, 09-28 are Mondays.
const ME = 'me';
const YOU = 'partner';
let n = 0;
const ci = (uid, dayKey, extra = {}) => ({
  id: `c${++n}`, uid, dayKey, clientAt: Date.parse(`${dayKey}T10:00:00`) + n, kind: 'photo', status: 'ok', reactions: {}, ...extra,
});
const days = (uid, list) => list.map((d) => ci(uid, d));

function pair(extra = {}) {
  return {
    id: 'p1',
    members: [ME, YOU],
    names: { [ME]: 'Kev', [YOU]: 'Alex' },
    goals: { [ME]: [{ from: '2026-09-07', value: 3 }], [YOU]: [{ from: '2026-09-07', value: 2 }] },
    stakes: [{ from: '2026-09-07', value: 'Loser buys dinner' }],
    weekStartsOn: 1,
    startWeek: '2026-09-07',
    reward: null,
    rewardHistory: [],
    paid: {},
    ...extra,
  };
}

test('historyValue picks the latest entry on or before the week', () => {
  const h = [{ from: '2026-09-07', value: 3 }, { from: '2026-09-21', value: 5 }];
  assert.equal(historyValue(h, '2026-09-07'), 3);
  assert.equal(historyValue(h, '2026-09-14'), 3);
  assert.equal(historyValue(h, '2026-09-21'), 5);
  assert.equal(historyValue(h, '2026-12-28'), 5);
  assert.equal(historyValue(h, '2026-08-31'), 3, 'before first entry uses earliest');
  assert.equal(historyValue([], '2026-09-07', 9), 9);
  assert.equal(historyValue(undefined, '2026-09-07', 'x'), 'x');
});

test('withHistoryValue replaces future entries and skips no-ops', () => {
  const h = [{ from: '2026-09-07', value: 3 }];
  assert.deepEqual(withHistoryValue(h, 4, '2026-09-14'), [{ from: '2026-09-07', value: 3 }, { from: '2026-09-14', value: 4 }]);
  const twice = withHistoryValue(withHistoryValue(h, 4, '2026-09-14'), 5, '2026-09-14');
  assert.deepEqual(twice, [{ from: '2026-09-07', value: 3 }, { from: '2026-09-14', value: 5 }]);
  assert.deepEqual(withHistoryValue(h, 3, '2026-09-14'), h, 'same value is a no-op');
  assert.deepEqual(withHistoryValue([], 2, '2026-09-14'), [{ from: '2026-09-14', value: 2 }]);
  // Changing back to the original value removes the pending change
  const back = withHistoryValue([{ from: '2026-09-07', value: 3 }, { from: '2026-09-14', value: 4 }], 3, '2026-09-14');
  assert.deepEqual(back, [{ from: '2026-09-07', value: 3 }]);
});

test('computeStartWeek gives a warm-up week when joining late in the week', () => {
  assert.equal(computeStartWeek('2026-09-28', 1), '2026-09-28'); // Mon
  assert.equal(computeStartWeek('2026-09-30', 1), '2026-09-28'); // Wed
  assert.equal(computeStartWeek('2026-10-01', 1), '2026-10-05'); // Thu -> next week
  assert.equal(computeStartWeek('2026-10-04', 1), '2026-10-05'); // Sun -> next week
  assert.equal(computeStartWeek('2026-09-29', 0), '2026-09-27'); // Tue in a Sunday week (index 2)
});

test('counts distinct approved days only', () => {
  const checkins = [
    ci(ME, '2026-09-28'),
    ci(ME, '2026-09-28'), // same day twice
    ci(ME, '2026-09-29', { kind: 'promise', status: 'pending' }),
    ci(ME, '2026-09-30', { kind: 'promise', status: 'rejected' }),
    ci(ME, '2026-10-01', { kind: 'promise', status: 'ok' }),
    ci(YOU, '2026-09-28'),
  ];
  const m = buildModel({ pair: pair(), checkins, meUid: ME, today: '2026-10-01' });
  assert.equal(m.currentWeek, '2026-09-28');
  assert.equal(m.week.members[ME].count, 2);
  assert.equal(m.week.members[ME].remaining, 1);
  assert.equal(m.week.members[ME].dayMap['2026-09-29'].status, 'pending');
  assert.equal(m.week.members[ME].dayMap['2026-09-30'].status, 'rejected');
  assert.equal(m.week.members[YOU].count, 1);
  assert.equal(m.myPending.length, 1);
  assert.equal(m.toReview.length, 0);
  assert.equal(m.feed[0].dayKey, '2026-10-01');
});

test('streaks, debts and paid marks', () => {
  const checkins = [
    // week 09-07: me 3/3, partner 1/2 -> partner misses
    ...days(ME, ['2026-09-07', '2026-09-08', '2026-09-09']),
    ...days(YOU, ['2026-09-07']),
    // week 09-14: both hit
    ...days(ME, ['2026-09-14', '2026-09-15', '2026-09-16']),
    ...days(YOU, ['2026-09-14', '2026-09-18']),
    // week 09-21: both hit
    ...days(ME, ['2026-09-21', '2026-09-23', '2026-09-27']),
    ...days(YOU, ['2026-09-22', '2026-09-24']),
    // current week 09-28: me 1/3
    ...days(ME, ['2026-09-28']),
  ];
  const p = pair({ paid: { [debtKey('2026-09-07', YOU)]: { by: ME, at: 1 } } });
  const m = buildModel({ pair: p, checkins, meUid: ME, today: '2026-09-29' });
  assert.equal(m.streak, 2);
  assert.equal(m.bestStreak, 2);
  assert.equal(m.debts.length, 1);
  assert.equal(m.debts[0].debtor, YOU);
  assert.equal(m.debts[0].creditor, ME);
  assert.equal(m.debts[0].paid, true);
  assert.equal(m.unpaidDebts.length, 0);
  assert.equal(m.weeks.length, 4);
  assert.equal(m.weeks[0].isCurrent, true);
  assert.equal(m.weeks[3].weekKey, '2026-09-07');

  // Once both hit the current week, the streak grows
  const more = [...checkins, ...days(ME, ['2026-09-29', '2026-09-30']), ...days(YOU, ['2026-09-28', '2026-09-29'])];
  const m2 = buildModel({ pair: p, checkins: more, meUid: ME, today: '2026-09-30' });
  assert.equal(m2.week.bothHit, true);
  assert.equal(m2.streak, 3);
  assert.equal(m2.bestStreak, 3);
});

test('no stakes means no debts; both missing gives two debts', () => {
  const checkins = [...days(ME, ['2026-09-07']), ...days(YOU, ['2026-09-07'])];
  const m = buildModel({ pair: pair(), checkins, meUid: ME, today: '2026-09-15' });
  assert.equal(m.debts.length, 2);
  const noStakes = buildModel({ pair: pair({ stakes: [] }), checkins, meUid: ME, today: '2026-09-15' });
  assert.equal(noStakes.debts.length, 0);
});

test('weeks before the start week do not count', () => {
  const checkins = [...days(ME, ['2026-09-07'])];
  const m = buildModel({ pair: pair({ startWeek: '2026-09-14' }), checkins, meUid: ME, today: '2026-09-16' });
  assert.equal(m.debts.length, 0);
  assert.equal(m.weeks.find((w) => w.weekKey === '2026-09-07').counted, false);
  const warm = buildModel({ pair: pair({ startWeek: '2026-10-05' }), checkins: [], meUid: ME, today: '2026-10-01' });
  assert.equal(warm.isWarmup, true);
  assert.equal(warm.week.counted, false);
  assert.equal(warm.effectiveFrom, '2026-09-28', 'changes apply immediately during warm-up');
});

test('solo (no partner yet) never counts', () => {
  const p = pair({ members: [ME], startWeek: null });
  const m = buildModel({ pair: p, checkins: days(ME, ['2026-09-28']), meUid: ME, today: '2026-09-29' });
  assert.equal(m.hasPartner, false);
  assert.equal(m.week.counted, false);
  assert.equal(m.streak, 0);
  assert.equal(m.week.members[ME].count, 1);
  assert.equal(m.names.partner, 'Partner');
});

test('goal changes apply next week once the week counts', () => {
  const p = pair({ goals: { [ME]: [{ from: '2026-09-07', value: 3 }, { from: '2026-10-05', value: 5 }], [YOU]: [{ from: '2026-09-07', value: 2 }] } });
  const m = buildModel({ pair: p, checkins: [], meUid: ME, today: '2026-09-30' });
  assert.equal(m.effectiveFrom, '2026-10-05');
  assert.equal(m.goals.me, 3);
  assert.equal(m.nextGoals.me, 5);
  assert.equal(m.goals.partner, 2);
});

test('reward progress counts consecutive both-hit weeks since it was set', () => {
  const checkins = [
    ...days(ME, ['2026-09-07', '2026-09-08', '2026-09-09']), ...days(YOU, ['2026-09-07', '2026-09-08']),
    ...days(ME, ['2026-09-14', '2026-09-15', '2026-09-16']), ...days(YOU, ['2026-09-14', '2026-09-18']),
    ...days(ME, ['2026-09-21', '2026-09-23', '2026-09-27']), ...days(YOU, ['2026-09-22', '2026-09-24']),
  ];
  const reward = { text: 'Brunch', target: 3, fromWeek: '2026-09-14' };
  const m = buildModel({ pair: pair({ reward }), checkins, meUid: ME, today: '2026-09-29' });
  assert.equal(m.streak, 3);
  assert.equal(m.reward.progress, 2, 'only weeks since the reward was set');
  assert.equal(m.reward.unlocked, false);
  const all = [...checkins, ...days(ME, ['2026-09-28', '2026-09-29', '2026-09-30']), ...days(YOU, ['2026-09-28', '2026-09-29'])];
  const m2 = buildModel({ pair: pair({ reward }), checkins: all, meUid: ME, today: '2026-09-30' });
  assert.equal(m2.reward.progress, 3);
  assert.equal(m2.reward.unlocked, true);
});

test('pinky promise days: this week so far, plus last week early in the week', () => {
  const base = { pair: pair(), checkins: [], meUid: ME };
  const tue = promiseDays(buildModel({ ...base, today: '2026-09-29' }));
  assert.equal(tue[0], '2026-09-29');
  assert.ok(tue.includes('2026-09-21'));
  assert.equal(tue.length, 9);
  const thu = promiseDays(buildModel({ ...base, today: '2026-10-01' }));
  assert.deepEqual(thu, ['2026-10-01', '2026-09-30', '2026-09-29', '2026-09-28']);
});

test('memberStatus and celebration copy', () => {
  const checkins = [...days(ME, ['2026-09-28', '2026-09-29'])];
  const m = buildModel({ pair: pair(), checkins, meUid: ME, today: '2026-10-03' });
  assert.deepEqual(memberStatus(m.week, ME, m.today), { tone: 'warn', text: '1 to go' });
  assert.deepEqual(memberStatus(m.week, YOU, m.today), { tone: 'warn', text: '2 to go' });
  const late = buildModel({ pair: pair(), checkins, meUid: ME, today: '2026-10-04' });
  assert.equal(memberStatus(late.week, YOU, late.today).tone, 'bad', 'partner needs 2 with only Sunday left');
  const before = buildModel({ pair: pair(), checkins: days(ME, ['2026-09-28']), meUid: ME, today: '2026-09-29' }).week;
  const after = buildModel({ pair: pair(), checkins, meUid: ME, today: '2026-09-29' }).week;
  assert.equal(checkinCelebration(before, after, ME).title, 'Day 2 of 3');
  const done = buildModel({ pair: pair(), checkins: [...checkins, ci(ME, '2026-09-30')], meUid: ME, today: '2026-09-30' }).week;
  assert.equal(checkinCelebration(after, done, ME).title, 'Goal hit! 🎉');
});
