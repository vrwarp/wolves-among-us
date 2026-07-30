# Footprints Companion — setup (about 10 minutes, once)

A single web page that keeps the round clock, death count, target, Sabotages and
answer sheets in sync across the TV and all four counselor phones, using Firebase
Firestore. Free tier; a whole game night is a few hundred reads/writes ($0).

## 1. Create the Firebase project  (3 min)
1. Go to **console.firebase.google.com** → **Add project** → name it (e.g. `footprints`).
2. Turn **off** Google Analytics when asked. Create.

## 2. Turn on Firestore  (1 min)
1. Left sidebar → **Build → Firestore Database → Create database**.
2. **Production mode**, nearest location. Done. (The deploy in step 4 installs the rules.)

## 3. Get your config  (1 min)
1. Gear icon → **Project settings** → **Your apps** → the **`</>`** (web) icon.
2. Nickname `companion`, do NOT tick hosting here → **Register**.
3. You'll see a `const firebaseConfig = { apiKey: ... }` block. **Copy the whole block.**

## 4. Deploy this folder to Firebase Hosting  (4 min)
Needs Node.js installed once (nodejs.org, LTS).

    cd companion
    npm install               # installs firebase-tools locally (one time)
    npx firebase login
    npx firebase use --add    # pick your project, alias: default
    npm run deploy

That prints your URL:  **https://YOUR-PROJECT.web.app**
(`deploy` also publishes `firestore.rules` — nothing to paste by hand.)

> No Node? Any HTTPS static host works (GitHub Pages, Netlify drop):
> upload `index.html`, then paste `firestore.rules` into
> Firestore → **Rules** → Publish, manually.

## 5. Connect the devices  (2 min)
1. Open your URL on **one** phone → paste the `firebaseConfig` block → keep or edit
   the game id → **Connect**.
2. A QR code appears under **Share to other devices**. Pick the view (Monitor /
   CC / Foreman / Referee / Ghost) and scan it on each device — **the link carries
   the connection**, so nobody else types anything.
3. TV: open the Monitor link in its browser (or a laptop on HDMI) → `fullscreen`
   → `stay awake`.

## On the night
- Any counselor view can run everything: clock ±0:30, meetings, ejections
  (crewmate = +1 death, imposter = free), Sabotage sets with automatic
  +1:00 / −1:30 & +2 deaths, target and threshold steppers, New Round.
- **Answers tab** = the paper answer sheet: tap a group number for door codes,
  Bible pages, gospel word and ball direction; tap a sudoku slip number for its
  solution (orange digits = the printed givens).
- The dot top-right: green = live sync · grey = demo (not connected) · red = offline
  (state freezes, catches up when wifi returns).
- Paper is the backup: answer sheets and the whiteboard work if wifi dies.

## Before the night: 2-minute smoke test
Open the URL on two phones. Death + on one appears on the other within a second;
start a Sabotage on one and Undo it from the other. If that works, everything
works. (`test/EMULATOR.md` has the full automated multi-device test.)

## Security note (honest version)
Anyone who has the link can change the game state — that's what makes setup
instant. The game id is unguessable and the stakes are a youth game night.
Afterwards, delete the project (or flip the rules to `allow read, write: if false;`).
