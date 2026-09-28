// Shareable images (weekly recap, single check-in) drawn on a canvas, and sharing to WhatsApp.
import { drawCover, loadImage, makeCanvas } from './photos.js';
import { APP_NAME } from '../config.js';

const W = 1080;
const H = 1350; // 4:5 – looks good in WhatsApp and Instagram
const FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji"';
const ME = '#FF6A3D';
const PARTNER = '#5B5FEF';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function font(weight, size) {
  return `${weight} ${size}px ${FONT}, ${EMOJI}`;
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fitText(ctx, `${kept[maxLines - 1]} …`, maxWidth);
    return kept;
  }
  return lines;
}

async function safeImage(url) {
  if (!url) return null;
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

function toBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88));
}

function brandBackground(ctx) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#FF7A45');
  g.addColorStop(1, '#FF3D6E');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (const [x, y, r] of [[980, 120, 220], [80, 1250, 260], [900, 1180, 120]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function footer(ctx) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = font(800, 34);
  ctx.textAlign = 'center';
  ctx.fillText(`${APP_NAME} · show up together`, W / 2, H - 46);
}

/**
 * @param {{ title: string, subtitle: string, rows: {name: string, count: number, goal: number, hit: boolean, who: 'me'|'partner'}[],
 *           outcome: string, streak: number, photos: string[] }} r  photos are image URLs
 */
export async function renderRecapImage(r) {
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  brandBackground(ctx);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = font(700, 40);
  ctx.fillText(r.subtitle, 70, 110);
  ctx.font = font(900, 76);
  ctx.fillText(fitText(ctx, r.title, W - 140), 70, 195);

  // Photo collage
  const imgs = (await Promise.all(r.photos.slice(0, 6).map(safeImage))).filter(Boolean);
  const cx = 50;
  const cy = 240;
  const cw = W - 100;
  const cols = imgs.length <= 2 ? Math.max(imgs.length, 1) : 3;
  const rows = Math.ceil(imgs.length / cols);
  const gap = 16;
  const tw = (cw - 80 - gap * (cols - 1)) / cols;
  const th = Math.min(tw * 1.25, rows === 1 ? 420 : 250);
  ctx.font = font(700, 38);
  const outcomeLines = wrap(ctx, r.outcome, cw - 80, 2);
  const contentH =
    (imgs.length ? rows * th + (rows - 1) * gap + 50 : 230) + r.rows.length * 96 + outcomeLines.length * 50 + (r.streak > 0 ? 70 : 0);
  const ch = Math.min(H - cy - 110, 40 + contentH + 30);
  ctx.fillStyle = '#fff';
  roundRect(ctx, cx, cy, cw, ch, 48);
  ctx.fill();

  let y = cy + 40;
  if (imgs.length) {
    imgs.forEach((img, i) => {
      const x = cx + 40 + (i % cols) * (tw + gap);
      const yy = y + Math.floor(i / cols) * (th + gap);
      ctx.save();
      roundRect(ctx, x, yy, tw, th, 24);
      ctx.clip();
      ctx.translate(x, yy);
      drawCover(ctx, img, img.naturalWidth, img.naturalHeight, tw, th);
      ctx.restore();
    });
    y += rows * th + (rows - 1) * gap + 50;
  } else {
    ctx.font = `120px ${EMOJI}`;
    ctx.textAlign = 'center';
    ctx.fillText('💪', W / 2, y + 150);
    y += 230;
  }

  // Member rows
  ctx.textAlign = 'left';
  for (const row of r.rows) {
    const color = row.who === 'me' ? ME : PARTNER;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + 80, y + 10, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = font(900, 36);
    ctx.textAlign = 'center';
    ctx.fillText(row.name.charAt(0).toUpperCase(), cx + 80, y + 23);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#23170f';
    ctx.font = font(800, 44);
    ctx.fillText(fitText(ctx, row.name, 480), cx + 135, y + 26);
    ctx.textAlign = 'right';
    ctx.fillStyle = row.hit ? '#11994c' : '#db3a42';
    ctx.font = font(900, 48);
    ctx.fillText(`${row.count}/${row.goal} ${row.hit ? '✓' : '✗'}`, cx + cw - 40, y + 28);
    ctx.textAlign = 'left';
    y += 96;
  }

  // Outcome + streak
  ctx.fillStyle = '#5f5047';
  ctx.font = font(700, 38);
  for (const line of outcomeLines) {
    ctx.fillText(line, cx + 40, y + 20);
    y += 50;
  }
  if (r.streak > 0) {
    ctx.fillStyle = '#23170f';
    ctx.font = font(900, 44);
    ctx.fillText(`🔥 ${r.streak}-week streak`, cx + 40, y + 40);
  }

  footer(ctx);
  return toBlob(canvas);
}

/** @param {{ name: string, line: string, note: string, main: string, inset: string|null }} c */
export async function renderCheckinImage(c) {
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  brandBackground(ctx);
  const main = await safeImage(c.main);
  const inset = await safeImage(c.inset);
  const px = 50;
  const py = 50;
  const pw = W - 100;
  const ph = H - 100;
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 48);
  ctx.clip();
  if (main) {
    ctx.translate(px, py);
    drawCover(ctx, main, main.naturalWidth, main.naturalHeight, pw, ph);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(px, py, pw, ph);
  ctx.restore();

  if (inset) {
    const iw = 260;
    const ih = 346;
    ctx.save();
    roundRect(ctx, px + 36, py + 36, iw, ih, 30);
    ctx.clip();
    ctx.translate(px + 36, py + 36);
    drawCover(ctx, inset, inset.naturalWidth, inset.naturalHeight, iw, ih);
    ctx.restore();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 8;
    roundRect(ctx, px + 36, py + 36, iw, ih, 30);
    ctx.stroke();
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  let y = H - 300;
  ctx.font = font(900, 64);
  ctx.fillText(fitText(ctx, `${c.name} checked in 💪`, pw - 80), px + 44, y);
  y += 64;
  ctx.font = font(700, 40);
  ctx.fillText(fitText(ctx, c.line, pw - 80), px + 44, y);
  if (c.note) {
    y += 58;
    ctx.font = font(600, 38);
    for (const line of wrap(ctx, `“${c.note}”`, pw - 88, 2)) {
      ctx.fillText(line, px + 44, y);
      y += 48;
    }
  }
  ctx.font = font(800, 30);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(APP_NAME, W - px - 40, H - px - 34);
  return toBlob(canvas);
}

/**
 * Opens the share sheet with the image (pick WhatsApp there). Where images can't be shared
 * (most desktop browsers) it opens WhatsApp with just the text.
 */
export async function shareToWhatsApp({ blob, text, filename = 'sweatpact.jpg' }) {
  if (blob && typeof File !== 'undefined') {
    const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        return 'shared';
      } catch (err) {
        if (err?.name === 'AbortError') return 'cancelled';
      }
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'whatsapp-text';
}
