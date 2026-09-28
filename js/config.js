// App-wide settings. Rename the app here (and in manifest.webmanifest + index.html).
export const APP_NAME = 'SweatPact';
export const APP_TAGLINE = 'Show up together.';
export const APP_VERSION = '1.2.0';

// Firebase JS SDK version loaded from Google's CDN (www.gstatic.com/firebasejs/<version>/...).
// To upgrade, change this to any version listed at https://firebase.google.com/support/release-notes/js
export const FIREBASE_SDK_VERSION = '12.17.1';

// Demo mode's simulated partner.
export const DEMO_PARTNER_NAME = 'Alex';

export const MAX_NAME = 24;
export const MAX_NOTE = 140;
export const MAX_STAKES = 60;
export const MAX_REWARD = 60;

export const ACTIVITIES = [
  { id: 'gym', label: 'Gym', emoji: '🏋️' },
  { id: 'run', label: 'Run', emoji: '🏃' },
  { id: 'walk', label: 'Walk', emoji: '🚶' },
  { id: 'yoga', label: 'Yoga', emoji: '🧘' },
  { id: 'bike', label: 'Bike', emoji: '🚴' },
  { id: 'swim', label: 'Swim', emoji: '🏊' },
  { id: 'sports', label: 'Sports', emoji: '⚽' },
  { id: 'home', label: 'Home workout', emoji: '🏠' },
  { id: 'other', label: 'Other', emoji: '✨' },
];

export const STAKES_SUGGESTIONS = [
  'Loser buys dinner 🍝',
  'Loser does the dishes 🍽️',
  'Loser plans date night 💫',
  'Loser buys coffee ☕',
  'Loser gives a massage 💆',
];

export const REWARD_SUGGESTIONS = [
  'Fancy brunch 🥞',
  'Movie night 🍿',
  'Spa day 💆',
  'New workout gear 👟',
  'Weekend trip 🏕️',
];

export const REACTIONS = ['🔥', '💪', '👏', '❤️', '😂'];

export const POKE_PRESETS = ['Gym today? 💪', 'Your turn! 👀', "Don't make me buy dinner 😤", 'Miss you at the gym 🥺', 'Race you! 🏃'];
export const POKE_COOLDOWN_MIN = 60;
export const MAX_POKE = 80;
export const MAX_COMMENT = 280;
export const MAX_WEIGHT_NOTE = 80;
