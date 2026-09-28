// Memoized access to the derived game model for the current state.
import { buildModel } from './logic.js';
import { todayKey } from './dates.js';

let last = null;

export function getModel(state) {
  const { pair, checkins, user } = state;
  if (!pair || !user) return null;
  const today = todayKey();
  if (last && last.pair === pair && last.checkins === checkins && last.uid === user.uid && last.today === today) {
    return last.model;
  }
  const model = buildModel({ pair, checkins: checkins || [], meUid: user.uid, today });
  last = { pair, checkins, uid: user.uid, today, model };
  return model;
}
