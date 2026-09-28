# SweatPact 💪🤝

A tiny workout-accountability app for two people. Set a weekly goal, snap a photo when you work out, and keep each other going — with a little something at stake.

It's a **web app (PWA)**: it installs to the Home Screen on iPhone and Android and opens full-screen like a normal app, but there's no App Store, no Xcode and no build step. Host it for free on **GitHub Pages**, sync the two phones through a free **Firebase** project.

**Try it right away:** until you add a Firebase config, the app runs in **demo mode** with a pretend partner, so you can click through everything on your computer first.

---

## Features

| Feature | What it does |
| --- | --- |
| Weekly goal | Each person picks how many days a week they'll work out (1–7). |
| Photo check-in | Snap a selfie, then optionally a second shot with the other camera. **Either one can be the main photo** (tap to swap), so you never have to film other people at the gym. Add the activity and a note. |
| Shared week board | See both of your weeks at a glance: which days, photos, and who's safe. Updates live on your partner's phone. |
| Stakes | “Loser buys dinner.” Whoever misses their weekly goal owes it. There's a ledger of who owes what, with a “settled” button. |
| Pinky promise 🤙 | Forgot to take a photo? Send a pinky promise for that day and your partner decides if it counts. Also works as a “log without photo.” |
| Reactions | React to your partner's check-ins with 🔥 💪 👏 ❤️ 😂. |
| Comments 💬 | Chat under any check-in. Unread comments get a dot. |
| Poke 👉 | Nudge your partner (“Gym today? 💪”). It shows as a banner on their Home screen. One poke per hour. |
| Gallery upload | Pick a photo from your library instead of the camera. It's tagged “🖼️ gallery” so it stays honest. |
| Stats & calendar | History → Stats: a monthly calendar colored by who worked out, plus workouts, per-week average, goal hit rate, best run, favorite activity and stakes won/lost, side by side. |
| Weight & body ⚖️ | Optional: History → Body. Log your weight whenever you like (daily, every few weeks, never). Tap **Body composition** to add skeletal muscle, fat mass and body water from a smart scale or gym machine. You get a smoothed trend chart, weekly rate, goal progress, BMI (with your height), body fat %, lean mass and a BMR estimate. kg or lb. **Private**: only you see your weigh-ins; optionally share just your progress (“−2 kg since Aug 10”) with your partner. |
| Weekly recap | The first time you open the app in a new week, a recap of last week pops up (also on every week in History). **Share to WhatsApp** turns it into an image. Single check-ins can be shared from the photo viewer too. |
| Team streak 🔥 | Consecutive weeks where you *both* hit your goals. |
| Treat yourselves 🎁 | Set a shared reward (“Fancy brunch”) for hitting your goals N weeks in a row, then cash it in. |
| History | Every week: who hit their goal, what was at stake, all the photos. |
| Fair rules | Goal and stakes changes apply **from next week**, so nobody can dodge the stakes on a Sunday night. If you team up late in the week (Thu–Sun) you get a warm-up week. |
| Works offline | The app loads with no signal (at the gym!) and check-ins sync when you're back online. |
| Your data | Download a full backup (JSON, photos included) any time. |
| Light & dark mode | Follows your phone's setting. |

What's *not* possible in a web app: Home Screen **widgets**, and **push notifications** without running a server (see [Ideas for later](#ideas-for-later)).

> **Updating from an older version?** Version 1.1 added pokes and comments and 1.2 added weight tracking. Both need the new rules: paste [`firestore.rules`](firestore.rules) into Firebase → Firestore Database → Rules → **Publish** again.

---

## 1. Run it on your computer (2 minutes)

You need any static web server. Pick one:

```bash
# with Node.js installed
npm start                     # serves http://localhost:8080

# or with Python
python3 -m http.server 8080
```

Open **http://localhost:8080** and choose **Try the demo**. In demo mode:

- everything stays in your browser,
- your pretend partner “Alex” reacts to your check-ins and approves your pinky promises,
- **Settings → Demo controls** lets you make Alex check in, send you a pinky promise, or **skip to next week** to see stakes, streaks and rewards settle.

> Tip: use your browser's device toolbar (Chrome DevTools → phone icon) to see it at phone size. The camera works on `localhost`.

Run the tests (Node 20+): `npm test`

---

## 2. Set up Firebase (free, ~10 minutes)

