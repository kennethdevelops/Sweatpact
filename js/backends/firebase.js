// FIREBASE backend: real-time sync between two phones using Firebase Auth + Cloud Firestore
// (free Spark plan). The SDK is loaded from Google's CDN, so there is no build step.
//
// Data model (see firestore.rules):
//   users/{uid}                     { name, pairId }
//   codes/{CODE}                    { pairId, createdBy, creatorName, weekStartsOn }
//   pairs/{pairId}                  { members[], names{}, goals{}, stakes[], weekStartsOn, startWeek, reward, rewardHistory[], paid{} }
//   pairs/{pairId}/checkins/{id}    { uid, dayKey, clientAt, kind, status, activity, note, hasPhoto, dual, reactions{} }
//   pairs/{pairId}/photos/{id}      { uid, main, inset }  (compressed JPEG data URLs, fetched on demand)

import { FIREBASE_SDK_VERSION } from '../config.js';
import { now, todayKey, weekStartKey } from '../core/dates.js';
import { computeStartWeek, withHistoryValue } from '../core/logic.js';
import { getModel } from '../core/model.js';
import { photoCache } from '../core/photo-cache.js';

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O/1/I/L

export async function loadFirebaseSdk(version = FIREBASE_SDK_VERSION) {
  const base = `https://www.gstatic.com/firebasejs/${version}`;
  const [app, auth, firestore] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  return { app, auth, firestore };
}

export function isFirebaseConfigured(config) {
  return Boolean(config && config.apiKey && config.projectId && config.appId);
}

