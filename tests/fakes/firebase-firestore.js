// Fake of firebase-firestore.js (only what the app uses), backed by fake-core's shared state.
// Mimics the behaviours that matter: field validation (no undefined), dotted update paths,
// merge semantics, sentinels, real-time listeners, transactions, batches, index limits and
// security rules (via fake-rules.js).

import { config, currentUid, fbError, onChange, readDoc, readState, tick, writeDocs } from './fake-core.js';
import { allowed } from './fake-rules.js';

const SENT = '__fake_sentinel__';
const DELETE = Symbol('delete');

export class Timestamp {
  constructor(seconds, nanoseconds) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static now() {
    return Timestamp.fromMillis(Date.now());
  }
  static fromMillis(ms) {
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
  static fromDate(d) {
    return Timestamp.fromMillis(d.getTime());
  }
  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
  toDate() {
    return new Date(this.toMillis());
  }
}

const sentinel = (kind, extra = {}) => ({ [SENT]: kind, ...extra });
export const serverTimestamp = () => sentinel('serverTimestamp');
export const deleteField = () => sentinel('delete');
export const arrayUnion = (...elements) => sentinel('arrayUnion', { elements });
export const arrayRemove = (...elements) => sentinel('arrayRemove', { elements });
export const increment = (n) => sentinel('increment', { n });

// ---------- instances & references ----------

const dbs = new Map();
class Firestore {
  constructor(app) {
    this.app = app;
    this.type = 'firestore';
  }
}
export function initializeFirestore(app, settings = {}) {
  if (dbs.has(app.name)) throw fbError('failed-precondition', 'initializeFirestore() has already been called with different options.');
  const db = new Firestore(app);
  db._settings = settings;
  dbs.set(app.name, db);
  return db;
}
export function getFirestore(app) {
  return dbs.get(app.name) || initializeFirestore(app, {});
}
export const persistentLocalCache = (settings = {}) => ({ kind: 'persistent', ...settings });
export const persistentMultipleTabManager = () => ({ kind: 'persistentMultipleTab' });
export const memoryLocalCache = () => ({ kind: 'memory' });

class DocumentReference {
  constructor(db, path) {
    this.type = 'document';
    this.firestore = db;
    this.path = path;
    this.id = path.split('/').pop();
  }
}
class CollectionReference {
  constructor(db, path) {
    this.type = 'collection';
    this.firestore = db;
    this.path = path;
    this.id = path.split('/').pop();
    this._constraints = [];
  }
}
class Query {
  constructor(db, path, constraints) {
    this.type = 'query';
    this.firestore = db;
    this.path = path;
    this._constraints = constraints;
  }
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function autoId() {
  let s = '';
  for (let i = 0; i < 20; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return s;
}

function joinSegments(fn, segments) {
  for (const s of segments) {
    if (s === undefined || s === null || s === '') throw fbError('invalid-argument', `Function ${fn}() cannot be called with an empty path segment (got ${s}).`);
  }
  return segments.flatMap((s) => String(s).split('/')).filter(Boolean);
}

export function doc(parent, ...segments) {
  let db;
  let base;
  if (parent instanceof CollectionReference) {
    db = parent.firestore;
    base = parent.path.split('/');
    if (segments.length === 0) segments = [autoId()];
  } else if (parent instanceof DocumentReference) {
    db = parent.firestore;
    base = parent.path.split('/');
  } else if (parent instanceof Firestore) {
    db = parent;
    base = [];
  } else {
    throw fbError('invalid-argument', 'doc(): expected a Firestore instance or reference');
  }
  const parts = [...base, ...joinSegments('doc', segments)];
  if (parts.length % 2 !== 0) throw fbError('invalid-argument', `Invalid document reference ${parts.join('/')} (odd number of segments).`);
  return new DocumentReference(db, parts.join('/'));
}

export function collection(parent, ...segments) {
  const db = parent instanceof Firestore ? parent : parent.firestore;
  const base = parent instanceof Firestore ? [] : parent.path.split('/');
  const parts = [...base, ...joinSegments('collection', segments)];
  if (parts.length % 2 !== 1) throw fbError('invalid-argument', `Invalid collection reference ${parts.join('/')}.`);
  return new CollectionReference(db, parts.join('/'));
}

export const where = (fieldPath, opStr, value) => ({ type: 'where', fieldPath, opStr, value });
export const orderBy = (fieldPath, directionStr = 'asc') => ({ type: 'orderBy', fieldPath, directionStr });
export const limit = (n) => ({ type: 'limit', n });
export function query(ref, ...constraints) {
  return new Query(ref.firestore, ref.path, [...(ref._constraints || []), ...constraints]);
}

// ---------- values ----------

const isSentinel = (v) => Boolean(v && typeof v === 'object' && v[SENT]);
const isMap = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && !isSentinel(v) && !('__ts' in v && Object.keys(v).length === 1);

function checkValue(v, path, { allowSentinel = true, inArray = false } = {}) {
  if (v === undefined) throw fbError('invalid-argument', `Function called with invalid data. Unsupported field value: undefined (found in field ${path || '<root>'})`);
  if (typeof v === 'function' || typeof v === 'symbol') throw fbError('invalid-argument', `Unsupported field value: ${typeof v} (found in field ${path})`);
  if (isSentinel(v)) {
    if (!allowSentinel || inArray) throw fbError('invalid-argument', `${v[SENT]}() is not supported inside arrays (found in field ${path})`);
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => {
      if (Array.isArray(x)) throw fbError('invalid-argument', `Nested arrays are not supported (found in field ${path})`);
      checkValue(x, `${path}[${i}]`, { allowSentinel, inArray: true });
    });
    return;
  }
  if (v && typeof v === 'object' && !(v instanceof Timestamp)) {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) {
      throw fbError('invalid-argument', `Unsupported field value: a custom object (found in field ${path})`);
    }
    for (const [k, x] of Object.entries(v)) checkValue(x, path ? `${path}.${k}` : k, { allowSentinel, inArray });
  }
}

function encode(v) {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}
function hydrate(v) {
  if (Array.isArray(v)) return v.map(hydrate);
  if (v && typeof v === 'object') {
    if ('__ts' in v && Object.keys(v).length === 1) return Timestamp.fromMillis(v.__ts);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, hydrate(x)]));
  }
  return v;
}
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
  return v;
}
const deepEq = (a, b) => JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));

