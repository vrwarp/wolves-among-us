// Clocks and staying power: a phone whose own clock is wrong, the TV actually
// counting down in real time, every device agreeing on the time left, and the
// whole set still synced after sitting idle between rounds.
//   EMU=1 node test/test_endurance.mjs
// IDLE_MIN=10 makes the idle soak longer (default 3 minutes).
import {EMU, BASE, CFG, section, check, note, eq, pick, diff, gid, settle,
        boot, newCtx, mk, live, st, conn, act, until, softUntil, html,
        allAgree, raw, pageErrs, finish} from "./harness.mjs";

await boot();
const clockText = p => p.evaluate("document.querySelector('[data-clk]')?.textContent||''");
const toSec = t => {const m=/^(\d+):(\d\d)$/.exec(t||""); return m ? +m[1]*60 + +m[2] : NaN};

/* ================================================================= */
section("1 · a phone whose own clock is wrong");
{
  const A = await mk("/c/cc","e-skew"), TV = await mk("/monitor","e-skew");
  await act(A,"start");
  await until(TV,"window.__state().timer.mode==='run'");
  await settle(600);

  // A phone that is 4 minutes fast — a genuinely common thing on a spare device.
  const SKEW = 4*60*1000;
  const ctx = await newCtx();
  await ctx.addInitScript(shift => {
    const R = Date;
    function F(...a){ return a.length ? new R(...a) : new R(R.now()+shift) }
    F.now = () => R.now()+shift;
    F.parse = R.parse; F.UTC = R.UTC; F.prototype = R.prototype;
    window.Date = F;
  }, SKEW);
  const SKEWED = await mk("/monitor","e-skew",{ctx});

  const off = await SKEWED.evaluate("window.__offset()");
  check("the app measures the phone's clock error from the server",
    Math.abs(off + SKEW) < 5000, `offset=${off}ms, phone is ${SKEW}ms fast`);

  const good = toSec(await clockText(TV)), bad = toSec(await clockText(SKEWED));
  check("…so the 4-minutes-fast phone still shows the right time left",
    Math.abs(good-bad) <= 2, `TV ${good}s vs skewed phone ${bad}s`);
  if(Math.abs(good-bad) > 2) note("a phone with a wrong clock shows a wrong countdown — check phone clocks before the night");

  // and it can still drive the game correctly
  await act(SKEWED,"adj",-60000);
  await until(TV,"window.__state().timer.endsAt-Date.now()<425000",15000);
  const agree = await allAgree([A,TV,SKEWED]);
  check("a skewed phone's clock edits land correctly on everyone else", agree.ok, agree.detail);
  const g2 = toSec(await clockText(TV)), b2 = toSec(await clockText(SKEWED));
  check("…and both still read the same countdown afterwards", Math.abs(g2-b2)<=2, `${g2}s vs ${b2}s`);
}

/* ================================================================= */
section("2 · the TV really counts down");
{
  const A = await mk("/c/cc","e-tick"), TV = await mk("/monitor","e-tick");
  await act(A,"start");
  await until(TV,"window.__state().timer.mode==='run'");
  const t0 = toSec(await clockText(TV));
  await settle(5000);
  const t1 = toSec(await clockText(TV));
  check("the TV clock ticks down in real time without anyone touching it",
    t0-t1 >= 4 && t0-t1 <= 6, `${t0}s → ${t1}s over 5s`);

  await act(A,"pause");
  await until(TV,"window.__state().timer.mode==='pause'");
  const p0 = toSec(await clockText(TV));
  await settle(3000);
  const p1 = toSec(await clockText(TV));
  check("a paused clock stops on the TV too", p0===p1, `${p0}s → ${p1}s`);

  // the phase stopwatch counts down independently
  await act(A,"sab",2);
  await until(TV,"!!document.querySelector('[data-phclk]')");
  const ph0 = toSec(await TV.evaluate("document.querySelector('[data-phclk]').textContent"));
  await settle(4000);
  const ph1 = toSec(await TV.evaluate("document.querySelector('[data-phclk]').textContent"));
  check("the 2:00 sabotage clock counts down on the TV", ph0-ph1 >= 3 && ph0-ph1 <= 5,
    `${ph0}s → ${ph1}s over 4s`);
  check("…while the paused round clock stays put", toSec(await clockText(TV))===p1,
    toSec(await clockText(TV))+"s");
}

/* ================================================================= */
section("3 · all six devices agree on the time left");
{
  const TV = await mk("/monitor","e-agree");
  const phones = [];
  for(const v of ["/c/cc","/c/cc","/c/foreman","/c/referee","/c/ghost"])
    phones.push(await mk(v,"e-agree"));
  const ALL = [TV,...phones];
  await act(phones[0],"start");
  await until(TV,"window.__state().timer.mode==='run'");
  await settle(1500);

  for(const wait of [0, 5000, 10000]){
    if(wait) await settle(wait);
    const shown = await Promise.all(ALL.map(p=>clockText(p).then(toSec)));
    const spread = Math.max(...shown)-Math.min(...shown);
    check(`after ${(1500+ (wait?wait:0))/1000|0}s all six show the same countdown (±1s)`,
      spread<=1, shown.join("s / ")+"s");
  }

  // a device joining late must show the same countdown, not a fresh 8:00
  const LATE = await mk("/monitor","e-agree");
  await settle(1200);
  const now = await Promise.all([TV,LATE].map(p=>clockText(p).then(toSec)));
  check("a device joining mid-round shows the running countdown, not 8:00",
    Math.abs(now[0]-now[1])<=1 && now[1]<478, `TV ${now[0]}s, joiner ${now[1]}s`);
}

