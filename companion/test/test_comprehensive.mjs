// Core mechanics of the companion app, device-to-device.
//   node test/test_comprehensive.mjs        (mock backend)
//   EMU=1 node test/test_comprehensive.mjs  (real Firestore emulator)
import {readFileSync} from "fs";
import {join} from "path";
import {HERE, APP, EMU, DEF, SDK_CDN, EMU_HOST, EMU_PORT, PROJECT,
        section, check, note, eq, pick, diff, gid, settle, boot, newCtx, mk, live,
        st, conn, act, until, softUntil, html, btnText, btnBy, tap,
        confirmNewRound, confirmPause, modal, CONFIRM_YES, allAgree,
        callMeeting, startMeeting, finishMeeting, MEETPLAN, MEETTOTAL, stageFor, meetLeft,
        windMeeting, raw, pageErrs, finish, BASE, CFG} from "./harness.mjs";

const b = await boot();

/* ---- reading a meeting off a screen ---------------------------------------
   Nothing is written when a stage ends, so what a device believes has to be
   read off the device. The TV names the stage in [data-stlabel]; a phone's
   strip carries the short name and the stage clock in its chip; the desk and
   the floor cards spell the stage out in words. */
const fmt = ms => {const s=Math.max(0,Math.round(ms/1000));
  return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")};
const SHORT2LONG = Object.fromEntries(MEETPLAN.map(([,l,s])=>[s,l]));
// The words the desk is handed for each stage — restated so a silent edit to
// the script the counsellor reads out is something a test notices.
const MEETGUIDE = {
  REPORT:      "Who found the body, and where? Facts only",
  NOMINATIONS: "Take accusations one at a time",
  CORNERS:     "Nominees to the corners",
  VOTE:        "Every corner is a name",
};
const derived = p => p.evaluate(()=>{
  const t = el => el ? el.textContent.trim() : null;
  const lab = document.querySelector("[data-stlabel]");
  const chip = document.querySelector(".strip .chip.phase");
  return {tv:    lab ? t(lab).split(/\s+/)[0] : null,
          chip:  chip ? t(chip).split(/\s+/)[0] : null,
          words: t(document.querySelector(".guide b")) || t(document.querySelector(".mtstage b")),
          stclk: t(document.querySelector("[data-stclk]")),
          mtclk: t(document.querySelector("[data-mtclk]"))};
});
// One label per device, whichever way that device says it.
const labelOf = d => d.tv || SHORT2LONG[d.chip] || d.words || null;
// Clocks are sampled a moment apart on different devices, so "the same" means
// the same second or its neighbour — a whole stage apart is what must not happen.
const toMs = c => {const m=/^(\d+):(\d\d)$/.exec(c||""); return m ? (+m[1]*60+ +m[2])*1000 : NaN};
const near = (a,b,tol=1500) => Math.abs(toMs(a)-toMs(b))<=tol;

/* ================================================================= */
section("1 · connect, bootstrap, defaults");
{
  const A = await mk("/c/cc","g-boot");
  const s = await st(A);
  check("first device reaches live sync", await A.evaluate("window.__conn()")==="live");
  check("fresh game seeded with the documented defaults", eq(s,DEF), JSON.stringify(s).slice(0,160));
  const off = await A.evaluate("window.__offset()");
  check("server clock offset resolved and sane", Math.abs(off)<5000, off+"ms");
  check("_ping probe stripped out of app state", !("_ping" in s));

  if(EMU){
    const d = await raw(gid("g-boot"));
    check("document really exists in Firestore", !!d && !!d.fields);
    check("_ping persisted with a real server timestamp",
      !!d.fields._ping?.mapValue?.fields?.t?.timestampValue, d?.fields?._ping?.mapValue?.fields?.t?.timestampValue);
    check("timer stored as a map, not a string", !!d.fields.timer?.mapValue);
    check("hist stored as an array", !!d.fields.hist?.arrayValue);
    check("deaths stored as an integer", d.fields.deaths?.integerValue==="0", JSON.stringify(d.fields.deaths));
    const skew = Math.abs(new Date(d.fields._ping.mapValue.fields.t.timestampValue).getTime()-Date.now());
    check("server timestamp within 5s of wall clock", skew<5000, skew+"ms");
  }

  // a second game id must be a completely separate document
  const Z = await mk("/c/cc","g-boot-other");
  await act(A,"dAdj",1);
  await until(A,"window.__state().deaths===1");
  await settle(600);
  check("games are isolated by game id", (await st(Z)).deaths===0);
}

/* ================================================================= */
section("2 · round clock");
{
  const A = await mk("/c/cc","g-clock"), B = await mk("/monitor","g-clock");
  await act(A,"start");
  await until(B,"window.__state().timer.mode==='run'");
  check("start propagates to the monitor", (await st(B)).timer.mode==="run");

  await act(A,"adj",30000);
  await until(B,"window.__state().hist.slice(-1)[0].label==='+0:30 clock'");
  let sB = await st(B), rem = sB.timer.endsAt - Date.now();
  check("+0:30 while running pushes endsAt out", rem>500000 && rem<512000, Math.round(rem)+"ms left");

  await act(A,"pause");
  await until(B,"window.__state().timer.mode==='pause'");
  const remA = (await st(A)).timer.remain;
  await settle(900);
  check("paused clock stops draining", (await st(B)).timer.remain===remA, remA+"ms");

  await act(A,"start");
  await until(B,"window.__state().timer.mode==='run'");
  check("resume is labelled Resume, not Start", (await st(B)).hist.slice(-1)[0].label==="Resume clock");

  await act(A,"pause"); await until(A,"window.__state().timer.mode==='pause'");
  await act(A,"adj",-450000);
  await until(A,"window.__state().timer.remain<100000");
  await act(A,"adj",-90000);
  await until(A,"window.__state().hist.length>=6");
  check("−0:30 style adjust never goes below zero while paused", (await st(A)).timer.remain===0,
    (await st(A)).timer.remain+"ms");

  await act(A,"resetT");
  await until(B,"window.__state().timer.mode==='idle'");
  sB = await st(B);
  check("reset restores the full round length", sB.timer.remain===480000 && sB.timer.dur===480000 && sB.timer.endsAt===0);

  // start twice must not restart the clock
  await act(A,"start"); await until(A,"window.__state().timer.mode==='run'");
  const ends = (await st(A)).timer.endsAt;
  await settle(400);
  await act(A,"start"); await settle(400);
  check("start is idempotent while already running", (await st(A)).timer.endsAt===ends);
  await act(A,"pause"); await settle(300);
  const remP = (await st(A)).timer.remain;
  await act(A,"pause"); await settle(300);
  check("pause is idempotent while already paused", (await st(A)).timer.remain===remP);
}

/* ================================================================= */
// A meeting is no longer driven. Central Command used to tap in every stage of
// every meeting while also running it; the four stages tile the 3:00 exactly, so
// each device now derives the stage it is in from the one shared deadline. What
// is left to test is the road in (gather, then the 3:00), the derivation itself,
// and the road out.
//
// Gone with the redesign, and deliberately not replaced:
//   · "CC's <PHASE> preset = Ns" ×5 — act.phasePre is deleted. A stage is not
//     started by hand any more, so there is no preset to check.
//   · "phase stop clears the stopwatch" / "…but does not end the meeting" —
//     act.phaseStop is deleted. Nothing stops a stage; the next one starts when
//     the clock says so. Both checks tested a control that no longer exists.
section("3 · the gather, and a meeting that runs itself");
{
  const A = await mk("/c/cc","g-meet"), G = await mk("/c/gm","g-meet");   // A drives, G watches
  await act(A,"start"); await until(A,"window.__state().timer.mode==='run'");

  /* --- step one: the gather. The round stops; the 3:00 does not start. --- */
  await callMeeting(A);
  await until(G,"window.__state().meet.mode==='gather'");
  let s = await st(G);
  check("calling a meeting stops the round clock everywhere", s.timer.mode==="pause", s.timer.mode);
  check("…and puts the room on notice without starting the 3:00",
    s.banner==="meeting" && s.meet.mode==="gather" && s.meet.endsAt===0, JSON.stringify(s.meet));
  check("…remembering it was the meeting that stopped the round clock",
    s.meet.clock===true, JSON.stringify(s.meet));
  check("…and the sabotage clock is left alone", s.phase.mode==="idle" && s.phase.label==="",
    JSON.stringify(s.phase));

  /* --- step two: Central Command starts the 3:00 once the room is in. --- */
  await act(A,"meeting");
  await until(G,"window.__state().meet.mode==='run'");
  s = await st(G);
  check("the desk starts the 3:00 from the gather",
    s.meet.mode==="run" && s.meet.remain===MEETTOTAL, JSON.stringify(s.meet));
  check("…carrying the gather's memory of the round clock through with it",
    s.meet.clock===true, JSON.stringify(s.meet));
  check("…and still keeping the sabotage clock clear",
    s.phase.mode==="idle" && s.phase.label==="", JSON.stringify(s.phase));

  /* --- the derivation: the stage is a function of the deadline, nothing else --- */
  for(const [ms, label, short, stclk] of [[165000,"REPORT","REPORT","0:15"],
                                          [105000,"NOMINATIONS","NOMS","0:45"],
                                          [ 45000,"CORNERS","CNRS","0:15"],
                                          [ 15000,"VOTE","VOTE","0:15"]]){
    await windMeeting(A, gid("g-meet"), ms);
    await until(G,`document.querySelector(".strip .chip.phase")?.textContent.trim().startsWith(${JSON.stringify(short)})`);
    const w = stageFor(ms);
    check(`${fmt(ms)} left on the meeting clock is ${label}`,
      w && w.label===label && fmt(w.rem)===stclk, JSON.stringify(w));
    const seen = await derived(G);
    check(`…and the Game Master's phone, told nothing, has worked out ${short} too`,
      seen.chip===short && near(seen.stclk, stclk), JSON.stringify(seen));
    const desk = await html(A);
    check(`…while the desk is handed the words for ${label}`,
      desk.includes(MEETGUIDE[label]), (desk.match(/class="guide"><b>[A-Z]+/)||["—"])[0]);
  }

  // Past the end there is no stage at all: what is left is naming who goes out.
  await windMeeting(A, gid("g-meet"), -1500);
  await until(A,"window.__state().meet.endsAt<Date.now()");
  await settle(500);
  check("once the 3:00 is spent no stage is derived at all",
    stageFor(-1500)===null && (await derived(A)).chip===null, JSON.stringify(await derived(A)));

  await finishMeeting(A);
  await until(G,"window.__state().banner==='none'");
  s = await st(G);
  check("closing the meeting clears the banner, the stage and the meeting clock",
    s.banner==="none" && s.phase.mode==="idle" && s.meet.mode==="idle", JSON.stringify(s.meet));
  // The desk closes meetings but no longer owns the clock, so a meeting has to
  // hand back the clock it took, or nobody at the desk can restart the round.
  check("…and gives back the round clock the meeting stopped", s.timer.mode==="run",
    s.timer.mode);
}

/* ================================================================= */
// Calling a meeting takes the round clock away, so the meeting has to give it
// back — however the vote went. Central Command closes meetings but the clock
// belongs to the Game Master now, so a meeting that left it stopped would strand
// the desk mid-round with no control to restart it.
// Equally, it must not hand back a clock it never took.
section("3b · every way out of a meeting hands the round clock back");
{
  const A = await mk("/c/cc","g-mclock"), M = await mk("/monitor","g-mclock");
  const left = s => s.timer.mode==="run" ? s.timer.endsAt-Date.now() : s.timer.remain;

  // Each imposter caught buys +1:00 on the round clock, so a vote that caught
  // one hands back the held time plus a minute — and a tie that caught one
  // alongside a crewmate hands back exactly the same. A crew-only vote gives
  // back precisely what the meeting took.
  for(const [name, exit, bonus] of [["Crewmate ejected",{crew:1},0],
                                    ["IMPOSTER caught",{imp:1},60000],
                                    ["a tie — two crewmates",{crew:2},0],
                                    ["a tie — crewmate and imposter",{crew:1,imp:1},60000]]){
    await act(A,"resetT"); await until(A,"window.__state().timer.mode==='idle'");
    await act(A,"start");
    await until(M,"window.__state().timer.mode==='run'");
    await settle(600);                       // let real seconds come off it
    await callMeeting(A);
    await until(M,"window.__state().meet.mode==='gather'");
    check(`${name}: calling the meeting stopped the round clock`,
      (await st(M)).timer.mode==="pause", (await st(M)).timer.mode);
    const held = (await st(M)).timer.remain;
    await act(A,"meeting");
    await until(M,"window.__state().meet.mode==='run'");
    check(`${name}: the gather handed the held clock through to the 3:00`,
      (await st(M)).meet.clock===true, JSON.stringify((await st(M)).meet));

    await finishMeeting(A, exit);
    await until(M,"window.__state().meet.mode==='idle'");
    await settle(400);
    const s = await st(M);
    check(`${name}: the round clock is running again`, s.timer.mode==="run", s.timer.mode);
    check(`${name}: it resumes where the meeting froze it${bonus?" plus the bought minute":", not from full"}`,
      Math.abs(left(s)-(held+bonus))<2500,
      `${Math.round(held)}ms held +${bonus}ms → ${Math.round(left(s))}ms`);
    check(`${name}: and the meeting clock is cleared with it`,
      s.meet.mode==="idle" && s.banner==="none", JSON.stringify(s.meet));
  }

  /* --- and the two ways it must keep its hands off the clock --- */

  // 1. the clock was never running when the meeting was called
  await act(A,"resetT");
  await until(M,"window.__state().timer.mode==='idle'");
  await startMeeting(A);
  await until(M,"window.__state().meet.mode==='run'");
  check("a meeting called on a stopped clock records that it took nothing",
    (await st(M)).meet.clock===false, JSON.stringify((await st(M)).meet));
  await finishMeeting(A);
  await until(M,"window.__state().meet.mode==='idle'");
  await settle(400);
  check("…and closing it does not start a clock nobody had started",
    (await st(M)).timer.mode==="idle", (await st(M)).timer.mode);

  // the sharper version: a clock deliberately paused before the meeting
  await act(A,"resetT"); await until(A,"window.__state().timer.mode==='idle'");
  await act(A,"start"); await settle(500); await act(A,"pause");
  await until(M,"window.__state().timer.mode==='pause'");
  await startMeeting(A);
  await until(M,"window.__state().meet.mode==='run'");
  await finishMeeting(A);
  await until(M,"window.__state().meet.mode==='idle'");
  await settle(400);
  check("a clock deliberately paused before the meeting is still paused after it",
    (await st(M)).timer.mode==="pause", (await st(M)).timer.mode);

  // 2. the whole game is paused — nothing may start under a PAUSED screen
  await act(A,"resetT"); await until(A,"window.__state().timer.mode==='idle'");
  await act(A,"start");
  await until(M,"window.__state().timer.mode==='run'");
  await startMeeting(A);
  await until(M,"window.__state().meet.mode==='run'");
  await confirmPause(A);
  await until(M,"window.__state().paused.on===true");
  await finishMeeting(A,{imp:1});
  await until(M,"window.__state().meet.mode==='idle'");
  await settle(400);
  let p = await st(M);
  check("closing a meeting while the game is paused does not restart the round clock",
    p.timer.mode!=="run", p.timer.mode);
  check("…and the game is still paused", p.paused.on===true, JSON.stringify(p.paused));

  await act(A,"resumeGame");
  await until(M,"window.__state().paused.on===false");
  await settle(500);
  p = await st(M);
  // Two things have to be true at once here, and they pull against each other.
  // The meeting was ended, so resuming must not bring a 0:00 meeting clock onto
  // the strip and the TV. But the meeting did take the round clock, and it could
  // not hand it back under the pause, so the resume owes it — see 3c, which
  // works the whole matrix.
  check("resuming does not resurrect the meeting that was already ended",
    p.meet.mode==="idle" && p.banner==="none", JSON.stringify(p.meet));
  check("…and the round clock the meeting took comes back with the resume",
    p.timer.mode==="run", p.timer.mode);
  await act(A,"start"); await settle(500);
  check("…and the round clock is still startable afterwards", (await st(M)).timer.mode==="run",
    (await st(M)).timer.mode);
}

/* ================================================================= */
// The mirror of 3b, and the other half of the same fix. afterMeeting() will not
// start a clock under a PAUSED screen — a round clock ticking behind the word
// PAUSED is worse than no clock at all — so a meeting that ends during a pause
// hands the intent to resumeGame instead, via paused.clock. Miss that handover
// and the meeting swallows the clock: the game resumes, the round is on, and
// the desk has a stopped clock it cannot start.
// The opposite mistake is the phantom: resume must never restart a clock that
// something ENDED during the pause, or a finished meeting or sabotage comes
// back stuck at 0:00.
section("3c · a meeting that ends under a pause hands the clock back on resume");
{
  const A = await mk("/c/cc","g-mpause"), M = await mk("/monitor","g-mpause");
  // the desk strip is where a phantom would show: MTG 0:00 or SAB 0:00
  const chips = () => A.evaluate(
    "[...document.querySelectorAll('.strip .chip')].map(c=>c.textContent.trim()).join(' | ')");

  // ejectImp's +1:00 lands in `remain` while the game is paused — the deferred
  // restart then hands back the held time plus the bought minute.
  for(const [name, exit, bonus] of [["Crewmate ejected",{crew:1},0],
                                    ["IMPOSTER caught",{imp:1},60000],
                                    ["a tie — crewmate and imposter",{crew:1,imp:1},60000]]){
    await act(A,"resetT"); await until(A,"window.__state().timer.mode==='idle'");
    await act(A,"start");
    await until(M,"window.__state().timer.mode==='run'");
    await settle(600);                       // let real seconds come off it
    await startMeeting(A);
    await until(M,"window.__state().meet.mode==='run'");
    const held = (await st(M)).timer.remain;

    await confirmPause(A);
    await until(M,"window.__state().paused.on===true");
    await finishMeeting(A, exit);
    await until(M,"window.__state().meet.mode==='idle'");
    await settle(400);
    let s = await st(M);
    check(`${name} under a pause: nothing starts while the screen still says PAUSED`,
      s.timer.mode!=="run" && s.paused.on===true, `${s.timer.mode}, paused.on=${s.paused.on}`);
    check(`${name} under a pause: the clock the meeting took is held for the resume`,
      s.paused.clock===true, JSON.stringify(s.paused));
    if(bonus) check(`${name} under a pause: the bought minute lands in remain, not on a live clock`,
      s.timer.remain===held+bonus, `${Math.round(held)}ms held → remain ${Math.round(s.timer.remain)}ms`);

    await act(A,"resumeGame");
    await until(M,"window.__state().paused.on===false");
    await until(A,"window.__state().paused.on===false");
    await settle(400);
    s = await st(M);
    check(`${name} under a pause: resuming hands the round clock back`,
      s.timer.mode==="run", s.timer.mode);
    check(`${name} under a pause: …from where the meeting froze it${bonus?", plus the bought minute":", not from full"}`,
      Math.abs((s.timer.endsAt-Date.now())-(held+bonus))<2500,
      `${Math.round(held)}ms held +${bonus}ms → ${Math.round(s.timer.endsAt-Date.now())}ms`);
    check(`${name} under a pause: and the meeting stays ended`,
      s.meet.mode==="idle" && s.banner==="none" && s.phase.mode==="idle", JSON.stringify(s.meet));
    check(`${name} under a pause: no phantom chip left on the desk strip`,
      (await chips())==="", await chips());
  }

  // The same shape with a clock that was never started: there is nothing to
  // hand back, and resume must not invent one.
  await act(A,"resetT");
  await until(M,"window.__state().timer.mode==='idle'");
  await startMeeting(A);
  await until(M,"window.__state().meet.mode==='run'");
  await confirmPause(A);
  await until(M,"window.__state().paused.on===true");
  await finishMeeting(A);
  await until(M,"window.__state().meet.mode==='idle'");
  await settle(400);
  check("a meeting called on a stopped clock claims nothing for the resume",
    (await st(M)).paused.clock===false, JSON.stringify((await st(M)).paused));
  await act(A,"resumeGame");
  await until(M,"window.__state().paused.on===false");
  await until(A,"window.__state().paused.on===false");
  await settle(400);
  let s = await st(M);
  check("…and resuming does not start a clock nobody had started",
    s.timer.mode==="idle", s.timer.mode);
  check("…nor bring the ended meeting back with it",
    s.meet.mode==="idle" && s.banner==="none", JSON.stringify(s.meet));
  check("…and the strip is left clean", (await chips())==="", await chips());

  // A sabotage is the other thing that can finish under a pause. Its clock is
  // `phase`, and paused.phase still says it was running when the pause landed —
  // so resume has the same chance to resurrect it at 0:00.
  await act(A,"resetT"); await until(A,"window.__state().timer.mode==='idle'");
  await act(A,"start");
  await until(M,"window.__state().timer.mode==='run'");
  await act(A,"sab");
  await until(M,"window.__state().phase.mode==='run'");
  await confirmPause(A);
  await until(M,"window.__state().paused.on===true");
  s = await st(M);
  check("pausing during a sabotage freezes its clock and remembers it was running",
    s.phase.mode==="pause" && s.paused.phase===true, JSON.stringify(s.paused));
  await act(A,"sabOk");
  await until(M,"window.__state().phase.mode==='idle'");
  await settle(300);
  check("SUCCESS still resolves the sabotage while the game is paused",
    (await st(M)).banner==="none" && (await st(M)).sabItems.length===0);

  await act(A,"resumeGame");
  await until(M,"window.__state().paused.on===false");
  await until(A,"window.__state().paused.on===false");
  await settle(500);
  s = await st(M);
  check("a sabotage resolved under the pause stays resolved after the resume",
    s.phase.mode==="idle" && s.phase.label==="" && s.banner==="none", JSON.stringify(s.phase));
  check("…with no phantom SAB 0:00 chip on the strip",
    !/SAB/.test(await chips()), await chips());
  // …while the round clock, which really was only paused, still comes back: the
  // guard must block the phantom without blocking the honest case.
  check("…and the round clock the pause froze is running again",
    s.timer.mode==="run", s.timer.mode);
}

/* ================================================================= */
// The whole point of deriving the stage: nobody has to drive it, and because
// every device works it out from the same deadline, nothing can drift. This is
// the section that would catch the old bug coming back — a stage that only
// advances on the phone that tapped it.
section("3d · the stages advance with nobody touching anything");
{
  const CC = await mk("/c/cc","g-auto"), TV = await mk("/monitor","g-auto"),
        FM = await mk("/c/foreman","g-auto");
  const ALL = [CC,TV,FM], NAMES = ["the desk","the TV","the Foreman"];
  await act(CC,"start"); await until(TV,"window.__state().timer.mode==='run'");
  await startMeeting(CC);
  await until(TV,"window.__state().meet.mode==='run'");
  await until(FM,"window.__state().meet.mode==='run'");

  // Real time, no help: 0:30 of REPORT has to become NOMINATIONS on its own.
  const opened = await st(CC);
  await until(TV,"!!document.querySelector('[data-stlabel]')", 10000);
  check("the meeting opens in REPORT", labelOf(await derived(TV))==="REPORT",
    JSON.stringify(await derived(TV)));
  const t0 = Date.now();
  const turned = await softUntil(TV,
    "document.querySelector('[data-stlabel]')?.textContent.includes('NOMINATIONS')", 60000);
  const waited = Math.round((Date.now()-t0)/1000);
  const at = meetLeft(await st(TV));
  check("REPORT becomes NOMINATIONS by itself, with nobody tapping",
    turned, `waited ${waited}s — ${JSON.stringify(await derived(TV))}`);
  check("…and it turns where the plan puts the boundary: 0:30 in, 2:30 left",
    turned && Math.abs(at-150000)<3000 && waited>=20,
    `turned with ${Math.round(at)}ms left, after waiting ${waited}s`);
  const after = await st(CC);
  // If anything had to be written to move the stage on, this is where it shows.
  check("…and not one write was needed to move it on",
    after.meet.endsAt===opened.meet.endsAt && after.hist.length===opened.hist.length,
    `endsAt ${opened.meet.endsAt}→${after.meet.endsAt}, hist ${opened.hist.length}→${after.hist.length}`);

  /* --- every device works the same stage out for itself --- */
  for(const ms of [165000, 105000, 45000, 15000]){
    const endsAt = await windMeeting(CC, gid("g-auto"), ms);
    const want = stageFor(ms);
    for(const p of ALL) await until(p, `window.__state().meet.endsAt===${endsAt}`, 12000);
    await settle(500);                        // one render tick on every screen
    const seen = await Promise.all(ALL.map(derived));
    const labels = seen.map(labelOf);
    check(`${fmt(ms)} left: the TV and both phones all say ${want.label}`,
      labels.every(l=>l===want.label),
      NAMES.map((n,i)=>n+":"+labels[i]).join(" | "));
    check(`${fmt(ms)} left: …and all three show the same stage clock`,
      seen.every(d=>d.stclk && near(d.stclk, seen[0].stclk)),
      NAMES.map((n,i)=>n+":"+seen[i].stclk).join(" | "));
    check(`${fmt(ms)} left: …and the same meeting clock above it`,
      seen.every(d=>d.mtclk && near(d.mtclk, seen[0].mtclk)),
      NAMES.map((n,i)=>n+":"+seen[i].mtclk).join(" | "));
  }

  /* --- the two clocks are one clock: they must flip on the same tick --- */
  // The stage clock is the meeting deadline minus a whole number of seconds, so
  // there is no instant at which one has ticked and the other has not. Sample
  // both together, on the phone and on the TV, across several second boundaries.
  await windMeeting(CC, gid("g-auto"), 105000);           // deep inside NOMINATIONS
  await settle(400);
  for(const [p,name] of [[CC,"the desk"],[TV,"the TV"]]){
    const samples = [];
    for(let i=0;i<32;i++){
      samples.push(await p.evaluate(()=>{
        const t = s => {const e=document.querySelector(s); return e?e.textContent.trim():null};
        return {mt:t("[data-mtclk]"), st:t("[data-stclk]")};
      }));
      await settle(250);
    }
    const bad = [];
    for(let i=1;i<samples.length;i++){
      const mtMoved = samples[i].mt!==samples[i-1].mt, stMoved = samples[i].st!==samples[i-1].st;
      if(mtMoved!==stMoved) bad.push(`${samples[i-1].mt}/${samples[i-1].st} → ${samples[i].mt}/${samples[i].st}`);
    }
    const ticks = samples.filter((s,i)=>i&&s.mt!==samples[i-1].mt).length;
    check(`${name}: the meeting clock and the stage clock never tick apart`,
      bad.length===0 && ticks>=5,
      bad.length ? bad.slice(0,3).join(" ; ") : `${ticks} second-boundaries crossed, all in step`);
  }
}

/* ================================================================= */
// One way in, for everyone. The EMERGEN-C yell can come from anywhere in the
// building, so any phone can halt the round — and no phone, the desk included,
// can start the 3:00 without gathering the room first.
section("3e · one way in, and it asks first");
{
  const roles = ["gm","cc","foreman"];
  const pages = {};
  for(const r of roles) pages[r] = await mk("/c/"+r,"g-call");
  const TV = await mk("/monitor","g-call");
  await act(pages.gm,"start"); await until(TV,"window.__state().timer.mode==='run'");

  for(const r of roles){
    // Ask, and look at what the dialog actually says before answering it.
    await act(pages[r],"callMeeting"); await settle(220);
    const m = await modal(pages[r]);
    check(`${r}: calling a meeting asks first`,
      !!m && /emergency meeting/i.test(m.title) && m.buttons.includes(CONFIRM_YES.callMeeting),
      JSON.stringify(m));
    check(`${r}: …and warns that it stops the round everywhere`,
      !!m && /round clock stops/i.test(m.body), m && m.body);
    await act(pages[r],"confirmNo"); await settle(200);
    check(`${r}: …and backing out of the dialog changes nothing`,
      (await st(TV)).meet.mode==="idle" && (await st(TV)).timer.mode==="run",
      JSON.stringify((await st(TV)).meet));

    await callMeeting(pages[r]);
    await until(TV,"window.__state().meet.mode==='gather'");
    check(`${r}: …and confirming halts the round from that phone`,
      (await st(TV)).timer.mode==="pause" && (await st(TV)).banner==="meeting",
      (await st(TV)).timer.mode);
    await act(pages[r],"cancelMeeting");
    await until(TV,"window.__state().meet.mode==='idle'");
    await until(TV,"window.__state().timer.mode==='run'");
  }

  /* --- and nobody, anywhere, has a button that skips the gather --- */
  await act(pages.gm,"desk"); await settle(300);           // the desk takeover open too
  const idle = await Promise.all(roles.map(r=>html(pages[r])));
  check("with no meeting open, not one role has a control that starts the 3:00",
    idle.every(h=>!/act\.meeting\(\)/.test(h)),
    roles.filter((r,i)=>/act\.meeting\(\)/.test(idle[i])).join(",")||"none");
  check("…while every one of them can call the gather",
    idle.every(h=>/act\.callMeeting\(\)/.test(h)),
    roles.filter((r,i)=>!/act\.callMeeting\(\)/.test(idle[i])).join(",")||"all can");

  await callMeeting(pages.foreman);                        // a floor phone calls it, from upstairs
  for(const r of roles) await until(pages[r],"window.__state().meet.mode==='gather'");
  const gathering = await Promise.all(roles.map(r=>html(pages[r])));
  const canStart = roles.filter((r,i)=>/act\.meeting\(\)/.test(gathering[i]));
  check("once the room is gathering, only the desk can start the 3:00",
    eq(canStart.sort(), ["cc","gm"]),                      // gm only via the open takeover
    canStart.join(",")||"nobody");
  check("…and nobody is offered a second meeting on top of the first",
    gathering.every(h=>!/act\.callMeeting\(\)/.test(h)),
    roles.filter((r,i)=>/act\.callMeeting\(\)/.test(gathering[i])).join(",")||"none");
  check("…and the floor is told what is happening rather than given controls",
    /Gather in the lobby/.test(gathering[roles.indexOf("foreman")]) &&
    !/act\.ejectCrew|act\.callVote/.test(gathering[roles.indexOf("foreman")]));
  // A second call while one is already up must not restart anything.
  const g0 = await st(TV);
  await act(pages.foreman,"doCallMeeting"); await settle(600);
  check("a second call landing on top of a live gather is a no-op",
    eq(pick(g0), pick(await st(TV))), diff(g0, await st(TV)));

  /* --- "Never mind": out of the gather, and the round is handed straight back --- */
  await act(pages.cc,"cancelMeeting");
  await until(TV,"window.__state().meet.mode==='idle'");
  await settle(400);
  const back = await st(TV);
  check("backing out of a gather hands the round clock straight back",
    back.timer.mode==="run" && back.banner==="none" && back.meet.mode==="idle",
    `${back.timer.mode} / ${back.banner}`);
}

/* ================================================================= */
// Ejections used to be their own section, tappable at any moment. They are now
// how a meeting is closed, and they only exist once the 3:00 is spent.
section("3f · the end options exist only once the meeting is over");
{
  const CC = await mk("/c/cc","g-endopt"), TV = await mk("/monitor","g-endopt");
  const ENDS = ["Crewmate ejected","IMPOSTER caught","Close the meeting"];
  const ends = async p => {const ts = await btnText(p); return ENDS.filter(e=>ts.some(t=>t.startsWith(e)))};
  const OVER = "document.body.innerHTML.includes('Who is going out?')";

  await act(CC,"resetT"); await until(CC,"window.__state().timer.mode==='idle'");
  await act(CC,"start");
  await until(TV,"window.__state().timer.mode==='run'");
  check("with no meeting at all there is nothing to close", eq(await ends(CC), []), (await ends(CC)).join(","));

  await callMeeting(CC); await until(CC,"window.__state().meet.mode==='gather'");
  check("…nor while the room is still gathering", eq(await ends(CC), []), (await ends(CC)).join(","));

  await act(CC,"meeting"); await until(CC,"window.__state().meet.mode==='run'");
  for(const ms of [165000, 105000, 45000, 15000]){
    await windMeeting(CC, gid("g-endopt"), ms);
    await settle(350);
    check(`…nor with ${fmt(ms)} still on the clock (${stageFor(ms).label})`,
      eq(await ends(CC), []), (await ends(CC)).join(","));
  }
  // The desk can cut it short — but that runs the clock out rather than ending
  // it, so the same choices are always what closes a meeting.
  await act(CC,"callVote");
  await until(CC,"window.__state().meet.remain===0");
  await until(CC, OVER, 12000);
  check("'skip ahead to the vote' runs the clock out instead of ending the meeting",
    (await st(CC)).banner==="meeting" && (await st(CC)).meet.mode==="run",
    JSON.stringify((await st(CC)).meet));
  check("…and only then is the desk offered the ejections and the close",
    eq(await ends(CC), ENDS), (await ends(CC)).join(","));
  await until(TV,"document.body.innerHTML.includes('TIME — CALL THE VOTE')", 12000);
  check("…with the TV telling the room the same thing",
    /TIME — CALL THE VOTE/.test(await html(TV)));
  check("…and the stage row is gone, because there is no stage left",
    (await derived(CC)).chip===null, JSON.stringify(await derived(CC)));

  // callVote is only meaningful once a meeting is actually running.
  await finishMeeting(CC); await until(CC,"window.__state().meet.mode==='idle'");
  let z = await st(CC);
  await act(CC,"callVote"); await settle(500);
  check("calling the vote with no meeting open does nothing at all",
    eq(pick(z), pick(await st(CC))), diff(z, await st(CC)));
  await callMeeting(CC); await until(CC,"window.__state().meet.mode==='gather'");
  z = await st(CC);
  await act(CC,"callVote"); await settle(500);
  check("…and calling it during the gather does nothing either",
    eq(pick(z), pick(await st(CC))), diff(z, await st(CC)));
  await act(CC,"cancelMeeting"); await until(CC,"window.__state().meet.mode==='idle'");

  /* --- and every way the vote can go, taken from the over state, hands the
         round back (a minute on top for each imposter caught) --- */
  for(const [name, exit, bonus] of [["Crewmate ejected",{crew:1},0],
                                    ["IMPOSTER caught",{imp:1},60000],
                                    ["a tie — two crewmates and an imposter",{crew:2,imp:1},60000]]){
    await act(CC,"resetT"); await until(CC,"window.__state().timer.mode==='idle'");
    await act(CC,"start");
    await until(CC,"window.__state().timer.mode==='run'");
    await settle(600);                          // let real seconds come off it
    await startMeeting(CC);
    await until(CC,"window.__state().meet.mode==='run'");
    await settle(400);
    await act(CC,"callVote");
    await until(CC,"window.__state().meet.remain===0");
    await until(CC, OVER, 12000);
    const held = (await st(CC)).timer.remain;
    await finishMeeting(CC, exit);
    await until(CC,"window.__state().meet.mode==='idle'");
    await settle(400);
    const s = await st(CC);
    check(`${name} closes an expired meeting and puts the round clock back`,
      s.banner==="none" && s.meet.mode==="idle" && s.timer.mode==="run" &&
      Math.abs((s.timer.endsAt-Date.now())-(held+bonus))<2500,
      `${s.banner}/${s.meet.mode}/${s.timer.mode}, held ${held}ms +${bonus}ms → ${Math.round(s.timer.endsAt-Date.now())}ms`);
    check(`${name}: …and the end options are gone with it`,
      eq(await ends(CC), []), (await ends(CC)).join(","));
  }
}

/* ================================================================= */
// The rule the whole meeting now hangs on: a meeting that reached the vote
// sends somebody out. The room decides WHO, never whether — and a tie sends
// every tied name, which is why the tally counts rather than flags. The app is
// where that rule is enforced, because the app is the only thing in the lobby
// that cannot be talked round at 8:40pm by twenty students.
section("3f2 · a meeting that ran cannot end with nobody ejected");
{
  const CC = await mk("/c/cc","g-mustej"), TV = await mk("/monitor","g-mustej"),
        FM = await mk("/c/foreman","g-mustej");
  const OVER = "document.body.innerHTML.includes('Who is going out?')";
  const closeBtn = p => p.evaluate(()=>{
    const b=[...document.querySelectorAll("button")].find(x=>x.textContent.trim().startsWith("Close the meeting"));
    return b ? {disabled:b.disabled, label:b.textContent.trim()} : null});
  // State first, screen second: startMeeting can retry, and a retry landing
  // after the vote was called would put a whole fresh 3:00 back on the room.
  const toTheVote = async () => {
    await startMeeting(CC);
    await until(CC,"window.__state().meet.mode==='run'");
    await settle(500);
    await act(CC,"callVote");
    await until(CC,"window.__state().meet.remain===0");
    await until(CC, OVER, 12000);
    await settle(300);
  };

  await act(CC,"resetT"); await until(CC,"window.__state().timer.mode==='idle'");
  await act(CC,"start");
  await until(TV,"window.__state().timer.mode==='run'");
  await toTheVote();

  /* --- with nothing recorded, there is no way out at all --- */
  const empty = await st(CC);
  check("the vote arrives with an empty tally", empty.meet.ejCrew===0 && empty.meet.ejImp===0,
    JSON.stringify(empty.meet));
  let b = await closeBtn(CC);
  check("the close is offered but dead until a name is recorded",
    !!b && b.disabled===true && /nobody ejected yet/i.test(b.label), JSON.stringify(b));
  check("…and the desk is told what the tally is for, not just that it is empty",
    /always sends somebody out/i.test(await html(CC)));
  await act(CC,"closeMeeting"); await settle(700);
  check("closing with nobody ejected does nothing at all",
    eq(pick(empty), pick(await st(CC))), diff(empty, await st(CC)));
  check("…and does not spend an undo slot pretending it did",
    (await st(CC)).hist.length===empty.hist.length,
    `${empty.hist.length} → ${(await st(CC)).hist.length}`);
  const btns = await btnText(CC);
  check("no button anywhere on the desk offers a tie, a skip or nobody going out",
    !btns.some(t=>/tie|skip|nobody ejected$/i.test(t)),
    btns.filter(t=>/tie|skip|nobody/i.test(t)).join(" | ")||"none");
  await act(CC,"cancelMeeting"); await settle(600);
  check("and 'never mind' is gone once the 3:00 has run — that door is the gather's",
    (await st(CC)).meet.mode==="run" && (await st(CC)).banner==="meeting",
    JSON.stringify((await st(CC)).meet));

  /* --- one name is enough, and it is what unlocks the close --- */
  await act(CC,"ejectCrew");
  await until(CC,"window.__state().meet.ejCrew===1");
  b = await closeBtn(CC);
  check("recording one crewmate arms the close and says how many are going",
    !!b && b.disabled===false && /one ejected/i.test(b.label), JSON.stringify(b));
  check("…the desk reads back what it has recorded",
    /Ejected:/.test(await html(CC)) && /one crewmate/.test(await html(CC)));
  await until(TV,"document.body.innerHTML.includes('ONE EJECTED')", 12000);
  check("…the TV stops asking for the vote and shows the count instead",
    /ONE EJECTED/.test(await html(TV)) && !/TIME — CALL THE VOTE/.test(await html(TV)));
  check("…and the floor phones are told the names are being read",
    /ejected so far/i.test(await html(FM)), (await html(FM)).includes("Vote is up")?"vote is up only":"no card");

  /* --- a tie: every tied name goes, and each imposter still buys its minute --- */
  await act(CC,"ejectCrew");
  await until(CC,"window.__state().meet.ejCrew===2");
  const beforeCatch = await st(CC);
  await act(CC,"ejectImp");
  await until(CC,"window.__state().meet.ejImp===1");
  let s = await st(CC);
  check("a tie is just more names: two crewmates and an imposter, all recorded",
    s.meet.ejCrew===2 && s.meet.ejImp===1, JSON.stringify(s.meet));
  check("…the caught imposter is counted and buys its minute on the held clock",
    s.impostersCaught===beforeCatch.impostersCaught+1 &&
    s.timer.remain===beforeCatch.timer.remain+60000,
    `caught ${beforeCatch.impostersCaught}→${s.impostersCaught}, remain ${beforeCatch.timer.remain}→${s.timer.remain}`);
  check("…and none of it touches the death board",
    s.deaths===empty.deaths, `${empty.deaths} → ${s.deaths}`);
  b = await closeBtn(CC);
  check("…the close counts all three", !!b && /three ejected/i.test(b.label), JSON.stringify(b));

  /* --- undo takes back one name at a time, not the whole meeting --- */
  await act(CC,"undo");
  await until(CC,"window.__state().meet.ejImp===0");
  s = await st(CC);
  check("undo takes back the last name only — the meeting and the other two stay",
    s.meet.mode==="run" && s.banner==="meeting" && s.meet.ejCrew===2 &&
    s.impostersCaught===beforeCatch.impostersCaught,
    JSON.stringify(s.meet)+" caught="+s.impostersCaught);
  check("…and the minute it bought goes back with it",
    s.timer.remain===beforeCatch.timer.remain, `${beforeCatch.timer.remain} → ${s.timer.remain}`);

  /* --- and the close is the thing that clears the tally --- */
  await act(CC,"closeMeeting");
  await until(TV,"window.__state().meet.mode==='idle'");
  await settle(400);
  s = await st(TV);
  check("closing hands the room back with the tally wiped for the next meeting",
    s.banner==="none" && s.meet.ejCrew===0 && s.meet.ejImp===0 && s.timer.mode==="run",
    JSON.stringify(s.meet));
  check("…and the undo history names what actually happened",
    /2 ejected/.test((s.hist.slice(-1)[0]||{}).label||""), (s.hist.slice(-1)[0]||{}).label||"(none)");

  /* --- the next meeting starts from an empty tally, not the last one's --- */
  await toTheVote();
  s = await st(CC);
  check("the next meeting starts from nobody, not from the last vote's names",
    s.meet.ejCrew===0 && s.meet.ejImp===0, JSON.stringify(s.meet));
  await finishMeeting(CC);
  await until(TV,"window.__state().meet.mode==='idle'");
}

/* ================================================================= */
// A meeting interrupts a scramble; it does not cancel it. The room is standing
// together in the lobby so there is nothing to run for — but the props are still
// where they were placed, and the 2:00 has to come back with the time it had
// left rather than as a fresh one, or the sabotage is silently spent for nothing.
section("3g · a meeting holds a live sabotage");
{
  const CC = await mk("/c/cc","g-hold"), TV = await mk("/monitor","g-hold"),
        FM = await mk("/c/foreman","g-hold");
  const phLeft = s => s.phase.mode==="run" ? s.phase.endsAt-Date.now() : s.phase.remain;
  const sabBtn = p => p.evaluate(()=>{const b=document.querySelector("button.btn-sab");
    return b ? {disabled:b.disabled, label:b.textContent.trim()} : null});

  for(const [name, exit] of [["Crewmate ejected",{crew:1}],
                             ["IMPOSTER caught",{imp:1}],
                             ["a tie — two crewmates",{crew:2}]]){
    await act(CC,"resetT"); await until(CC,"window.__state().timer.mode==='idle'");
    await act(CC,"start");
    // Every writer has to be up to date before it writes: a phone still holding
    // last round's counters would put them straight back with its next tap.
    for(const p of [TV,FM,CC]) await until(p,"window.__state().timer.mode==='run'");
    await act(FM,"sab");
    await until(TV,"window.__state().banner==='sabotage'");
    const drawn = (await st(TV)).sabItems, used = (await st(TV)).sabotagesUsed;
    await settle(2600);                       // let real seconds come off the 2:00

    /* --- the hold --- */
    await callMeeting(FM);                    // called from the floor, mid-scramble
    await until(TV,"window.__state().meet.mode==='gather'");
    let s = await st(TV);
    check(`${name}: the meeting holds the scramble instead of wiping it`,
      eq(s.sabItems, drawn) && s.sabItems.length>0, JSON.stringify(s.sabItems));
    check(`${name}: …with the 2:00 stopped where it stood, not reset`,
      s.phase.mode==="pause" && s.phase.label==="SABOTAGE" &&
      s.phase.remain<119000 && s.phase.remain>112000, `${s.phase.mode} ${s.phase.remain}ms`);
    check(`${name}: …and meet.sab remembers it, the way meet.clock does`,
      s.meet.sab===true && s.meet.clock===true, JSON.stringify(s.meet));
    check(`${name}: …without the scramble counting twice`,
      s.sabotagesUsed===used, `${used} → ${s.sabotagesUsed}`);
    const heldAt = s.phase.remain;

    // No scramble while the room is together — the button says so and is dead.
    for(const [p,who] of [[CC,"the desk"],[FM,"the Foreman"]]){
      const b = await sabBtn(p);
      check(`${name}: ${who}'s sabotage button is dead during the meeting`,
        !!b && b.disabled===true && /not during a meeting/.test(b.label), JSON.stringify(b));
    }
    check(`${name}: …and the desk is told what it is holding and for how long`,
      /scramble is holding at/.test(await html(CC)) && /starts again by itself/.test(await html(CC)));
    const guard = await st(TV);
    await act(FM,"sab"); await settle(700);
    check(`${name}: act.sab() during a meeting is a no-op even so`,
      eq(pick(guard), pick(await st(TV))), diff(guard, await st(TV)));

    await act(CC,"meeting");
    await until(TV,"window.__state().meet.mode==='run'");
    s = await st(TV);
    check(`${name}: the 3:00 carries the hold through with it`,
      s.meet.sab===true && s.phase.mode==="pause" && eq(s.sabItems, drawn), JSON.stringify(s.meet));
    await settle(1500);
    check(`${name}: …and the held 2:00 does not drain while the meeting runs`,
      (await st(TV)).phase.remain===heldAt, `${heldAt} → ${(await st(TV)).phase.remain}`);

    /* --- and back --- */
    await windMeeting(CC, gid("g-hold"), -800);
    await until(CC,"document.body.innerHTML.includes('Who is going out?')", 12000);
    await finishMeeting(CC, exit);
    await until(TV,"window.__state().meet.mode==='idle'");
    await settle(500);
    s = await st(TV);
    check(`${name}: the scramble comes back rather than being lost`,
      s.banner==="sabotage" && eq(s.sabItems, drawn), `${s.banner} ${JSON.stringify(s.sabItems)}`);
    check(`${name}: …restarting at the time it stopped, not at a fresh 2:00`,
      s.phase.mode==="run" && Math.abs(phLeft(s)-heldAt)<2500,
      `held ${heldAt}ms → resumed with ${Math.round(phLeft(s))}ms`);
    check(`${name}: …and the sabotage still counts once, not twice`,
      s.sabotagesUsed===used, `${used} → ${s.sabotagesUsed}`);
    check(`${name}: …with the meeting itself properly closed`,
      s.meet.mode==="idle" && s.meet.sab===false, JSON.stringify(s.meet));
    check(`${name}: …and the desk can resolve the scramble again`,
      (await btnText(CC)).some(t=>t.startsWith("SUCCESS")), (await btnText(CC)).join(" | "));
    await act(CC,"sabOk"); await until(TV,"window.__state().banner==='none'");
    check(`${name}: …after which the sabotage button is live again`,
      (await sabBtn(CC))?.disabled===false,
      JSON.stringify({btn:await sabBtn(CC), used:(await st(CC)).sabotagesUsed,
                      max:(await st(CC)).sabotageMax, round:(await st(CC)).round}));
    check(`${name}: the round is clean enough to run the next one`, await confirmNewRound(CC),
      "round="+(await st(CC)).round);
  }

  /* --- "Never mind" out of the gather restores it just the same --- */
  await act(CC,"resetT"); await until(CC,"window.__state().timer.mode==='idle'");
  await act(CC,"start");
  await until(TV,"window.__state().timer.mode==='run'");
  await act(CC,"sab"); await until(TV,"window.__state().banner==='sabotage'");
  await settle(2200);
  await callMeeting(CC); await until(TV,"window.__state().meet.mode==='gather'");
  const held = (await st(TV)).phase.remain, items = (await st(TV)).sabItems;
  await act(CC,"cancelMeeting"); await until(TV,"window.__state().meet.mode==='idle'");
  await settle(400);
  let s = await st(TV);
  check("backing out of the gather puts the scramble back too",
    s.banner==="sabotage" && eq(s.sabItems, items) && s.phase.mode==="run" &&
    Math.abs(phLeft(s)-held)<2500,
    `${s.banner} ${s.phase.mode} held ${held}ms → ${Math.round(phLeft(s))}ms`);

  /* --- and a hold that ends under a pause waits for the resume --- */
  await callMeeting(CC); await until(TV,"window.__state().meet.mode==='gather'");
  await act(CC,"meeting"); await until(TV,"window.__state().meet.mode==='run'");
  const heldP = (await st(TV)).phase.remain;
  await windMeeting(CC, gid("g-hold"), -800);
  await until(CC,"document.body.innerHTML.includes('Who is going out?')", 12000);
  await confirmPause(CC); await until(TV,"window.__state().paused.on===true");
  await finishMeeting(CC); await until(TV,"window.__state().meet.mode==='idle'");
  await settle(400);
  s = await st(TV);
  check("a hold released under a pause does not start the 2:00 behind the word PAUSED",
    s.phase.mode==="pause" && s.paused.on===true && s.banner==="sabotage",
    `${s.phase.mode} paused=${s.paused.on} ${s.banner}`);
  check("…and hands the scramble to the resume instead", s.paused.phase===true,
    JSON.stringify(s.paused));
  await act(CC,"resumeGame"); await until(TV,"window.__state().paused.on===false");
  await settle(400);
  s = await st(TV);
  check("…which starts it again at the time it was holding at",
    s.phase.mode==="run" && Math.abs(phLeft(s)-heldP)<3000,
    `held ${heldP}ms → resumed with ${Math.round(phLeft(s))}ms`);

  /* --- the regression: a plain meeting still ends with nothing running --- */
  await act(CC,"sabOk"); await until(TV,"window.__state().banner==='none'");
  await startMeeting(CC);
  check("a meeting with no sabotage under it records that it is holding nothing",
    (await st(TV)).meet.sab===false, JSON.stringify((await st(TV)).meet));
  await finishMeeting(CC); await until(TV,"window.__state().meet.mode==='idle'");
  await settle(400);
  s = await st(TV);
  check("…and ends with the banner clear, not with a phantom sabotage",
    s.banner==="none" && s.phase.mode==="idle" && s.sabItems.length===0,
    `${s.banner} ${s.phase.mode} ${JSON.stringify(s.sabItems)}`);
}

/* ================================================================= */
// Rewritten for the night-one debrief. A wrong ejection used to tick the death
// board, which taught the room to stop nominating — so it no longer does: the
// ejected crewmate dies in the fiction, the board stays put. And catching an
// imposter now BUYS +1:00 on the round clock, the mirror of a failed sabotage
// costing 1:30.
section("4 · ejections — no tick for crew, +1:00 for a catch");
{
  const A = await mk("/c/cc","g-eject"), M = await mk("/monitor","g-eject");
  const left = s => s.timer.mode==="run" ? s.timer.endsAt-Date.now() : s.timer.remain;

  /* --- crewmate ejected: the board does not move --- */
  await act(A,"start"); await until(M,"window.__state().timer.mode==='run'");
  await settle(600);                       // let real seconds come off it
  await startMeeting(A); await until(M,"window.__state().meet.mode==='run'");
  const heldC = (await st(M)).timer.remain;    // the clock the room walked in with
  await act(A,"ejectCrew");
  await until(M,"window.__state().meet.ejCrew===1");
  check("crewmate ejected is recorded on the meeting, and is labelled as the no-tick it is",
    (await st(M)).hist.slice(-1)[0].label==="Crewmate ejected — no tick",
    (await st(M)).hist.slice(-1)[0].label);
  await act(A,"closeMeeting");
  await until(M,"window.__state().meet.mode==='idle'");
  await settle(400);
  let s = await st(M);
  check("crewmate ejected leaves the death board unchanged", s.deaths===0, "deaths="+s.deaths);
  check("…and closing on it clears the meeting banner, stage and meeting clock",
    s.banner==="none" && s.phase.mode==="idle" && s.meet.mode==="idle", JSON.stringify(s.meet));
  check("…and hands the round clock back where the meeting froze it",
    s.timer.mode==="run" && Math.abs(left(s)-heldC)<2500,
    `${Math.round(heldC)}ms held → ${Math.round(left(s))}ms`);

  /* --- imposter caught: +1 catch, and the crew buys a minute --- */
  await startMeeting(A); await until(M,"window.__state().meet.mode==='run'");
  const heldI = (await st(M)).timer.remain;
  await act(A,"ejectImp");
  await until(M,"window.__state().impostersCaught===1");
  check("…and is labelled with the minute it buys",
    (await st(M)).hist.slice(-1)[0].label==="Imposter caught (+1:00)",
    (await st(M)).hist.slice(-1)[0].label);
  await act(A,"closeMeeting");
  await until(M,"window.__state().meet.mode==='idle'");
  await settle(400);
  s = await st(M);
  check("imposter caught = still no death tick", s.deaths===0 && s.impostersCaught===1,
    `deaths=${s.deaths} caught=${s.impostersCaught}`);
  check("…and closing on it restarts the round clock",
    s.banner==="none" && s.meet.mode==="idle" && s.timer.mode==="run", JSON.stringify(s.meet));
  check("the catch gains ≈1:00 over the clock the room walked in with",
    Math.abs(left(s)-(heldI+60000))<2500,
    `${Math.round(heldI)}ms held → ${Math.round(left(s))}ms (want +60000)`);

  /* --- and the same catch while the whole game is paused: the minute lands in
         `remain`, and the deferred restart hands it back with the bonus on --- */
  await startMeeting(A); await until(M,"window.__state().meet.mode==='run'");
  const heldP = (await st(M)).timer.remain;
  await confirmPause(A); await until(M,"window.__state().paused.on===true");
  await finishMeeting(A,{imp:1});
  await until(M,"window.__state().impostersCaught===2");
  await settle(400);
  s = await st(M);
  check("a catch while the game is paused still closes the meeting",
    s.meet.mode==="idle" && s.banner==="none" && s.paused.on===true, JSON.stringify(s.meet));
  check("…does not start a clock behind the word PAUSED", s.timer.mode!=="run", s.timer.mode);
  check("…and its +1:00 lands in remain, exactly",
    s.timer.remain===heldP+60000, `${heldP}ms held → remain ${s.timer.remain}ms`);
  await act(A,"resumeGame"); await until(M,"window.__state().paused.on===false");
  await settle(400);
  s = await st(M);
  check("…so the resume hands back the frozen clock plus the bought minute",
    s.timer.mode==="run" && Math.abs(left(s)-(heldP+60000))<3000,
    `${Math.round(heldP)}ms held → ${Math.round(left(s))}ms`);
}

/* ================================================================= */
section("5 · sabotage lifecycle");
{
  const A = await mk("/c/cc","g-sab"), F = await mk("/c/foreman","g-sab"), M = await mk("/monitor","g-sab");
  await act(A,"start"); await until(A,"window.__state().timer.mode==='run'");

  // a floor counselor (foreman) can start one — imposters tap them, not CC
  await act(F,"sab");
  await until(M,"window.__state().banner==='sabotage'");
  let s = await st(M);
  check("foreman can start a sabotage", s.sabItems.length===5 && s.sabotagesUsed===1);
  check("sabotage arms the 2:00 phase clock", s.phase.label==="SABOTAGE" && s.phase.remain===120000);

  // One at a time: two kiosks can both be held, so a second sab() while one is
  // live must be swallowed whole — no second draw, no second tick of the count.
  const guard = await st(M);
  await act(A,"sab"); await settle(700);
  check("sab() during a live sabotage is a no-op",
    (await st(M)).sabotagesUsed===1 && eq(pick(guard), pick(await st(M))),
    diff(guard, await st(M)) || "used="+(await st(M)).sabotagesUsed);
  check("…and burns no undo slot", (await st(M)).hist.length===guard.hist.length,
    `${guard.hist.length} → ${(await st(M)).hist.length}`);

  const before = (await st(A)).timer.endsAt;
  await act(A,"sabOk");
  await until(M,"window.__state().banner==='none'");
  s = await st(M);
  check("success adds exactly +1:00 to a running clock", s.timer.endsAt-before===60000, (s.timer.endsAt-before)+"ms");
  check("success clears the props and the phase", s.sabItems.length===0 && s.phase.mode==="idle");

  await act(A,"sab");
  await until(F,"window.__state().banner==='sabotage'");
  const t0 = (await st(A)).timer.endsAt, d0 = (await st(A)).deaths;
  await act(A,"sabFail");
  await until(M,"window.__state().banner==='none'");
  s = await st(M);
  check("failure costs −1:30 on a running clock", t0-s.timer.endsAt===90000, (t0-s.timer.endsAt)+"ms");
  check("failure costs +2 deaths", s.deaths===d0+2);

  check("both sabotages now spent", s.sabotagesUsed===2);
  // The three "Set" buttons are gone: one button, and the allowance still gates it.
  const sabBtns = p => p.evaluate(()=>[...document.querySelectorAll("button.btn-sab")]
    .map(x=>({disabled:x.disabled, label:x.textContent.trim()})));
  const btns = await sabBtns(A);
  check("the one sabotage button is dead after 2 sabotages",
    btns.length===1 && btns[0].disabled===true && /none left/.test(btns[0].label), JSON.stringify(btns));
  const fBtns = await sabBtns(F);
  check("…on the foreman's phone too",
    fBtns.length===1 && fBtns.every(x=>x.disabled), JSON.stringify(fBtns));

  // clamp: failure must not drive a short clock negative
  await act(A,"pause");   await until(A,"window.__state().timer.mode==='pause'");
  await act(A,"resetT");  await until(A,"window.__state().timer.remain===480000");
  await act(A,"adj",-450000); await until(A,"window.__state().timer.remain===30000");
  await act(A,"sab");   await until(A,"window.__state().banner==='sabotage'");
  await act(A,"sabFail"); await until(A,"window.__state().banner==='none'");
  check("failure clamps a short paused clock at 0:00", (await st(A)).timer.remain===0,
    (await st(A)).timer.remain+"ms");

  // resolution controls are CC-only on the floor phones
  const foremanControls = await html(F);
  check("foreman is told CC resolves it (no SUCCESS/FAILED buttons)",
    !/SUCCESS/.test(foremanControls) || /Central Command resolves it/.test(foremanControls));
}

/* ================================================================= */
// Readers shared by the two sabotage-draw sections below.
const SABPROPS = Object.keys(APP.props);
const SABNUM = ["no","one","two","three","four","five","six"];
// The TV overlay separates the props with <br>; the card lists them in an <li>.
const tvItems = p => p.evaluate(()=>{
  const d=document.querySelector(".overlay.sab .items");
  return d ? d.innerHTML.split(/<br\s*\/?>/i).map(x=>x.replace(/<[^>]*>/g,"").trim()).filter(Boolean) : null;
});
const cardItems = p => p.evaluate(()=>{
  const ul=document.querySelector(".sabitems");
  return ul ? [...ul.querySelectorAll("li b")].map(b=>b.textContent.trim()) : null;
});

// The three printed sets are gone — every scramble is drawn now. What matters
// is not which props come up but that ONE draw happened and every screen in the
// room is reading that same one. Five devices each rolling their own five would
// send the crew hunting five different lists, and nobody would know why.
section("5b · the draw — one list, on every screen");
{
  const A = await mk("/c/cc","g-draw"), F = await mk("/c/foreman","g-draw"),
        M = await mk("/monitor","g-draw"), G = await mk("/c/gm","g-draw");

  // driven from the floor phone, because that is who gets tapped by an imposter
  await act(F,"sab");
  await until(M,"!!document.querySelector('.overlay.sab')");
  await until(A,"!!document.querySelector('.sabitems')");
  await until(G,"!!document.querySelector('.sabitems')");
  await settle(400);
  const items = (await st(F)).sabItems;
  check("a default draw is five props", items.length===5, JSON.stringify(items));
  check("every drawn prop is a real one with a known door",
    items.length>0 && items.every(p=>SABPROPS.includes(p) && APP.props[p]), JSON.stringify(items));
  check("no prop is drawn twice", new Set(items).size===items.length, JSON.stringify(items));
  check("the list comes back in door order, the way it is read aloud",
    eq(items, items.slice().sort((a,b)=>SABPROPS.indexOf(a)-SABPROPS.indexOf(b))), JSON.stringify(items));

  const agree = await allAgree([A,F,M,G]);
  check("all four devices hold the same drawn list",
    agree.ok && eq(agree.state.sabItems, items),
    agree.ok ? JSON.stringify(agree.state.sabItems) : agree.detail);
  const onTV = await tvItems(M), onDesk = await cardItems(A),
        onFloor = await cardItems(F), onGM = await cardItems(G);
  check("the TV paints exactly those props, in that order", eq(onTV, items), JSON.stringify(onTV));
  check("the desk card paints exactly those props, in that order", eq(onDesk, items), JSON.stringify(onDesk));
  check("the floor phone paints them too", eq(onFloor, items), JSON.stringify(onFloor));
  check("…and so does the Game Master's", eq(onGM, items), JSON.stringify(onGM));

  const LATE = await mk("/monitor","g-draw");
  await until(LATE,"!!document.querySelector('.overlay.sab')");
  check("a device joining mid-scramble reads that list, it does not draw its own",
    eq(await tvItems(LATE), items), JSON.stringify(await tvItems(LATE)));

  // the doors: the desk must be able to verify, the room must have to search
  const cardHTML = await html(A), tvHTML = await html(M);
  check("the desk card gives Central Command every door",
    items.every(p=>cardHTML.includes("door "+APP.props[p])),
    (cardHTML.match(/door [UD]\d/g)||[]).join(","));
  check("the TV gives away no doors at all", !/door [UD]\d/.test(tvHTML),
    (tvHTML.match(/door [UD]\d/g)||[]).join(","));
  check("card and TV both spell the count out, and it matches the list",
    cardHTML.includes(`one item per person · ${SABNUM[items.length]} people`) &&
    tvHTML.includes(`ONE ITEM PER PERSON · ${SABNUM[items.length].toUpperCase()} PEOPLE`),
    ((cardHTML.match(/one item per person · \w+ people/)||[""])[0])+" / "+
    ((tvHTML.match(/[A-Z]+ PEOPLE/)||[""])[0]));
  check("the card header counts this sabotage against the allowance",
    cardHTML.includes("SABOTAGE · 1 of 2"), (cardHTML.match(/SABOTAGE · [^<]*/)||[""])[0]);
  check("the undo entry names the draw, not a set number",
    (await st(A)).hist.slice(-1)[0].label==="Sabotage — 5 props",
    (await st(A)).hist.slice(-1)[0].label);
  await act(A,"sabOk"); await until(M,"window.__state().banner==='none'");

  // Eight scrambles. Five of six props is only six possible lists, so strict
  // uniqueness is the wrong bar — repeats are expected. Eight identical is not.
  const draws = [];
  for(let i=0;i<8;i++){
    await act(A,"sab"); await until(M,"window.__state().banner==='sabotage'");
    await settle(200);
    const d = (await st(M)).sabItems;
    draws.push(d.join(","));
    check(`draw ${i+1} is five real props with no repeat`,
      d.length===5 && new Set(d).size===5 && d.every(p=>SABPROPS.includes(p)), JSON.stringify(d));
    await act(A,"sabOk"); await until(M,"window.__state().banner==='none'");
    await settle(120);
  }
  const distinct = new Set(draws).size;
  check("repeated sabotages do not hand out the same list every time", distinct>1,
    `${distinct} distinct of 8 — ${[...new Set(draws)].join(" | ")}`);
  note(`eight draws produced ${distinct} distinct lists (six are possible)`);

  // the Game Master's dial is what the next draw asks for
  for(const n of [2,6,3]){
    const from = (await st(G)).sabProps;
    for(let i=0;i<Math.abs(n-from);i++){await act(G,"sabPropsAdj", n>from?1:-1); await settle(150)}
    await until(F,`window.__state().sabProps===${n}`);
    await act(F,"sab"); await until(M,"window.__state().banner==='sabotage'");
    await settle(250);
    const d = (await st(M)).sabItems;
    check(`the dial at ${n} draws exactly ${n} props`,
      d.length===n && new Set(d).size===n && d.every(p=>SABPROPS.includes(p)), JSON.stringify(d));
    check(`…and the TV spells ${n} out under the list`,
      (await html(M)).includes(`${SABNUM[n].toUpperCase()} PEOPLE`),
      ((await html(M)).match(/[A-Z]+ PEOPLE/)||[""])[0]);
    const a2 = await allAgree([A,F,M,G]);
    check(`…and every device agrees on that ${n}-prop list`,
      a2.ok && eq(a2.state.sabItems, d), a2.ok?JSON.stringify(a2.state.sabItems):a2.detail);
    await act(A,"sabOk"); await until(M,"window.__state().banner==='none'");
  }

  // the Game Master can lower the cap under what has already fired
  await act(A,"sab"); await until(A,"!!document.querySelector('.sabitems')");
  await settle(300);
  const used = (await st(A)).sabotagesUsed;
  check("past the cap the card names which sabotage this was, not “12 of 2”",
    (await html(A)).includes(`SABOTAGE · no. ${used}`),
    ((await html(A)).match(/SABOTAGE · [^<]*/)||[""])[0]);
  await act(A,"sabOk"); await until(M,"window.__state().banner==='none'");
}

/* ================================================================= */
// A document can carry a sabotage banner with no usable draw behind it: one
// written before the draw existed, or a write that half-arrived. The TV is in
// front of the whole room, so this must not throw and must not paint junk.
section("5c · a sabotage banner with no usable list behind it");
if(EMU){
  const enc = v =>
    Array.isArray(v)     ? {arrayValue:{values:v.map(enc)}} :
    v===null             ? {nullValue:null} :
    typeof v==="number"  ? {integerValue:String(v)} :
    typeof v==="boolean" ? {booleanValue:v} :
    typeof v==="object"  ? {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,enc(x)]))}} :
                           {stringValue:String(v)};
  // Straight into the emulator, around the app. A field named in the mask but
  // absent from the body is deleted — that is the "written before the draw" case.
  const write = async (id, fields) => {
    const mask = Object.keys(fields).map(k=>"updateMask.fieldPaths="+k).join("&");
    const body = {fields:Object.fromEntries(Object.entries(fields)
      .filter(([,v])=>v!==undefined).map(([k,v])=>[k,enc(v)]))};
    const r = await fetch(`http://${EMU_HOST}:${EMU_PORT}/v1/projects/${PROJECT}/databases/(default)/documents/games/${id}?${mask}`,
      {method:"PATCH", headers:{Authorization:"Bearer owner","Content-Type":"application/json"},
       body:JSON.stringify(body)});
    return r.ok;
  };
  const RUNNING = () => ({mode:"run", endsAt:Date.now()+90000, remain:90000, label:"SABOTAGE"});
  const cases = [
    ["no sabItems field at all", {banner:"sabotage", phase:RUNNING(), sabItems:undefined}, []],
    ["sabItems is a string",     {banner:"sabotage", phase:RUNNING(), sabItems:"FUSE, BATTERY"}, []],
    ["sabItems is a map",        {banner:"sabotage", phase:RUNNING(), sabItems:{a:"FUSE"}}, []],
    ["sabItems holds junk",      {banner:"sabotage", phase:RUNNING(), sabItems:["BANANA",7,null,"FUSE"]}, ["FUSE"]],
  ];
  for(const [i,[name, fields, expect]] of cases.entries()){
    const id = "g-bad-"+i;                               // its own document, so one case cannot leak into the next
    const DESK = await mk("/c/cc", id);                  // let the app create a normal document first
    const errs0 = pageErrs.length;
    check(`${name} — written straight into Firestore`, await write(gid(id), fields));
    await until(DESK,"window.__state().banner==='sabotage'");
    const TV = await mk("/monitor", id);                 // and a device that only ever sees the broken one
    await settle(700);
    const s = await st(TV);
    check(`${name} — the TV still answers`, !!s && s.banner==="sabotage", JSON.stringify(s&&s.sabItems));
    const h = await html(TV);
    check(`${name} — the overlay is the sabotage one, and prints no junk`,
      /SABOTAGE/.test(h) && !/undefined|NaN|\[object Object\]/.test(h),
      (h.match(/undefined|NaN|\[object Object\]/g)||[]).join(","));
    check(`${name} — the TV lists only real props`, eq(await tvItems(TV), expect),
      JSON.stringify(await tvItems(TV)));
    check(`${name} — the desk card lists only real props`, eq(await cardItems(DESK), expect),
      JSON.stringify(await cardItems(DESK)));
    check(`${name} — the spelled count matches what is actually listed`,
      h.includes(`${SABNUM[expect.length].toUpperCase()} PEOPLE`),
      ((h.match(/[A-Z]+ PEOPLE/)||[""])[0]));
    check(`${name} — nothing threw on either device`, pageErrs.length===errs0,
      pageErrs.slice(errs0).join(" | "));
    if(!expect.length) note(`${name}: the room sees the SABOTAGE overlay with an empty list ("NO PEOPLE")`);
  }
} else note("skipped — needs the emulator's REST API to write a broken document");

