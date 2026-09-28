// Shared UI building blocks.
import { html, raw, cx } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { photoCache } from '../core/photo-cache.js';
import { dataUrlToBlob } from '../core/photos.js';
import { dowLetter, relativeDay, timeAgo, monthDay } from '../core/dates.js';
import { memberStatus } from '../core/logic.js';
import { ACTIVITIES, REACTIONS, APP_NAME } from '../config.js';

export const who = (m, uid) => (uid === m.meUid ? 'me' : 'partner');
export const nameOf = (m, uid) => m.nameOf(uid);
export const initial = (name) => (String(name || '?').trim().charAt(0) || '?').toUpperCase();
export const activityOf = (id) => ACTIVITIES.find((a) => a.id === id) || null;

export function activityText(id) {
  const a = activityOf(id);
  return a ? `${a.emoji} ${a.label}` : '';
}

export function logo(size = 56) {
  return raw(`<svg class="logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF7A45"/><stop offset="1" stop-color="#FF3D6E"/></linearGradient></defs>
    <rect width="64" height="64" rx="18" fill="url(#lg)"/>
    <circle cx="25" cy="32" r="11" fill="none" stroke="#fff" stroke-width="5.5"/>
    <circle cx="39" cy="32" r="11" fill="none" stroke="#FFE3D1" stroke-width="5.5"/>
    <path d="M28.76 21.66 A11 11 0 0 1 34.53 26.5" fill="none" stroke="#fff" stroke-width="5.5"/>
  </svg>`);
}

// Profile pictures arrive as JPEG data URLs; render them through short blob: URLs instead.
const avatarUrls = new Map(); // data URL -> blob: URL
export function avatarUrl(dataUrl) {
  if (!dataUrl) return null;
  let url = avatarUrls.get(dataUrl);
  if (!url) {
    try {
      url = URL.createObjectURL(dataUrlToBlob(dataUrl));
    } catch {
      return null;
    }
    if (avatarUrls.size > 8) {
      const [oldest, oldUrl] = avatarUrls.entries().next().value;
      URL.revokeObjectURL(oldUrl);
      avatarUrls.delete(oldest);
    }
    avatarUrls.set(dataUrl, url);
  }
  return url;
}

function avatarFace(name, src) {
  const url = avatarUrl(src);
  return url ? html`<img src=${url} alt="" decoding="async">` : initial(name);
}

/** Round profile picture, falling back to the initial. `src` is the stored data URL (m.avatarOf(uid)). */
export function avatar(name, whoKey, size = '', src = null) {
  return html`<span class=${cx('avatar', size, { 'has-img': avatarUrl(src) })} data-who=${whoKey} aria-hidden="true">${avatarFace(name, src)}</span>`;
}

const RING_R = 19;
const RING_C = 2 * Math.PI * RING_R;

/** Progress ring with the member's initial inside. */
export function ring({ count, goal, name, whoKey, size = 52, src = null }) {
  const pct = Math.max(0, Math.min(1, goal ? count / goal : 0));
  const offset = (RING_C * (1 - pct)).toFixed(2);
  return html`<span class=${cx('ring', { done: pct >= 1 })} data-who=${whoKey} style=${`--size:${size}px`}>
    <svg viewBox="0 0 44 44" aria-hidden="true">
      <circle class="ring-track" cx="22" cy="22" r="${RING_R}"></circle>
      <circle class="ring-fill" cx="22" cy="22" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${offset}"></circle>
    </svg>
    <span class=${cx('ring-initial', { 'has-img': avatarUrl(src) })}>${avatarFace(name, src)}</span>
    ${pct >= 1 ? html`<span class="ring-check">${icon('check', { size: 14, stroke: 3 })}</span>` : ''}
  </span>`;
}

export function pill(tone, text, extra = '') {
  return text ? html`<span class=${cx('pill', tone, extra)}>${text}</span>` : '';
}

