// Body (History → Body): optional weight & body composition log. Private to you;
// with sharing on, your partner sees only your progress summary.
import { html, cx, raw } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { addDays, diffDays, monthDay, relativeDay } from '../../core/dates.js';
import {
  derive, formatWeight, hasComposition, sortEntries, summary, toDisplay, trendSeries, weightUnit,
} from '../../core/body.js';
import { emptyState } from '../components.js';

const RANGES = [
  { id: '1m', days: 31, label: '1M' },
  { id: '3m', days: 92, label: '3M' },
  { id: '1y', days: 366, label: '1Y' },
  { id: 'all', days: null, label: 'All' },
];

const pct = (part, whole) => (part != null && whole ? (part / whole) * 100 : null);
const METRICS = {
  weight: { label: 'Weight', value: (e) => e.weightKg, mass: true },
  fat: { label: 'Body fat', value: (e) => pct(e.fatKg, e.weightKg), suffix: '%' },
  muscle: { label: 'Muscle', value: (e) => e.muscleKg ?? null, mass: true },
  water: { label: 'Water', value: (e) => pct(e.waterKg, e.weightKg), suffix: '%' },
  bmi: { label: 'BMI', value: (e, body) => (body?.heightCm ? e.weightKg / (body.heightCm / 100) ** 2 : null) },
};

const fmtMetric = (metric, v, units) => (metric.mass ? formatWeight(v, units) : `${v.toFixed(1)}${metric.suffix || ''}`);
const axisValue = (metric, v, units) => (metric.mass ? toDisplay(v, units) : Math.round(v * 10) / 10);