/* ================================================================= */
section("6 · counters and clamps");
{
  const A = await mk("/c/cc","g-count");
  await act(A,"dAdj",-1); await settle(400);
  check("deaths clamp at 0", (await st(A)).deaths===0);
  for(let i=0;i<3;i++){await act(A,"dAdj",1); await until(A,`window.__state().deaths===${i+1}`)}
  check("deaths step up one at a time", (await st(A)).deaths===3);

  for(let i=0;i<8;i++){await act(A,"thAdj",-1); await settle(160)}
  await settle(500);
  check("threshold clamps at 1", (await st(A)).threshold===1, "th="+(await st(A)).threshold);

  for(let i=0;i<14;i++){await act(A,"tgAdj",1); await settle(140)}
  await settle(500);
  check("target points clamp at 11", (await st(A)).targetPts===11, "tg="+(await st(A)).targetPts);
  for(let i=0;i<14;i++){await act(A,"tgAdj",-1); await settle(140)}
  await settle(500);
  check("target points clamp at 1", (await st(A)).targetPts===1, "tg="+(await st(A)).targetPts);
}

/* ================================================================= */
section("7 · new round asks before it wipes the round");
{
  const A = await mk("/c/gm","g-round"), M = await mk("/monitor","g-round");
  await act(A,"start"); await act(A,"dAdj",1); await act(A,"sab");
  await until(M,"window.__state().deaths===1 && window.__state().banner==='sabotage'");

  const labels0 = await btnText(A);
  check("Undo and New round are distinct buttons",
    labels0.filter(t=>/^NEW ROUND/.test(t)).length===1 && labels0.some(t=>t.startsWith("↩")),
    labels0.filter(t=>/NEW ROUND|↩/.test(t)).join(" / "));

  // The button only asks. Nothing may move until the dialog is answered.
  await tap(A,"NEW ROUND");
  await settle(300);
  check("the button only asks — nothing changes yet",
    (await st(A)).round===1 && (await st(A)).deaths===1 && (await st(A)).banner==="sabotage",
    `round=${(await st(A)).round} deaths=${(await st(A)).deaths}`);
  const dlg = await modal(A);
  check("the dialog names the round it would start", !!dlg && /Start round 2\?/.test(dlg.title),
    dlg && dlg.title);
  check("…and says what it clears, in room terms",
    !!dlg && /deaths/i.test(dlg.body) && /clock/i.test(dlg.body), dlg && dlg.body);
  check("…and offers a way out as well as a way through",
    !!dlg && dlg.buttons.includes("Cancel") && dlg.buttons.includes(CONFIRM_YES.newRound),
    dlg && dlg.buttons.join(" | "));

  // backing out
  await tap(A,"Cancel");
  await settle(500);
  check("Cancel closes the dialog", (await modal(A))===null, JSON.stringify(await modal(A)));
  check("…and the round it was about to wipe is untouched",
    (await st(A)).round===1 && (await st(A)).deaths===1 && (await st(A)).sabItems.length===5,
    `round=${(await st(A)).round} deaths=${(await st(A)).deaths}`);
  check("…and nothing was written to the history",
    !(await st(A)).hist.some(h=>h.label==="New round"), (await st(A)).hist.map(h=>h.label).join(","));

  // the escape hatch a phone keyboard does not have, but a tablet does
  await tap(A,"NEW ROUND"); await settle(250);
  await A.keyboard.press("Escape"); await settle(500);
  check("Escape closes the dialog too", (await modal(A))===null, JSON.stringify(await modal(A)));
  check("…without starting a round", (await st(A)).round===1, "round="+(await st(A)).round);

  // REGRESSION (same family as the old arming bug): another phone acting
  // re-renders this whole view. The dialog is drawn by that render, so an
  // innocent update from the desk must not drop the question on the floor —
  // and must not leave a live confirm behind an ordinary-looking screen.
  await tap(A,"NEW ROUND");
  await settle(150);
  await act(M,"dAdj",1);                                  // any second phone acting would do this
  await until(A,"window.__state().deaths===2");
  const survived = await modal(A);
  check("the dialog survives another phone's update", !!survived && /Start round 2\?/.test(survived.title),
    JSON.stringify(survived));
  check("…and the game underneath still has not moved", (await st(A)).round===1, "round="+(await st(A)).round);

  await tap(A,CONFIRM_YES.newRound);
  await until(M,"window.__state().round===2");
  const s = await st(M);
  check("confirming starts round 2", s.round===2);
  check("new round clears deaths, catches, sabotages", s.deaths===0 && s.impostersCaught===0 && s.sabotagesUsed===0 && s.sabItems.length===0);
  check("new round clears the sabotage banner and phase", s.banner==="none" && s.phase.mode==="idle");
  check("new round re-arms a full idle clock", s.timer.mode==="idle" && s.timer.remain===480000);
  check("new round keeps target and threshold", s.targetPts===5 && s.threshold===6);
  check("the dialog closes once it has run", (await modal(A))===null, JSON.stringify(await modal(A)));
  await settle(700);
  check("one confirmation advances exactly one round", (await st(A)).round===2, "round="+(await st(A)).round);

  // and it is repeatable — the ask is not a one-shot
  await tap(A,"NEW ROUND"); await settle(250);
  await tap(A,CONFIRM_YES.newRound);
  await until(M,"window.__state().round===3");
  check("the next round can be started the same way", (await st(M)).round===3, "round="+(await st(M)).round);
}

