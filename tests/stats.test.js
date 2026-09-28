import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../js/core/logic.js';
import { buildStats, monthCalendar, shiftMonth, weekRecap } from '../js/core/stats.js';

const ME = 'me';
const YOU = 'you';
let n = 0;
const ci = (uid, dayKey, extra = {}) => ({
  id: `c${++n}`, uid, dayKey, clientAt: Date.parse(`${dayKey}T10:00:00`) + n, kind: 'photo', status: 'ok', hasPhoto: true, activity: 'gym', reactions: {}, ...extra,
});
const pair = {
  members: [ME, YOU],
  names: { [ME]: 'Kev', [YOU]: 'Alex' },
  goals: { [ME]: [{ from: '2026-09-07', value: 2 }], [YOU]: [{ from: '2026-09-07', value: 2 }] },
  stakes: [{ from: '2026-09-07', value: 'Dinner' }],
  weekStartsOn: 1,
  startWeek: '2026-09-07',
  paid: {},
};
const checkins = [
  ci(ME, '2026-09-07'), ci(ME, '2026-09-09', { activity: 'run' }), ci(YOU, '2026-09-07'), // wk1: me 2/2, you 1/2
  ci(ME, '2026-09-14', { activity: 'run' }), ci(ME, '2026-09-15', { activity: 'run' }), ci(YOU, '2026-09-14'), ci(YOU, '2026-09-16'), // wk2 both hit
  ci(ME, '2026-09-22', { status: 'pending', kind: 'promise', hasPhoto: false }), // pending doesn't count
  ci(YOU, '2026-10-01', { activity: 'yoga' }),
];
const model = buildModel({ pair, checkins, meUid: ME, today: '2026-10-01' });

test('shiftMonth', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('month calendar is aligned to the week start and marks workouts', () => {
  const cal = monthCalendar(model, '2026-09');
  assert.equal(cal.title, 'September 2026');
  assert.equal(cal.weeks[0][0].dayKey, '2026-08-31'); // Monday before Sep 1
  assert.equal(cal.weekdayLetters[0], 'M');
  const cell = cal.weeks.flat().find((c) => c.dayKey === '2026-09-07');
  assert.equal(cell.me && cell.partner, true);
  assert.equal(cal.weeks.flat().find((c) => c.dayKey === '2026-09-22').me, false, 'pending is not a workout');
  assert.deepEqual(cal.counts, { me: 4, partner: 3, together: 2 });
  const oct = monthCalendar(model, '2026-10');
  assert.equal(oct.weeks.flat().find((c) => c.dayKey === '2026-10-01').isToday, true);
});

test('member stats, head to head and stakes tally', () => {
  const s = buildStats(model);
  assert.equal(s.me.total, 4);
  assert.equal(s.partner.total, 4);
  assert.equal(s.leader, null);
  assert.equal(s.me.thisMonth, 0);
  assert.equal(s.partner.thisMonth, 1);
  assert.equal(s.me.favorite.id, 'run');
  assert.equal(s.me.hit, 2); // wk1, wk2 hit; wk3 missed (pending only)
  assert.equal(s.me.of, 3);
  assert.equal(s.me.hitRate, 67);
  assert.equal(s.partner.hit, 1);
  assert.equal(s.together, 2);
  assert.equal(s.stakes.wonCount, 2); // partner missed wk1 and wk3
  assert.equal(s.stakes.lostCount, 1); // I missed wk3
  assert.equal(s.me.avgPerWeek, Math.round((4 / 3) * 10) / 10);
});

test('week recap collects photos and debts', () => {
  const r = weekRecap(model, '2026-09-07');
  assert.equal(r.photos.length, 3);
  assert.equal(r.debts.length, 1);
  assert.equal(r.debts[0].debtor, YOU);
});
