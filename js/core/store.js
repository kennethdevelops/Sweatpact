// A tiny state container. set()/ui() merge a patch and schedule one render per frame.

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  let scheduled = false;
  const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(f, 0);

  const flush = () => {
    scheduled = false;
    for (const fn of subs) fn(state);
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    frame(flush);
  };

  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      if (!p) return;
      state = { ...state, ...p };
      schedule();
    },
    ui(patch) {
      const p = typeof patch === 'function' ? patch(state.ui) : patch;
      if (!p) return;
      state = { ...state, ui: { ...state.ui, ...p } };
      schedule();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    refresh: schedule,
  };
}
