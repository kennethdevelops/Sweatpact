// Runs the real Firebase backend code against the fake SDK (tests/fakes), simulating two phones.
import test from 'node:test';
import assert from 'node:assert/strict';

import * as app from './fakes/firebase-app.js';
import * as auth from './fakes/firebase-auth.js';
import * as firestore from './fakes/firebase-firestore.js';
import { resetAll, readState } from './fakes/fake-core.js';
import { createStore } from '../js/core/store.js';
import { createFirebaseBackend } from '../js/backends/firebase.js';
import { photoCache } from '../js/core/photo-cache.js';
import { todayKey, weekStartKey, nextWeek } from '../js/core/dates.js';
import { computeStartWeek, debtKey } from '../js/core/logic.js';
import { getModel } from '../js/core/model.js';

const sdk = { app, auth, firestore };
const config = { apiKey: 'fake', projectId: 'fake', appId: 'fake' };
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function device(name) {
  const toasts = [];
  const store = createStore({ boot: 'loading', user: null, profile: null, pair: null, checkins: [], ui: {} });
  const backend = createFirebaseBackend({ store, config, sdk, appName: name, toast: (t) => toasts.push(t) });
  return { store, backend, toasts };
}

function waitFor(store, predicate, label, timeout = 2000) {
  return new Promise((resolve, reject) => {
    if (predicate(store.get())) return resolve(store.get());
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`Timed out waiting for: ${label}`));
    }, timeout);
    const unsub = store.subscribe((s) => {
      if (predicate(s)) {
        clearTimeout(timer);
        unsub();
        resolve(s);
      }
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

resetAll();
const A = device('phoneA');
const B = device('phoneB');
const C = device('phoneC');
let code;
let pairId;

test('boots signed out', async () => {
  await Promise.all([A.backend.init(), B.backend.init(), C.backend.init()]);
  await waitFor(A.store, (s) => s.boot === 'ready' && s.user === null, 'A ready');
  assert.equal(A.store.get().mode, 'firebase');
});

test('create a pact (anonymous sign-in happens automatically)', async () => {
  const res = await A.backend.createPair({ name: 'Kev', goal: 3, stakes: 'Loser buys dinner', weekStartsOn: 1 });
  code = res.code;
  pairId = res.pairId;
  assert.match(code, /^[23456789A-HJKMNP-Z]{6}$/);
  const s = await waitFor(A.store, (s) => s.pair?.members?.length === 1, 'A pair loaded');
  assert.equal(s.profile.pairId, pairId);
  assert.equal(s.pair.names[s.user.uid], 'Kev');
  assert.deepEqual(s.pair.stakes, [{ from: weekStartKey(todayKey(), 1), value: 'Loser buys dinner' }]);
  assert.equal(s.user.isAnonymous, true);
});

test('partner looks up the code and joins; start week gets set', async () => {
  const info = await B.backend.lookupCode(code.toLowerCase());
  assert.equal(info.creatorName, 'Kev');
  assert.equal(info.pairId, pairId);
  await B.backend.joinPair(code, { name: 'Alex', goal: 2 });
  const sb = await waitFor(B.store, (s) => s.pair?.members?.length === 2 && s.pair.startWeek, 'B sees full pair');
  const sa = await waitFor(A.store, (s) => s.pair?.members?.length === 2 && s.pair.startWeek, 'A sees partner');
  assert.equal(sa.pair.startWeek, computeStartWeek(todayKey(), 1));
  assert.equal(sb.pair.names[sb.user.uid], 'Alex');
  assert.equal(getModel(sa).names.partner, 'Alex');
  assert.equal(getModel(sb).goals.me, 2);
});

test('a third person cannot join a full pact', async () => {
  await assert.rejects(() => C.backend.joinPair(code, { name: 'Eve', goal: 1 }), /already has two people/);
  await assert.rejects(() => C.backend.joinPair('ZZZZZZ', { name: 'Eve', goal: 1 }), /doesn't exist/);
});

let photoId;
test('photo check-in syncs to the partner, who can react', async () => {
  photoId = await A.backend.addCheckin({ kind: 'photo', dayKey: todayKey(), activity: 'gym', note: 'Leg day', photo: { main: TINY_JPEG, inset: TINY_JPEG } });
  const sb = await waitFor(B.store, (s) => s.checkins.some((c) => c.id === photoId), 'B sees check-in');
  const c = sb.checkins.find((x) => x.id === photoId);
  assert.equal(c.status, 'ok');
  assert.equal(c.hasPhoto, true);
  assert.equal(c.dual, true);
  assert.equal(c.note, 'Leg day');
  assert.equal(getModel(sb).week.members[A.store.get().user.uid].count, 1);

  await B.backend.react(photoId, '🔥');
  const sa = await waitFor(A.store, (s) => s.checkins.find((x) => x.id === photoId)?.reactions?.[B.store.get().user.uid] === '🔥', 'A sees reaction');
  assert.ok(sa);
  await B.backend.react(photoId, null);
  await waitFor(A.store, (s) => !s.checkins.find((x) => x.id === photoId)?.reactions?.[B.store.get().user.uid], 'reaction removed');
});

test('photos are stored separately and fetched on demand by the partner only', async () => {
  const fsDoc = readState().docs[`pairs/${pairId}/photos/${photoId}`];
  assert.equal(fsDoc.main, TINY_JPEG);
  assert.equal(fsDoc.uid, A.store.get().user.uid);
  assert.equal(readState().docs[`pairs/${pairId}/checkins/${photoId}`].main, undefined, 'check-in doc stays small');
  const got = await B.backend.loadPhoto(photoId);
  assert.equal(got.main, TINY_JPEG);
  assert.equal(got.inset, TINY_JPEG);
  assert.equal(await C.backend.loadPhoto(photoId), null, 'outsiders get nothing');
  // The shared cache hands out blob: URLs for rendering
  await photoCache.clear();
  photoCache.setLoader((id) => B.backend.loadPhoto(id));
  const urls = await photoCache.ensure(photoId);
  assert.match(urls.main, /^blob:/);
});

test('pinky promise: partner approves; you cannot approve your own', async () => {
  const id = await B.backend.addCheckin({ kind: 'promise', dayKey: todayKey(), activity: 'run', note: 'Forgot phone' });
  await waitFor(A.store, (s) => getModel(s)?.toReview.some((c) => c.id === id), 'A has something to review');
  // B trying to approve their own promise is blocked by the rules
  await B.backend.review(id, true);
  await sleep(30);
  assert.ok(B.toasts.some((t) => /refused/i.test(t)), `expected permission toast, got ${B.toasts}`);
  assert.equal(B.store.get().checkins.find((c) => c.id === id).status, 'pending');
  await A.backend.review(id, true);
  const sb = await waitFor(B.store, (s) => s.checkins.find((c) => c.id === id)?.status === 'ok', 'B promise approved');
  assert.equal(getModel(sb).week.members[sb.user.uid].count, 1);
});

test('settings: goal, stakes, reward, paid marks', async () => {
  const before = getModel(A.store.get());
  await A.backend.setGoal(5);
  const sa = await waitFor(A.store, (s) => s.pair.goals[s.user.uid].some((g) => g.value === 5), 'goal saved');
  const m = getModel(sa);
  if (before.week.counted) {
    assert.equal(m.goals.me, 3, 'counted week keeps its goal');
    assert.equal(m.nextGoals.me, 5);
  } else {
    assert.equal(m.goals.me, 5, 'warm-up week changes apply now');
  }
  await A.backend.setStakes('Loser does dishes');
  await waitFor(B.store, (s) => s.pair.stakes.some((x) => x.value === 'Loser does dishes'), 'B sees stakes');

  await B.backend.setReward({ text: 'Brunch', target: 2 });
  await waitFor(A.store, (s) => s.pair.reward?.text === 'Brunch', 'A sees reward');
  await A.backend.claimReward();
  const s2 = await waitFor(B.store, (s) => !s.pair.reward && s.pair.rewardHistory.length === 1, 'reward claimed');
  assert.equal(s2.pair.rewardHistory[0].text, 'Brunch');

  const key = debtKey(weekStartKey(todayKey(), 1), A.store.get().user.uid);
  await B.backend.setPaid(key, true);
  await waitFor(A.store, (s) => s.pair.paid?.[key]?.by === B.store.get().user.uid, 'paid mark');
  await B.backend.setPaid(key, false);
  await waitFor(A.store, (s) => !s.pair.paid?.[key], 'paid cleared');

  await A.backend.setName('Kevin');
  await waitFor(B.store, (s) => getModel(s).names.partner === 'Kevin', 'rename synced');
  assert.equal(nextWeek(weekStartKey(todayKey(), 1)) > todayKey(), true);
});

test('pokes: only your own entry; partner sees it and marks it seen', async () => {
  const uidA = A.store.get().user.uid;
  const uidB = B.store.get().user.uid;
  await A.backend.poke('Gym today? 💪');
  const sb = await waitFor(B.store, (s) => s.pair.pokes?.[uidA]?.text === 'Gym today? 💪', 'B sees poke');
  const at = sb.pair.pokes[uidA].at;
  await B.backend.markPokeSeen(at);
  await waitFor(A.store, (s) => s.pair.pokeSeen?.[uidB] === at, 'A sees seen mark');
  // Forging a poke from the partner is refused by the rules
  await assert.rejects(() => firestore.updateDoc(firestore.doc(firestore.getFirestore(app.getApp('phoneA')), 'pairs', pairId), { [`pokes.${uidB}`]: { text: 'fake', at: 1 } }), /permission/i);
});

test('comments sync, are limited to 280 characters, and only your own can be deleted', async () => {
  const cid = B.store.get().checkins[0].id;
  const id = await A.backend.addComment(cid, 'Nice one! 🔥');
  const sb = await waitFor(B.store, (s) => s.comments?.some((c) => c.id === id), 'B sees comment');
  assert.equal(sb.comments.find((c) => c.id === id).checkinId, cid);
  const dbB = firestore.getFirestore(app.getApp('phoneB'));
  await assert.rejects(() => firestore.deleteDoc(firestore.doc(dbB, 'pairs', pairId, 'comments', id)), /permission/i);
  await assert.rejects(
    () => firestore.setDoc(firestore.doc(dbB, 'pairs', pairId, 'comments', 'long'), { checkinId: cid, uid: B.store.get().user.uid, text: 'x'.repeat(281), clientAt: 1 }),
    /permission/i,
  );
  await A.backend.deleteComment(id);
  await waitFor(B.store, (s) => !s.comments.some((c) => c.id === id), 'comment deleted');
  const outsider = firestore.getFirestore(app.getApp('phoneC'));
  await assert.rejects(() => firestore.getDocs(firestore.collection(outsider, 'pairs', pairId, 'comments')), /permission/i);
});

test('gallery photos are tagged', async () => {
  const id = await B.backend.addCheckin({ kind: 'photo', dayKey: todayKey(), activity: 'gym', note: '', photo: { main: TINY_JPEG, inset: null }, source: 'gallery' });
  const sa = await waitFor(A.store, (s) => s.checkins.some((c) => c.id === id), 'A sees gallery check-in');
  assert.equal(sa.checkins.find((c) => c.id === id).source, 'gallery');
});

test('delete own check-in (and its photo)', async () => {
  await A.backend.deleteCheckin(photoId);
  await waitFor(B.store, (s) => !s.checkins.some((c) => c.id === photoId), 'B sees deletion');
  assert.equal(readState().docs[`pairs/${pairId}/photos/${photoId}`], undefined);
});

test('protect account with email, sign out, sign back in', async () => {
  const uidA = A.store.get().user.uid;
  await assert.rejects(() => A.backend.linkEmail('bad', 'secret1'), /doesn't look right/);
  await assert.rejects(() => A.backend.linkEmail('kev@example.com', '123'), /at least 6/);
  await A.backend.linkEmail('kev@example.com', 'secret1');
  assert.equal(A.store.get().user.isAnonymous, false);
  await A.backend.signOut();
  await waitFor(A.store, (s) => s.user === null && s.pair === null, 'signed out');
  await assert.rejects(() => A.backend.signInEmail('kev@example.com', 'wrong'), /Wrong email or password/);
  await A.backend.signInEmail('kev@example.com', 'secret1');
  const s = await waitFor(A.store, (s) => s.pair?.members?.length === 2, 'pair back after sign-in');
  assert.equal(s.user.uid, uidA);
});

test('leave and re-join; remove partner', async () => {
  await B.backend.leavePair();
  await waitFor(B.store, (s) => s.profile?.pairId === null && s.pair === null, 'B left');
  const sa = await waitFor(A.store, (s) => s.pair?.members?.length === 1, 'A alone');
  assert.equal(sa.pair.startWeek, null);
  await B.backend.joinPair(code, { name: 'Alex', goal: 2 });
  await waitFor(A.store, (s) => s.pair?.members?.length === 2 && s.pair.startWeek, 'B back');
  await A.backend.removePartner();
  const sb = await waitFor(B.store, (s) => s.notice === 'removed' && !s.pair, 'B removed');
  assert.equal(sb.profile.pairId, null);
  await sleep(20);
  assert.equal(readState().docs[`users/${sb.user.uid}`].pairId, null, 'profile pointer cleared');
});