export function statusPill(summaryWeek, uid, today) {
  const s = memberStatus(summaryWeek, uid, today);
  const tone = !summaryWeek.counted && s.tone !== 'ok' ? 'muted' : s.tone;
  return pill(tone, s.tone === 'ok' ? `${s.text} ✓` : s.text);
}

/** Photo with optional inset. Starts loading it if needed. */
export function photoView(c, { swapped = false, cls = '' } = {}) {
  const p = photoCache.peek(c.id);
  if (!p) {
    photoCache.request(c.id);
    const gone = photoCache.isMissing(c.id);
    return html`<div class=${cx('photo', cls, gone ? 'is-missing' : 'is-loading')}>
      ${gone ? html`<span class="photo-missing">${icon('image', { size: 28 })}<small>Photo not available offline</small></span>` : ''}
    </div>`;
  }
  const main = swapped && p.inset ? p.inset : p.main;
  const inset = swapped && p.inset ? p.main : p.inset;
  return html`<div class=${cx('photo', cls)}>
    <img class="photo-main" src=${main} alt="Workout photo" decoding="async">
    ${inset ? html`<img class="photo-inset" src=${inset} alt="" decoding="async">` : ''}
  </div>`;
}

export function thumbImg(c) {
  if (!c?.hasPhoto) return '';
  const p = photoCache.peek(c.id);
  if (!p) {
    photoCache.request(c.id);
    return '';
  }
  return html`<img src=${p.main} alt="" decoding="async">`;
}

/** One cell in the week board. */
export function dayCell(m, uid, dayKey, { canPromise }) {
  const mine = uid === m.meUid;
  const entry = m.week.members[uid]?.dayMap[dayKey];
  const isToday = dayKey === m.today;
  const isFuture = dayKey > m.today;
  const status = entry?.status;
  const cover = entry?.cover;
  const photo = status && cover?.hasPhoto ? thumbImg(cover) : '';
  let action = '';
  let label = `${relativeDay(dayKey, m.today)}: `;
  if (entry) {
    action = 'openViewer';
    label += status === 'ok' ? 'worked out' : status === 'pending' ? 'pinky promise pending' : "didn't count";
  } else if (mine && isToday) {
    action = 'openCamera';
    label += 'check in now';
  } else if (mine && !isFuture && canPromise) {
    action = 'openPromise';
    label += 'no workout – tap to pinky promise';
  } else {
    label += isFuture ? 'coming up' : 'no workout';
  }
  const glyph = !status ? (mine && isToday ? icon('plus', { size: 18, stroke: 2.6 }) : '') : status === 'pending' ? '⏳' : status === 'rejected' ? '✕' : photo ? '' : cover?.kind === 'promise' ? '🤙' : '✓';
  return html`<button type="button" class=${cx('day', status && `st-${status}`, { 'has-photo': photo, 'is-today': isToday, 'is-future': isFuture })}
      data-action=${action} data-id=${cover?.id || ''} data-day=${dayKey} aria-label=${label} ${!action ? raw('disabled') : ''}>
    ${photo}
    ${glyph ? html`<span class="day-glyph">${glyph}</span>` : ''}
    <span class="day-label">${dowLetter(dayKey)}</span>
  </button>`;
}

export function reactionsBar(c, m) {
  const reactions = c.reactions || {};
  if (c.uid !== m.meUid) {
    const mine = reactions[m.meUid];
    return html`<div class="reactions" role="group" aria-label="React">
      ${REACTIONS.map(
        (e) => html`<button type="button" class=${cx('react', { on: mine === e })} data-action="react" data-id=${c.id} data-emoji=${e}
            aria-pressed=${mine === e ? 'true' : 'false'} aria-label=${`React ${e}`}>${e}</button>`,
      )}
    </div>`;
  }
  const got = Object.entries(reactions).filter(([u]) => u !== m.meUid);
  if (!got.length) return html`<span class="muted small">No reactions yet</span>`;
  return html`<div class="got-reactions">${got.map(([u, e]) => html`<span class="got">${e} <span>${m.nameOf(u)}</span></span>`)}</div>`;
}

