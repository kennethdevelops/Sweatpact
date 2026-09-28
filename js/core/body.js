// Weight & body composition: unit conversions, derived metrics (BMI, body fat %, BMR),
// a trend line that copes with irregular logging, and progress summaries.
// Pure functions, no DOM. Everything is stored in kg / cm; units only matter for display.
import { addDays, diffDays } from './dates.js';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const MIN_KG = 20;
export const MAX_KG = 400;
export const COMPOSITION = ['muscleKg', 'fatKg', 'waterKg'];

export const kgToLb = (kg) => kg / KG_PER_LB;
export const lbToKg = (lb) => lb * KG_PER_LB;
export const round1 = (n) => Math.round(n * 10) / 10;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function cmToFtIn(cm) {
  const totalIn = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(totalIn / 12), in: totalIn % 12 };
}
export const ftInToCm = (ft, inches = 0) => ((Number(ft) || 0) * 12 + (Number(inches) || 0)) * CM_PER_IN;

export const isImperial = (units) => units === 'imperial';
export const weightUnit = (units) => (isImperial(units) ? 'lb' : 'kg');
/** kg -> number in the display unit, 1 decimal. */
export const toDisplay = (kg, units) => round1(isImperial(units) ? kgToLb(kg) : kg);
/** display-unit number -> kg */
export const fromDisplay = (v, units) => (isImperial(units) ? lbToKg(v) : v);

/** "72.4 kg", "159.6 lb"; sign: true gives "+0.4 kg" / "−1.2 kg". */
export function formatWeight(kg, units, { sign = false, unit = true } = {}) {
  if (!isNum(kg)) return '–';
  const v = toDisplay(kg, units);
  const abs = Math.abs(v).toFixed(1);
  const s = sign ? (v > 0 ? `+${abs}` : v < 0 ? `−${abs}` : abs) : v.toFixed(1);
  return unit ? `${s} ${weightUnit(units)}` : s;
}

export function formatHeight(cm, units) {
  if (!isNum(cm)) return '–';
  if (!isImperial(units)) return `${Math.round(cm)} cm`;
  const { ft, in: inches } = cmToFtIn(cm);
  return `${ft}′${inches}″`;
}