function ago(days) {
  if (days == null) return '';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

function heroCard(s, units) {
  const d = s.derived;
  const g = s.goal;
  const chips = [
    s.changePrevKg != null ? `${formatWeight(s.changePrevKg, units, { sign: true })} vs ${monthDay(s.prev.dayKey)}` : null,
    s.changeStartKg != null ? `${formatWeight(s.changeStartKg, units, { sign: true })} since ${monthDay(s.first.dayKey)}` : null,
    s.ratePerWeekKg != null ? `${formatWeight(s.ratePerWeekKg, units, { sign: true })}/week` : null,
    s.trendKg != null ? `Trend ${formatWeight(s.trendKg, units)}` : null,
    d.bmi != null ? `BMI ${d.bmi.toFixed(1)} · ${d.bmiCategory}` : null,
  ].filter(Boolean);
  return html`<section class="card body-hero" data-key="body-hero">
    <div class="body-hero-top">
      <div>
        <p class="eyebrow">Latest · ${ago(s.daysAgo)}</p>
        <p class="body-big">${formatWeight(s.latest.weightKg, units, { unit: false })}<small> ${weightUnit(units)}</small></p>
      </div>
      <button type="button" class="icon-btn" data-action="openSheet" data-sheet="bodyProfile" aria-label="Height, goal and sharing">${icon('settings', { size: 22 })}</button>
    </div>
    ${chips.length ? html`<div class="body-chips">${chips.map((c) => html`<span class="pill muted">${c}</span>`)}</div>` : ''}
    ${g
      ? html`<div class="body-goal">
          <div class="body-goal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(g.progress * 100)}><i style=${`width:${Math.round(g.progress * 100)}%`}></i></div>
          <p class="small">${g.reached
            ? html`<b>Goal of ${formatWeight(g.goalKg, units)} reached 🎉</b>`
            : html`<b>${formatWeight(Math.abs(g.toGoKg), units)} to go</b> to ${formatWeight(g.goalKg, units)}${g.eta ? ` · at this pace around ${monthDay(g.eta)}` : ''}`}</p>
        </div>`
      : ''}
    ${s.daysAgo >= 14 ? html`<p class="muted small body-hint">Last logged ${ago(s.daysAgo)} · log anytime you like</p>` : ''}
    <button type="button" class="btn btn-primary btn-block" data-action="openWeight">${icon('plus', { size: 18 })} Log weight</button>
  </section>`;
}

function chart(entries, body, units, state, m) {
  const avail = Object.entries(METRICS).filter(([, mt]) => entries.filter((e) => mt.value(e, body) != null).length >= 2);
  if (!avail.length) return '';
  const metricId = avail.some(([id]) => id === state.ui.bodyMetric) ? state.ui.bodyMetric : avail[0][0];
  const metric = METRICS[metricId];
  const range = RANGES.find((r) => r.id === state.ui.bodyRange) || RANGES[1];
  const from = range.days ? addDays(m.today, -range.days) : null;
  const pts = entries.filter((e) => (!from || e.dayKey >= from) && metric.value(e, body) != null).map((e) => ({ dayKey: e.dayKey, v: metric.value(e, body) }));
  const trend = metricId === 'weight' && entries.length >= 3 ? trendSeries(entries).filter((t) => !from || t.dayKey >= from) : [];
  const goal = metricId === 'weight' && body?.goalKg ? body.goalKg : null;

  const W = 320;
  const H = 150;
  const L = 36;
  const R = 10;
  const T = 10;
  const Bm = 22;
  let plot = html`<p class="muted small chart-empty">No ${metric.label.toLowerCase()} entries in this range.</p>`;
  if (pts.length) {
    const vals = [...pts.map((p) => p.v), ...trend.map((t) => t.trendKg)];
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (goal != null && goal >= lo - 10 && goal <= hi + 10) {
      lo = Math.min(lo, goal);
      hi = Math.max(hi, goal);
    }
    const padV = Math.max((hi - lo) * 0.12, 0.5);
    lo -= padV;
    hi += padV;
    const d0 = pts[0].dayKey;
    const span = Math.max(1, diffDays(d0, pts[pts.length - 1].dayKey));
    const x = (dk) => (pts.length === 1 ? (L + W - R) / 2 : L + (diffDays(d0, dk) / span) * (W - L - R));
    const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - Bm);
    const line = (arr, get) => arr.map((p, i) => `${i ? 'L' : 'M'}${x(p.dayKey).toFixed(1)},${y(get(p)).toFixed(1)}`).join(' ');
    const trendIn = trend.filter((t) => t.dayKey >= d0);
    const path = trendIn.length >= 2 ? line(trendIn, (t) => t.trendKg) : pts.length >= 2 ? line(pts, (p) => p.v) : '';
    const label = (v) => String(axisValue(metric, v, units));
    const svg = `<svg class="body-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${metric.label} chart">
      <line class="grid" x1="${L}" x2="${W - R}" y1="${y(hi - padV)}" y2="${y(hi - padV)}"/>
      <line class="grid" x1="${L}" x2="${W - R}" y1="${y(lo + padV)}" y2="${y(lo + padV)}"/>
      <text class="axis" x="${L - 6}" y="${y(hi - padV) + 4}" text-anchor="end">${label(hi - padV)}</text>
      <text class="axis" x="${L - 6}" y="${y(lo + padV) + 4}" text-anchor="end">${label(lo + padV)}</text>
      ${goal != null && goal >= lo && goal <= hi ? `<line class="goal" x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}"/><text class="axis goal-label" x="${W - R}" y="${y(goal) - 4}" text-anchor="end">Goal</text>` : ''}
      ${path ? `<path class="${trendIn.length >= 2 ? 'trend' : 'link'}" d="${path}"/>` : ''}
      ${pts.map((p) => `<circle class="pt" cx="${x(p.dayKey).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.2"/>`).join('')}
      <text class="axis" x="${L}" y="${H - 5}">${monthDay(pts[0].dayKey)}</text>
      ${pts.length > 1 ? `<text class="axis" x="${W - R}" y="${H - 5}" text-anchor="end">${monthDay(pts[pts.length - 1].dayKey)}</text>` : ''}
    </svg>`;
    plot = raw(svg);
  }
  return html`<section class="card body-chart-card" data-key="body-chart">
    <div class="chips body-metrics">
      ${avail.length > 1 ? avail.map(([id, mt]) => html`<button type="button" class=${cx('chip-btn', { on: id === metricId })} data-action="bodyMetric" data-value=${id}>${mt.label}</button>`) : html`<b>${metric.label}</b>`}
    </div>
    ${plot}
    <div class="seg compact body-range" role="radiogroup" aria-label="Range">
      ${RANGES.map((r) => html`<label><input type="radio" name="brange" value=${r.id} data-change="bodyRange" ${r.id === range.id ? raw('checked') : ''}><span>${r.label}</span></label>`)}
    </div>
    ${metricId === 'weight' && trend.length ? html`<p class="muted small chart-legend"><i class="dot me"></i> weigh-ins · line = smoothed trend</p>` : ''}
  </section>`;
}

function delta(cur, prev, fmt) {
  if (cur == null || prev == null) return '';
  const d = Math.round((cur - prev) * 10) / 10;
  if (!d) return html`<small class="tile-delta">no change</small>`;
  return html`<small class="tile-delta">${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}</small>`;
}

function compositionCard(s, body, units) {
  const c = s.composition;
  if (!c) return '';
  const d = derive(c, body, c.dayKey);
  const p = s.prevComposition;
  const pd = p ? derive(p, body, p.dayKey) : null;
  const kg = (v) => formatWeight(v, units);
  const tiles = [];
  if (c.muscleKg != null) tiles.push(html`<div class="tile"><span>Skeletal muscle</span><b>${kg(c.muscleKg)}</b><small>${d.musclePct}% of weight</small>${delta(c.muscleKg, p?.muscleKg, kg)}</div>`);
  if (c.fatKg != null) tiles.push(html`<div class="tile"><span>Fat mass</span><b>${kg(c.fatKg)}</b><small>${d.fatPct}% body fat${d.fatCategory ? ` · ${d.fatCategory}` : ''}</small>${delta(d.fatPct, pd?.fatPct, (v) => `${v} pts`)}</div>`);
  if (c.waterKg != null) tiles.push(html`<div class="tile"><span>Body water</span><b>${kg(c.waterKg)}</b><small>${d.waterPct}% of weight</small>${delta(c.waterKg, p?.waterKg, kg)}</div>`);
  if (d.leanKg != null) tiles.push(html`<div class="tile"><span>Lean mass</span><b>${kg(d.leanKg)}</b><small>everything but fat</small>${delta(d.leanKg, pd?.leanKg, kg)}</div>`);
  if (d.bmi != null) tiles.push(html`<div class="tile"><span>BMI</span><b>${d.bmi.toFixed(1)}</b><small>${d.bmiCategory}</small></div>`);
  if (d.bmr != null) tiles.push(html`<div class="tile"><span>BMR</span><b>${d.bmr.toLocaleString('en-US')}</b><small>kcal/day at rest</small></div>`);
  return html`<section class="card" data-key="body-comp">
    <div class="card-title-row"><h2 class="card-title">Body composition</h2><span class="muted small">${monthDay(c.dayKey)}</span></div>
    <div class="stat-tiles body-tiles">${tiles}</div>
    ${!body?.heightCm ? html`<p class="muted small body-tip">Add your height to see BMI. <button type="button" class="link-btn" data-action="openSheet" data-sheet="bodyProfile">Add height</button></p>` : ''}
  </section>`;
}

function partnerCard(state, m, units) {
  const p = m.hasPartner ? state.pair?.bodyShare?.[m.partnerUid] : null;
  if (!p) return '';
  const bits = [
    p.deltaKg ? `${formatWeight(p.deltaKg, units, { sign: true })} since ${monthDay(p.since)}` : `No change since ${monthDay(p.since)}`,
    p.ratePerWeekKg != null ? `${formatWeight(p.ratePerWeekKg, units, { sign: true })}/week` : null,
  ].filter(Boolean);
  return html`<section class="card body-partner" data-who="partner" data-key="body-partner">
    <b>${m.names.partner}'s progress</b><span>${bits.join(' · ')}</span>
  </section>`;
}

function entryList(entries, units, state, m) {
  const desc = entries.slice().reverse();
  const shown = state.ui.bodyShowAll ? desc : desc.slice(0, 20);
  return html`<section class="card list-card" data-key="body-list">
    <h2 class="card-title">Weigh-ins</h2>
    ${shown.map((e, i) => {
      const prev = desc[i + 1];
      const d = derive(e);
      const comp = [d.fatPct != null ? `Fat ${d.fatPct}%` : null, e.muscleKg != null ? `Muscle ${formatWeight(e.muscleKg, units)}` : null, d.waterPct != null ? `Water ${d.waterPct}%` : null].filter(Boolean);
      return html`<button type="button" class="list-row body-row" data-action="openWeight" data-id=${e.id} data-key=${`w-${e.id}`}>
        <span class="list-label">${relativeDay(e.dayKey, m.today)}${comp.length ? html`<small>${comp.join(' · ')}</small>` : ''}</span>
        <span class="list-value">${formatWeight(e.weightKg, units)}${prev ? html`<small>${formatWeight(e.weightKg - prev.weightKg, units, { sign: true })}</small>` : ''}</span>
      </button>`;
    })}
    ${desc.length > shown.length ? html`<button type="button" class="btn btn-ghost btn-block" data-action="bodyShowAll">Show all ${desc.length}</button>` : ''}
  </section>`;
}

export function render(state, m) {
  const body = state.body || {};
  const units = body.units || 'metric';
  const entries = sortEntries(state.weights);
  const s = summary(entries, body, m.today);
  const privacy = html`<p class="footnote body-privacy">${icon('lock', { size: 13 })} Only you can see your weigh-ins${body.share && m.hasPartner ? `. ${m.names.partner} sees your progress summary.` : '.'}</p>`;
  if (!s) {
    return html`<div data-key="body-empty">
      ${emptyState(
        '⚖️',
        'Track your weight (optional)',
        'Log whenever you like – every day, every few weeks, or not at all. Add body composition from a smart scale or gym machine if you have it.',
        html`<button type="button" class="btn btn-primary" data-action="openWeight">${icon('plus', { size: 18 })} Log weight</button>
          <button type="button" class="btn btn-ghost" data-action="openSheet" data-sheet="bodyProfile">Height, units & goal</button>`,
      )}
      ${partnerCard(state, m, units)}
      ${privacy}
    </div>`;
  }
  return html`${heroCard(s, units)}
    ${chart(entries, body, units, state, m)}
    ${compositionCard(s, body, units)}
    ${!entries.some(hasComposition) ? html`<p class="muted small body-tip" data-key="body-comp-tip">Got a smart scale or InBody reading? Add skeletal muscle, fat mass and body water under <b>Body composition</b> when you log.</p>` : ''}
    ${partnerCard(state, m, units)}
    ${entryList(entries, units, state, m)}
    ${privacy}`;
}

export const actions = {
  openWeight(ctx, { id }) {
    const s = ctx.store.get();
    const entries = sortEntries(s.weights);
    const entry = id ? entries.find((e) => e.id === id) : null;
    const last = entries[entries.length - 1];
    ctx.openSheet({ type: 'weight', id: entry ? entry.id : null, showComp: hasComposition(entry || last), draft: null, error: '' });
  },
  bodyMetric(ctx, { value }) {
    ctx.store.ui({ bodyMetric: value });
  },
  bodyRange(ctx, data, ev) {
    ctx.store.ui({ bodyRange: ev.target.value });
  },
  bodyShowAll(ctx) {
    ctx.store.ui({ bodyShowAll: true });
  },
};
