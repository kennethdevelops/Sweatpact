// Keeps check-in photos on this device (IndexedDB) so each photo is downloaded at most once.
// Rendering uses short blob: URLs created from the stored JPEG data URLs.

import { kvStore } from '../lib/idb.js';
import { dataUrlToBlob } from './photos.js';

const idb = kvStore('photos');
const urls = new Map(); // id -> { main, inset } (blob: URLs)
const inflight = new Map();
const missing = new Map(); // id -> time we gave up (retry later)
let loader = null; // async (id) => { main, inset } | null
let changed = () => {};

function remember(id, photo) {
  const old = urls.get(id);
  if (old) {
    if (old.main) URL.revokeObjectURL(old.main);
    if (old.inset) URL.revokeObjectURL(old.inset);
  }
  urls.set(id, {
    main: photo.main ? URL.createObjectURL(dataUrlToBlob(photo.main)) : null,
    inset: photo.inset ? URL.createObjectURL(dataUrlToBlob(photo.inset)) : null,
  });
}

export const photoCache = {
  setLoader(fn) {
    loader = fn;
    missing.clear();
  },
  onChange(fn) {
    changed = fn;
  },
  /** Synchronous lookup for rendering. Returns {main, inset} blob URLs or null. */
  peek(id) {
    return urls.get(id) || null;
  },
  isMissing(id) {
    return missing.has(id);
  },
  /** Starts loading a photo if needed (fire-and-forget during render). */
  request(id) {
    if (!id || urls.has(id) || inflight.has(id)) return;
    const gaveUp = missing.get(id);
    if (gaveUp && Date.now() - gaveUp < 30_000) return;
    this.ensure(id);
  },
  ensure(id) {
    if (urls.has(id)) return Promise.resolve(urls.get(id));
    if (inflight.has(id)) return inflight.get(id);
    const p = (async () => {
      try {
        let photo = await idb.get(id);
        if (!photo && loader) {
          photo = await loader(id);
          if (photo) await idb.set(id, photo);
        }
        if (photo) {
          remember(id, photo);
          missing.delete(id);
        } else {
          missing.set(id, Date.now());
        }
      } catch (err) {
        console.warn('Photo load failed', id, err);
        missing.set(id, Date.now());
      } finally {
        inflight.delete(id);
        changed();
      }
      return urls.get(id) || null;
    })();
    inflight.set(id, p);
    return p;
  },
  async put(id, photo) {
    remember(id, photo);
    missing.delete(id);
    changed();
    try {
      await idb.set(id, photo);
    } catch (err) {
      console.warn('Could not store photo locally', err);
    }
  },
  /** Raw data URLs (for backups). */
  async getData(id) {
    return (await idb.get(id)) || null;
  },
  async remove(id) {
    const old = urls.get(id);
    if (old) {
      if (old.main) URL.revokeObjectURL(old.main);
      if (old.inset) URL.revokeObjectURL(old.inset);
    }
    urls.delete(id);
    await idb.del(id);
    changed();
  },
  async clear() {
    for (const id of [...urls.keys()]) {
      const u = urls.get(id);
      if (u.main) URL.revokeObjectURL(u.main);
      if (u.inset) URL.revokeObjectURL(u.inset);
    }
    urls.clear();
    missing.clear();
    await idb.clear();
    changed();
  },
};
