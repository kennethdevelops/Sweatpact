import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cmToFtIn, derive, formatHeight, formatWeight, ftInToCm, kgToLb, lbToKg, shareSummary, summary, trendSeries, validateEntry, validateProfile,
  weeklyRate,
} from '../js/core/body.js';
import { addDays } from '../js/core/dates.js';

const T = '2026-09-28';
const e = (dayKey, weightKg, extra = {}) => ({ dayKey, weightKg, ...extra });

test('unit conversions round-trip', () => {
  assert.equal(Math.round(kgToLb(100) * 10) / 10, 220.5);
  assert.ok(Math.abs(lbToKg(kgToLb(72.4)) - 72.4) < 1e-9);
  assert.deepEqual(cmToFtIn(178), { ft: 5, in: 10 });
  assert.equal(Math.round(ftInToCm(5, 10)), 178);
  assert.equal(formatWeight(72.44, 'metric'), '72.4 kg');
  assert.equal(formatWeight(72.4, 'imperial'), '159.6 lb');
  assert.equal(formatWeight(-1.23, 'metric', { sign: true }), '−1.2 kg');
  assert.equal(formatWeight(0.4, 'metric', { sign: true }), '+0.4 kg');
  assert.equal(formatHeight(178, 'imperial'), '5′10″');
  assert.equal(formatHeight(178, 'metric'), '178 cm');
});

test('derive: BMI needs height; composition percentages; both BMR formulas', () => {
  assert.equal(derive(e(T, 80)).bmi, null);
  const d = derive(e(T, 80, { fatKg: 20, muscleKg: 36, waterKg: 44 }), { heightCm: 180 });
  assert.equal(d.bmi, 24.7);
  assert.equal(d.bmiCategory, 'Healthy');
  assert.equal(d.fatPct, 25);
  assert.equal(d.fatCategory, null, 'no sex, no fat band');
  assert.equal(d.leanKg, 60);
  assert.equal(d.musclePct, 45);
  assert.equal(d.waterPct, 55);
  assert.equal(d.bmr, Math.round(370 + 21.6 * 60));
  assert.equal(d.bmrMethod, 'katch');

  const m = derive(e(T, 80), { heightCm: 180, sex: 'm', birthYear: 1996 });
  assert.equal(m.bmr, Math.round(10 * 80 + 6.25 * 180 - 5 * 30 + 5));
  assert.equal(m.bmrMethod, 'mifflin');
  assert.equal(derive(e(T, 80), { heightCm: 180 }).bmr, null, 'no sex/age and no fat mass: no BMR');
  assert.equal(derive(e(T, 80, { fatKg: 18 }), { sex: 'm' }).fatCategory, 'Above range');
});

test('trend: smooths daily noise, catches up after long gaps', () => {
  const daily = [80, 81, 79, 80.5, 79.5].map((w, i) => e(addDays(T, i), w));
  const t = trendSeries(daily);
  assert.equal(t[0].trendKg, 80);
  assert.ok(Math.abs(t[4].trendKg - 80) < 0.3, 'daily noise mostly smoothed out');

  const sparse = trendSeries([e(T, 80), e(addDays(T, 30), 76)]);
  assert.ok(sparse[1].trendKg < 76.5, `a month later the trend follows the new weight (${sparse[1].trendKg})`);
});

test('weekly rate needs two entries at least 10 days apart', () => {
  assert.equal(weeklyRate([e(T, 80)]), null);
  assert.equal(weeklyRate([e(T, 80), e(addDays(T, 5), 79)]), null);
  assert.equal(weeklyRate([e(T, 80), e(addDays(T, 14), 79)]), -0.5);
});

test('summary with a single entry has nothing to compare, and does not crash', () => {
  const s = summary([e(T, 80)], { goalKg: 75 }, addDays(T, 3));
  assert.equal(s.count, 1);
  assert.equal(s.daysAgo, 3);
  assert.equal(s.changePrevKg, null);
  assert.equal(s.changeStartKg, null);
  assert.equal(s.trendKg, null);
  assert.equal(s.ratePerWeekKg, null);
  assert.equal(s.goal.eta, null);
  assert.equal(s.goal.toGoKg, -5);
  assert.equal(s.composition, null);
  assert.equal(summary([], {}, T), null);
});

test('summary: changes, goal progress and ETA', () => {
  const list = [e(T, 80), e(addDays(T, 7), 79.5, { fatKg: 20 }), e(addDays(T, 21), 78, { fatKg: 19 })];
  const s = summary(list, { goalKg: 76 }, addDays(T, 25));
  assert.equal(s.changePrevKg, -1.5);
  assert.equal(s.changeStartKg, -2);
  assert.ok(s.ratePerWeekKg < 0);
  assert.equal(s.goal.progress, 0.5);
  assert.ok(s.goal.eta > addDays(T, 21));
  assert.equal(s.composition.fatKg, 19);
  assert.equal(s.prevComposition.fatKg, 20);
  // Moving away from the goal: no ETA
  assert.equal(summary(list, { goalKg: 85 }, T).goal.eta, null);
  assert.equal(summary(list, { goalKg: 79 }, T).goal.reached, true);
});

test('share summary never includes an absolute weight', () => {
  const s = shareSummary([e(T, 80), e(addDays(T, 14), 79)]);
  assert.deepEqual(Object.keys(s).sort(), ['count', 'deltaKg', 'ratePerWeekKg', 'since']);
  assert.equal(s.deltaKg, -1);
  assert.equal(shareSummary([]), null);
});

test('validateEntry', () => {
  assert.deepEqual(validateEntry({ dayKey: T, weight: '72,4' }).entry, { dayKey: T, weightKg: 72.4 });
  assert.equal(validateEntry({ dayKey: T, weight: '160' }, 'imperial').entry.weightKg, 72.6);
  assert.match(validateEntry({ dayKey: T, weight: '' }).error, /Enter your weight/);
  assert.match(validateEntry({ dayKey: T, weight: 'abc' }).error, /number/);
  assert.match(validateEntry({ dayKey: T, weight: '5' }).error, /between/);
  assert.match(validateEntry({ dayKey: addDays(T, 1), weight: '70' }, 'metric', T).error, /hasn't happened/);
  assert.match(validateEntry({ dayKey: T, weight: '70', fat: '80' }).error, /less than your weight/);
  assert.match(validateEntry({ dayKey: T, weight: '70', fat: '30', water: '45' }).error, /can’t be more/);
  const ok = validateEntry({ dayKey: T, weight: '70', muscle: '31.5', fat: '', water: '40', note: ' after run ' }).entry;
  assert.deepEqual(ok, { dayKey: T, weightKg: 70, muscleKg: 31.5, waterKg: 40, note: 'after run' });
});

test('validateProfile', () => {
  const b = validateProfile({ units: 'metric', heightCm: '178', sex: 'm', birthYear: '1990', goal: '75', share: 'on' }).body;
  assert.deepEqual(b, { units: 'metric', heightCm: 178, sex: 'm', birthYear: 1990, goalKg: 75, share: true });
  const i = validateProfile({ units: 'imperial', heightFt: '5', heightIn: '10', goal: '165' }).body;
  assert.equal(Math.round(i.heightCm), 178);
  assert.equal(i.goalKg, 74.8);
  assert.equal(i.share, false);
  assert.equal(validateProfile({ units: 'metric' }).body.heightCm, null, 'everything is optional');
  assert.match(validateProfile({ units: 'metric', heightCm: '20' }).error, /Height/);
});