function resolve(value, old, now) {
  if (isSentinel(value)) {
    switch (value[SENT]) {
      case 'serverTimestamp':
        return { __ts: now };
      case 'delete':
        return DELETE;
      case 'increment':
        return (typeof old === 'number' ? old : 0) + value.n;
      case 'arrayUnion': {
        const arr = Array.isArray(old) ? old.slice() : [];
        for (const e of value.elements.map(encode)) if (!arr.some((x) => deepEq(x, e))) arr.push(e);
        return arr;
      }
      case 'arrayRemove': {
        const els = value.elements.map(encode);
        return (Array.isArray(old) ? old : []).filter((x) => !els.some((e) => deepEq(x, e)));
      }
      default:
        throw new Error(`Unknown sentinel ${value[SENT]}`);
    }
  }
  if (Array.isArray(value) || value instanceof Timestamp) return encode(value);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(value)) {
      const r = resolve(x, undefined, now);
      if (r === DELETE) throw fbError('invalid-argument', 'deleteField() can only be used with update() and set() with {merge: true}');
      out[k] = r;
    }
    return out;
  }
  return value;
}

function mergeInto(target, src, now) {
  const out = { ...(target || {}) };
  for (const [k, v] of Object.entries(src)) {
    if (isMap(v) && isMap(out[k])) out[k] = mergeInto(out[k], v, now);
    else if (isMap(v)) out[k] = mergeInto({}, v, now);
    else {
      const r = resolve(v, out[k], now);
      if (r === DELETE) delete out[k];
      else out[k] = r;
    }
  }
  return out;
}

function applySet(cur, data, merge, now) {
  if (merge) return mergeInto(cur || {}, data, now);
  return resolve(data, undefined, now);
}

function applyUpdate(cur, data, now) {
  const out = clone(cur);
  for (const [key, v] of Object.entries(data)) {
    const parts = key.split('.');
    if (parts.some((p) => p === '')) throw fbError('invalid-argument', `Invalid field path (${key}).`);
    let obj = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!isMap(obj[parts[i]])) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    const last = parts[parts.length - 1];
    const r = resolve(v, obj[last], now);
    if (r === DELETE) delete obj[last];
    else obj[last] = r;
  }
  return out;
}

// ---------- rules & writes ----------

const getRaw = (path) => readDoc(path);
const uidFor = (db) => currentUid(db.app.name);

function checkRead(db, op, path) {
  if (!config.rules) return;
  if (!allowed({ op, path, before: op === 'get' ? getRaw(path) : null, after: null, uid: uidFor(db), getDoc: getRaw })) {
    throw fbError('permission-denied', `Missing or insufficient permissions. (${op} ${path})`);
  }
}