/* ================================================================= */
section("8 · undo — depth, compounds, cross-device");
{
  // B rides on the old referee QR link, which now lands on the Foreman view —
  // the redirect must not cost the phone its writes.
  const A = await mk("/c/cc","g-undo"), B = await mk("/c/referee","g-undo");
  check("nothing to undo on a fresh game", (await st(A)).hist.length===0);
  await act(A,"undo"); await settle(400);
  check("undo on an empty history is a safe no-op", (await st(A)).deaths===0 && (await st(A)).round===1);

  for(let i=1;i<=15;i++){await act(A,"dAdj",1); await until(A,`window.__state().deaths===${i}`)}
  await until(B,"window.__state().deaths===15");     // let the second phone catch up first
  let s = await st(A);
  check("history caps at 10 entries", s.hist.length===10, "len="+s.hist.length);
  check("oldest kept snapshot is the 6th action", s.hist[0].s.deaths===5, "deaths@0="+s.hist[0].s.deaths);
  check("both phones agree on the history", eq((await st(B)).hist, s.hist));

  await act(B,"undo"); await until(A,"window.__state().deaths===14");
  check("an undo from the old referee link lands on CC", (await st(A)).deaths===14);
  for(let i=13;i>=5;i--){await act(A,"undo"); await until(B,`window.__state().deaths===${i}`)}
  s = await st(B);
  check("ten undos walk all the way back", s.deaths===5 && s.hist.length===0, "deaths="+s.deaths+" hist="+s.hist.length);
  await act(A,"undo"); await settle(500);
  check("an 11th undo cannot go past the window", (await st(B)).deaths===5);

  // compound action restored in one step
  await act(A,"start"); await until(A,"window.__state().timer.mode==='run'");
  await act(A,"sab"); await until(B,"window.__state().banner==='sabotage'");
  const pre = await st(B);
  await act(A,"sabFail"); await until(B,"window.__state().deaths===7");
  await act(B,"undo"); await until(A,"window.__state().deaths===5");
  s = await st(A);
  check("undo of sabotage-fail restores deaths, banner, phase and the exact drawn list",
    s.deaths===5 && s.banner==="sabotage" && s.phase.label==="SABOTAGE" &&
    s.sabItems.length===5 && eq(s.sabItems, pre.sabItems),
    `was ${JSON.stringify(pre.sabItems)} → now ${JSON.stringify(s.sabItems)}`);
  check("…and the props on the desk card are that same list again",
    eq(await cardItems(A), pre.sabItems), JSON.stringify(await cardItems(A)));
  check("undo of sabotage-fail restores the clock too",
    Math.abs(s.timer.endsAt-pre.timer.endsAt)<50, (s.timer.endsAt-pre.timer.endsAt)+"ms");

  // undo a new round
  await act(A,"undo"); await until(A,"window.__state().banner==='none'");
  const beforeRound = await st(A);
  await confirmNewRound(A);
  await until(B,"window.__state().round===2");
  await act(B,"undo"); await until(A,"window.__state().round===1");
  s = await st(A);
  check("undo of New round puts the old round back",
    s.round===1 && s.deaths===beforeRound.deaths && s.sabotagesUsed===beforeRound.sabotagesUsed,
    `round=${s.round} deaths=${s.deaths} sab=${s.sabotagesUsed}`);
}

