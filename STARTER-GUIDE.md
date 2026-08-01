# Among Us: Footprints — starter guide for next time

Written after the first live night (2026-07-30 · 20 students · 6 counselors ·
3 rounds). Everything in here is either what worked or what we changed because
it didn't. The full rules are `print-pack/FACILITATOR-PLAYBOOK.pdf` (5 pages);
this is the running-order.

## Shopping (a week out)

- **Apples** — buy at **Costco**, not Safeway (night-one lesson: Safeway pricing hurt). ~6, they take abuse.
- **15 cups** per lane, **3 red balls**, **spoons for every student**, painter's tape for lines and door sheets.
- **4 unmistakably different markers** — one per floor counselor, never set down. The mark *is* the verification.
- **Origami kits** — confirm GREEN is easier than BLUE (green scores 2, blue 3).
- **Bibles: 6 identical ESV LARGE PRINT pew Bibles.** Not "some ESVs" — **large print and regular print have different page numbers**, and the answer sheet is printed for large print. This bit us in prep; the answer sheet now carries the warning.
- **1–2 cheap tablets** for the sabotage kiosks. Any browser is fine.
- Two TVs work great (we ran one per floor) — anything with a browser.

## Print

Follow `print-pack/PRINT-ME-FIRST.md` — every file, copy count, paper type.
Cards changed after night one: each card now names **3 doors, not all 7**, and
Sudoku/Maze have **separate signs** so they can live in different rooms.

## App setup (10 minutes, the day before)

1. The app is deployed at `https://footprints-among-us.web.app` (see `companion/SETUP.md` to redeploy).
2. Make the QR sheet: `cd companion && GAME=night-<something> npm run qr` → print `device-links.html`.
3. Roles are **Game Master · Central Command · Foreman** — every floor counselor scans the *same* Foreman row. TVs scan Monitor (both TVs, same link). Kiosk tablets scan **Sabotage Kiosk** and get propped in quiet hallways, plugged in if possible.
4. On **every** device: check the dot is **green**, and **tap for sound**. Turn both TVs' volume **up** — night one never heard a single cue; they're much louder now, but a muted TV is still silent.
5. Extra browser tabs from an old game night can drag a phone back to the old game — close them.

## Settings (what 20 students actually played like)

| dial | start at | night-one evidence |
|---|---|---|
| Target | **5** (announce: 4 easy · 6 hard) | 10 lost round 1 outright; 5 won round 2 by a nose |
| Round clock | **8:00** | right length all night |
| Imposters | **3** (4 = imposter-leaning) | 4-with-8-deaths won round 3 |
| Death threshold | **6** (8 if 4 imposters) | see below — may now run 1 lower |
| Sabotages/round | 2 · 5 props | barely used night one; the kiosks exist to fix that |

**Balance caveat:** after night one we removed ejection ticks — the board now
moves *only* on kills and failed sabotages. That makes the threshold slightly
harder for imposters than the numbers above, so if round 1 feels crew-safe,
drop the threshold by 1 rather than adding an imposter.

**The Game Master's ±0:30 is the balance dial.** Round 2 was won because of a
single +0:30 added mid-round. Don't be precious about it.

## The reveal — every round, no exceptions

Night one forgot this all three rounds and the imposters never knew their
partners. Circle up, then verbatim:

1. "Everyone: eyes closed." *(walk the circle, tap the imposters)*
2. "If I tapped you — and only if I tapped you — raise a hand **high**. Eyes stay closed."
3. "Imposters: open your eyes. Every raised hand is your partner. Memorize them."
4. "Imposters: close your eyes. Hands down."
5. "Everyone: arms up. … And down." *(cover — nobody can tell who moved before)*
6. "Open your eyes."

While their eyes are open is also when they remember their tools: **walk
through a doorway to reload**, and **hold a status kiosk 2 seconds** to fire a
sabotage after they've walked away. Sell the kiosk hard — an unused sabotage
is a free gift to the crew.

## During a round

- **Meetings run themselves.** Someone yells EMERGEN-C → any counselor taps *Call emergency meeting* → the TV says EVERYONE TO THE LOBBY with the clock stopped → Central Command starts the 3:00 when the room is in. The app walks report → noms → corners → vote and says what to read aloud.
- **Say this in the briefing:** "a wrong vote doesn't move the death board." Night one's room went quiet because accusing felt expensive. It isn't anymore — a tie costs nothing, a wrong eject just loses the one person, and catching an imposter **earns a minute**.
- Keep nominations moving: a nomination needs a *reason*, nominees get their 15 seconds in the corners, and skipping ahead to the vote is one tap when the room has decided early.
- **New round** is the orange button at the very bottom of the Game Master's screen. Run the reveal *before* tapping it.
- **Undo** lives with the Game Master alone — a mis-tap anywhere gets called across to them, fixed once, verified on the TV.
- Dots: **green** good · **red** = offline, keep playing, **don't refresh** (taps queue and land when it heals) · **grey** = talking to nobody, re-scan the QR.
- One phone owns the death count. Two counselors tapping Death+ in the same instant lands as one — look at the TV, not your own screen.

## Night-one scoreboard, for calibration

| round | settings | result |
|---|---|---|
| 1 | target 10 · 3 imp · 6 deaths | **Imposters** — crew ran out of clock at 10 pts |
| 2 | target 5 · 3 imp · 6 deaths · +0:30 mid-round | **Crew**, narrowly |
| 3 | target 5 · 4 imp · 8 deaths | **Imposters** — killed to threshold |

Students had fun in all three. One student ignored tasks and played detective
all night — that's legal, and fine.
