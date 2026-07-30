# What the emulator tests found

Everything below was produced by driving the real app in real browser contexts
(one per phone) against Google's **actual Firestore emulator** — not a mock.
Run it yourself with `npm run test:emulator`.

## The one real bug — fixed

**"New round" could fire without warning.** You tap *New round*, the button
changes to *Tap again to confirm* — and then any other counsellor taps anything.
That re-renders your screen, the label snapped back to *New round — resets
deaths & clock*, but the confirm was still armed underneath. The next innocent
tap wiped deaths, clock, sabotages and started a new round.

With four counsellors on four phones inside a 3-second window, this was likely
to fire at least once a night. The automated test harness itself tripped over it.

Fixed in `index.html`: the button's label is now derived from the armed state, so
the two can never disagree. Regression test:
`test_comprehensive.mjs › the confirm label survives another phone's update`.

## Two guards added

- **SUCCESS / FAILED with no sabotage running** used to still move the clock
  (+1:00 / −1:30) and FAILED still added 2 deaths. They are now no-ops unless a
  sabotage is actually live.
- **Calling a meeting during a live sabotage** used to hide the sabotage banner
  but leave the set armed underneath. A meeting now cancels the sabotage
  outright. It still counts against the two-per-round limit.

## Things that are working as designed — but tell your counsellors

These are not bugs. They fall out of "every phone writes to one shared
document", and they are all recoverable. Worth a 60-second briefing.

**1. Two people tapping the same button at the same instant = one tap.**
Measured: four phones tapping *Death +* in the same instant moved the count by
**1**, not 4. Whoever writes last wins that field.
→ *Let one phone own the death count. Everyone else watches the TV.*

**2. Undo reads your own screen, not the truth.** Tapping Undo three times fast
walked back only 1–2 steps, because each tap re-reads a state that has not
updated yet. And Undo tapped on a phone that is behind reverts to *that phone's*
older snapshot.
→ *Tap Undo once. Watch the number move on the TV. Then tap again if needed.*

**3. Grey dot means you are not connected — and it will not fix itself.**
The app gives the database **8 seconds** to answer on first load. Miss that
window — crowded wifi, six phones connecting at once, a slow captive portal —
and it falls back to demo mode: a fresh-looking 0-death game with a **grey**
dot. Taps there go nowhere, and it never retries. The same thing happens to a
phone that reloads while the database is unreachable.

This is the single most likely way to lose data on the night, and the tell is
one pixel.
→ *Before round 1, walk the room and check every dot is **green**. If any phone
is grey, refresh it. Green = live. Grey = talking to nobody. Red = offline but
it will catch up.*

**3b. "Skip — demo mode" looks like a working game.** A counsellor who taps it
instead of scanning the QR gets a fully functional-looking app with its own
private numbers and a grey dot. Verified: nothing they tap reaches the real game.
→ *Same fix — grey dot, re-scan the QR.*

**3c. Pasting the share link into a tab that already has the app open does
nothing.** It is only a `#hash` change, so the page never re-runs its connect
step. Scanning the QR is fine — the camera opens a fresh tab.
→ *If you paste a link into an open tab, reload it afterwards.*

**4. There is no offline cache.** With wifi fully down, a refresh gives a browser
error page — the app will not load at all.
→ *Never refresh while the dot is red. Wait for it to go green; it catches up on
its own.*

**5. Undo is only 10 deep, and taps that do nothing still use a slot.**
*End meeting* with no meeting open, or *stop* with no phase running, both write a
history entry.
→ *Undo the real mistake first, before tapping anything else.*

**6. Offline taps are queued, not lost.** A phone that goes offline keeps showing
its last known numbers, accepts taps, and flushes them when wifi returns.
Verified across four wifi drops and a long blackout with six queued taps.

## The 60-second briefing card

> **Check your dot before we start. It must be GREEN.**
> Green = live. Grey = talking to nobody, refresh once.
> Red = offline, it'll catch up — **don't refresh**.
> One phone owns *Death +*. Everyone else watches the TV.
> Undo: tap once, watch the TV, then tap again.
> *New round* needs two taps, and paper is always the backup.

## If you want one more change before tomorrow

The 8-second give-up (finding 3) is the only thing here that can silently cost
you data, and it is the one thing a counsellor cannot easily notice. Two options,
both small:

- Raise the timeout from 8s to ~20s in `index.html` (the `setTimeout(...,8000)`
  inside the boot block). Slower phones then still get in.
- Or make the failure loud: on fallback, show the offline banner instead of a
  silent grey dot.

Not done — it is a judgement call about the night, not a bug fix.

## Coverage

| suite | what it covers | checks |
|---|---|---|
| `test_multidevice.mjs` | the original smoke test | 11 |
| `test_comprehensive.mjs` | clock, meetings, phases, ejections, sabotage, counters, new round, undo depth, TV overlays, **all 32 groups + all 80 sudoku answers**, role views, share links, security rules, shipped-data integrity | 156 |
| `test_refresh.mjs` | reload in 13 different game states, five devices reloading at once, reload mid-write, mid-sabotage, two tabs, wifi-down reload, a slow first connect, link-joined reload, wiped storage, an accidental demo-mode tap | 96 |
| `test_chaos.mjs` | **every action performed then undone and compared field by field**, fat-finger repeats, panic undo, four phones acting in the same instant, unplanned sequences, wifi flapping, and a 60-second four-phone random-tap soak (~750 taps) | 107 |
| `test_endurance.mjs` | a phone whose own clock is 4 minutes wrong, the TV counting down in real time, six devices agreeing on the time left, everything still synced after idling between rounds | 26 |
| `test_fullgame.mjs` | a scripted three-round night on six devices — TV, two CC phones, Foreman, Referee, Ghost — with mistakes, corrections, a phone reload and a wifi drop; **all six must agree after every step** | 67 |

**463 checks**, all passing against the real emulator.

## One more thing worth knowing

The clock is kept as an absolute deadline plus a per-device correction measured
against the server at connect time. That means a counsellor's phone can have its
own clock minutes off and still show the correct time remaining — verified with a
phone deliberately set 4 minutes fast.
