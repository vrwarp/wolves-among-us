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
The app gives the database a fixed budget to answer on first load. Miss it and
it falls back to demo mode: a fresh-looking 0-death game with a **grey** dot.
Taps there go nowhere, and it never retries. The same happens to a phone that
reloads while the database is unreachable.

That budget was **8 seconds**, and it was too tight — the very first client
connection to the freshly created `footprints-among-us` database blew it during
the real deploy, on a fast desktop with good wifi. Raised to **25 seconds**.
Six phones connecting at once on church wifi is the same cold-start situation,
so this was not theoretical.

The fallback still exists, and the tell is still one pixel.
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

**7. Pause reads your screen too.** Like Undo, *Pause game* from a phone that
has not caught up acts on what that phone last saw. Two phones pausing at once
converge fine; the risk is pausing from a stale screen.
→ *Watch the TV, not your own phone.*

## Sound

Synthesised in the page — no audio files, nothing to download, works offline.

| cue | where | when |
|---|---|---|
| countdown beep | every device | each of the last ten seconds |
| end-of-round tone | every device | at 0:00 |
| minute chime | **TV only** | every whole minute |
| sabotage alert | every device | when a set is picked |
| meeting chime | every device | when a meeting starts |
| pause / resume | every device | either way |

Every device works the countdown out from the same absolute deadline, so they
beep together without anything being broadcast.

**Browsers refuse to play audio until the screen is touched.** Every view has a
sound control that reads *tap for sound* in orange until it is unlocked, then
*sound on*; tapping it again mutes. **Tap the TV once after you open it** or it
stays silent all night. It is also the mute if a phone needs to be quiet.

## The 60-second briefing card

> **Check your dot before we start. It must be GREEN.**
> Green = live. Grey = talking to nobody, refresh once.
> Red = offline, it'll catch up — **don't refresh**.
> **Tap the TV screen once so it can make sound.**
> One phone owns *Death +*. Everyone else watches the TV.
> Undo: tap once, watch the TV, then tap again.
> *New round* and *Pause game* need two taps. Paper is always the backup.

## The live deployment

Deployed to **https://footprints-among-us.web.app** (project
`footprints-among-us`, Firestore in `nam5`). `test/live-smoke.mjs` runs 22
checks against the deployed page and the real database — three devices syncing,
cross-device undo, a refresh rejoining, the published security rules, and that
nothing but `index.html` is served. Re-run it any time:

    node test/live-smoke.mjs

Hosting was set to publish the whole folder; it now publishes only `index.html`.
The test suite, `appdata.json`, `package.json` and this file are no longer
reachable from the public URL.

**One thing to keep in mind:** every answer is embedded in `index.html` — all 32
groups' door codes, the 80 sudoku solutions, the gospel words. Anyone who opens
the URL and views source has the answer sheet. That is inherent to the
single-file design; the "no student phones" rule is what makes it safe. Don't
post the link anywhere students can reach it, and delete the project afterwards.

## Coverage

| suite | what it covers | checks |
|---|---|---|
| `test_multidevice.mjs` | the original smoke test | 11 |
| `test_comprehensive.mjs` | clock, meetings, phases, ejections, sabotage, counters, new round, undo depth, TV overlays, **all 32 groups + all 80 sudoku answers**, role views, share links, security rules, shipped-data integrity | 156 |
| `test_refresh.mjs` | reload in 13 different game states, five devices reloading at once, reload mid-write, mid-sabotage, two tabs, wifi-down reload, a slow first connect, link-joined reload, wiped storage, an accidental demo-mode tap | 96 |
| `test_chaos.mjs` | **every action performed then undone and compared field by field**, fat-finger repeats, panic undo, four phones acting in the same instant, unplanned sequences, wifi flapping, and a 60-second four-phone random-tap soak (~750 taps) | 107 |
| `test_features.mjs` | the sound cues (who hears what and when, and what stays silent) and the game-wide pause from all four roles — freeze, exact resume, undo, refresh, two phones at once — plus a section driven by **real clicks** rather than scripted calls | 96 |
| `test_endurance.mjs` | a phone whose own clock is 4 minutes wrong, the TV counting down in real time, six devices agreeing on the time left, everything still synced after idling between rounds | 26 |
| `test_fullgame.mjs` | a scripted three-round night on six devices — TV, two CC phones, Foreman, Referee, Ghost — with mistakes, corrections, a phone reload and a wifi drop; **all six must agree after every step** | 67 |

**559 checks**, all passing against the real emulator.

## One more thing worth knowing

The clock is kept as an absolute deadline plus a per-device correction measured
against the server at connect time. That means a counsellor's phone can have its
own clock minutes off and still show the correct time remaining — verified with a
phone deliberately set 4 minutes fast.
