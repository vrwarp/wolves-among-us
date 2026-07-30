# Multi-device testing

Everything is wired through npm — from the `companion/` folder:

    npm install            # firebase-tools + playwright (one time)
    npx playwright install chromium   # browser for the test (one time)

    npm test               # real fbBackend code path vs a protocol-faithful mock
    npm run test:emulator  # SAME test vs Google's real Firestore emulator
    npm run emulator       # just the emulator, for poking at the app by hand
    npm run serve          # serve the app locally on :8124

`test:emulator` uses `firebase emulators:exec`, so the emulator starts, the
11-check three-device test runs (sync, mid-game-join regression, cross-device
undo, clock offsets), and everything tears down by itself.

Why both: the cloud sandbox this was built in blocks Firebase downloads, so the
mock (`mock-server.js` + `test/mock/`) reproduces Firestore's documented
semantics — merge writes, server timestamps, snapshot streams — and runs
anywhere. The emulator run is the ground truth; do it once on your machine.
(`test:emulator` loads the real SDK from Google's CDN, so it needs internet.)

## The 2-minute manual smoke test (real Firebase, after deploy)

1. Open your URL on two phones; connect one, share the CC link to the other.
2. Tap **Death +** on one — it appears on the other within a second.
3. Start a Sabotage on one, **Undo** it from the other.

If those three work, everything works — it's all the same one document.