/* ================================================================= */
section("4 · sitting idle between rounds");
{
  const IDLE_MS = (+process.env.IDLE_MIN || 3) * 60000;
  const TV = await mk("/monitor","e-idle");
  const CC = await mk("/c/cc","e-idle"), FM = await mk("/c/foreman","e-idle"),
        GH = await mk("/c/ghost","e-idle");
  const ALL = [TV,CC,FM,GH];
  await act(CC,"dAdj",2);
  await allAgree(ALL);

  console.log(`   · idling every device for ${IDLE_MS/60000} minutes…`);
  await settle(IDLE_MS);

  const conns = await Promise.all(ALL.map(p=>conn(p)));
  check(`every device still reads live after ${IDLE_MS/60000} idle minutes`,
    conns.every(c=>c==="live"), conns.join(","));

  await act(FM,"dAdj",1);
  const woke = await softUntil(TV,"window.__state().deaths===3",20000);
  check("a tap after the idle stretch still reaches the TV", woke, "deaths="+(await st(TV)).deaths);
  const agree = await allAgree(ALL, 20000);
  check("…and everyone converges again", agree.ok, agree.detail);

  // the clock offset probe is only taken at boot — make sure it has not drifted
  const offs = await Promise.all(ALL.map(p=>p.evaluate("window.__offset()")));
  check("clock offsets are still sane after the idle stretch",
    offs.every(o=>Math.abs(o)<5000), offs.join(","));

  await act(CC,"start");
  await until(TV,"window.__state().timer.mode==='run'");
  await settle(3000);
  const shown = await Promise.all(ALL.map(p=>clockText(p).then(toSec)));
  check("starting the clock after the idle stretch is still in sync everywhere",
    Math.max(...shown)-Math.min(...shown) <= 1, shown.join("s / ")+"s");

  // and undo still works after all that quiet
  const before = await st(CC);
  await act(CC,"dAdj",1); await settle(700);
  await act(CC,"undo");   await settle(900);
  check("undo still works after the idle stretch", eq(pick(before), pick(await st(CC))),
    diff(before, await st(CC)));
}

/* ================================================================= */
section("4b · a phone that goes in a pocket");
{
  const CC = await mk("/c/cc","e-lock"), TV = await mk("/monitor","e-lock"),
        P  = await mk("/c/foreman","e-lock");
  await act(CC,"start"); await act(CC,"dAdj",1);
  await allAgree([CC,TV,P]);

  const hide = v => P.evaluate(hidden => {
    Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>hidden?"hidden":"visible"});
    Object.defineProperty(document,"hidden",{configurable:true,get:()=>hidden});
    document.dispatchEvent(new Event("visibilitychange"));
  }, v);

  await hide(true);                       // screen locks, phone goes in a pocket
  await settle(45000);
  await act(CC,"dAdj",1);                 // the game moves on without it
  await act(CC,"sab",2);
  await settle(2500);

  await hide(false);                      // taken back out
  const caught = await softUntil(P,
    "window.__state().deaths===2 && window.__state().banner==='sabotage'", 30000);
  check("a pocketed phone catches up the moment it comes back out", caught,
    `deaths=${(await st(P)).deaths} banner=${(await st(P)).banner}`);
  check("…and its dot is green, not grey", await conn(P)==="live", await conn(P));

  const shown = await Promise.all([TV,P].map(p=>clockText(p).then(toSec)));
  check("…and its round clock is right, not 45 seconds behind",
    Math.abs(shown[0]-shown[1])<=1, `TV ${shown[0]}s vs pocketed ${shown[1]}s`);

  await act(P,"sabOk");
  const back = await allAgree([CC,TV,P], 20000);
  check("it can drive the game immediately after waking", back.ok && back.state.banner==="none",
    back.ok?"banner="+back.state.banner:back.detail);
}

/* ================================================================= */
section("5 · the TV's convenience buttons do not break anything");
{
  const TV = await mk("/monitor","e-tv"), CC = await mk("/c/cc","e-tv");
  const before = await st(TV);
  // wake lock and fullscreen are unavailable headless — they must fail quietly
  TV.on("dialog", d=>d.dismiss().catch(()=>{}));
  await TV.evaluate("act.wake()").catch(()=>{});
  await TV.evaluate("act.fs()").catch(()=>{});
  await settle(800);
  check("stay-awake / fullscreen never disturb the game state",
    eq(pick(before), pick(await st(TV))), diff(before, await st(TV)));
  await act(CC,"dAdj",1);
  check("the TV is still syncing after them", await softUntil(TV,"window.__state().deaths===1"));
  check("no uncaught exceptions from them", pageErrs.length===0, pageErrs.slice(0,3).join(" | "));
}

/* ================================================================= */
section("6 · no page errors");
check("no uncaught exceptions anywhere in the endurance run", pageErrs.length===0,
  pageErrs.slice(0,4).join(" | "));

await finish("ENDURANCE TEST");