Firebase keeps the two phones in sync. The free **Spark** plan is plenty for two people (details in [Costs](#costs)). You don't need a credit card.

1. **Create a project** — go to <https://console.firebase.google.com>, click **Create a project** (e.g. `sweatpact`). Google Analytics isn't needed; you can turn it off.
2. **Turn on sign-in** — **Build → Authentication → Get started → Sign-in method**, then enable:
   - **Anonymous** (lets you start without an account), and
   - **Email/Password** (lets you protect your account and sign in on a new phone).
3. **Create the database** — **Build → Firestore Database → Create database**.
   - If asked for an edition, pick **Standard**.
   - Pick a location near you (it can't be changed later).
   - Start in **production mode**.
4. **Publish the security rules** — in Firestore open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**. These rules make sure only the two people in a pact can see its data.
5. **Register the web app** — click the gear icon → **Project settings → General → Your apps →** the **`</>`** (Web) button. Give it a nickname, skip Firebase Hosting, and you'll see a `firebaseConfig` object.
6. **Paste the config** into [`js/firebase-config.js`](js/firebase-config.js):

   ```js
   export const firebaseConfig = {
     apiKey: 'AIza...',
     authDomain: 'sweatpact-xxxx.firebaseapp.com',
     projectId: 'sweatpact-xxxx',
     storageBucket: 'sweatpact-xxxx.firebasestorage.app',
     messagingSenderId: '1234567890',
     appId: '1:1234567890:web:abc123',
   };
   ```

   These values are **safe to commit to a public repo** — they only identify your project. Your data is protected by the rules from step 4.

Reload `http://localhost:8080`: the welcome screen now shows **Get started** instead of the demo.

> Already tried the demo in this browser? Go to **Settings → Exit demo** first.

---

## 3. Put it online with GitHub Pages (free, ~5 minutes)

The camera only works on secure (`https://`) sites, so for your phones you need the app online. GitHub Pages is free for public repositories.

1. Create a new repository on GitHub, e.g. `sweatpact` (public).
2. Upload the project. Either drag all files into **Add file → Upload files** on the repo page, or:

   ```bash
   git init
   git add .
   git commit -m "SweatPact"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/sweatpact.git
   git push -u origin main
   ```

3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch **main**, folder **/ (root)** → **Save**.
4. After a minute your app is live at **`https://YOUR-USERNAME.github.io/sweatpact/`**.
5. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain** → `YOUR-USERNAME.github.io`.

No build step, no GitHub Actions: every push to `main` redeploys automatically.

<details>
<summary>Prefer Firebase Hosting instead of GitHub Pages?</summary>

Also free, and on the same project. Install the Firebase CLI (`npm i -g firebase-tools`), run `firebase login`, `firebase use --add` (pick your project), then `firebase deploy`. This deploys the site *and* the security rules (see `firebase.json`). Your app will be at `https://YOUR-PROJECT.web.app`.
</details>

---

## 4. Install it on both phones

**iPhone (Safari)** — open your app's URL → tap **Share** → **Add to Home Screen** → **Add**. Then open **SweatPact from the Home Screen** and set it up *there*.

> ⚠️ On iPhone, the Home Screen app has its own storage, separate from Safari. Anything you set up in a Safari tab won't carry over — so install first, then set up. (The app reminds you.)

**Android (Chrome)** — open the URL → tap **Install** when prompted, or menu **⋮ → Install app / Add to Home screen**.

## 5. Team up

1. **You:** Get started → your name → weekly goal → **Start a new pact** → pick the stakes → **Share invite link**.
2. **Your partner:** open the link, install the app (see above), then **Join the pact** — the code is filled in for them. (They can also type the 6-character code under **Join my partner**; you'll find it later in **Settings → Partner**.)
3. Both of you: **Settings → Protect my account** to add an email and password. Guest accounts live on one phone only; protecting yours means you can sign in on a new phone and keep your streak and history.

That's it — tap the big camera button after your next workout.

---

## How it works

### No build step
Plain HTML, CSS and JavaScript modules. No `npm install`, no bundler, no framework. The Firebase SDK is loaded from Google's CDN (`www.gstatic.com/firebasejs/...`) only when a config is present; the version lives in [`js/config.js`](js/config.js) (`FIREBASE_SDK_VERSION`).

### Project structure

```
index.html                  App shell
manifest.webmanifest        Makes it installable (name, icons, colors)
sw.js                       Service worker: offline support & instant loading
firestore.rules             Security rules to paste into Firebase
firebase.json               Optional: Firebase CLI deploys (rules + hosting)
css/app.css                 All styles (light/dark, colors at the top)
icons/                      App icons
js/
  main.js                   Starts the app, picks demo vs Firebase
  config.js                 App name, Firebase SDK version, activities, suggestions
  firebase-config.js        ← your Firebase config goes here
  core/
    logic.js                The rules of the game: weeks, goals, stakes, streaks, rewards
    stats.js                Stats, calendar and weekly recap numbers
    body.js                 Weight & body composition: units, BMI/BMR, trend, validation
    share-card.js           Draws the shareable recap / check-in images, opens WhatsApp
    dates.js                Day/week helpers
    photos.js               Camera capture, cropping, JPEG compression
    photo-cache.js          Keeps photos on the phone so each is downloaded once
    store.js, model.js      App state
    platform.js             Install prompt, share sheet, clipboard, downloads
  backends/
    firebase.js             Real sync (Auth + Firestore)
    local.js                Demo mode with a simulated partner
  ui/
    app.js                  Routing, rendering, actions
    camera.js               The check-in camera
    sheets.js               Bottom sheets & photo viewer
    components.js           Shared UI pieces
    screens/                welcome (onboarding), home, history, body, pact, settings
  lib/                      Tiny helpers: HTML templating + DOM diffing, icons, IndexedDB
tests/                      `npm test` – logic tests + Firebase backend tests against a fake Firebase
```

### Data model (Firestore)

```
users/{uid}                    { name, pairId, body: { heightCm, sex, birthYear, goalKg, units, share } }
users/{uid}/weights/{dayKey}   { weightKg, muscleKg?, fatKg?, waterKg?, note? }   ← private, only you can read it
codes/{CODE}                   { pairId, creatorName, ... }        ← how a partner finds the pact
pairs/{pairId}                 { members, names, goals, stakes, weekStartsOn, startWeek, reward, rewardHistory, paid }
pairs/{pairId}/checkins/{id}   { uid, dayKey, kind, status, activity, note, reactions, ... }   (small)
pairs/{pairId}/photos/{id}     { main, inset }                     (compressed JPEGs, fetched only when shown)
pairs/{pairId}/comments/{id}   { checkinId, uid, text, clientAt }
(pokes live on the pair document: pokes.{uid} = { text, at }, pokeSeen.{uid} = at;
 with sharing on, bodyShare.{uid} = { deltaKg, ratePerWeekKg, count, since } – no absolute weights)
```

Goals and stakes are stored as small histories (`[{from: '2026-09-28', value: 3}, ...]`) so past weeks are always judged by the rules that applied at the time. Streaks, debts and reward progress are computed on the phone from the check-ins — see `js/core/logic.js`.

### Photos without paid storage
Firebase's file storage now requires the paid plan, so photos are compressed on the phone (main shot ~720×960, inset ~360×480, usually 100–200 KB together) and stored in Firestore documents. Each photo is downloaded at most once per phone and then kept on the device.

### Offline
The service worker caches the app so it opens instantly and without signal. Firestore's offline cache keeps your data on the phone and queues check-ins until you're back online (you'll see a small sync icon on posts that haven't been sent yet).

### Costs
On the free Spark plan, Firestore includes 1 GiB of storage, 50K reads/day, 20K writes/day and 10 GiB/month of downloads ([current limits](https://firebase.google.com/pricing)). Two people checking in 3–4 times a week each add at most about 100 MB of photos per year, so the free 1 GiB lasts close to a decade. Anonymous and Email/Password sign-in are free. GitHub Pages is free.

### Security & privacy
- Only the two members of a pact can read or change its check-ins, photos and settings (enforced by `firestore.rules`).
- A partner joins by knowing the pact code; a pact never has more than two people.
- You can only approve your *partner's* pinky promises, only edit or delete your own check-ins and comments, and only set your own reaction and poke.
- Weigh-ins and body composition are readable only by you — not even your partner. With **Share my progress** on, your partner sees only your change and weekly rate.
- Your photos live in **your own** Firebase project — not on anyone else's server.

---

## Customize it

| What | Where |
| --- | --- |
| App name | `APP_NAME` in `js/config.js`, plus `name`/`short_name` in `manifest.webmanifest` and the `<title>`/`apple-mobile-web-app-title` in `index.html` |
| Colors | The variables at the top of `css/app.css` (`--me`, `--partner`, `--grad`, …) |
| Activities, stakes & reward suggestions, reaction emojis | `js/config.js` |
| Icons | Replace the PNGs in `icons/` (keep the same sizes) |
| Demo partner's name | `DEMO_PARTNER_NAME` in `js/config.js` |

### Updating the live app
Just push your changes. Phones pick up the new version in the background and show it the next time the app is opened (fully close and reopen it). If you **add or rename files**, also add them to `APP_SHELL` in `sw.js` and bump `VERSION` there.

While developing on `localhost`, the service worker always fetches fresh files, so a normal reload shows your changes.

---

## Troubleshooting

| You see | Fix |
| --- | --- |
| “Guest sign-in is turned off…” | Firebase → Authentication → Sign-in method → enable **Anonymous**. |
| “No Firestore database yet…” | Firebase → Firestore Database → **Create database**. |
| “Firebase refused the request…” | Publish the rules from `firestore.rules` (Firestore → Rules → Publish). |
| “This website is not an authorized domain…” | Firebase → Authentication → Settings → Authorized domains → add your GitHub Pages domain. |
| The camera doesn't open | The site must be `https://` (or `localhost`). Allow camera access when asked; on iPhone check **Settings → Safari → Camera**. You can always use the **Camera app** button or a pinky promise. |
| iPhone lost my setup after installing | You set it up in Safari before adding it to the Home Screen. Set it up again from the Home Screen app — or protect your account first and sign in. |
| My partner lost their phone | If they protected their account: sign in on the new phone. If not: **Settings → Remove partner**, and they re-join with the code (the streak restarts). |
| The app didn't update | Fully close it and open it again. |

---

## Ideas for later

- **Push notifications** when your partner checks in. Web push works on installed web apps (iPhone iOS 16.4+ and Android), but sending needs a small server — e.g. Firebase Cloud Functions (paid Blaze plan) or a scheduled GitHub Action.
- A weekly recap card, monthly stats, or more than two people per pact.
