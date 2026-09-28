// Date helpers. Days are local calendar dates stored as 'YYYY-MM-DD' strings ("day keys").
// A week is identified by the day key of its first day ("week key").

const DAY_MS = 86400000;
let offsetMs = 0; // demo-mode time travel

export function setClockOffsetDays(days) {
  offsetMs = (Number(days) || 0) * DAY_MS;
}
export function getClockOffsetDays() {
  return Math.round(offsetMs / DAY_MS);
}
export function now() {
  return Date.now() + offsetMs;
}

const pad = (n) => String(n).padStart(2, '0');

export function toDayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Noon avoids daylight-saving edge cases when adding days.
export function fromDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function isDayKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key);
}

export function todayKey() {
  return toDayKey(new Date(now()));
}

export function addDays(key, n) {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + n);
  return toDayKey(d);
}

export function diffDays(fromKey, toKey) {
  return Math.round((fromDayKey(toKey) - fromDayKey(fromKey)) / DAY_MS);
}

// weekStartsOn: 0 = Sunday, 1 = Monday
export function weekStartKey(key, weekStartsOn = 1) {
  const d = fromDayKey(key);
  const back = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - back);
  return toDayKey(d);
}

export const nextWeek = (weekKey) => addDays(weekKey, 7);
export const prevWeek = (weekKey) => addDays(weekKey, -7);

export function weekDays(weekKey) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekKey, i));
}

// Index of a day inside its week (0..6)
export function dayIndexInWeek(key, weekStartsOn = 1) {
  return diffDays(weekStartKey(key, weekStartsOn), key);
}

const fmt = (opts) => new Intl.DateTimeFormat('en-US', opts);
const fDow = fmt({ weekday: 'short' });
const fMonthDay = fmt({ month: 'short', day: 'numeric' });
const fFull = fmt({ weekday: 'long', month: 'long', day: 'numeric' });
const fTime = fmt({ hour: 'numeric', minute: '2-digit' });

export const dowShort = (key) => fDow.format(fromDayKey(key)); // "Tue"
export const dowLetter = (key) => dowShort(key).charAt(0); // "T"
export const monthDay = (key) => fMonthDay.format(fromDayKey(key)); // "Sep 29"
export const fullDay = (key) => fFull.format(fromDayKey(key)); // "Tuesday, September 29"
export const timeOfDay = (ms) => fTime.format(new Date(ms)); // "6:42 PM"

export function weekRange(weekKey) {
  const start = fromDayKey(weekKey);
  const end = fromDayKey(addDays(weekKey, 6));
  const sameMonth = start.getMonth() === end.getMonth();
  const a = fMonthDay.format(start);
  const b = sameMonth ? String(end.getDate()) : fMonthDay.format(end);
  return `${a} – ${b}`;
}

// "Today", "Yesterday", "Tue", "Sep 12"
export function relativeDay(key, today = todayKey()) {
  const diff = diffDays(key, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return dowShort(key);
  return monthDay(key);
}

// "just now", "5m ago", "3h ago", then falls back to relativeDay
export function timeAgo(ms, current = now()) {
  const s = Math.max(0, Math.round((current - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 12) return `${h}h ago`;
  return relativeDay(toDayKey(new Date(ms)), toDayKey(new Date(current)));
}