function commitWrites(db, writes) {
  const now = Date.now();
  const before = {};
  const docs = {};
  for (const w of writes) {
    const p = w.ref.path;
    if (!(p in before)) before[p] = readDoc(p);
    const cur = p in docs ? docs[p] : before[p];
    let next = null;
    if (w.type === 'set') next = applySet(cur, w.data, w.options?.merge, now);
    else if (w.type === 'update') {
      if (!cur) throw fbError('not-found', `No document to update: ${p}`);
      next = applyUpdate(cur, w.data, now);
    }
    if (next && JSON.stringify(next).length > 1048487) throw fbError('invalid-argument', `Document ${p} is larger than 1 MiB.`);
    docs[p] = next;
  }
  if (config.rules) {
    const uid = uidFor(db);
    for (const p of Object.keys(before)) {
      const b = before[p];
      const a = docs[p] ?? null;
      const op = a == null ? 'delete' : b == null ? 'create' : 'update';
      if (!allowed({ op, path: p, before: b, after: a, uid, getDoc: (x) => (x in before ? before[x] : readDoc(x)) })) {
        throw fbError('permission-denied', `Missing or insufficient permissions. (${op} ${p})`);
      }
    }
  }
  writeDocs(docs);
}

// ---------- snapshots & queries ----------

class DocumentSnapshot {
  constructor(ref, data) {
    this.ref = ref;
    this.id = ref.id;
    this._data = data;
    this.metadata = { hasPendingWrites: false, fromCache: false };
  }
  exists() {
    return this._data != null;
  }
  data() {
    return this._data == null ? undefined : hydrate(clone(this._data));
  }
  get(field) {
    return field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.data());
  }
}

class QuerySnapshot {
  constructor(q, docs) {
    this.query = q;
    this.docs = docs;
    this.size = docs.length;
    this.empty = docs.length === 0;
    this.metadata = { hasPendingWrites: false, fromCache: false };
  }
  forEach(fn) {
    this.docs.forEach(fn);
  }
  docChanges() {
    return this.docs.map((d, i) => ({ type: 'added', doc: d, oldIndex: -1, newIndex: i }));
  }
}