/* ================================================================= */
section("9 · monitor (TV) rendering");
{
  const A = await mk("/c/cc","g-mon"), M = await mk("/monitor","g-mon");
  let h = await html(M);
  check("monitor paints the round label and clock", /Round 1/.test(h) && /8:00/.test(h));
  check("monitor draws death boxes with the threshold marked",
    (h.match(/class="bx /g)||[]).length>=8 && /class="bx\s*\s*thr"/.test(h),
    (h.match(/class="bx[^"]*"/g)||[]).join(" "));

  await act(A,"sab"); await until(M,"document.querySelector('.overlay.sab')");
  h = await html(M);
  check("sabotage overlay appears on the TV", /SABOTAGE/.test(h));
  for(const prop of (await st(M)).sabItems)
    check(`  overlay lists ${prop}`, h.includes(prop));
  // finding them is the scramble — the TV must not give the locations away
  check("the overlay does not reveal which door each prop is at",
    !/door [UD]\d/.test(h), (h.match(/door [UD]\d/g)||[]).join(","));
  check("overlay repeats the walking rule", /ONE ITEM PER PERSON/.test(h));

  await act(A,"sabOk"); await until(M,"!document.querySelector('.overlay.sab')");
  // The gather is the first thing the room sees, and it deliberately carries no
  // countdown — a clock here would hurry the wrong thing.
  await callMeeting(A); await until(M,"document.querySelector('.overlay.meet')");
  h = await html(M);
  check("the gather overlay calls the room in", /EMERGENCY MEETING/.test(h) && /EVERYONE TO THE LOBBY/.test(h));
  check("…with no countdown on it at all",
    !/data-mtclk/.test(h) && !/data-stclk/.test(h), (h.match(/data-\w*clk/g)||[]).join(","));
  await act(A,"meeting"); await until(M,"window.__state().meet.mode==='run'");
  await until(M,"!!document.querySelector('[data-stlabel]')");
  check("starting the 3:00 puts the meeting clock on the TV",
    /data-mtclk/.test(await html(M)), (await derived(M)).mtclk);
  await windMeeting(A, gid("g-mon"), 105000);
  await until(M,"document.querySelector('[data-stlabel]')?.textContent.includes('NOMINATIONS')");
  check("the TV names the stage the deadline puts it in, with nobody tapping",
    labelOf(await derived(M))==="NOMINATIONS", JSON.stringify(await derived(M)));
  await windMeeting(A, gid("g-mon"), -1000);
  await until(M,"document.body.innerHTML.includes('TIME — CALL THE VOTE')");
  check("…and when the 3:00 is spent the TV says so instead of naming a stage",
    /TIME — CALL THE VOTE/.test(await html(M)) && !/data-stlabel/.test(await html(M)));
  check("…and 'hard stop' is gone from the TV for good", !/hard stop/i.test(await html(M)));
  await finishMeeting(A); await until(M,"!document.querySelector('.overlay.meet')");

  // clock urgency classes — reset first so the arithmetic is from a known 8:00
  await act(A,"resetT");  await until(M,"window.__state().timer.remain===480000");
  await act(A,"start");   await until(M,"window.__state().timer.mode==='run'");
  await act(A,"adj",-370000);                                  // → 1:50 left
  await until(M,"window.__state().timer.endsAt-Date.now()<115000");
  await until(M,"!!document.querySelector('.mon.warn')");
  check("under 2:00 the TV turns amber", /mon warn/.test(await html(M)));
  await act(A,"adj",-60000);                                   // → 0:50 left
  await until(M,"!!document.querySelector('.mon.crit')");
  check("under 1:00 the TV turns red", /mon crit/.test(await html(M)));

  // round over at 0:00
  await act(A,"adj",-60000);                                   // clamps to now
  await until(M,"!!document.querySelector('.overlay.crew')",20000);
  h = await html(M);
  check("clock hitting 0:00 shows ROUND OVER", /ROUND OVER/.test(h));
  check("ROUND OVER quotes the point target", /target was 5/.test(h));

  // imposters win overrides
  await act(A,"resetT"); await until(M,"!document.querySelector('.overlay.crew')",20000);
  for(let i=0;i<6;i++){await act(A,"dAdj",1); await until(A,`window.__state().deaths===${i+1}`)}
  await until(M,"document.querySelector('.overlay.win')");
  h = await html(M);
  check("deaths reaching the threshold shows IMPOSTERS WIN", /IMPOSTERS WIN/.test(h));
  check("win overlay quotes deaths and threshold", /6 deaths/.test(h) && /threshold was 6/.test(h));
}

/* ================================================================= */
section("10 · answers tab — every group and every sudoku");
{
  const A = await mk("/c/cc","g-ans");
  await act(A,"tab","answers");
  await act(A,"padMode","grp");
  let bad = [];
  for(let g=1; g<=32; g++){
    await act(A,"padClr");
    for(const d of String(g)) await act(A,"pad",d);
    const got = await A.evaluate(()=>{
      const el=document.getElementById("ansres"); if(!el)return null;
      const codes={}; el.querySelectorAll(".cd").forEach(c=>codes[c.querySelector("span").textContent]=c.querySelector("b").textContent);
      const kv=[...el.querySelectorAll(".kv")].map(k=>[k.querySelector("span").textContent, k.querySelector("b").textContent]);
      const ringed=[...el.querySelectorAll(".cd.mine")].map(c=>c.querySelector("span").textContent);
      return {title:el.querySelector("h1")?.textContent, codes, kv, ringed,
              small:el.querySelector(".small")?.textContent||"", text:el.textContent};
    });
    if(!got){bad.push(`${g}: no card`); continue}
    if(got.title!==`Group ${g}`) bad.push(`${g}: title "${got.title}"`);
    for(const d of APP.doors) if(got.codes[d]!==APP.code[d][g]) bad.push(`${g}/${d}: ${got.codes[d]}≠${APP.code[d][g]}`);
    // the card now names and rings this group's own three doors
    const mine = (APP.doors3||{})[g];
    if(!mine || mine.length!==3) bad.push(`${g}: appdata doors3 missing/short (${JSON.stringify(mine)})`);
    else {
      if(!got.small.includes(`their doors: ${mine.join(" · ")}`)) bad.push(`${g}: doors line missing ("${got.small}")`);
      if(!eq(got.ringed.slice().sort(), mine.slice().sort()) || got.ringed.length!==3)
        bad.push(`${g}: ringed ${JSON.stringify(got.ringed)} ≠ ${JSON.stringify(mine)}`);
    }
    if(!got.text.includes(APP.gospel[g].toUpperCase())) bad.push(`${g}: gospel ${APP.gospel[g]} missing`);
    // the counsellor reads the whole line aloud, not just the cue word
    if(!got.text.includes(APP.gospelPhrase[APP.gospel[g]])) bad.push(`${g}: gospel phrase for ${APP.gospel[g]} missing`);
    if(APP.ball[g] && !got.text.includes(APP.ball[g])) bad.push(`${g}: ball missing`);
    const wantV = APP.verses[g]||[];
    if(wantV.length !== got.kv.length) bad.push(`${g}: ${got.kv.length} verse rows, want ${wantV.length}`);
    else wantV.forEach(([ref,page],i)=>{
      if(got.kv[i][0]!==ref || got.kv[i][1]!==String(page)) bad.push(`${g}: verse ${got.kv[i]} ≠ ${ref}/${page}`)});
  }
  check("all 32 groups: door codes, their-doors ring, verse pages, gospel word, ball direction",
    bad.length===0, bad.slice(0,4).join(" | "));

  await act(A,"padMode","sud");
  bad = [];
  for(let n=1; n<=80; n++){
    await act(A,"padClr");
    for(const d of String(n)) await act(A,"pad",d);
    const got = await A.evaluate(()=>{
      const el=document.getElementById("ansres"); if(!el)return null;
      return {title:el.querySelector("h1")?.textContent,
        cells:[...el.querySelectorAll(".sud td")].map(td=>({v:td.textContent, gv:td.className.includes("gv")}))};
    });
    if(!got || got.cells.length!==16){bad.push(`#${n}: ${got?got.cells.length:"no"} cells`); continue}
    if(got.title!==`Sudoku #${n}`) bad.push(`#${n}: title "${got.title}"`);
    const S = APP.sudoku[n];
    got.cells.forEach((c,i)=>{
      if(c.v!==String(S.a[i])) bad.push(`#${n}[${i}]: ${c.v}≠${S.a[i]}`);
      if(c.gv !== !!S.p[i])    bad.push(`#${n}[${i}]: given flag ${c.gv}≠${!!S.p[i]}`);
    });
  }
  check("all 80 sudoku solutions + printed-given highlighting", bad.length===0, bad.slice(0,4).join(" | "));

  // keypad edge cases
  await act(A,"padMode","grp"); await act(A,"padClr");
  await act(A,"pad","3"); await act(A,"pad","3");
  check("group pad rejects 33 and falls back to 3", /Group 3\b/.test(await html(A)));
  await act(A,"padClr"); await act(A,"pad","4"); await act(A,"pad","0");
  check("group pad clears rather than showing group 40",
    !(await A.evaluate("!!document.getElementById('ansres')")),
    await A.evaluate("document.getElementById('ansres')?.textContent?.slice(0,40)"));
  await act(A,"padMode","sud"); await act(A,"padClr");
  await act(A,"pad","8"); await act(A,"pad","0");
  check("sudoku pad accepts 80", /Sudoku #80/.test(await html(A)));
  await act(A,"pad","1");
  check("a third digit restarts the entry", /Sudoku #1\b/.test(await html(A)));
  await act(A,"padClr");
  check("clear empties the readout", !/Sudoku #/.test(await html(A)));
  // "find" is the only thing that moves the page, and only when tapped
  await act(A,"pad","4"); await act(A,"pad","2");
  const before = await A.evaluate("scrollY");
  await settle(900);
  check("typing never scrolls the page by itself", (await A.evaluate("scrollY"))===before,
    `${before} → ${await A.evaluate("scrollY")}`);
  await act(A,"padGo"); await settle(900);
  check("find scrolls the answer into view", (await A.evaluate("scrollY"))!==before ||
    (await A.evaluate("document.getElementById('ansres').getBoundingClientRect().top"))<200,
    "scrollY "+await A.evaluate("scrollY"));
  check("…and the answer it found is the right one", /Sudoku #42/.test(await html(A)));

  // the out-of-range message is reachable from a deep link
  const L = await mk("/c/cc?tab=answers&grp=99","g-ans");
  check("deep link to a bad group explains the range", /No group 99/.test(await html(L)) && /highest is 32/.test(await html(L)));
  const L2 = await mk("/c/cc?tab=answers&sud=12","g-ans");
  check("deep link to a sudoku opens it directly", /Sudoku #12/.test(await html(L2)));

  // static reference block
  const ref = await html(A);
  check("reference block lists where every prop lives", Object.keys(APP.props).every(p=>ref.includes(p+" "+APP.props[p])));
  check("reference block lists the scoring", /mediums 2/.test(ref) && /hard 3/.test(ref) && /GREEN 2/.test(ref));
}

/* ================================================================= */
section("11 · role views");
{
  // Three app roles now. The old referee/ghost QR codes are printed on real
  // paper, so those URLs must keep working — by landing on the Foreman view.
  const roles = {gm:"Game Master", cc:"Central Command", foreman:"Foreman"};
  const pages = {};
  for(const r of Object.keys(roles)) pages[r] = await mk("/c/"+r,"g-roles");

  for(const [r,name] of Object.entries(roles)){
    const h = await html(pages[r]);
    check(`${r}: header names the role`, h.includes(name));
    check(`${r}: has controls / answers / my role tabs`, /Controls/.test(h) && /Answers/.test(h) && /My role/.test(h));
  }

  // the redirect: printed QR sheets from night one keep working
  for(const old of ["referee","ghost"]){
    pages[old] = await mk("/c/"+old,"g-roles");
    const h = await html(pages[old]);
    check(`old /c/${old} URL lands on the Foreman view`,
      h.includes("<b>Foreman</b>") && /Controls/.test(h) && /My role/.test(h),
      (h.match(/<b>[A-Z][a-z]+ ?[A-Za-z]*<\/b>/)||["(no header)"])[0]);
    check(`old /c/${old} URL never shows the retired role name`,
      !/Roaming Referee|Ghost Guide/.test(h));
  }

  // The split: the desk runs the fiction, the Game Master runs the session.
  const gm = await html(pages.gm), cc = await html(pages.cc);
  const gmBtns = await btnText(pages.gm), ccBtns = await btnText(pages.cc);
  const dial = ts => ts.some(t=>t.startsWith("−1 death")) && ts.some(t=>t.startsWith("+1 death"));
  check("gm: owns the clock, the dials, undo and New round",
    /Round clock/.test(gm) && /Death threshold/.test(gm) && dial(gmBtns) &&
    /class="sect">Undo</.test(gm) && gmBtns.some(t=>/^NEW ROUND/.test(t)),
    gmBtns.join(" | "));
  // Post-playtest order: the setup dials come BEFORE New round, and New round
  // is dead last on the screen in its standout class — nothing below it to
  // scroll past, nothing above it to mistake it for.
  check("gm: the setup dials come before New round",
    gm.indexOf("Round length —")>=0 && gm.indexOf("Round length —") < gm.indexOf("NEW ROUND") &&
    gm.indexOf("Props per sabotage —") < gm.indexOf("NEW ROUND"),
    `length@${gm.indexOf("Round length —")} props@${gm.indexOf("Props per sabotage —")} newround@${gm.indexOf("NEW ROUND")}`);
  check("gm: the last button on the controls tab is NEW ROUND, in the standout class",
    /^NEW ROUND/.test(gmBtns[gmBtns.length-1]||"") && /btn-newround/.test(gm),
    "last button = "+(gmBtns[gmBtns.length-1]||"(none)"));
  // "Deaths — N of M" is the desk's own heading; the GM's version of the same
  // idea reads "Death threshold". ("Death +" is not usable as a marker — the
  // Undo button quotes the last action, which can itself be "Death +1".)
  const DESK = /class="sect">Deaths — \d+ of \d+/;
  check("gm: does not carry the desk's in-game controls by default",
    !DESK.test(gm) && !gmBtns.some(t=>t.startsWith("Death +")),
    gmBtns.join(" | "));
  check("gm: offers a break-glass takeover of the desk", /Take over the desk/.test(gm));
  // The clock is why this phone is picked up, so it is the first thing on it and
  // Start/Pause is a thumb-sized target rather than one of four in a row.
  check("gm: the clock leads the screen, ahead of the six setup dials",
    gm.indexOf("Round clock —") < gm.indexOf("Round length —") &&
    gm.indexOf("Round clock —") < gm.indexOf("Death threshold"),
    `clock@${gm.indexOf("Round clock —")} length@${gm.indexOf("Round length —")} thr@${gm.indexOf("Death threshold")}`);
  check("gm: calling a meeting, pause and undo all sit above the dials",
    ["Emergency meeting","Pause","Undo","Take over the desk"]
      .every(x=>gm.indexOf(x)>=0 && gm.indexOf(x)<gm.indexOf("Round length —")),
    ["Emergency meeting","Pause","Undo","Take over the desk"].map(x=>x+"@"+gm.indexOf(x)).join(" "));
  check("gm: Start is full width and says what it starts",
    /btn-ok btn-wide[^>]*>Start the round</.test(gm) &&
    gmBtns.some(t=>t.startsWith("Reset to 8:00")),
    gmBtns.filter(t=>/Start|Reset/.test(t)).join(" | "));

  // The desk no longer taps meetings through. It calls one like everyone else,
  // and once the 3:00 is running it is handed words, not buttons.
  check("cc: owns the deaths, the ejections behind a meeting, and the sabotage",
    DESK.test(cc) && ccBtns.some(t=>t.startsWith("Death +")) && /Sabotage —/.test(cc),
    ccBtns.join(" | "));
  check("cc: reaches a meeting only through the gather, like every other role",
    ccBtns.some(t=>t.startsWith("Call emergency meeting")) && !/act\.meeting\(\)/.test(cc),
    ccBtns.join(" | "));
  check("cc: the row of five stage buttons and its stop button are gone",
    !/phaserow/.test(cc) && !["report","noms","corners","vote"].some(x=>cc.includes(x+"<span>")) &&
    !/act\.phasePre|act\.phaseStop/.test(cc),
    (cc.match(/phaserow|act\.phase\w+/g)||["none"]).join(","));
  check("cc: no meeting is open, so no ejection control is offered",
    !/Crewmate ejected/.test(cc) && !/IMPOSTER caught/.test(cc), ccBtns.join(" | "));
  check("cc: 'hard stop' is gone from the desk too", !/hard stop/i.test(cc));
  // The desk view explains in prose where the clock and Undo went, so absence
  // has to be judged on the controls themselves, not on the words.
  check("cc: no clock, no dials, no New round button, no undo button",
    !/Round clock/.test(cc) && !dial(ccBtns) && !/btn-undo/.test(cc) &&
    !ccBtns.some(t=>/^NEW ROUND/i.test(t)) && !ccBtns.some(t=>t.startsWith("↩")),
    ccBtns.join(" | "));

  // The floor view proper, plus the two redirected old URLs — all three must
  // render the same Foreman controls.
  for(const r of ["foreman","referee","ghost"]){
    const h = await html(pages[r]);
    check(`${r}: no clock and no desk controls`,
      !/Round clock/.test(h) && !/Crewmate ejected/.test(h));
    check(`${r}: keeps sabotage and pause`, /Sabotage —/.test(h) && /Pause game|Resume game/.test(h));
    check(`${r}: undo now lives with the Game Master`, !/btn-undo/.test(h));
    // The EMERGEN-C yell can come from anywhere, so every phone in the
    // building can halt the round — but none of them can run the meeting.
    check(`${r}: can call an emergency meeting`,
      (await btnText(pages[r])).some(t=>t.startsWith("Call emergency meeting")),
      (await btnText(pages[r])).join(" | "));
    check(`${r}: but cannot start the 3:00 or run a stage by hand`,
      !/act\.meeting\(\)/.test(h) && !/act\.phasePre|act\.phaseStop|phaserow/.test(h),
      (h.match(/act\.(meeting|phase\w+)|phaserow/g)||["none"]).join(","));
  }

  for(const r of Object.keys(roles)){
    await act(pages[r],"tab","role");
    const h = await html(pages[r]);
    check(`${r}: role crib renders its briefing lines`, (h.match(/· /g)||[]).length>=4);
    await act(pages[r],"tab","controls");
  }
  // The one Foreman crib now carries every station's verification rules, and
  // the old URLs read that same crib. (The cribs were rewritten wholesale — no
  // old referee/ghost sentences are asserted anywhere.)
  for(const r of ["foreman","referee","ghost"]){
    await act(pages[r],"tab","role");
    const h = await html(pages[r]);
    check(`${r}: the crib is the Foreman one, covering every floor station`,
      /Foreman — the short version/.test(h) &&
      ["STAGE —","DEAD ROOM —","UPSTAIRS —","SPECIAL DELIVERY —","ANSWERS TAB —"].every(x=>h.includes(x)),
      ["STAGE —","DEAD ROOM —","UPSTAIRS —","SPECIAL DELIVERY —","ANSWERS TAB —"].filter(x=>!h.includes(x)).join(",")||"all present");
    await act(pages[r],"tab","controls");
  }
  // every role still writes to the same document — driven from an old-URL phone
  await act(pages.referee,"sab");
  await until(pages.ghost,"window.__state().banner==='sabotage'");
  await callMeeting(pages.cc);
  await until(pages.gm,"window.__state().meet.mode==='gather'");
  check("actions from any role reach every other role", (await st(pages.foreman)).sabItems.length===5);
  await act(pages.cc,"cancelMeeting");                 // still a gather — never mind
  await until(pages.gm,"window.__state().meet.mode==='idle'");

  // The break-glass section must survive the re-render any other phone causes.
  // "Death +" is the marker: an ejection only exists once a meeting is over, but
  // the desk's death counter is always there and the GM's own view never has it.
  await act(pages.gm,"desk");
  check("gm: opening the takeover reveals the desk controls", DESK.test(await html(pages.gm)));
  await act(pages.cc,"dAdj",1);
  await until(pages.gm,"window.__state().deaths===1");
  check("gm: the takeover stays open when another phone acts",
    DESK.test(await html(pages.gm)));
  await act(pages.gm,"desk");
  check("gm: it closes again", !DESK.test(await html(pages.gm)));

  const bogus = await mk("/c/nobody","g-roles");
  check("an unknown role falls back to the home screen", /Footprints Companion/.test(await html(bogus)));
}

/* ================================================================= */
section("12 · share links carry the connection");
{
  const A = await mk("/c/cc","g-share");
  await act(A,"dAdj",2); await until(A,"window.__state().deaths===2");
  await A.evaluate("location.hash='#/'"); await settle(400);
  const link = await A.evaluate("document.getElementById('sharelink')?.textContent||''");
  check("home screen prints a share link", link.includes("#/monitor?cfg="), link.slice(0,60));

  // Post-playtest roster: four view links plus the kiosk, and nothing retired.
  const homeLinks = await A.evaluate(()=>[...document.querySelectorAll(".home button")]
    .map(b=>b.childNodes[0].textContent.trim()));
  check("the home screen lists the four views and the kiosk, in order",
    eq(homeLinks, ["TV Monitor","Game Master","Central Command","Foreman","Sabotage Kiosk"]),
    homeLinks.join(" | "));
  const picker = await A.evaluate(()=>[...document.querySelectorAll(".viewpick button")]
    .map(b=>b.textContent.trim()));
  check("the share picker is monitor · gm · cc · foreman · kiosk",
    eq(picker, ["TV Monitor","Game Master","Central Cmd","Foreman","Kiosk"]),
    picker.join(" | "));
  check("no referee or ghost link survives anywhere on the home screen",
    !/Roaming Referee|Ghost Guide|\/c\/referee|\/c\/ghost/.test(await html(A)));

  await act(A,"shareView","/kiosk"); await settle(300);
  check("the kiosk can be shared like any view",
    (await A.evaluate("document.getElementById('sharelink').textContent")).includes("#/kiosk?cfg="));
  await act(A,"shareView","/c/foreman"); await settle(300);
  const link2 = await A.evaluate("document.getElementById('sharelink').textContent");
  check("share-view picker rewrites the link", link2.includes("#/c/foreman?cfg="));

  // a brand new device with empty storage opens the link and is in the game
  const ctx = await newCtx();
  const N = await ctx.newPage();
  N.on("pageerror", e=>pageErrs.push("shared-link: "+e));
  await N.goto(link2.replace("http://localhost:8124", BASE), {waitUntil:"domcontentloaded"});
  await live(N);
  const sN = await st(N);
  check("a device with no setup joins straight from the link", sN.deaths===2, "deaths="+sN.deaths);
  check("the link also picks the view", /Foreman/.test(await html(N)));
  const stored = await N.evaluate("localStorage.getItem('fpCfg')");
  check("the link's config is remembered for next time", !!stored && JSON.parse(stored).gameId===gid("g-share"));

  const qr = await A.evaluate(()=>{const e=document.getElementById("qr");return e?e.innerHTML.length:0});
  check("QR box renders something (image or fallback text)", qr>0, qr+" chars");

  // Disconnect asks first — a mis-tap must not throw a phone out of the game
  await act(A,"forget"); await settle(500);
  const dq = await modal(A);
  check("Disconnect asks before it drops the device",
    !!dq && /Disconnect this device\?/.test(dq.title) && dq.buttons.includes(CONFIRM_YES.forget),
    JSON.stringify(dq));
  check("…and says the game keeps running for everyone else", !!dq && /keeps running/.test(dq.body), dq && dq.body);
  await act(A,"confirmNo"); await settle(500);
  check("cancelling leaves the device connected",
    !!(await A.evaluate("localStorage.getItem('fpCfg')")) && (await conn(A))==="live", await conn(A));

  await act(A,"forget"); await settle(300);
  await act(A,"confirmYes").catch(()=>{});     // this one reloads the page out from under us
  await settle(800);
  check("Disconnect wipes the stored config", !(await A.evaluate("localStorage.getItem('fpCfg')")));
  check("…and drops back to the connect screen", /Paste the/.test(await html(A)));
}

/* ================================================================= */
section("13 · reload, offline, recovery");
{
  const A = await mk("/c/cc","g-net"), B = await mk("/monitor","g-net");
  await act(A,"start"); await act(A,"dAdj",3); await act(A,"sab");
  await until(B,"window.__state().deaths===3 && window.__state().banner==='sabotage'");

  await A.reload({waitUntil:"domcontentloaded"});
  await A.waitForFunction("window.__conn && window.__conn()==='live'", null, {timeout:30000});
  const s = await st(A);
  check("a reload restores the live game, not defaults",
    s.deaths===3 && s.banner==="sabotage" && s.timer.mode==="run", `deaths=${s.deaths} banner=${s.banner}`);
  check("undo history survives a reload", s.hist.length===3, "hist="+s.hist.length);

  if(EMU){
    await A.context().setOffline(true);
    const flipped = await A.waitForFunction("window.__conn()==='off'", null, {timeout:45000}).then(()=>true,()=>false);
    check("losing the network flips the dot to offline", flipped);
    await act(A,"dAdj",1);
    await settle(1500);
    check("the offline phone still updates its own screen", (await st(A)).deaths===4, "A deaths="+(await st(A)).deaths);
    check("the offline write has not reached the other device yet", (await st(B)).deaths===3, "B deaths="+(await st(B)).deaths);
    await A.context().setOffline(false);
    const back = await A.waitForFunction("window.__conn()==='live'", null, {timeout:45000}).then(()=>true,()=>false);
    check("the dot goes green again when wifi returns", back);
    const synced = await until(B,"window.__state().deaths===4",20000).then(()=>true,()=>false);
    check("the queued write catches up on the other device", synced, "B deaths="+(await st(B)).deaths);
  } else note("offline test skipped (mock backend)");
}

/* ================================================================= */
section("14 · concurrent counselors");
{
  const [A,B,C] = [await mk("/c/cc","g-race"), await mk("/c/foreman","g-race"), await mk("/c/referee","g-race")];
  await Promise.all([act(A,"dAdj",1), act(B,"dAdj",1), act(C,"dAdj",1)]);
  await settle(2500);
  const vals = [(await st(A)).deaths, (await st(B)).deaths, (await st(C)).deaths];
  check("all three phones converge on one number", new Set(vals).size===1, JSON.stringify(vals));
  note(`three simultaneous "Death +" taps landed as +${vals[0]} (last-write-wins on the field)`);

  // sequential taps from three different phones must never be lost
  await act(A,"dAdj",1); await until(C,`window.__state().deaths===${vals[0]+1}`);
  await act(B,"dAdj",1); await until(A,`window.__state().deaths===${vals[0]+2}`);
  await act(C,"dAdj",1); await until(B,`window.__state().deaths===${vals[0]+3}`);
  check("taps that take turns are never lost", (await st(A)).deaths===vals[0]+3);

  const h = (await st(A)).hist;
  check("history stays well formed under three writers",
    Array.isArray(h) && h.length<=10 && h.every(e=>e && typeof e.label==="string" && e.s && typeof e.s.deaths==="number"));

  // rapid fire from one phone
  const base = (await st(A)).deaths;
  for(let i=0;i<8;i++) await act(A,"dAdj",1);
  await settle(2500);
  const after = (await st(B)).deaths;
  check("a burst of taps on one phone lands whole", after===base+8, `${base}→${after}`);
}

/* ================================================================= */
section("15 · Firestore security rules");
if(EMU){
  const P = await mk("/","g-rules",{connect:false});
  const res = await P.evaluate(async ({sdk,host,port,project})=>{
    const {initializeApp} = await import(`${sdk}/firebase-app.js`);
    const F = await import(`${sdk}/firebase-firestore.js`);
    const app = initializeApp({apiKey:"demo",projectId:project},"rulesprobe");
    const db = F.getFirestore(app);
    F.connectFirestoreEmulator(db,host,port);
    const race = pr => Promise.race([pr, new Promise((_,rj)=>setTimeout(()=>rj(new Error("timeout")),12000))]);
    const try_ = async fn => {try{await race(fn()); return "ok"}catch(e){return e.code||e.message}};
    return {
      gamesRead:  await try_(()=>F.getDoc(F.doc(db,"games","probe"))),
      gamesWrite: await try_(()=>F.setDoc(F.doc(db,"games","probe"),{x:1})),
      otherRead:  await try_(()=>F.getDoc(F.doc(db,"secrets","probe"))),
      otherWrite: await try_(()=>F.setDoc(F.doc(db,"secrets","probe"),{x:1})),
      subWrite:   await try_(()=>F.setDoc(F.doc(db,"games/probe/notes","x"),{x:1})),
    };
  },{sdk:SDK_CDN, host:EMU_HOST, port:EMU_PORT, project:PROJECT});
  check("games/* is readable by anyone with the link", res.gamesRead==="ok", res.gamesRead);
  check("games/* is writable by anyone with the link", res.gamesWrite==="ok", res.gamesWrite);
  check("every other collection is denied for reads", res.otherRead==="permission-denied", res.otherRead);
  check("every other collection is denied for writes", res.otherWrite==="permission-denied", res.otherWrite);
  check("subcollections under a game are denied too", res.subWrite==="permission-denied", res.subWrite);
} else note("rules test skipped (needs the real emulator)");

/* ================================================================= */
section("16 · shipped data integrity");
{
  const src = readFileSync(join(HERE,"..","index.html"),"utf8");
  const tpl = readFileSync(join(HERE,"..","index.template.html"),"utf8");
  const grab = s => {
    const i = s.indexOf("/*__DATA__*/");
    return s.slice(i+12, s.indexOf("\n", i)).replace(/;\s*$/,"");
  };
  const canon = o => Array.isArray(o) ? o.map(canon)
    : (o && typeof o==="object") ? Object.keys(o).sort().reduce((a,k)=>(a[k]=canon(o[k]),a),{})
    : o;
  let embedded=null, parseErr="";
  try{embedded = JSON.parse(grab(src))}catch(e){parseErr=String(e)}
  check("index.html has parseable embedded app data", !!embedded, parseErr);
  if(embedded){
    check("embedded data is byte-for-byte appdata.json", eq(canon(embedded), canon(APP)));
    check("32 groups of door codes on all 7 doors",
      APP.doors.length===7 && APP.doors.every(d=>Object.keys(embedded.code[d]).length===32));
    check("80 sudoku puzzles, each 16 cells", Object.keys(embedded.sudoku).length===80 &&
      Object.values(embedded.sudoku).every(s=>s.a.length===16 && s.p.length===16));
    const solved = Object.entries(embedded.sudoku).filter(([n,s])=>{
      const rows=[0,1,2,3].map(r=>s.a.slice(4*r,4*r+4));
      const cols=[0,1,2,3].map(c=>[0,1,2,3].map(r=>s.a[4*r+c]));
      const box=[[0,1,4,5],[2,3,6,7],[8,9,12,13],[10,11,14,15]].map(ix=>ix.map(i=>s.a[i]));
      const ok=g=>g.every(x=>new Set(x).size===4 && x.every(v=>v>=1&&v<=4));
      const givens=s.p.every((v,i)=>v===0||v===s.a[i]);
      return !(ok(rows)&&ok(cols)&&ok(box)&&givens);
    });
    check("every embedded sudoku answer is a valid 4×4 solution matching its givens",
      solved.length===0, solved.slice(0,3).map(([n])=>"#"+n).join(","));
    check("every sabotage set is 5 props with a known door",
      [1,2,3].every(i=>embedded.sets[i].length===5 && embedded.sets[i].every(p=>embedded.props[p])));
    // doors3: each group's own three doors — always real doors, no repeats,
    // and always at least one upstairs (U*) and one downstairs (D*).
    const d3bad = [...Array(32)].map((_,i)=>String(i+1)).filter(g=>{
      const ds = embedded.doors3?.[g];
      return !(Array.isArray(ds) && ds.length===3 && new Set(ds).size===3 &&
        ds.every(d=>embedded.doors.includes(d)) &&
        ds.some(d=>d.startsWith("U")) && ds.some(d=>d.startsWith("D")));
    });
    check("doors3: every group 1–32 has exactly 3 valid doors spanning both floors",
      !!embedded.doors3 && Object.keys(embedded.doors3).length===32 && d3bad.length===0,
      d3bad.length ? "bad groups: "+d3bad.slice(0,6).join(",") : Object.keys(embedded.doors3||{}).length+" groups");
    check("every group has a gospel word", Object.keys(embedded.gospel).length===32);
    check("every gospel word has a sentence to finish it",
      [...new Set(Object.values(embedded.gospel))].every(w=>typeof embedded.gospelPhrase?.[w]==="string"
        && embedded.gospelPhrase[w].length>10),
      JSON.stringify(embedded.gospelPhrase).slice(0,120));
  }
  check("index.template.html differs from index.html only in the data block",
    src.replace(grab(src),"") === tpl.replace(grab(tpl),""));
}

/* ================================================================= */
section("17 · no page errors anywhere");
check("no uncaught exceptions across every device in this run", pageErrs.length===0,
  pageErrs.slice(0,4).join(" | "));

await finish("COMPREHENSIVE TEST");
