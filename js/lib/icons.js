// Simple line icons (24×24, stroke = currentColor).
import { raw } from './dom.js';

const P = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9.2V19a1.5 1.5 0 0 0 1.5 1.5h3.5v-6h3v6H17a1.5 1.5 0 0 0 1.5-1.5V9.2"/>',
  history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.6"/>',
  trophy: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a.5.5 0 0 0-.5.5A3.5 3.5 0 0 0 8 10"/><path d="M16 6h2.5a.5.5 0 0 1 .5.5A3.5 3.5 0 0 1 16 10"/><path d="M12 13.5V17"/><path d="M8.5 20.5h7"/><path d="M10 17h4l.5 3.5h-5z"/>',
  settings: '<path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2"/><path d="M4 17h3"/><path d="M11 17h9"/><circle cx="9" cy="17" r="2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  share: '<path d="M12 3.5V15"/><path d="m7.5 8 4.5-4.5L16.5 8"/><path d="M6 11.5v7A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5v-7"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  chevronLeft: '<path d="m14.5 6-6 6 6 6"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5.5 12v7.5h13V12"/><path d="M12 8v11.5"/><path d="M12 8C10.6 5.2 7.5 4.6 7.5 6.6 7.5 7.9 9.5 8 12 8zM12 8c1.4-2.8 4.5-3.4 4.5-1.4 0 1.3-2 1.4-4.5 1.4z"/>',
  trash: '<path d="M4.5 7h15"/><path d="M10 11v6M14 11v6"/><path d="M6.5 7l.9 12.1a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/><path d="M9.5 7V4.5h5V7"/>',
  flip: '<path d="M4.5 11.5A7.5 7.5 0 0 1 17.6 6.5L19.5 8.5"/><path d="M19.5 4v4.5H15"/><path d="M19.5 12.5a7.5 7.5 0 0 1-13.1 5L4.5 15.5"/><path d="M4.5 20v-4.5H9"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 15.5-4.5-4.5-8.5 8.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  logout: '<path d="M14.5 4.5h3A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5h-3"/><path d="M10 16.5 5.5 12 10 7.5"/><path d="M5.5 12h10"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 5.6a3.3 3.3 0 0 1 0 5.8"/><path d="M17.5 13.9a6 6 0 0 1 3.5 5.6"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  send: '<path d="M4.5 11.8 19.5 4.5l-5.6 15-3-6.3z"/><path d="m10.9 13.2 3.6-3.6"/>',
  undo: '<path d="M9 14.5 4.5 10 9 5.5"/><path d="M4.5 10h10a5 5 0 0 1 0 10h-3"/>',
  edit: '<path d="M4.5 19.5h3.8L19 8.8a2 2 0 0 0 0-2.8l-1-1a2 2 0 0 0-2.8 0L4.5 15.7z"/><path d="m13.5 6.5 4 4"/>',
  addSquare: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>',
  sparkle: '<path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z"/><path d="M18.5 15.5c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4.5H15"/>',
  wifiOff: '<path d="M3.5 3.5l17 17"/><path d="M8.5 16.1a5 5 0 0 1 5.4-1"/><path d="M5.3 12.7a9.5 9.5 0 0 1 4-2.4"/><path d="M13.8 10.1a9.5 9.5 0 0 1 4.9 2.6"/><path d="M2 9.2a14 14 0 0 1 3.9-2.5"/><path d="M10.3 5.1A14 14 0 0 1 22 9.2"/><path d="M12 19.5h.01"/>',
};

export function icon(name, { size = 22, cls = '', stroke = 2 } = {}) {
  const body = P[name] || P.info;
  return raw(
    `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`,
  );
}
