// Full-screen check-in camera: shot 1 (selfie by default) → optional shot 2 (other camera) → review → post.
// Either camera can be the main photo (tap the small one to swap), so nobody is forced to film the gym.
import { html, morph, raw, cx } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { buildCheckinPhoto, captureVideo, fileToCanvas } from '../core/photos.js';
import { ACTIVITIES, MAX_NOTE } from '../config.js';
import { haptic } from '../core/platform.js';

let active = null; // only one camera at a time

export function isCameraOpen() {
  return Boolean(active);
}

export function closeCamera() {
  active?.close();
}

export function openCamera(ctx) {
  if (active) return;
  const root = document.getElementById('camera-root');
  let st = { step: 'first', facing: 'user', starting: true, error: '', shots: [], swapped: false, busy: false, cams: 2, activity: 'gym' };
  let stream = null;
  let closed = false;

  const set = (patch) => {
    st = { ...st, ...patch };
    render();
  };

  function stopStream() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    const v = root.querySelector('video');
    if (v) v.srcObject = null;
  }

  async function start(facing) {
    stopStream();
    set({ facing, starting: true, error: '' });
    if (!navigator.mediaDevices?.getUserMedia) return set({ starting: false, error: 'unsupported' });
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } },
      });
      if (closed) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        st.cams = devices.filter((d) => d.kind === 'videoinput').length || 1;
      } catch {
        /* ignore */
      }
      set({ starting: false });
    } catch (err) {
      console.warn('Camera error', err);
      set({ starting: false, error: err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'unavailable' });
    }
  }

  function attach() {
    const v = root.querySelector('video');
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      v.play?.().catch(() => {});
    }
  }

  function flash() {
    const f = root.querySelector('.cam-flash');
    if (!f) return;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  function shoot() {
    const v = root.querySelector('video');
    if (!v || !v.videoWidth || st.starting) return;
    const url = captureVideo(v, { mirror: st.facing === 'user' }).toDataURL('image/jpeg', 0.9);
    flash();
    haptic(15);
    if (st.step === 'first') {
      st = { ...st, shots: [{ url, facing: st.facing }], step: 'second' };
      start(st.facing === 'user' ? 'environment' : 'user');
    } else {
      stopStream();
      set({ shots: [...st.shots, { url, facing: st.facing }], step: 'review' });
    }
  }

  async function useFile(file, source) {
    if (!file) return;
    try {
      const url = (await fileToCanvas(file)).toDataURL('image/jpeg', 0.9);
      stopStream();
      set({ shots: [{ url, facing: source }], step: 'review', error: '', swapped: false });
    } catch {
      ctx.toast("Couldn't read that photo");
    }
  }

  async function post(form) {
    if (st.busy) return;
    const fd = new FormData(form);
    const activity = String(fd.get('activity') || '') || null;
    const note = String(fd.get('note') || '').trim().slice(0, MAX_NOTE);
    set({ busy: true });
    try {
      const [a, b] = st.swapped && st.shots[1] ? [st.shots[1], st.shots[0]] : st.shots;
      const photo = await buildCheckinPhoto(a.url, b?.url || null);
      close();
      const source = st.shots.some((s) => s.facing === 'gallery') ? 'gallery' : 'camera';
      await ctx.submitCheckin({ kind: 'photo', activity, note, photo, source });
    } catch (err) {
      console.error(err);
      set({ busy: false });
      ctx.toast(err.message || 'Could not post your check-in');
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    stopStream();
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('keydown', onKey);
    root.removeEventListener('click', onClick);
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('change', onChange);
    root.innerHTML = '';
    root.hidden = true;
    document.body.classList.remove('camera-open');
    active = null;
    ctx.onCameraClosed?.();
  }

  function onVisibility() {
    if (document.hidden) stopStream();
    else if (!closed && (st.step === 'first' || st.step === 'second') && !st.error) start(st.facing);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  function onClick(e) {
    const el = e.target.closest('[data-cam]');
    if (!el) return;
    const what = el.dataset.cam;
    if (what === 'close') close();
    else if (what === 'shoot') shoot();
    else if (what === 'flip') start(st.facing === 'user' ? 'environment' : 'user');
    else if (what === 'skip') {
      stopStream();
      set({ step: 'review' });
    } else if (what === 'retake') {
      set({ shots: [], step: 'first', swapped: false });
      start('user');
    } else if (what === 'swap') set({ swapped: !st.swapped });
    else if (what === 'file') root.querySelector('input.cam-file')?.click();
    else if (what === 'gallery') root.querySelector('input.gal-file')?.click();
    else if (what === 'retry') start(st.facing);
    else if (what === 'promise') {
      close();
      ctx.openSheet({ type: 'promise' });
    }
  }
  function onSubmit(e) {
    const form = e.target.closest('form[data-cam-form]');
    if (!form) return;
    e.preventDefault();
    post(form);
  }
  function onChange(e) {
    if (e.target.matches('input[type=file]')) {
      useFile(e.target.files?.[0], e.target.classList.contains('gal-file') ? 'gallery' : 'camera');
      e.target.value = '';
    }
    if (e.target.name === 'activity') st.activity = e.target.value;
  }

  function errorPanel() {
    const denied = st.error === 'denied';
    return html`<div class="cam-error">
      <div class="cam-error-emoji">${denied ? '🔒' : '📷'}</div>
      <b>${denied ? 'Camera access is blocked' : "Can't open the camera here"}</b>
      <p>${denied ? 'Allow camera access for this app in your browser or phone settings, or use your phone’s camera app instead.' : 'You can still take a photo with your phone’s camera app.'}</p>
      <div class="cam-error-actions">
        <button type="button" class="btn btn-primary" data-cam="file">${icon('camera', { size: 18 })} Use camera app</button>
        <button type="button" class="btn btn-ghost-light" data-cam="gallery">${icon('image', { size: 18 })} Choose from gallery</button>
        ${denied ? html`<button type="button" class="btn btn-ghost-light" data-cam="retry">Try again</button>` : ''}
        <button type="button" class="btn btn-ghost-light" data-cam="promise">Pinky promise instead 🤙</button>
      </div>
    </div>`;
  }

  function reviewPhoto() {
    const [a, b] = st.swapped && st.shots[1] ? [st.shots[1], st.shots[0]] : st.shots;
    return html`<div class="photo cam-preview">
      <img class="photo-main" src=${a.url} alt="Your photo">
      ${b ? html`<img class="photo-inset" src=${b.url} alt=""><button type="button" class="inset-hit" data-cam="swap" aria-label="Swap photos"></button>` : ''}
    </div>`;
  }

  function view() {
    const live = st.step === 'first' || st.step === 'second';
    const titles = { first: 'Check in', second: st.cams > 1 ? 'Now the other side' : 'Add a second shot?', review: 'Looking good!' };
    const hints = {
      first: 'Snap your workout – a selfie, your view, anything.',
      second: st.cams > 1 ? 'Optional: add a shot from the other camera.' : 'Optional: add another shot.',
      review: st.shots[1] ? 'Tap the small photo to swap them.' : 'Add what you did and post it.',
    };
    return html`<div class=${cx('cam', `step-${st.step}`)} role="dialog" aria-modal="true" aria-label="Check-in camera">
      <div class="cam-top">
        <button type="button" class="cam-btn" data-cam="close" aria-label="Close">${icon('x', { size: 26 })}</button>
        <div class="cam-title">${titles[st.step]}</div>
        ${live && !st.error ? html`<button type="button" class="cam-btn" data-cam="flip" aria-label="Switch camera">${icon('flip', { size: 24 })}</button>` : html`<span class="cam-btn-spacer"></span>`}
      </div>
      <div class="cam-stage">
        ${live && !st.error ? html`<video data-key="cam-video" class=${cx({ mirror: st.facing === 'user' })} playsinline muted autoplay></video>` : ''}
        ${live && st.starting && !st.error ? html`<div class="cam-starting"><span class="spinner light"></span></div>` : ''}
        ${st.error && live ? errorPanel() : ''}
        ${st.step === 'second' && st.shots[0] ? html`<img class="cam-first" src=${st.shots[0].url} alt="First shot">` : ''}
        ${st.step === 'review' ? reviewPhoto() : ''}
        <div class="cam-flash"></div>
      </div>
      <p class="cam-hint">${hints[st.step]}</p>
      ${live
        ? html`<div class="cam-controls">
            <div class="cam-side">${st.step === 'first'
              ? html`<button type="button" class="cam-text-btn" data-cam="promise">No photo?<br>Pinky promise</button>`
              : html`<button type="button" class="cam-text-btn" data-cam="skip">Skip</button>`}</div>
            <button type="button" class="shutter" data-cam="shoot" aria-label="Take photo" ${st.starting || st.error ? raw('disabled') : ''}><span></span></button>
            <div class="cam-side"><button type="button" class="cam-text-btn cam-gallery" data-cam="gallery">${icon('image', { size: 26 })}<span>Gallery</span></button></div>
          </div>`
        : html`<form class="cam-review" data-cam-form>
            <div class="chips chips-scroll" role="radiogroup" aria-label="Activity">
              ${ACTIVITIES.map((a) => html`<label class="chip dark"><input type="radio" name="activity" value=${a.id} ${a.id === st.activity ? raw('checked') : ''}><span>${a.emoji} ${a.label}</span></label>`)}
            </div>
            <input class="input dark" name="note" maxlength=${MAX_NOTE} placeholder="Add a note (optional)" autocomplete="off">
            <div class="cam-actions">
              <button type="button" class="btn btn-ghost-light" data-cam="retake">Retake</button>
              <button type="submit" class="btn btn-primary btn-lg" ${st.busy ? raw('disabled') : ''}>${st.busy ? html`<span class="spinner"></span> Posting…` : 'Post check-in'}</button>
            </div>
          </form>`}
      <input class="cam-file" type="file" accept="image/*" capture="user" hidden>
      <input class="gal-file" type="file" accept="image/*" hidden>
    </div>`;
  }

  function render() {
    if (closed) return;
    morph(root, view());
    attach();
  }

  active = { close };
  root.hidden = false;
  document.body.classList.add('camera-open');
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('change', onChange);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('keydown', onKey);
  render();
  start('user');
  return active;
}