/** Parse user input like "72,4" or " 72.4 ". Empty -> null, garbage -> NaN. */
export function parseNumber(v) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function bmiCategory(bmi) {
  if (!isNum(bmi)) return null;
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Healthy';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

// Rough body fat % bands (adults), only shown when sex is set.
const FAT_BANDS = { m: [8, 20, 25], f: [21, 33, 39] };
export function fatCategory(pct, sex) {
  const b = FAT_BANDS[sex];
  if (!b || !isNum(pct)) return null;
  if (pct < b[0]) return 'Low';
  if (pct < b[1]) return 'Healthy';
  if (pct < b[2]) return 'Above range';
  return 'High';
}

export function ageFrom(birthYear, today) {
  if (!isNum(birthYear)) return null;
  const age = Number(today.slice(0, 4)) - birthYear;
  return age > 0 && age < 120 ? age : null;
}

/**
 * Metrics derived from one entry + the profile.
 * BMR: Katch-McArdle when fat mass is known (needs no sex/age), else Mifflin-St Jeor.
 */
export function derive(entry, body = {}, today = entry?.dayKey) {
  const w = entry?.weightKg;
  const out = { bmi: null, bmiCategory: null, fatPct: null, fatCategory: null, leanKg: null, musclePct: null, waterPct: null, bmr: null, bmrMethod: null };
  if (!isNum(w) || w <= 0) return out;
  const h = body?.heightCm;
  if (isNum(h) && h > 0) {
    out.bmi = round1(w / (h / 100) ** 2);
    out.bmiCategory = bmiCategory(out.bmi);
  }
  if (isNum(entry.fatKg)) {
    out.fatPct = round1((entry.fatKg / w) * 100);
    out.fatCategory = fatCategory(out.fatPct, body?.sex);
    out.leanKg = round1(w - entry.fatKg);
  }
  if (isNum(entry.muscleKg)) out.musclePct = round1((entry.muscleKg / w) * 100);
  if (isNum(entry.waterKg)) out.waterPct = round1((entry.waterKg / w) * 100);
  const age = ageFrom(body?.birthYear, today || '');
  if (out.leanKg != null) {
    out.bmr = Math.round(370 + 21.6 * out.leanKg);
    out.bmrMethod = 'katch';
  } else if (isNum(h) && age && (body?.sex === 'm' || body?.sex === 'f')) {
    out.bmr = Math.round(10 * w + 6.25 * h - 5 * age + (body.sex === 'm' ? 5 : -161));
    out.bmrMethod = 'mifflin';
  }
  return out;
}

export const hasComposition = (e) => COMPOSITION.some((k) => isNum(e?.[k]));
export const sortEntries = (entries) => (entries || []).filter((e) => isNum(e?.weightKg)).slice().sort((a, b) => (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0));

/**
 * Smoothed weight. Each entry pulls the trend by α = 1 − 0.9^gapDays, so daily logs are
 * smoothed like a 10% moving average while an entry after weeks away mostly replaces it.
 */
export function trendSeries(entries) {
  const sorted = sortEntries(entries);
  let trend = null;
  let prev = null;
  return sorted.map((e) => {
    if (trend == null) trend = e.weightKg;
    else {
      const gap = Math.max(1, diffDays(prev, e.dayKey));
      trend += (1 - 0.9 ** gap) * (e.weightKg - trend);
    }
    prev = e.dayKey;
    return { dayKey: e.dayKey, weightKg: e.weightKg, trendKg: round1(trend) };
  });
}

/** Least-squares slope in kg/week, or null without ≥2 entries spanning ≥10 days. */
export function weeklyRate(entries, { windowDays = 90, minSpan = 10 } = {}) {
  const sorted = sortEntries(entries);
  if (sorted.length < 2) return null;
  const last = sorted[sorted.length - 1].dayKey;
  const pts = sorted.filter((e) => diffDays(e.dayKey, last) <= windowDays).map((e) => [diffDays(last, e.dayKey), e.weightKg]);
  if (pts.length < 2 || -pts[0][0] < minSpan) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of pts) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den ? Math.round((num / den) * 700) / 100 : null;
}

/** Everything the Body screen shows. Returns null with no entries; every field may be null. */
export function summary(entries, body = {}, today) {
  const sorted = sortEntries(entries);
  if (!sorted.length) return null;
  const latest = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const first = sorted[0];
  const trend = sorted.length >= 3 ? trendSeries(sorted).pop().trendKg : null;
  const rate = weeklyRate(sorted);
  const comps = sorted.filter(hasComposition);

  let goal = null;
  const g = body?.goalKg;
  if (isNum(g)) {
    const toGo = round1(g - latest.weightKg);
    const total = g - first.weightKg;
    const reached = total === 0 ? true : total < 0 ? latest.weightKg <= g : latest.weightKg >= g;
    const progress = reached ? 1 : total ? Math.min(1, Math.max(0, (latest.weightKg - first.weightKg) / total)) : 0;
    let eta = null;
    if (!reached && rate && Math.sign(rate) === Math.sign(toGo)) {
      const days = Math.round((toGo / rate) * 7);
      if (days > 0 && days <= 3 * 365) eta = addDays(latest.dayKey, days);
    }
    goal = { goalKg: g, toGoKg: toGo, progress, reached, eta };
  }

  return {
    count: sorted.length,
    latest,
    daysAgo: today ? diffDays(latest.dayKey, today) : null,
    prev,
    changePrevKg: prev ? round1(latest.weightKg - prev.weightKg) : null,
    first,
    changeStartKg: prev ? round1(latest.weightKg - first.weightKg) : null,
    trendKg: trend,
    ratePerWeekKg: rate,
    goal,
    composition: comps.length ? comps[comps.length - 1] : null,
    prevComposition: comps.length > 1 ? comps[comps.length - 2] : null,
    derived: derive(latest, body, today),
  };
}

