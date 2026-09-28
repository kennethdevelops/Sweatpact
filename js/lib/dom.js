// Tiny rendering toolkit (no framework):
//   html`<p>${text}</p>`  – template tag that escapes values (safe against XSS)
//   raw(str)              – mark a string as trusted HTML
//   morph(root, markup)   – update the DOM to match new markup, keeping focus, scroll,
//                           input values, playing videos and CSS transitions intact.
// Elements with data-key="..." are matched by key (use it for list items and anything
// whose identity matters). data-morph="skip" leaves an element's children alone.

class SafeHTML {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
export const raw = (s) => new SafeHTML(String(s ?? ''));

function interp(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof SafeHTML) return v.s;
  if (Array.isArray(v)) return v.map(interp).join('');
  return escapeHTML(v);
}

// Values placed right after `=` (attr=${value}) are quoted automatically.
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (strings[i].endsWith('=')) {
      const s = v instanceof SafeHTML ? v.s.replace(/"/g, '&quot;') : interp(v);
      out += `"${s}"`;
    } else {
      out += interp(v);
    }
    out += strings[i + 1];
  }
  return new SafeHTML(out);
}

/** cx('a', {b: true, c: false}) -> "a b" */
export function cx(...parts) {
  const out = [];
  for (const p of parts) {
    if (!p) continue;
    if (typeof p === 'string') out.push(p);
    else for (const [k, v] of Object.entries(p)) if (v) out.push(k);
  }
  return out.join(' ');
}

const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-key') : null);

function compatible(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  return a.tagName === b.tagName && keyOf(a) === keyOf(b);
}

export function morph(root, markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(markup);
  morphChildren(root, tpl.content);
}

function morphChildren(from, to) {
  const keyed = new Map();
  for (let c = from.firstChild; c; c = c.nextSibling) {
    const k = keyOf(c);
    if (k != null) keyed.set(k, c);
  }
  const wanted = new Set();
  for (let c = to.firstChild; c; c = c.nextSibling) {
    const k = keyOf(c);
    if (k != null) wanted.add(k);
  }

  let cursor = from.firstChild;
  let next = to.firstChild;
  while (next) {
    const toNode = next;
    next = next.nextSibling;

    // Drop keyed nodes that won't be reused so unkeyed siblings can line up
    while (cursor && keyOf(cursor) != null && !wanted.has(keyOf(cursor))) {
      const n = cursor.nextSibling;
      keyed.delete(keyOf(cursor));
      from.removeChild(cursor);
      cursor = n;
    }

    const k = keyOf(toNode);
    let match = null;
    if (k != null) {
      const cand = keyed.get(k);
      if (cand && cand.tagName === toNode.tagName) {
        match = cand;
        keyed.delete(k);
      }
    } else if (cursor && keyOf(cursor) == null && compatible(cursor, toNode)) {
      match = cursor;
    }

    if (match) {
      if (match === cursor) cursor = cursor.nextSibling;
      else from.insertBefore(match, cursor);
      morphNode(match, toNode);
    } else {
      from.insertBefore(toNode, cursor);
    }
  }
  while (cursor) {
    const n = cursor.nextSibling;
    from.removeChild(cursor);
    cursor = n;
  }
}

function morphNode(from, to) {
  if (from.nodeType === 3 || from.nodeType === 8) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  if (from.nodeType !== 1) return;

  const fa = from.attributes;
  for (let i = fa.length - 1; i >= 0; i--) {
    const name = fa[i].name;
    if (!to.hasAttribute(name)) from.removeAttribute(name);
  }
  const ta = to.attributes;
  for (let i = 0; i < ta.length; i++) {
    const { name, value } = ta[i];
    if (from.getAttribute(name) !== value) from.setAttribute(name, value);
  }

  const tag = from.tagName;
  if (tag === 'INPUT') return; // keep whatever the user typed/selected (forms hold their own draft)
  if (tag === 'TEXTAREA' || tag === 'VIDEO' || tag === 'CANVAS') return;
  if (to.getAttribute('data-morph') === 'skip') return;
  morphChildren(from, to);
}