const getField = (data, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
function cmp(a, b) {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
function matchWhere(v, op, x) {
  switch (op) {
    case '==': return deepEq(v, x);
    case '!=': return v !== undefined && !deepEq(v, x);
    case '<': return v !== undefined && v < x;
    case '<=': return v !== undefined && v <= x;
    case '>': return v !== undefined && v > x;
    case '>=': return v !== undefined && v >= x;
    case 'array-contains': return Array.isArray(v) && v.some((e) => deepEq(e, x));
    case 'array-contains-any': return Array.isArray(v) && v.some((e) => x.some((y) => deepEq(e, y)));
    case 'in': return x.some((y) => deepEq(v, y));
    case 'not-in': return v !== undefined && !x.some((y) => deepEq(v, y));
    default: throw fbError('invalid-argument', `Unsupported operator ${op}`);
  }
}

function checkIndex(cons) {
  const fields = new Set(cons.filter((c) => c.type === 'where' || c.type === 'orderBy').map((c) => c.fieldPath));
  const hasOrder = cons.some((c) => c.type === 'orderBy');
  const allEquality = cons.filter((c) => c.type === 'where').every((c) => c.opStr === '==');
  if (fields.size > 1 && (hasOrder || !allEquality)) {
    throw fbError('failed-precondition', 'The query requires an index (filters/orderBy on different fields need a composite index).');
  }
}

function runQuery(q) {
  const state = readState();
  const depth = q.path.split('/').length + 1;
  const prefix = `${q.path}/`;
  const cons = q._constraints || [];
  checkIndex(cons);
  let rows = Object.entries(state.docs)
    .filter(([p]) => p.startsWith(prefix) && p.split('/').length === depth)
    .map(([path, data]) => ({ path, data }));
  for (const c of cons.filter((c) => c.type === 'where')) rows = rows.filter((r) => matchWhere(getField(r.data, c.fieldPath), c.opStr, encode(c.value)));
  const orders = cons.filter((c) => c.type === 'orderBy');
  for (const o of orders) rows = rows.filter((r) => getField(r.data, o.fieldPath) !== undefined);
  rows.sort((a, b) => {
    for (const o of orders) {
      const c = cmp(getField(a.data, o.fieldPath), getField(b.data, o.fieldPath));
      if (c) return o.directionStr === 'desc' ? -c : c;
    }
    return a.path < b.path ? -1 : 1;
  });
  const lim = cons.find((c) => c.type === 'limit');
  if (lim) rows = rows.slice(0, lim.n);
  return rows;
}

const toQuerySnapshot = (q, rows) =>
  new QuerySnapshot(q, rows.map((r) => new DocumentSnapshot(new DocumentReference(q.firestore, r.path), r.data)));

// ---------- public operations ----------

export async function getDoc(ref) {
  await tick();
  checkRead(ref.firestore, 'get', ref.path);
  return new DocumentSnapshot(ref, getRaw(ref.path));
}
export const getDocFromCache = getDoc;
export const getDocFromServer = getDoc;

export async function getDocs(q) {
  await tick();
  checkRead(q.firestore, 'list', q.path);
  return toQuerySnapshot(q, runQuery(q));
}

export async function setDoc(ref, data, options) {
  checkValue(data, '');
  await tick();
  commitWrites(ref.firestore, [{ type: 'set', ref, data, options }]);
}

export async function updateDoc(ref, dataOrField, ...rest) {
  let data = dataOrField;
  if (typeof dataOrField === 'string') {
    data = { [dataOrField]: rest[0] };
    for (let i = 1; i < rest.length; i += 2) data[rest[i]] = rest[i + 1];
  }
  checkValue(data, '');
  await tick();
  commitWrites(ref.firestore, [{ type: 'update', ref, data }]);
}

export async function deleteDoc(ref) {
  await tick();
  commitWrites(ref.firestore, [{ type: 'delete', ref }]);
}

export function writeBatch(db) {
  const writes = [];
  let committed = false;
  const batch = {
    set(ref, data, options) {
      checkValue(data, '');
      writes.push({ type: 'set', ref, data, options });
      return batch;
    },
    update(ref, data) {
      checkValue(data, '');
      writes.push({ type: 'update', ref, data });
      return batch;
    },
    delete(ref) {
      writes.push({ type: 'delete', ref });
      return batch;
    },
    async commit() {
      if (committed) throw fbError('failed-precondition', 'A write batch can no longer be used after commit() has been called.');
      committed = true;
      await tick();
      commitWrites(db, writes);
    },
  };
  return batch;
}

export async function runTransaction(db, updateFunction) {
  const writes = [];
  let wrote = false;
  const tx = {
    async get(ref) {
      if (wrote) throw fbError('invalid-argument', 'Firestore transactions require all reads to be executed before all writes.');
      await tick();
      checkRead(db, 'get', ref.path);
      return new DocumentSnapshot(ref, getRaw(ref.path));
    },
    set(ref, data, options) {
      wrote = true;
      checkValue(data, '');
      writes.push({ type: 'set', ref, data, options });
      return tx;
    },
    update(ref, data) {
      wrote = true;
      checkValue(data, '');
      writes.push({ type: 'update', ref, data });
      return tx;
    },
    delete(ref) {
      wrote = true;
      writes.push({ type: 'delete', ref });
      return tx;
    },
  };
  const result = await updateFunction(tx);
  commitWrites(db, writes);
  return result;
}

export function onSnapshot(ref, ...args) {
  let next;
  let error;
  let i = 0;
  if (args[0] && typeof args[0] === 'object' && typeof args[0].next !== 'function' && typeof args[0].error !== 'function') i = 1; // options
  if (typeof args[i] === 'function') {
    next = args[i];
    error = args[i + 1];
  } else if (args[i] && typeof args[i] === 'object') {
    next = args[i].next;
    error = args[i].error;
  }
  const db = ref.firestore;
  let last;
  let active = true;
  const evaluate = () => {
    if (!active) return;
    try {
      if (ref.type === 'document') {
        checkRead(db, 'get', ref.path);
        const d = getRaw(ref.path);
        const sig = JSON.stringify(d);
        if (sig === last) return;
        last = sig;
        next?.(new DocumentSnapshot(ref, d));
      } else {
        checkRead(db, 'list', ref.path);
        const rows = runQuery(ref);
        const sig = JSON.stringify(rows);
        if (sig === last) return;
        last = sig;
        next?.(toQuerySnapshot(ref, rows));
      }
    } catch (err) {
      active = false;
      stop();
      if (error) error(err);
      else console.error('[fake onSnapshot]', err);
    }
  };
  const stop = onChange(evaluate);
  setTimeout(evaluate, 0);
  return () => {
    active = false;
    stop();
  };
}
