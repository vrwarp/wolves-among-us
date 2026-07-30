# Multi-device testing

Everything is wired through npm — from the `companion/` folder:

    npm install            # firebase-tools + playwright (one time)
    npx playwright install chromium   # browser for the test (one time)

    npm test               # every suite vs a protocol-faithful mock
    npm run test:emulator  # every suite vs Google's real Firestore emulator  ← the real one
    npm run test:quick     # smoke + core mechanics only (~5 min)
    npm run test:game      # just the scripted game night, on six devices
    npm run emulator       # just the emulator, for poking at the app by hand
    npm run serve          # serve the app locally on :8124

`test:emulator` uses `firebase emulators:exec`: the emulator starts, every
`test_*.mjs` file runs against it in turn, and everything tears down by itself.
Budget about 25 minutes for the full run. **Read `FINDINGS.md` before the
night** — it has the counsellor briefing card.

## The suites

| file | what it covers |
|---|---|
| `test_multidevice.mjs` | the original 11-check smoke test: sync, mid-game-join regression, cross-device undo, clock offsets |
| `test_comprehensive.mjs` | clock, meetings, phase presets, ejections, sabotage, counters and clamps, two-tap New round, undo depth, TV overlays, **all 32 groups and all 80 sudoku answers checked against `appdata.json`**, role views, share links + QR, Firestore security rules, shipped-data integrity |
| `test_refresh.mjs` | reload in 13 different game states, five devices reloading at once, reload mid-write, mid-sabotage, two tabs on one phone, reload with wifi down, reload with the database unreachable, link-joined reload, wiped storage |
| `test_chaos.mjs` | **every action performed then undone and compared field by field**, fat-finger repeats, panic-tapping undo, four phones acting in the same instant, sequences nobody planned, wifi flapping, and a 60-second four-phone random-tap soak |
| `test_endurance.mjs` | a phone whose own clock is 4 minutes wrong, the TV counting down in real time, six devices agreeing on the time left, and everything still synced after sitting idle between rounds (`IDLE_MIN=10` to lengthen) |
| `test_fullgame.mjs` | a scripted three-round night on six devices — TV, two CC phones, Foreman, Referee, Ghost — with mistakes, corrections, a phone reload and a wifi drop. All six must agree after every single step |

Run one on its own against a already-running emulator:

    npm run emulator                       # terminal 1
    npm run serve                          # terminal 2
    EMU=1 node test/test_chaos.mjs         # terminal 3

Every run uses fresh game ids (`RUN_ID` overrides), so a long-lived emulator
never leaks state between runs.

Why both backends: the cloud sandbox this was built in blocks Firebase
downloads, so the mock (`mock-server.js` + `test/mock/`) reproduces Firestore's
documented semantics — merge writes, server timestamps, snapshot streams — and
runs anywhere. The emulator run is the ground truth, and only it can exercise
security rules, offline/reconnect and real write contention. (Both load the real
SDK, so they need internet.)

## The 2-minute manual smoke test (real Firebase, after deploy)

1. Open your URL on two phones; connect one, share the CC link to the other.
2. Tap **Death +** on one — it appears on the other within a second.
3. Start a Sabotage on one, **Undo** it from the other.

If those three work, everything works — it's all the same one document.
