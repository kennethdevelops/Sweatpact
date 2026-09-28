// Fake of firebase-auth.js (only what the app uses).
import { accounts, authByApp, fbError, newUid, sessionKV, tick } from './fake-core.js';

export const fakeAuthSettings = { anonymousDisabled: false };

function makeUser(rec) {
  return {
    uid: rec.uid,
    isAnonymous: Boolean(rec.isAnonymous),
    email: rec.email || null,
    providerData: rec.email ? [{ providerId: 'password', email: rec.email }] : [],
  };
}

export function getAuth(app) {
  const name = app?.name || '[DEFAULT]';
  if (authByApp.has(name)) return authByApp.get(name);
  const key = `fakeauth.current.${name}`;
  const saved = sessionKV.get(key);
  const auth = { app, name: 'auth', currentUser: saved ? makeUser(saved) : null, _listeners: new Set(), _key: key };
  authByApp.set(name, auth);
  return auth;
}

function setUser(auth, rec) {
  auth.currentUser = rec ? makeUser(rec) : null;
  if (rec) sessionKV.set(auth._key, rec);
  else sessionKV.del(auth._key);
  for (const l of [...auth._listeners]) setTimeout(() => l(auth.currentUser), 0);
}

export function onAuthStateChanged(auth, next) {
  auth._listeners.add(next);
  setTimeout(() => next(auth.currentUser), 0);
  return () => auth._listeners.delete(next);
}

export async function signInAnonymously(auth) {
  await tick();
  if (fakeAuthSettings.anonymousDisabled) throw fbError('auth/admin-restricted-operation');
  setUser(auth, { uid: newUid(), isAnonymous: true });
  return { user: auth.currentUser };
}

export const EmailAuthProvider = {
  PROVIDER_ID: 'password',
  credential: (email, password) => ({ providerId: 'password', email, password }),
};

const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || '');

export async function linkWithCredential(user, cred) {
  await tick();
  if (!validEmail(cred.email)) throw fbError('auth/invalid-email');
  if (!cred.password) throw fbError('auth/missing-password');
  if (cred.password.length < 6) throw fbError('auth/weak-password');
  const all = accounts.all();
  if (all[cred.email.toLowerCase()]) throw fbError('auth/email-already-in-use');
  if (user.email) throw fbError('auth/provider-already-linked');
  all[cred.email.toLowerCase()] = { uid: user.uid, password: cred.password };
  accounts.save(all);
  const rec = { uid: user.uid, isAnonymous: false, email: cred.email.toLowerCase() };
  for (const auth of authByApp.values()) {
    if (auth.currentUser?.uid === user.uid) {
      Object.assign(auth.currentUser, makeUser(rec));
      sessionKV.set(auth._key, rec);
    }
  }
  return { user: makeUser(rec) };
}

export async function signInWithEmailAndPassword(auth, email, password) {
  await tick();
  if (!validEmail(email)) throw fbError('auth/invalid-email');
  const acc = accounts.all()[String(email).toLowerCase()];
  if (!acc || acc.password !== password) throw fbError('auth/invalid-credential');
  setUser(auth, { uid: acc.uid, isAnonymous: false, email: String(email).toLowerCase() });
  return { user: auth.currentUser };
}

export async function sendPasswordResetEmail(auth, email) {
  await tick();
  if (!validEmail(email)) throw fbError('auth/invalid-email');
}

export async function signOut(auth) {
  await tick();
  setUser(auth, null);
}
