// Fake of firebase-app.js (only what the app uses).
const apps = new Map();

export function initializeApp(options, name = '[DEFAULT]') {
  if (apps.has(name)) {
    const e = new Error(`Firebase: Firebase App named '${name}' already exists (app/duplicate-app).`);
    e.code = 'app/duplicate-app';
    throw e;
  }
  if (!options || !options.apiKey) {
    const e = new Error('Firebase: invalid options');
    e.code = 'app/invalid-app-argument';
    throw e;
  }
  const app = { name, options: { ...options }, automaticDataCollectionEnabled: false };
  apps.set(name, app);
  return app;
}

export function getApp(name = '[DEFAULT]') {
  return apps.get(name);
}

export const SDK_VERSION = 'fake';
