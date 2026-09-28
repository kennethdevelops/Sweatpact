// Photo helpers: capture from <video>, read files, crop to 3:4, compress to small JPEGs.
// Photos are stored as JPEG data URLs (Firestore documents hold up to ~1 MB).

export const PHOTO_W = 720;
export const PHOTO_H = 960;
export const INSET_W = 360;
export const INSET_H = 480;

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Draws `source` into (0,0,dw,dh) cropping it like CSS object-fit: cover. */
export function drawCover(ctx, source, sw, sh, dw, dh, mirror = false) {
  const target = dw / dh;
  let cw = sw;
  let ch = sh;
  let cx = 0;
  let cy = 0;
  if (sw / sh > target) {
    cw = sh * target;
    cx = (sw - cw) / 2;
  } else {
    ch = sw / target;
    cy = (sh - ch) / 2;
  }
  ctx.save();
  if (mirror) {
    ctx.translate(dw, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, cx, cy, cw, ch, 0, 0, dw, dh);
  ctx.restore();
}

export function captureVideo(video, { mirror = false, width = PHOTO_W, height = PHOTO_H } = {}) {
  const canvas = makeCanvas(width, height);
  drawCover(canvas.getContext('2d'), video, video.videoWidth, video.videoHeight, width, height, mirror);
  return canvas;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

export async function fileToCanvas(file, { width = PHOTO_W, height = PHOTO_H } = {}) {
  let source = null;
  let sw = 0;
  let sh = 0;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    sw = source.width;
    sh = source.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      source = await loadImage(url);
      sw = source.naturalWidth;
      sh = source.naturalHeight;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const canvas = makeCanvas(width, height);
  drawCover(canvas.getContext('2d'), source, sw, sh, width, height, false);
  source.close?.();
  return canvas;
}

export function dataUrlBytes(url) {
  const i = url.indexOf(',');
  return Math.floor(((url.length - i - 1) * 3) / 4);
}

/** Encodes as JPEG, lowering quality until it fits in maxBytes. */
export function canvasToJpeg(canvas, { maxBytes = 150_000, quality = 0.78, minQuality = 0.42 } = {}) {
  let q = quality;
  let url = canvas.toDataURL('image/jpeg', q);
  while (dataUrlBytes(url) > maxBytes && q > minQuality) {
    q = Math.max(minQuality, q - 0.08);
    url = canvas.toDataURL('image/jpeg', q);
  }
  return url;
}

export async function resizeDataUrl(url, width, height, opts) {
  const img = await loadImage(url);
  const canvas = makeCanvas(width, height);
  drawCover(canvas.getContext('2d'), img, img.naturalWidth, img.naturalHeight, width, height, false);
  return canvasToJpeg(canvas, opts);
}

export function dataUrlToBlob(url) {
  const [head, b64] = url.split(',');
  const mime = /data:([^;,]+)/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Final photo for a check-in: main shot + optional smaller inset shot. */
export async function buildCheckinPhoto(mainUrl, insetUrl) {
  const main = await resizeDataUrl(mainUrl, PHOTO_W, PHOTO_H, { maxBytes: 150_000 });
  const inset = insetUrl ? await resizeDataUrl(insetUrl, INSET_W, INSET_H, { maxBytes: 45_000, quality: 0.72 }) : null;
  return { main, inset };
}

export const AVATAR_SIZE = 256;
export const AVATAR_MAX_BYTES = 30_000;

/** Profile picture: square center crop, small enough to live on the pact document. */
export async function buildAvatar(file) {
  const canvas = await fileToCanvas(file, { width: AVATAR_SIZE, height: AVATAR_SIZE });
  return canvasToJpeg(canvas, { maxBytes: AVATAR_MAX_BYTES, quality: 0.82, minQuality: 0.4 });
}

// ---------- Demo placeholder "photos" (no real camera needed) ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Android Emoji",sans-serif';

export function makeDemoPhoto({ seed = 1, emoji = '🏋️', caption = '', width = PHOTO_W, height = PHOTO_H, selfie = false } = {}) {
  const rand = mulberry32(seed);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const hue = Math.floor(rand() * 360);
  const g = ctx.createLinearGradient(0, 0, width * 0.4, height);
  g.addColorStop(0, `hsl(${hue} 72% ${selfie ? 70 : 62}%)`);
  g.addColorStop(1, `hsl(${(hue + 50) % 360} 70% ${selfie ? 48 : 38}%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 16; i++) {
    ctx.beginPath();
    ctx.fillStyle = `hsla(${(hue + rand() * 80) | 0}, 90%, 88%, ${0.06 + rand() * 0.16})`;
    ctx.arc(rand() * width, rand() * height * 0.7, 18 + rand() * width * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!selfie) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, height * 0.7, width, height * 0.3);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(2, width / 180);
    for (let x = -width; x < width * 2; x += width / 5) {
      ctx.beginPath();
      ctx.moveTo(width / 2, height * 0.7);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.round(width * (selfie ? 0.5 : 0.4))}px ${EMOJI_FONT}`;
  ctx.fillText(emoji, width / 2, height * (selfie ? 0.52 : 0.46));
  if (caption) {
    ctx.font = `700 ${Math.round(width * 0.052)}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(caption, width / 2, height * 0.86);
  }
  const v = ctx.createRadialGradient(width / 2, height / 2, width * 0.35, width / 2, height / 2, width);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, width, height);
  return canvasToJpeg(canvas, { quality: 0.7, maxBytes: selfie ? 40_000 : 120_000 });
}