export function randomCode(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

const MESSAGES = {
  'auth/admin-restricted-operation': 'Guest sign-in is turned off. In the Firebase console enable Authentication → Sign-in method → Anonymous.',
  'auth/operation-not-allowed': 'This sign-in method is turned off in the Firebase console (Authentication → Sign-in method).',
  'auth/email-already-in-use': 'That email already has an account. Use “I already have an account” to sign in with it.',
  'auth/credential-already-in-use': 'That email already has an account.',
  'auth/provider-already-linked': 'This account is already protected with an email.',
  'auth/invalid-email': "That email address doesn't look right.",
  'auth/missing-email': 'Enter your email address.',
  'auth/weak-password': 'Use a password with at least 6 characters.',
  'auth/missing-password': 'Enter your password.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-login-credentials': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': "You're offline. Check your connection and try again.",
  'auth/invalid-api-key': 'The Firebase config is wrong (invalid API key). Check js/firebase-config.js.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The Firebase config is wrong (invalid API key). Check js/firebase-config.js.',
  'auth/unauthorized-domain': 'This website is not an authorized domain. Add it in Firebase console → Authentication → Settings → Authorized domains.',
  'permission-denied': 'Firebase refused the request. Make sure you published the security rules from firestore.rules.',
  unavailable: "You're offline. Try again when you have a connection.",
  'deadline-exceeded': 'The connection is too slow right now. Try again.',
};

export function friendlyError(err, context) {
  const code = err?.code || '';
  const msg = String(err?.message || '');
  if (/does not exist for project|database \(default\) does not exist/i.test(msg)) {
    return new Error('No Firestore database yet. In the Firebase console open Build → Firestore Database → Create database.');
  }
  if (context === 'join' && code === 'permission-denied') {
    return new Error('That pact already has two people.');
  }
  if (code === 'failed-precondition' && /offline/i.test(msg)) return new Error(MESSAGES.unavailable);
  if (/client is offline/i.test(msg)) return new Error(MESSAGES.unavailable);
  const out = new Error(MESSAGES[code] || msg || 'Something went wrong.');
  out.code = code;
  return out;
}

export function createFirebaseBackend({ store, config, sdk: injectedSdk = null, appName, toast = () => {} }) {
  let sdk = null;
  let fs = null;
  let authApi = null;
  let auth = null;
  let db = null;
  let authKnown = false;
  let profileLoaded = false;
  let profileTimer = null;
  let unsubProfile = null;
  let unsubPair = null;
  let unsubCheckins = null;
  let currentPairId = null;
  let authUnsub = null;
  let disposed = false;
  const startWeekTried = new Set();

  const S = () => store.get();
  const uid = () => auth?.currentUser?.uid || null;
  const pairRef = () => fs.doc(db, 'pairs', currentPairId);
  const model = () => getModel(S());

  function markReady() {
    if (S().boot === 'ready') return;
    if (!authKnown) return;
    if (auth.currentUser && !profileLoaded) return;
    store.set({ boot: 'ready' });
  }

  // Setup problems (no database, bad config, rules not published) get a banner; everything else a toast.
  function reportError(err, where) {
    const e = friendlyError(err);
    console.error(`[firebase] ${where}:`, err);
    const setupProblem =
      /Firestore database|config is wrong|turned off/i.test(e.message) || (where === 'profile' && err?.code === 'permission-denied');
    if (setupProblem) store.set({ fatal: e.message });
    else toast(e.message);
  }

  // Fire-and-forget writes: the UI updates instantly from the local cache,
  // Firestore syncs in the background (and retries when back online).
  function background(promise, where) {
    promise.catch((err) => reportError(err, where));
  }

  function requirePair() {
    if (!currentPairId || !S().pair) throw new Error('You are not in a pact yet.');
    return S().pair;
  }

  function stopPair() {
    unsubPair?.();
    unsubCheckins?.();
    unsubPair = null;
    unsubCheckins = null;
  }

  function stopAll() {
    unsubProfile?.();
    unsubProfile = null;
    stopPair();
    currentPairId = null;
    clearTimeout(profileTimer);
  }

  function watchPair(pairId) {
    if (pairId === currentPairId) return;
    stopPair();
    currentPairId = pairId;
    store.set({ pair: null, checkins: [], checkinsLoaded: false, pairError: null });
    if (!pairId) return;

    unsubPair = fs.onSnapshot(
      fs.doc(db, 'pairs', pairId),
      (snap) => {
        if (pairId !== currentPairId) return;
        if (!snap.exists()) {
          if (snap.metadata.fromCache) return;
          store.set({ pair: null, pairError: 'missing' });
          return;
        }
        const pair = { id: snap.id, ...snap.data() };
        if (!Array.isArray(pair.members) || !pair.members.includes(uid())) {
          removedFromPair();
          return;
        }
        store.set({ pair, pairError: null });
        maybeSetStartWeek(pair);
      },
      (err) => {
        if (pairId !== currentPairId) return;
        if (err?.code === 'permission-denied') removedFromPair();
        else reportError(err, 'pair');
      },
    );

    const q = fs.query(fs.collection(db, 'pairs', pairId, 'checkins'), fs.orderBy('clientAt', 'desc'), fs.limit(2000));
    unsubCheckins = fs.onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        if (pairId !== currentPairId) return;
        const checkins = snap.docs.map((d) => ({ ...d.data(), id: d.id, pending: d.metadata.hasPendingWrites }));
        store.set({ checkins, checkinsLoaded: true, syncPending: snap.metadata.hasPendingWrites });
      },
      (err) => {
        if (pairId !== currentPairId) return;
        if (err?.code !== 'permission-denied') reportError(err, 'checkins');
      },
    );
  }

  // Our partner removed us (or the pact is gone): forget it and go back to onboarding.
  function removedFromPair() {
    const me = uid();
    stopPair();
    currentPairId = null;
    store.set({ pair: null, checkins: [], pairError: null, notice: 'removed', profile: { ...(S().profile || {}), pairId: null } });
    if (me) fs.setDoc(fs.doc(db, 'users', me), { pairId: null }, { merge: true }).catch(() => {});
  }

  // Once both people are in, decide the first week that counts (joining late gives a warm-up week).
  function maybeSetStartWeek(pair) {
    if (pair.members.length !== 2 || pair.startWeek || startWeekTried.has(pair.id + pair.members.join())) return;
    startWeekTried.add(pair.id + pair.members.join());
    const ref = fs.doc(db, 'pairs', pair.id);
    fs.runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.data();
      if (!d || d.members.length !== 2 || d.startWeek) return;
      tx.update(ref, { startWeek: computeStartWeek(todayKey(), d.weekStartsOn ?? 1) });
    }).catch((err) => {
      startWeekTried.delete(pair.id + pair.members.join()); // retry on the next update
      console.warn('startWeek not set yet', err?.code || err);
    });
  }

  function watchProfile(user) {
    unsubProfile?.();
    profileLoaded = false;
    const ref = fs.doc(db, 'users', user.uid);
    unsubProfile = fs.onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists() && snap.metadata.fromCache) return; // wait for the server's answer
        profileLoaded = true;
        clearTimeout(profileTimer);
        const d = snap.exists() ? snap.data() : {};
        store.set({ profile: { name: d.name || '', pairId: d.pairId || null } });
        watchPair(d.pairId || null);
        markReady();
      },
      (err) => {
        profileLoaded = true;
        store.set({ profile: { name: '', pairId: null } });
        reportError(err, 'profile');
        markReady();
      },
    );
    // First launch while offline: don't hang on the splash screen forever.
    clearTimeout(profileTimer);
    profileTimer = setTimeout(() => {
      if (profileLoaded) return;
      profileLoaded = true;
      store.set({ profile: { name: '', pairId: null } });
      toast("Couldn't reach the server. Check your connection.");
      markReady();
    }, 8000);
  }

  function handleUser(user) {
    if (disposed) return;
    authKnown = true;
    if (!user) {
      stopAll();
      store.set({ user: null, profile: null, pair: null, checkins: [], pairError: null });
      markReady();
      return;
    }
    store.set({ user: { uid: user.uid, isAnonymous: user.isAnonymous, email: user.email || null } });
    watchProfile(user);
  }

  async function ensureSignedIn() {
    if (auth.currentUser) return auth.currentUser;
    try {
      const cred = await authApi.signInAnonymously(auth);
      return cred.user;
    } catch (err) {
      throw friendlyError(err);
    }
  }

  const api = {
    kind: 'firebase',

    async init() {
      sdk = injectedSdk || (await loadFirebaseSdk());
      fs = sdk.firestore;
      authApi = sdk.auth;
      const app = appName ? sdk.app.initializeApp(config, appName) : sdk.app.initializeApp(config);
      auth = authApi.getAuth(app);
      try {
        db = fs.initializeFirestore(app, {
          localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
        });
      } catch (err) {
        console.warn('Offline cache unavailable, using memory cache', err);
        db = fs.getFirestore(app);
      }
      photoCache.setLoader(loadPhoto);
      store.set({ mode: 'firebase' });
      await new Promise((resolve) => {
        let first = true;
        authUnsub = authApi.onAuthStateChanged(auth, (user) => {
          handleUser(user);
          if (first) {
            first = false;
            resolve();
          }
        });
      });
    },

    dispose() {
      disposed = true;
      stopAll();
      authUnsub?.();
    },

    // ----- account -----
    ensureSignedIn,
    async signInEmail(email, password) {
      try {
        stopAll();
        await authApi.signInWithEmailAndPassword(auth, email.trim(), password);
      } catch (err) {
        throw friendlyError(err);
      }
    },
    async linkEmail(email, password) {
      try {
        const cred = authApi.EmailAuthProvider.credential(email.trim(), password);
        const res = await authApi.linkWithCredential(auth.currentUser, cred);
        store.set({ user: { uid: res.user.uid, isAnonymous: res.user.isAnonymous, email: res.user.email || email.trim() } });
      } catch (err) {
        throw friendlyError(err);
      }
    },
    async resetPassword(email) {
      try {
        await authApi.sendPasswordResetEmail(auth, email.trim());
      } catch (err) {
        throw friendlyError(err);
      }
    },
    async signOut() {
      stopAll();
      await authApi.signOut(auth);
    },

    // ----- pact -----
    async createPair({ name, goal, stakes, weekStartsOn = 1 }) {
      const user = await ensureSignedIn();
      const me = user.uid;
      const wk = weekStartKey(todayKey(), weekStartsOn);
      for (let attempt = 0; attempt < 6; attempt++) {
        const code = randomCode(6);
        const newPairRef = fs.doc(fs.collection(db, 'pairs'));
        const codeRef = fs.doc(db, 'codes', code);
        try {
          await fs.runTransaction(db, async (tx) => {
            const existing = await tx.get(codeRef);
            if (existing.exists()) {
              const e = new Error('code collision');
              e.code = 'sp/collision';
              throw e;
            }
            tx.set(newPairRef, {
              schema: 1,
              code,
              createdBy: me,
              createdAt: fs.serverTimestamp(),
              members: [me],
              names: { [me]: name },
              goals: { [me]: [{ from: wk, value: goal }] },
              stakes: stakes ? [{ from: wk, value: stakes }] : [],
              weekStartsOn,
              startWeek: null,
              reward: null,
              rewardHistory: [],
              paid: {},
            });
            tx.set(codeRef, { pairId: newPairRef.id, createdBy: me, creatorName: name, weekStartsOn, createdAt: fs.serverTimestamp() });
            tx.set(fs.doc(db, 'users', me), { name, pairId: newPairRef.id, updatedAt: fs.serverTimestamp() }, { merge: true });
          });
          return { code, pairId: newPairRef.id };
        } catch (err) {
          if (err?.code === 'sp/collision') continue;
          throw friendlyError(err);
        }
      }
      throw new Error('Could not create a pact code. Try again.');
    },

    async lookupCode(rawCode) {
      await ensureSignedIn();
      const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length < 4) return null;
      try {
        const snap = await fs.getDoc(fs.doc(db, 'codes', code));
        if (!snap.exists()) return null;
        const d = snap.data();
        return { code, pairId: d.pairId, creatorName: d.creatorName || 'your partner', creatorUid: d.createdBy, weekStartsOn: d.weekStartsOn ?? 1 };
      } catch (err) {
        throw friendlyError(err);
      }
    },

    async joinPair(rawCode, { name, goal }) {
      const info = await api.lookupCode(rawCode);
      if (!info) throw new Error("That code doesn't exist. Check it with your partner.");
      const me = uid();
      if (info.creatorUid === me) throw new Error("That's your own code – send it to your partner.");
      const wk = weekStartKey(todayKey(), info.weekStartsOn);
      try {
        await fs.updateDoc(fs.doc(db, 'pairs', info.pairId), {
          members: fs.arrayUnion(me),
          [`names.${me}`]: name,
          [`goals.${me}`]: [{ from: wk, value: goal }],
        });
        await fs.setDoc(fs.doc(db, 'users', me), { name, pairId: info.pairId, updatedAt: fs.serverTimestamp() }, { merge: true });
      } catch (err) {
        throw friendlyError(err, 'join');
      }
      return info;
    },

    async leavePair() {
      const me = uid();
      if (!currentPairId) return;
      const batch = fs.writeBatch(db);
      batch.set(fs.doc(db, 'users', me), { pairId: null, updatedAt: fs.serverTimestamp() }, { merge: true });
      batch.update(pairRef(), { members: fs.arrayRemove(me), startWeek: null });
      try {
        await batch.commit();
      } catch (err) {
        throw friendlyError(err);
      }
    },

    async removePartner() {
      const pair = requirePair();
      const partner = pair.members.find((m) => m !== uid());
      if (!partner) return;
      startWeekTried.clear();
      background(fs.updateDoc(pairRef(), { members: fs.arrayRemove(partner), startWeek: null }), 'removePartner');
    },

    async setName(name) {
      requirePair();
      const me = uid();
      const batch = fs.writeBatch(db);
      batch.update(pairRef(), { [`names.${me}`]: name });
      batch.set(fs.doc(db, 'users', me), { name }, { merge: true });
      background(batch.commit(), 'setName');
    },
    async setGoal(goal) {
      const pair = requirePair();
      const me = uid();
      const next = withHistoryValue(pair.goals?.[me], goal, model().effectiveFrom);
      background(fs.updateDoc(pairRef(), { [`goals.${me}`]: next }), 'setGoal');
    },
    async setStakes(text) {
      const pair = requirePair();
      background(fs.updateDoc(pairRef(), { stakes: withHistoryValue(pair.stakes, text, model().effectiveFrom) }), 'setStakes');
    },
    async setWeekStart(weekStartsOn) {
      requirePair();
      background(fs.updateDoc(pairRef(), { weekStartsOn }), 'setWeekStart');
    },
    async setReward({ text, target }) {
      requirePair();
      const reward = { text, target, fromWeek: model().currentWeek, setBy: uid(), setAt: now() };
      background(fs.updateDoc(pairRef(), { reward }), 'setReward');
    },
    async claimReward() {
      const pair = requirePair();
      if (!pair.reward) return;
      const claimed = { ...pair.reward, claimedAt: now(), claimedBy: uid() };
      background(fs.updateDoc(pairRef(), { reward: null, rewardHistory: fs.arrayUnion(claimed) }), 'claimReward');
    },
    async clearReward() {
      requirePair();
      background(fs.updateDoc(pairRef(), { reward: null }), 'clearReward');
    },
    async setPaid(key, paid) {
      requirePair();
      background(fs.updateDoc(pairRef(), { [`paid.${key}`]: paid ? { by: uid(), at: now() } : fs.deleteField() }), 'setPaid');
    },

    // ----- check-ins -----
    async addCheckin({ kind, dayKey, activity, note, photo }) {
      requirePair();
      const me = uid();
      const ref = fs.doc(fs.collection(db, 'pairs', currentPairId, 'checkins'));
      const batch = fs.writeBatch(db);
      batch.set(ref, {
        uid: me,
        dayKey,
        clientAt: now(),
        createdAt: fs.serverTimestamp(),
        kind,
        status: kind === 'promise' ? 'pending' : 'ok',
        activity: activity || null,
        note: note || '',
        hasPhoto: Boolean(photo),
        dual: Boolean(photo?.inset),
        reactions: {},
      });
      if (photo) {
        await photoCache.put(ref.id, photo);
        batch.set(fs.doc(db, 'pairs', currentPairId, 'photos', ref.id), {
          uid: me,
          main: photo.main,
          inset: photo.inset || null,
          createdAt: fs.serverTimestamp(),
        });
      }
      background(batch.commit(), 'addCheckin');
      return ref.id;
    },
    async review(id, approve) {
      requirePair();
      background(
        fs.updateDoc(fs.doc(db, 'pairs', currentPairId, 'checkins', id), {
          status: approve ? 'ok' : 'rejected',
          reviewedBy: uid(),
          reviewedAt: now(),
        }),
        'review',
      );
    },
    async react(id, emoji) {
      requirePair();
      const me = uid();
      background(
        fs.updateDoc(fs.doc(db, 'pairs', currentPairId, 'checkins', id), { [`reactions.${me}`]: emoji || fs.deleteField() }),
        'react',
      );
    },
    async deleteCheckin(id) {
      requirePair();
      const c = S().checkins.find((x) => x.id === id);
      const batch = fs.writeBatch(db);
      batch.delete(fs.doc(db, 'pairs', currentPairId, 'checkins', id));
      if (c?.hasPhoto) batch.delete(fs.doc(db, 'pairs', currentPairId, 'photos', id));
      background(batch.commit(), 'deleteCheckin');
      await photoCache.remove(id);
    },

    async exportData() {
      const { pair, checkins } = S();
      const photos = {};
      for (const c of checkins || []) {
        if (!c.hasPhoto) continue;
        await photoCache.ensure(c.id);
        const p = await photoCache.getData(c.id);
        if (p) photos[c.id] = p;
      }
      return { pair, checkins: (checkins || []).map(({ pending, ...c }) => c), photos };
    },

    loadPhoto: (id) => loadPhoto(id),
  };

  async function loadPhoto(id) {
    if (!currentPairId) return null;
    try {
      const snap = await fs.getDoc(fs.doc(db, 'pairs', currentPairId, 'photos', id));
      if (!snap.exists()) return null;
      const d = snap.data();
      return { main: d.main || null, inset: d.inset || null };
    } catch (err) {
      console.warn('Photo fetch failed', id, err?.code || err);
      return null;
    }
  }

  return api;
}