/** The only thing a partner can see (when sharing is on): no absolute weights. */
export function shareSummary(entries) {
  const s = summary(entries, {});
  if (!s) return null;
  return { deltaKg: s.changeStartKg ?? 0, ratePerWeekKg: s.ratePerWeekKg, count: s.count, since: s.first.dayKey };
}

/**
 * Validate a form (values in the display unit). Returns { entry } with kg values, or { error }.
 * Composition fields are optional; empty means "not measured".
 */
export function validateEntry(values, units = 'metric', today = null) {
  const dayKey = String(values.dayKey || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return { error: 'Pick a date.' };
  if (today && dayKey > today) return { error: "That date hasn't happened yet." };
  const w = parseNumber(values.weight);
  if (w == null) return { error: 'Enter your weight.' };
  if (Number.isNaN(w)) return { error: "That weight doesn't look like a number." };
  const weightKg = round1(fromDisplay(w, units));
  if (weightKg < MIN_KG || weightKg > MAX_KG) return { error: `Weight should be between ${formatWeight(MIN_KG, units)} and ${formatWeight(MAX_KG, units)}.` };
  const entry = { dayKey, weightKg };
  const labels = { muscleKg: 'Skeletal muscle', fatKg: 'Fat mass', waterKg: 'Body water' };
  const fields = { muscleKg: values.muscle, fatKg: values.fat, waterKg: values.water };
  for (const [k, raw] of Object.entries(fields)) {
    const n = parseNumber(raw);
    if (n == null) continue;
    if (Number.isNaN(n) || n <= 0) return { error: `${labels[k]} doesn't look right.` };
    const kg = round1(fromDisplay(n, units));
    if (kg >= entry.weightKg) return { error: `${labels[k]} must be less than your weight.` };
    entry[k] = kg;
  }
  if (isNum(entry.fatKg) && isNum(entry.waterKg) && entry.fatKg + entry.waterKg > entry.weightKg) {
    return { error: 'Fat mass plus body water can’t be more than your weight.' };
  }
  const note = String(values.note || '').trim();
  if (note) entry.note = note;
  return { entry };
}

/** Clean a body profile patch from a form. Returns { body } or { error }. */
export function validateProfile(values) {
  const out = { units: isImperial(values.units) ? 'imperial' : 'metric' };
  const u = out.units;
  let heightCm = null;
  if (isImperial(u)) {
    const ft = parseNumber(values.heightFt);
    const inch = parseNumber(values.heightIn);
    if (ft != null || inch != null) {
      if (Number.isNaN(ft) || Number.isNaN(inch)) return { error: "That height doesn't look right." };
      heightCm = ftInToCm(ft || 0, inch || 0);
    }
  } else {
    const cm = parseNumber(values.heightCm);
    if (Number.isNaN(cm)) return { error: "That height doesn't look right." };
    heightCm = cm;
  }
  if (heightCm != null && (heightCm < 100 || heightCm > 250)) return { error: 'Height should be between 100 and 250 cm (3′3″ – 8′2″).' };
  out.heightCm = heightCm == null ? null : round1(heightCm);
  out.sex = values.sex === 'm' || values.sex === 'f' ? values.sex : null;
  const by = parseNumber(values.birthYear);
  if (Number.isNaN(by) || (by != null && (by < 1900 || by > 2100))) return { error: "That birth year doesn't look right." };
  out.birthYear = by == null ? null : Math.round(by);
  const g = parseNumber(values.goal);
  if (Number.isNaN(g)) return { error: "That goal weight doesn't look right." };
  const goalKg = g == null ? null : round1(fromDisplay(g, u));
  if (goalKg != null && (goalKg < MIN_KG || goalKg > MAX_KG)) return { error: 'That goal weight looks off.' };
  out.goalKg = goalKg;
  out.share = values.share === 'on' || values.share === true;
  return { body: out };
}
