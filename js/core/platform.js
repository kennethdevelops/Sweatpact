// Browser/device helpers: install prompts, sharing, clipboard, downloads, haptics.

const ua = navigator.userAgent || '';
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/i.test(ua);

export function isStandalone() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
}

// Android/desktop Chrome: capture the install prompt so we can show our own button.
let deferredPrompt = null;
const installListeners = new Set();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installListeners.forEach((f) => f());
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installListeners.forEach((f) => f());
});
export const canPromptInstall = () => Boolean(deferredPrompt);
export const onInstallAvailabilityChange = (fn) => installListeners.add(fn);
export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice.catch(() => null);
  deferredPrompt = null;
  installListeners.forEach((f) => f());
  return choice?.outcome === 'accepted';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/** Opens the share sheet when available, otherwise copies to the clipboard. */
export async function shareOrCopy({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }
  const ok = await copyText([text, url].filter(Boolean).join(' '));
  return ok ? 'copied' : 'failed';
}

/** Saves a file. On iPhone the share sheet ("Save to Files") works better than downloads. */
export async function saveFile(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  try {
    const file = new File([blob], name, { type });
    if (isIOS && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2000);
  return 'downloaded';
}

export function haptic(pattern = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported (iOS) */
  }
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* ignore */
  }
}

export const appUrl = () => location.href.split('#')[0].split('?')[0];
export const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function readJoinCodeFromUrl() {
  try {
    const params = new URLSearchParams(location.search);
    const code = (params.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return code.length >= 4 ? code : '';
  } catch {
    return '';
  }
}

export function clearUrlParams() {
  if (location.search) history.replaceState(history.state, '', appUrl() + location.hash);
}

// Local, per-device preferences (never synced)
export const local = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(`sp.${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === undefined || value === null) localStorage.removeItem(`sp.${key}`);
      else localStorage.setItem(`sp.${key}`, JSON.stringify(value));
    } catch {
      /* storage full or blocked */
    }
  },
};
