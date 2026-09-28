import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, diffDays, dayIndexInWeek, fromDayKey, relativeDay, toDayKey, weekDays, weekRange, weekStartKey,
  setClockOffsetDays, todayKey, getClockOffsetDays,
} from '../js/core/dates.js';

test('day keys round-trip', () => {
  assert.equal(toDayKey(fromDayKey('2026-09-28')), '2026-09-28');
  assert.equal(toDayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('addDays crosses month, year and DST boundaries', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  // US DST changes (only meaningful when TZ has DST, harmless otherwise)
  assert.equal(addDays('2026-03-07', 1), '2026-03-08');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(diffDays('2026-03-01', '2026-04-01'), 31);
  assert.equal(diffDays('2026-10-31', '2026-11-07'), 7);
});

test('week starts on Monday or Sunday', () => {
  // 2026-09-28 is a Monday
  assert.equal(weekStartKey('2026-09-28', 1), '2026-09-28');
  assert.equal(weekStartKey('2026-10-04', 1), '2026-09-28'); // Sunday belongs to Monday week
  assert.equal(weekStartKey('2026-10-04', 0), '2026-10-04'); // Sunday starts a Sunday week
  assert.equal(weekStartKey('2026-10-03', 0), '2026-09-27');
  assert.equal(dayIndexInWeek('2026-09-30', 1), 2);
  assert.deepEqual(weekDays('2026-09-28'), [
    '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  ]);
});

test('formatting', () => {
  assert.equal(weekRange('2026-09-28'), 'Sep 28 – Oct 4');
  assert.equal(weekRange('2026-10-05'), 'Oct 5 – 11');
  assert.equal(relativeDay('2026-09-28', '2026-09-28'), 'Today');
  assert.equal(relativeDay('2026-09-27', '2026-09-28'), 'Yesterday');
  assert.equal(relativeDay('2026-09-25', '2026-09-28'), 'Fri');
  assert.equal(relativeDay('2026-09-01', '2026-09-28'), 'Sep 1');
});

test('clock offset for demo time travel', () => {
  const real = todayKey();
  setClockOffsetDays(7);
  assert.equal(getClockOffsetDays(), 7);
  assert.equal(todayKey(), addDays(real, 7));
  setClockOffsetDays(0);
  assert.equal(todayKey(), real);
});