export function promiseBlock(c, m) {
  const text = c.status === 'pending' ? (c.uid === m.meUid ? `Waiting for ${m.names.partner}` : 'Waiting for you') : c.status === 'ok' ? 'Counted' : "Didn't count";
  return html`<div class=${cx('promise-block', `st-${c.status}`)}>
    <span class="promise-emoji" aria-hidden="true">🤙</span>
    <div><b>Pinky promise</b><span>For ${relativeDay(c.dayKey, m.today).toLowerCase() === 'today' ? 'today' : relativeDay(c.dayKey, m.today)} · ${text}</span></div>
  </div>`;
}

// ----- comments & pokes helpers -----
let commentsMemo = { src: null, map: new Map() };
export function commentsByCheckin(state) {
  const list = state.comments || [];
  if (commentsMemo.src === list) return commentsMemo.map;
  const map = new Map();
  for (const c of list) {
    if (!map.has(c.checkinId)) map.set(c.checkinId, []);
    map.get(c.checkinId).push(c);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.clientAt - b.clientAt);
  commentsMemo = { src: list, map };
  return map;
}
export const unreadComments = (list, m, seen) => (seen ? list.filter((x) => x.uid !== m.meUid && x.clientAt > seen).length : 0);

/** The partner's poke I haven't dismissed yet, or null. */
export function incomingPoke(state, m) {
  if (!m.partnerUid) return null;
  const p = state.pair?.pokes?.[m.partnerUid];
  if (!p?.at) return null;
  return p.at > (state.pair?.pokeSeen?.[m.meUid] || 0) ? p : null;
}

export function postCard(c, m, { isNew = false, comments = [], seen = 0 } = {}) {
  const w = who(m, c.uid);
  const name = nameOf(m, c.uid);
  const act = activityText(c.activity);
  const meta = [act, c.kind === 'promise' ? `sent ${timeAgo(c.clientAt)}` : timeAgo(c.clientAt)].filter(Boolean).join(' · ');
  return html`<article class=${cx('post', { 'is-new': isNew, 'is-rejected': c.status === 'rejected' })} data-key=${`post-${c.id}`}>
    <header class="post-head">
      ${avatar(name, w, 'sm', m.avatarOf(c.uid))}
      <div class="post-meta"><b>${name}</b><span>${meta}</span></div>
      ${c.source === 'gallery' ? html`<span class="gallery-tag" title="Picked from the photo gallery">🖼️ gallery</span>` : ''}
      ${isNew ? html`<span class="new-badge">New</span>` : ''}
      ${c.pending ? html`<span class="sync-dot" title="Waiting to sync">${icon('refresh', { size: 14 })}</span>` : ''}
    </header>
    ${c.hasPhoto
      ? html`<button type="button" class="photo-btn" data-action="openViewer" data-id=${c.id} aria-label="Open photo">${photoView(c)}</button>`
      : promiseBlock(c, m)}
    ${c.note ? html`<p class="post-note">${c.note}</p>` : ''}
    <footer class="post-foot">
      ${reactionsBar(c, m)}
      <button type="button" class=${cx('comment-btn', { unread: unreadComments(comments, m, seen) })} data-action="openViewer" data-id=${c.id} data-focus="comments"
          aria-label=${`${comments.length} comments`}>💬${comments.length ? html` <b>${comments.length}</b>` : ''}</button>
    </footer>
  </article>`;
}

