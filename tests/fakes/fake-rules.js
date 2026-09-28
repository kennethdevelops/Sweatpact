// A JavaScript mirror of firestore.rules, used by the fake Firestore in tests.
// It checks that the app's reads and writes follow the intended security policy.
// (It can't prove the real rules file is correct, but it keeps the app honest.)

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function eq(a, b) {
  return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
}
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (isObj(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
  return v;
}

function affectedKeys(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((k) => !(k in (before || {})) || !(k in (after || {})) || !eq(before[k], after[k]));
}
const hasOnly = (list, allowed) => list.every((k) => allowed.includes(k));
const onlyChanged = (before, after, keys) => hasOnly(affectedKeys(before, after), keys);
const onlyMyEntry = (before, after, field, me) => hasOnly(affectedKeys(before?.[field] || {}, after?.[field] || {}), [me]);

/**
 * @param {object} p
 * @param {'get'|'list'|'create'|'update'|'delete'} p.op
 * @param {string} p.path  document path (or collection path for list)
 * @param {object|null} p.before  current document data (resource.data)
 * @param {object|null} p.after   document data after the write (request.resource.data)
 * @param {string|null} p.uid
 * @param {(path:string)=>object|null} p.getDoc  reads current data (rules get())
 */
export function allowed({ op, path, before, after, uid, getDoc }) {
  const seg = path.split('/');
  const signedIn = Boolean(uid);
  const read = op === 'get' || op === 'list';

  if (seg[0] === 'users' && seg.length === 2) return signedIn && uid === seg[1];

  if (seg[0] === 'codes' && seg.length === 2) {
    if (op === 'get') return signedIn;
    if (op === 'create') return signedIn && after?.createdBy === uid;
    return false;
  }

  if (seg[0] === 'pairs' && seg.length === 2) {
    if (op === 'get') return signedIn && Boolean(before) && (before.members || []).includes(uid);
    if (op === 'list' || op === 'delete') return false;
    if (op === 'create') return signedIn && eq(after.members, [uid]) && after.createdBy === uid;
    if (op === 'update') {
      if (!signedIn || !before) return false;
      const members = before.members || [];
      const memberPath =
        members.includes(uid) &&
        (after.members || []).every((m) => members.includes(m)) &&
        eq(after.createdBy ?? null, before.createdBy ?? null) &&
        eq(after.code ?? null, before.code ?? null) &&
        onlyMyEntry(before, after, 'names', uid) &&
        onlyMyEntry(before, after, 'goals', uid);
      const joinPath =
        !members.includes(uid) &&
        members.length < 2 &&
        eq(after.members, [...members, uid]) &&
        onlyChanged(before, after, ['members', 'names', 'goals']) &&
        onlyMyEntry(before, after, 'names', uid) &&
        onlyMyEntry(before, after, 'goals', uid);
      return memberPath || joinPath;
    }
  }

  if (seg[0] === 'pairs' && (seg.length === 4 || (seg.length === 3 && op === 'list'))) {
    const pair = getDoc(`pairs/${seg[1]}`);
    const isMember = signedIn && Boolean(pair) && (pair.members || []).includes(uid);
    const sub = seg[2];

    if (sub === 'checkins') {
      if (read) return isMember;
      if (op === 'create') {
        return (
          isMember &&
          after.uid === uid &&
          ((after.kind === 'photo' && after.status === 'ok') || (after.kind === 'promise' && after.status === 'pending'))
        );
      }
      if (op === 'update') {
        if (!isMember) return false;
        const ownEdit = before.uid === uid && onlyChanged(before, after, ['note', 'activity']);
        const review =
          before.uid !== uid &&
          before.status === 'pending' &&
          onlyChanged(before, after, ['status', 'reviewedBy', 'reviewedAt']) &&
          ['ok', 'rejected'].includes(after.status) &&
          after.reviewedBy === uid;
        const react = onlyChanged(before, after, ['reactions']) && onlyMyEntry(before, after, 'reactions', uid);
        return ownEdit || review || react;
      }
      if (op === 'delete') return isMember && before?.uid === uid;
    }

    if (sub === 'photos') {
      if (read) return isMember;
      if (op === 'create') return isMember && after.uid === uid;
      if (op === 'delete') return isMember && before?.uid === uid;
      return false;
    }
  }
  return false;
}
