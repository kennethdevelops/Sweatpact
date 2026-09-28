// DEMO backend: everything lives on this device (IndexedDB) and a simulated partner
// reacts to what you do. Same interface as the Firebase backend.

import { kvStore } from '../lib/idb.js';
import {
  addDays, dayIndexInWeek, diffDays, getClockOffsetDays, nextWeek, now, setClockOffsetDays, todayKey, weekDays, weekStartKey,
  fromDayKey,
} from '../core/dates.js';
import { withHistoryValue } from '../core/logic.js';
import { shareSummary } from '../core/body.js';
import { getModel } from '../core/model.js';
import { hashSeed, makeDemoPhoto, AVATAR_SIZE, INSET_H, INSET_W, PHOTO_H, PHOTO_W } from '../core/photos.js';
import { photoCache } from '../core/photo-cache.js';
import { ACTIVITIES, DEMO_PARTNER_NAME, REACTIONS } from '../config.js';

export const DEMO_ME = 'demo-me';
export const DEMO_PARTNER = 'demo-partner';
const DAY = 86400000;
const db = kvStore('demo');

const NOTES = ['Leg day 🦵', '5k done!', 'Early bird session', 'Hot yoga, hotter me', 'New PR on deadlift', 'Rainy run but worth it', 'Quick HIIT before work', '', '', '', ''];
const SCENE = { gym: '🏋️', run: '🏃', walk: '🚶', yoga: '🧘', bike: '🚴', swim: '🏊', sports: '⚽', home: '🤸', other: '💪' };
const FACES = ['😅', '😤', '😎', '🥵', '😁', '🤩', '😌'];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const newId = () => `c${now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function createLocalBackend({ store, toast = () => {} }) {
  let data = null; // { version, pair, checkins, comments, weights, body, clockOffsetDays }
  let saveTimer = null;
  const timers = new Set();

  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => db.set('state', data).catch((e) => console.warn('Demo save failed', e)), 120);
  };
  const publish = () => {
    store.set({
      pair: data?.pair || null,
      checkins: data?.checkins || [],
      comments: data?.comments || [],
      weights: data?.weights || [],
      body: data?.body || null,
      profile: data ? { name: data.pair.names[DEMO_ME], pairId: data.pair.id, avatar: data.pair.avatars?.[DEMO_ME] || null } : null,
    });
  };
  const commit = (fn) => {
    fn();
    data = { ...data };
    persist();
    publish();
  };
  const later = (ms, fn) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (data) fn();
    }, ms);
    timers.add(t);
  };
  const partnerName = () => data?.pair?.names?.[DEMO_PARTNER] || DEMO_PARTNER_NAME;
  const model = () => getModel(store.get());
  const updatePair = (patch) => commit(() => (data.pair = { ...data.pair, ...patch }));
  const updateCheckin = (id, fn) =>
    commit(() => {
      data.checkins = data.checkins.map((c) => (c.id === id ? { ...c, ...fn(c) } : c));
    });

  function makeSeeded(uid, dayKey, r, extra = {}) {
    const activity = pick(r, ACTIVITIES.slice(0, 8)).id;
    const hour = 6 + Math.floor(r() * 14);
    const clientAt = fromDayKey(dayKey).getTime() - 12 * 3600000 + hour * 3600000 + Math.floor(r() * 3600000);
    return {
      id: `s${hashSeed(uid + dayKey + r()).toString(36)}`,
      uid,
      dayKey,
      clientAt,
      kind: 'photo',
      status: 'ok',
      activity,
      note: pick(r, NOTES),
      hasPhoto: true,
      dual: true,
      reactions: {},
      demoSeed: { seed: Math.floor(r() * 1e9), scene: SCENE[activity] || '💪', face: pick(r, FACES) },
      ...extra,
    };
  }

  // Weigh-ins stay private; with sharing on, only the progress summary goes on the pair.
  function syncBodyShare() {
    const share = data.body?.share ? shareSummary(data.weights) : null;
    const next = { ...(data.pair.bodyShare || {}) };
    if (share) next[DEMO_ME] = { ...share, updatedAt: now() };
    else delete next[DEMO_ME];
    data.pair = { ...data.pair, bodyShare: next };
  }

  function seedWeights(today, r) {
    const out = [];
    let day = addDays(today, -60);
    let w = 82 + r() * 4;
    let muscle = w * 0.42;
    while (day < today) {
      const withComp = r() < 0.5;
      const fat = w * (0.26 - (60 - diffDays(day, today)) * 0.0004);
      out.push({
        id: day,
        dayKey: day,
        clientAt: fromDayKey(day).getTime() - 4 * 3600000,
        weightKg: Math.round((w + (r() - 0.5) * 0.8) * 10) / 10,
        ...(withComp ? { muscleKg: Math.round(muscle * 10) / 10, fatKg: Math.round(fat * 10) / 10, waterKg: Math.round(w * 0.53 * 10) / 10 } : {}),
      });
      const gap = 2 + Math.floor(r() * 13);
      day = addDays(day, gap);
      w -= gap * (0.03 + r() * 0.04);
      muscle += gap * 0.005;
    }
    return out;
  }

  function generatePhoto(id) {
    const c = data?.checkins.find((x) => x.id === id);
    if (!c?.demoSeed) return null;
    const { seed, scene, face } = c.demoSeed;
    return {
      main: makeDemoPhoto({ seed, emoji: scene, width: PHOTO_W, height: PHOTO_H }),
      inset: makeDemoPhoto({ seed: seed + 7, emoji: face, width: INSET_W, height: INSET_H, selfie: true }),
    };
  }

  function seedData({ name, goal }) {
    const today = todayKey();
    const ws = 1;
    const cw = weekStartKey(today, ws);
    const startWeek = addDays(cw, -28);
    const r = rng(hashSeed(name + today));
    const checkins = [];
    const partnerGoal = 3;
    const daysFor = (week, count, notAfter) => {
      const all = weekDays(week).filter((d) => !notAfter || d < notAfter);
      const chosen = new Set();
      while (chosen.size < Math.min(count, all.length)) chosen.add(all[Math.floor(r() * all.length)]);
      return [...chosen].sort();
    };
    for (let i = 4; i >= 1; i--) {
      const week = addDays(cw, -7 * i);
      const partnerCount = i === 4 ? partnerGoal - 1 : partnerGoal;
      for (const d of daysFor(week, goal, null)) checkins.push(makeSeeded(DEMO_ME, d, r));
      for (const d of daysFor(week, partnerCount, null)) checkins.push(makeSeeded(DEMO_PARTNER, d, r));
    }
    // Current week: partner has a head start, plus a pinky promise waiting for you
    const idx = dayIndexInWeek(today, ws);
    const partnerDays = [];
    if (idx >= 1) partnerDays.push(cw);
    if (idx >= 3) partnerDays.push(addDays(cw, 2));
    for (const d of partnerDays) checkins.push(makeSeeded(DEMO_PARTNER, d, r));
    if (idx >= 2 && !partnerDays.includes(addDays(today, -1))) {
      checkins.push({
        id: newId(),
        uid: DEMO_PARTNER,
        dayKey: addDays(today, -1),
        clientAt: now() - 3 * 3600000,
        kind: 'promise',
        status: 'pending',
        activity: 'run',
        note: 'Forgot my phone at the park 🙈',
        hasPhoto: false,
        dual: false,
        reactions: {},
      });
    }
    // Sprinkle reactions
    for (const c of checkins) {
      if (c.kind !== 'photo' || r() < 0.4) continue;
      const other = c.uid === DEMO_ME ? DEMO_PARTNER : DEMO_ME;
      c.reactions = { [other]: pick(r, REACTIONS) };
    }
    return {
      version: 1,
      clockOffsetDays: 0,
      pair: {
        id: 'demo-pair',
        demo: true,
        code: 'DEMO42',
        createdBy: DEMO_ME,
        members: [DEMO_ME, DEMO_PARTNER],
        names: { [DEMO_ME]: name, [DEMO_PARTNER]: DEMO_PARTNER_NAME },
        avatars: { [DEMO_PARTNER]: makeDemoPhoto({ seed: 4242, emoji: '😎', width: AVATAR_SIZE, height: AVATAR_SIZE, selfie: true }) },
        goals: { [DEMO_ME]: [{ from: startWeek, value: goal }], [DEMO_PARTNER]: [{ from: startWeek, value: partnerGoal }] },
        stakes: [{ from: startWeek, value: 'Loser buys dinner 🍝' }],
        weekStartsOn: ws,
        startWeek,
        reward: { text: 'Fancy brunch 🥞', target: 4, fromWeek: addDays(cw, -21), setBy: DEMO_PARTNER, setAt: now() - 21 * DAY },
        rewardHistory: [],
        paid: {},
        bodyShare: { [DEMO_PARTNER]: { deltaKg: -2.4, ratePerWeekKg: -0.35, count: 9, since: addDays(today, -49), updatedAt: now() - 2 * DAY } },
      },
      checkins,
      weights: seedWeights(today, r),
      body: { units: 'metric', heightCm: 178, sex: null, birthYear: null, goalKg: 78, share: false },
      comments: (() => {
        const target = checkins.filter((c) => c.uid === DEMO_PARTNER && c.kind === 'photo').sort((a, b) => b.clientAt - a.clientAt)[0];
        if (!target) return [];
        return [
          { id: newId() + 'a', checkinId: target.id, uid: DEMO_ME, text: 'Look at you go! 🔥', clientAt: target.clientAt + 3600000 },
          { id: newId() + 'b', checkinId: target.id, uid: DEMO_PARTNER, text: 'Your turn tomorrow 😏', clientAt: target.clientAt + 5400000 },
        ];
      })(),
    };
  }

  const api = {
    kind: 'demo',

    async init() {
      try {
        data = (await db.get('state')) || null;
      } catch {
        data = null;
      }
      setClockOffsetDays(data?.clockOffsetDays || 0);
      photoCache.setLoader(async (id) => generatePhoto(id));
      store.set({ mode: 'demo', user: { uid: DEMO_ME, isAnonymous: true, email: null }, boot: 'ready' });
      publish();
    },

    async startDemo({ name, goal }) {
      data = seedData({ name, goal });
      await db.set('state', data);
      publish();
    },

    // ----- pact settings -----
    async setName(name) {
      updatePair({ names: { ...data.pair.names, [DEMO_ME]: name } });
    },
    async setAvatar(dataUrl) {
      const avatars = { ...(data.pair.avatars || {}) };
      if (dataUrl) avatars[DEMO_ME] = dataUrl;
      else delete avatars[DEMO_ME];
      updatePair({ avatars });
    },
    async setGoal(goal) {
      const m = model();
      updatePair({ goals: { ...data.pair.goals, [DEMO_ME]: withHistoryValue(data.pair.goals[DEMO_ME], goal, m.effectiveFrom) } });
    },
    async setStakes(text) {
      const m = model();
      updatePair({ stakes: withHistoryValue(data.pair.stakes, text, m.effectiveFrom) });
    },
    async setWeekStart(weekStartsOn) {
      updatePair({ weekStartsOn });
    },
    async setReward({ text, target }) {
      const m = model();
      updatePair({ reward: { text, target, fromWeek: m.currentWeek, setBy: DEMO_ME, setAt: now() } });
    },
    async claimReward() {
      const r = data.pair.reward;
      if (!r) return;
      updatePair({ reward: null, rewardHistory: [...(data.pair.rewardHistory || []), { ...r, claimedAt: now(), claimedBy: DEMO_ME }] });
    },
    async clearReward() {
      updatePair({ reward: null });
    },
    async setPaid(key, paid) {
      const next = { ...(data.pair.paid || {}) };
      if (paid) next[key] = { by: DEMO_ME, at: now() };
      else delete next[key];
      updatePair({ paid: next });
    },

    // ----- check-ins -----
    async addCheckin({ kind, dayKey, activity, note, photo, source }) {
      const id = newId();
      const c = {
        id,
        uid: DEMO_ME,
        dayKey,
        clientAt: now(),
        kind,
        status: kind === 'promise' ? 'pending' : 'ok',
        activity: activity || null,
        note: note || '',
        hasPhoto: Boolean(photo),
        source: photo ? (source === 'gallery' ? 'gallery' : 'camera') : null,
        dual: Boolean(photo?.inset),
        reactions: {},
      };
      if (photo) await photoCache.put(id, photo);
      commit(() => (data.checkins = [...data.checkins, c]));
      if (kind === 'promise') {
        later(3500, () => {
          updateCheckin(id, (x) => (x.status === 'pending' ? { status: 'ok', reviewedBy: DEMO_PARTNER, reviewedAt: now() } : {}));
          toast(`${partnerName()} counted your pinky promise 🤙`);
        });
      } else {
        later(2600, () => {
          const emoji = pick(Math.random, REACTIONS);
          updateCheckin(id, (x) => ({ reactions: { ...x.reactions, [DEMO_PARTNER]: emoji } }));
          toast(`${partnerName()} reacted ${emoji} to your check-in`);
        });
      }
      return id;
    },
    async review(id, approve) {
      updateCheckin(id, (c) =>
        c.status === 'pending' && c.uid !== DEMO_ME ? { status: approve ? 'ok' : 'rejected', reviewedBy: DEMO_ME, reviewedAt: now() } : {},
      );
    },
    async react(id, emoji) {
      updateCheckin(id, (c) => {
        const reactions = { ...(c.reactions || {}) };
        if (emoji) reactions[DEMO_ME] = emoji;
        else delete reactions[DEMO_ME];
        return { reactions };
      });
    },
    async deleteCheckin(id) {
      commit(() => (data.checkins = data.checkins.filter((c) => c.id !== id || c.uid !== DEMO_ME)));
      await photoCache.remove(id);
    },

    // ----- pokes & comments -----
    async poke(text) {
      updatePair({ pokes: { ...(data.pair.pokes || {}), [DEMO_ME]: { text, at: now() } } });
      later(4000, () => {
        const replies = ['On my way to the gym 🏃', 'Already did mine today 😎', 'Ugh fine, going now 😤', 'You first! 😂'];
        updatePair({ pokes: { ...(data.pair.pokes || {}), [DEMO_PARTNER]: { text: pick(Math.random, replies), at: now() } } });
      });
    },
    async markPokeSeen(at) {
      updatePair({ pokeSeen: { ...(data.pair.pokeSeen || {}), [DEMO_ME]: at } });
    },
    async addComment(checkinId, text) {
      const id = newId();
      const add = (uid, t) => commit(() => (data.comments = [...(data.comments || []), { id: newId(), checkinId, uid, text: t, clientAt: now() }]));
      commit(() => (data.comments = [...(data.comments || []), { id, checkinId, uid: DEMO_ME, text, clientAt: now() }]));
      later(3000, () => add(DEMO_PARTNER, pick(Math.random, ['😂😂', 'Love this!', 'Show off 😏', 'Proud of you ❤️', 'Next time I’m coming too'])));
      return id;
    },
    async deleteComment(id) {
      commit(() => (data.comments = (data.comments || []).filter((c) => c.id !== id || c.uid !== DEMO_ME)));
    },

    // ----- weight & body composition (private) -----
    async saveWeight(entry, { replaceId = null } = {}) {
      const id = entry.dayKey;
      commit(() => {
        data.weights = [...(data.weights || []).filter((x) => x.id !== id && x.id !== replaceId), { ...entry, id, clientAt: now() }];
        syncBodyShare();
      });
      return id;
    },
    async deleteWeight(id) {
      commit(() => {
        data.weights = (data.weights || []).filter((x) => x.id !== id);
        syncBodyShare();
      });
    },
    async setBody(body) {
      commit(() => {
        data.body = { ...(data.body || {}), ...body };
        syncBodyShare();
      });
    },

    async exportData() {
      const photos = {};
      for (const c of data?.checkins || []) {
        if (!c.hasPhoto) continue;
        const p = await photoCache.getData(c.id);
        if (p) photos[c.id] = p;
      }
      return { pair: data?.pair || null, checkins: data?.checkins || [], comments: data?.comments || [], weights: data?.weights || [], body: data?.body || null, photos };
    },

    // ----- demo-only controls -----
    demo: {
      partnerPoke() {
        updatePair({ pokes: { ...(data.pair.pokes || {}), [DEMO_PARTNER]: { text: 'Gym today? 💪', at: now() } } });
        toast(`${partnerName()} poked you 👉`);
      },
      partnerCheckIn() {
        const r = rng(Date.now());
        const c = makeSeeded(DEMO_PARTNER, todayKey(), r, { clientAt: now(), note: pick(r, NOTES) });
        c.id = newId();
        commit(() => (data.checkins = [...data.checkins, c]));
        toast(`${partnerName()} just checked in 💪`);
      },
      partnerPromise() {
        const today = todayKey();
        const m = model();
        const day = dayIndexInWeek(today, m.ws) > 0 ? addDays(today, -1) : today;
        const c = {
          id: newId(),
          uid: DEMO_PARTNER,
          dayKey: day,
          clientAt: now(),
          kind: 'promise',
          status: 'pending',
          activity: 'gym',
          note: 'Phone died mid-workout, I swear!',
          hasPhoto: false,
          dual: false,
          reactions: {},
        };
        commit(() => (data.checkins = [...data.checkins, c]));
        toast(`${partnerName()} sent you a pinky promise 🤙`);
      },
      jumpToNextWeek() {
        const m = model();
        // The simulated partner finishes their week...
        const pw = m.week.members[DEMO_PARTNER];
        const r = rng(Date.now());
        const open = m.week.days.filter((d) => d >= m.today && pw.dayMap[d]?.status !== 'ok');
        const added = [];
        for (const d of open.slice(0, pw.remaining)) {
          const c = makeSeeded(DEMO_PARTNER, d, r);
          c.id = newId();
          added.push(c);
        }
        // ...then time moves to the first day of next week.
        const target = nextWeek(m.currentWeek);
        const offset = getClockOffsetDays() + diffDays(m.today, target);
        setClockOffsetDays(offset);
        commit(() => {
          data.checkins = [...data.checkins, ...added];
          data.clockOffsetDays = offset;
        });
        return target;
      },
      async reset() {
        for (const t of timers) clearTimeout(t);
        timers.clear();
        clearTimeout(saveTimer);
        data = null;
        setClockOffsetDays(0);
        await db.del('state');
        await photoCache.clear();
        publish();
      },
    },
  };
  return api;
}