export function tabbar(route, m, extraHomeBadge = 0) {
  const tab = (id, label, ic, badge = 0) =>
    html`<a href=${`#/${id}`} class=${cx('tab', { active: route === id })} aria-current=${route === id ? 'page' : 'false'}>
      <span class="tab-icon">${icon(ic, { size: 24 })}${badge ? html`<span class="tab-badge">${badge}</span>` : ''}</span>
      <span>${label}</span>
    </a>`;
  const pactBadge = (m?.reward?.unlocked ? 1 : 0) + (m?.unpaidDebts?.length || 0) > 0 ? '!' : 0;
  return html`<nav class="tabbar" aria-label="Main">
    ${tab('home', 'Home', 'home', (m?.toReview?.length || 0) + (extraHomeBadge || 0))}
    ${tab('history', 'History', 'history')}
    <button type="button" class="tab-cta" data-action="openCamera" aria-label="Check in with a photo">${icon('camera', { size: 28, stroke: 2.2 })}</button>
    ${tab('pact', 'Pact', 'trophy', pactBadge)}
    ${tab('settings', 'Settings', 'settings')}
  </nav>`;
}

export function toastView(toast) {
  if (!toast) return '';
  return html`<div class="toast" role="status" data-key=${`toast-${toast.id}`}>${toast.text}</div>`;
}

const CONFETTI_COLORS = ['#FF6A3D', '#FF3D6E', '#5B5FEF', '#FFC53D', '#12A150', '#3DB7FF'];
export function celebrateView(c) {
  if (!c) return '';
  let seed = c.id;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const bits = Array.from({ length: 36 }, (_, i) => {
    const left = (rnd() * 100).toFixed(1);
    const delay = (rnd() * 0.5).toFixed(2);
    const dur = (1.6 + rnd() * 1.4).toFixed(2);
    const rot = Math.floor(rnd() * 360);
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const shape = i % 3 === 0 ? 'round' : '';
    return raw(`<i class="confetto ${shape}" style="left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${dur}s;--rot:${rot}deg"></i>`);
  });
  return html`<div class="celebrate" data-key=${`cel-${c.id}`} data-action="closeCelebrate" role="dialog" aria-live="assertive" aria-label=${c.title}>
    <div class="confetti" aria-hidden="true">${bits}</div>
    <div class="celebrate-card">
      <div class="celebrate-emoji" aria-hidden="true">${c.emoji || '🎉'}</div>
      <h2>${c.title}</h2>
      ${c.subtitle ? html`<p>${c.subtitle}</p>` : ''}
      <button type="button" class="btn btn-primary btn-block" data-action="closeCelebrate">${c.cta || 'Nice!'}</button>
    </div>
  </div>`;
}

export function splash(text = '') {
  return html`<div class="splash" data-key="splash">
    ${logo(72)}
    <p class="splash-name">${APP_NAME}</p>
    ${text ? html`<p class="muted">${text}</p>` : ''}
  </div>`;
}

export function sectionHead(title, linkHref = '', linkText = '') {
  return html`<div class="section-head"><h2>${title}</h2>${linkHref ? html`<a href=${linkHref}>${linkText}</a>` : ''}</div>`;
}

export function debtLine(d, m, { withButton = true } = {}) {
  const debtor = d.debtor === m.meUid ? 'You' : m.names.partner;
  const creditor = d.creditor === m.meUid ? 'you' : m.names.partner;
  return html`<div class=${cx('debt', { paid: d.paid })} data-key=${`debt-${d.key}`}>
    <div class="debt-text">
      <b>${debtor} ${d.debtor === m.meUid ? 'owe' : 'owes'} ${creditor}</b>
      <span>${d.stakes}</span>
      <small>Week of ${monthDay(d.weekKey)} · ${d.count}/${d.goal} days${d.paid ? ' · settled ✓' : ''}</small>
    </div>
    ${withButton
      ? html`<button type="button" class=${cx('btn btn-sm', d.paid ? 'btn-ghost' : 'btn-outline')} data-action="togglePaid" data-key=${d.key} data-paid=${d.paid ? '0' : '1'}>
          ${d.paid ? 'Undo' : 'Settled'}
        </button>`
      : ''}
  </div>`;
}

export function emptyState(emoji, title, text, action = '') {
  return html`<div class="empty"><div class="empty-emoji" aria-hidden="true">${emoji}</div><b>${title}</b><p>${text}</p>${action}</div>`;
}
