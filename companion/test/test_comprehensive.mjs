// Core mechanics of the companion app, device-to-device.
//   node test/test_comprehensive.mjs        (mock backend)
//   EMU=1 node test/test_comprehensive.mjs  (real Firestore emulator)
import {readFileSync} from "fs";
import {join} from "path";
import {HERE, APP, EMU, DEF, SDK_CDN, EMU_HOST, EMU_PORT, PROJECT,
        section, check, note, eq, gid, settle, boot, newCtx, mk, live,
        st, conn, act, until, softUntil, html, btnText, btnBy, tap,
        confirmNewRound, confirmPause, modal, CONFIRM_YES,
        raw, pageErrs, finish, BASE, CFG} from "./harness.mjs";

const b = await boot();

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
section("3 · meetings and phase stopwatch");
{
  const A = await mk("/c/cc","g-meet"), G = await mk("/c/gm","g-meet");   // A drives, G watches
  await act(A,"start"); await until(A,"window.__state().timer.mode==='run'");
  await act(A,"meeting");
  await until(G,"window.__state().banner==='meeting'");
  let s = await st(G);
  check("meeting pauses the round clock everywhere", s.timer.mode==="pause");
  // The 3:00 hard stop is its own clock now, so the sub-phases can run under it
  // instead of overwriting it.
  check("meeting starts a 3:00 hard stop of its own",
    s.meet.mode==="run" && s.meet.remain===180000, JSON.stringify(s.meet));
  check("…kept clear of the phase stopwatch", s.phase.mode==="idle" && s.phase.label==="",
    JSON.stringify(s.phase));
  check("…and it remembers that it was the meeting that stopped the round clock",
    s.meet.clock===true, JSON.stringify(s.meet));

  const presets = [["phasePre",30,"REPORT"],["phasePre",90,"NOMINATIONS"],["phasePre",30,"CORNERS"],
                   ["phasePre",30,"VOTE"],["phasePre",120,"SABOTAGE"]];
  for(const [fn,secs,label] of presets){
    await act(A,fn,secs,label);
    await until(G,`window.__state().phase.label===${JSON.stringify(label)}`);
    const g = await st(G), p = g.phase;
    check(`CC's ${label} preset = ${secs}s, seen by the GM`, p.remain===secs*1000 && p.mode==="run", p.remain+"ms");
    check(`…and the 3:00 hard stop keeps running under ${label}`, g.meet.mode==="run",
      JSON.stringify(g.meet));
  }
  await act(A,"phaseStop");
  await until(G,"window.__state().phase.mode==='idle'");
  check("phase stop clears the stopwatch", (await st(G)).phase.label==="");
  check("…but does not end the meeting itself", (await st(G)).meet.mode==="run",
    JSON.stringify((await st(G)).meet));

  await act(A,"endMeeting");
  await until(G,"window.__state().banner==='none'");
  s = await st(G);
  check("end meeting clears banner, phase and the hard stop",
    s.banner==="none" && s.phase.mode==="idle" && s.meet.mode==="idle", JSON.stringify(s.meet));
  // The desk closes meetings but no longer owns the clock, so a meeting has to
  // hand back the clock it took, or nobody at the desk can restart the round.
  check("end meeting gives back the round clock the meeting stopped", s.timer.mode==="run",
    s.timer.mode);
}

/* ================================================================= */
// Calling a meeting takes the round clock away, so the meeting has to give it
// back — by whichever of the three doors it leaves. Central Command closes
// meetings but the clock belongs to the Game Master now, so a meeting that left
// it stopped would strand the desk mid-round with no control to restart it.
// Equally, it must not hand back a clock it never took.
section("3b · every way out of a meeting hands the round clock back");
{
  const A = await mk("/c/cc","g-mclock"), M = await mk("/monitor","g-mclock");
  const left = s => s.timer.mode==="run" ? s.timer.endsAt-Date.now() : s.timer.remain;

  for(const [name, exit] of [["End meeting","endMeeting"],
                             ["Crewmate ejected","ejectCrew"],
                             ["IMPOSTER caught","ejectImp"]]){
    await act(A,"resetT"); await act(A,"start");
    await until(M,"window.__state().timer.mode==='run'");
    await settle(600);                       // let real seconds come off it
    await act(A,"meeting");
    await until(M,"window.__state().meet.mode==='run'");
    check(`${name}: calling the meeting stopped the round clock`,
      (await st(M)).timer.mode==="pause", (await st(M)).timer.mode);
    const held = (await st(M)).timer.remain;

    await act(A,exit);
    await until(M,"window.__state().meet.mode==='idle'");
    await settle(400);
    const s = await st(M);
    check(`${name}: the round clock is running again`, s.timer.mode==="run", s.timer.mode);
    check(`${name}: it resumes where the meeting froze it, not from full`,
      Math.abs(left(s)-held)<2500, `${Math.round(held)}ms held → ${Math.round(left(s))}ms`);
    check(`${name}: and the hard stop is cleared with it`,
      s.meet.mode==="idle" && s.banner==="none", JSON.stringify(s.meet));
  }

  /* --- and the two ways it must keep its hands off the clock --- */

  // 1. the clock was never running when the meeting was called
  await act(A,"resetT");
  await until(M,"window.__state().timer.mode==='idle'");
  await act(A,"meeting");
  await until(M,"window.__state().meet.mode==='run'");
  check("a meeting called on a stopped clock records that it took nothing",
    (await st(M)).meet.clock===false, JSON.stringify((await st(M)).meet));
  await act(A,"endMeeting");
  await until(M,"window.__state().meet.mode==='idle'");
  await settle(400);
  check("…and ending it does not start a clock nobody had started",
    (await st(M)).timer.mode==="idle", (await st(M)).timer.mode);

  // the sharper version: a clock deliberately paused before the meeting
  await act(A,"resetT"); await act(A,"start"); await settle(500); await act(A,"pause");
  await until(M,"window.__state().timer.mode==='pause'");
  await act(A,"meeting");
  await until(M,"window.__state().meet.mode==='run'");
  await act(A,"ejectCrew");
  await until(M,"window.__state().meet.mode==='idle'");
  await settle(400);
  check("a clock deliberately paused before the meeting is still paused after it",
    (await st(M)).timer.mode==="pause", (await st(M)).timer.mode);

  // 2. the whole game is paused — nothing may start under a PAUSED screen
  await act(A,"resetT"); await act(A,"start");
  await until(M,"window.__state().timer.mode==='run'");
  await act(A,"meeting");
  await until(M,"window.__state().meet.mode==='run'");
  await confirmPause(A);
  await until(M,"window.__state().paused.on===true");
  await act(A,"ejectImp");
  await until(M,"window.__state().meet.mode==='idle'");
  await settle(400);
  let p = await st(M);
  check("ending a meeting while the game is paused does not restart the round clock",
    p.timer.mode!=="run", p.timer.mode);
  check("…and the game is still paused", p.paused.on===true, JSON.stringify(p.paused));

  await act(A,"resumeGame");
  await until(M,"window.__state().paused.on===false");
  await settle(500);
  p = await st(M);
  // Two things have to be true at once here, and they pull against each other.
  // The meeting was ended, so resuming must not bring a 0:00 hard stop back onto
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

  for(const [name, exit] of [["End meeting","endMeeting"],
                             ["Crewmate ejected","ejectCrew"],
                             ["IMPOSTER caught","ejectImp"]]){
    await act(A,"resetT"); await act(A,"start");
    await until(M,"window.__state().timer.mode==='run'");
    await settle(600);                       // let real seconds come off it
    await act(A,"meeting");
    await until(M,"window.__state().meet.mode==='run'");
    const held = (await st(M)).timer.remain;

    await confirmPause(A);
    await until(M,"window.__state().paused.on===true");
    await act(A,exit);
    await until(M,"window.__state().meet.mode==='idle'");
    await settle(400);
    let s = await st(M);
    check(`${name} under a pause: nothing starts while the screen still says PAUSED`,
      s.timer.mode!=="run" && s.paused.on===true, `${s.timer.mode}, paused.on=${s.paused.on}`);
    check(`${name} under a pause: the clock the meeting took is held for the resume`,
      s.paused.clock===true, JSON.stringify(s.paused));

    await act(A,"resumeGame");
    await until(M,"window.__state().paused.on===false");
    await until(A,"window.__state().paused.on===false");
    await settle(400);
    s = await st(M);
    check(`${name} under a pause: resuming hands the round clock back`,
      s.timer.mode==="run", s.timer.mode);
    check(`${name} under a pause: …from where the meeting froze it, not from full`,
      Math.abs((s.timer.endsAt-Date.now())-held)<2500,
      `${Math.round(held)}ms held → ${Math.round(s.timer.endsAt-Date.now())}ms`);
    check(`${name} under a pause: and the meeting stays ended`,
      s.meet.mode==="idle" && s.banner==="none" && s.phase.mode==="idle", JSON.stringify(s.meet));
    check(`${name} under a pause: no phantom chip left on the desk strip`,
      (await chips())==="", await chips());
  }

  // The same shape with a clock that was never started: there is nothing to
  // hand back, and resume must not invent one.
  await act(A,"resetT");
  await until(M,"window.__state().timer.mode==='idle'");
  await act(A,"meeting");
  await until(M,"window.__state().meet.mode==='run'");
  await confirmPause(A);
  await until(M,"window.__state().paused.on===true");
  await act(A,"endMeeting");
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
  await act(A,"resetT"); await act(A,"start");
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
section("4 · ejections");
{
  const A = await mk("/c/cc","g-eject"), M = await mk("/monitor","g-eject");
  await act(A,"meeting"); await until(M,"window.__state().banner==='meeting'");
  await act(A,"ejectCrew");
  await until(M,"window.__state().deaths===1");
  let s = await st(M);
  check("crewmate ejected = +1 death", s.deaths===1);
  check("ejection closes the meeting banner, phase and hard stop",
    s.banner==="none" && s.phase.mode==="idle" && s.meet.mode==="idle", JSON.stringify(s.meet));

  await act(A,"meeting"); await until(M,"window.__state().banner==='meeting'");
  await act(A,"ejectImp");
  await until(M,"window.__state().impostersCaught===1");
  s = await st(M);
  check("imposter caught = no death tick", s.deaths===1 && s.impostersCaught===1);
  check("imposter ejection also closes the meeting", s.banner==="none");
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
  const btns = await A.evaluate(()=>[...document.querySelectorAll("button")]
    .filter(x=>/^Set [123]$/.test(x.textContent.trim())).map(x=>x.disabled));
  check("Set 1–3 buttons disabled after 2 sabotages", btns.length===3 && btns.every(Boolean), JSON.stringify(btns));
  const fBtns = await F.evaluate(()=>[...document.querySelectorAll("button")]
    .filter(x=>/^Set [123]$/.test(x.textContent.trim())).map(x=>x.disabled));
  check("…on the foreman's phone too", fBtns.length===3 && fBtns.every(Boolean), JSON.stringify(fBtns));

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
    labels0.filter(t=>t.startsWith("New round")).length===1 && labels0.some(t=>t.startsWith("↩")),
    labels0.filter(t=>/New round|↩/.test(t)).join(" / "));

  // The button only asks. Nothing may move until the dialog is answered.
  await tap(A,"New round");
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
  await tap(A,"New round"); await settle(250);
  await A.keyboard.press("Escape"); await settle(500);
  check("Escape closes the dialog too", (await modal(A))===null, JSON.stringify(await modal(A)));
  check("…without starting a round", (await st(A)).round===1, "round="+(await st(A)).round);

  // REGRESSION (same family as the old arming bug): another phone acting
  // re-renders this whole view. The dialog is drawn by that render, so an
  // innocent update from the desk must not drop the question on the floor —
  // and must not leave a live confirm behind an ordinary-looking screen.
  await tap(A,"New round");
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
  check("new round keeps target and threshold", s.targetPts===8 && s.threshold===6);
  check("the dialog closes once it has run", (await modal(A))===null, JSON.stringify(await modal(A)));
  await settle(700);
  check("one confirmation advances exactly one round", (await st(A)).round===2, "round="+(await st(A)).round);

  // and it is repeatable — the ask is not a one-shot
  await tap(A,"New round"); await settle(250);
  await tap(A,CONFIRM_YES.newRound);
  await until(M,"window.__state().round===3");
  check("the next round can be started the same way", (await st(M)).round===3, "round="+(await st(M)).round);
}

/* ================================================================= */
section("8 · undo — depth, compounds, cross-device");
{
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
  check("referee's undo lands on CC", (await st(A)).deaths===14);
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
  check("undo of sabotage-fail restores deaths, banner, set and phase",
    s.deaths===5 && s.banner==="sabotage" && s.sabItems.length===5 && s.phase.label==="SABOTAGE");
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
  await act(A,"meeting"); await until(M,"document.querySelector('.overlay.meet')");
  h = await html(M);
  check("meeting overlay appears on the TV", /EMERGENCY MEETING/.test(h));
  await act(A,"phasePre",90,"NOMINATIONS");
  await until(M,"window.__state().phase.label==='NOMINATIONS'");
  await until(M,"document.body.innerHTML.includes('NOMINATIONS')");
  check("meeting overlay shows the current phase name", (await html(M)).includes("NOMINATIONS"));
  await act(A,"endMeeting"); await until(M,"!document.querySelector('.overlay.meet')");

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
  check("ROUND OVER quotes the point target", /target was 8/.test(h));

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
      return {title:el.querySelector("h1")?.textContent, codes, kv, text:el.textContent};
    });
    if(!got){bad.push(`${g}: no card`); continue}
    if(got.title!==`Group ${g}`) bad.push(`${g}: title "${got.title}"`);
    for(const d of APP.doors) if(got.codes[d]!==APP.code[d][g]) bad.push(`${g}/${d}: ${got.codes[d]}≠${APP.code[d][g]}`);
    if(!got.text.includes(APP.gospel[g].toUpperCase())) bad.push(`${g}: gospel ${APP.gospel[g]} missing`);
    // the counsellor reads the whole line aloud, not just the cue word
    if(!got.text.includes(APP.gospelPhrase[APP.gospel[g]])) bad.push(`${g}: gospel phrase for ${APP.gospel[g]} missing`);
    if(APP.ball[g] && !got.text.includes(APP.ball[g])) bad.push(`${g}: ball missing`);
    const wantV = APP.verses[g]||[];
    if(wantV.length !== got.kv.length) bad.push(`${g}: ${got.kv.length} verse rows, want ${wantV.length}`);
    else wantV.forEach(([ref,page],i)=>{
      if(got.kv[i][0]!==ref || got.kv[i][1]!==String(page)) bad.push(`${g}: verse ${got.kv[i]} ≠ ${ref}/${page}`)});
  }
  check("all 32 groups: door codes, verse pages, gospel word, ball direction", bad.length===0, bad.slice(0,4).join(" | "));

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
  const roles = {gm:"Game Master", cc:"Central Command", foreman:"Foreman",
                 referee:"Roaming Referee", ghost:"Ghost Guide"};
  const pages = {};
  for(const r of Object.keys(roles)) pages[r] = await mk("/c/"+r,"g-roles");

  for(const [r,name] of Object.entries(roles)){
    const h = await html(pages[r]);
    check(`${r}: header names the role`, h.includes(name));
    check(`${r}: has controls / answers / my role tabs`, /Controls/.test(h) && /Answers/.test(h) && /My role/.test(h));
  }

  // The split: the desk runs the fiction, the Game Master runs the session.
  const gm = await html(pages.gm), cc = await html(pages.cc);
  const gmBtns = await btnText(pages.gm), ccBtns = await btnText(pages.cc);
  const dial = ts => ts.some(t=>t.startsWith("−1 death")) && ts.some(t=>t.startsWith("+1 death"));
  check("gm: owns the clock, the dials, undo and New round",
    /Round clock/.test(gm) && /Death threshold/.test(gm) && dial(gmBtns) &&
    /class="sect">Undo</.test(gm) && gmBtns.some(t=>t.startsWith("New round")),
    gmBtns.join(" | "));
  check("gm: does not carry the desk's in-game controls by default",
    !/Crewmate ejected/.test(gm) && !/Start meeting/.test(gm) && !/Death \+/.test(gm));
  check("gm: offers a break-glass takeover of the desk", /Take over the desk/.test(gm));

  check("cc: owns meetings, phases, ejections, deaths and sabotage",
    /Start meeting/.test(cc) && /Meeting — 3:00 hard stop/.test(cc) &&
    ["report","noms","corners","vote"].every(x=>cc.includes(x+"<span>")) &&
    /Crewmate ejected/.test(cc) && /Death \+/.test(cc) && /Sabotage —/.test(cc),
    ccBtns.join(" | "));
  // The desk view explains in prose where the clock and Undo went, so absence
  // has to be judged on the controls themselves, not on the words.
  check("cc: no clock, no dials, no New round button, no undo button",
    !/Round clock/.test(cc) && !dial(ccBtns) && !/btn-undo/.test(cc) &&
    !ccBtns.some(t=>t.startsWith("New round")) && !ccBtns.some(t=>t.startsWith("↩")),
    ccBtns.join(" | "));

  for(const r of ["foreman","referee","ghost"]){
    const h = await html(pages[r]);
    check(`${r}: no clock and no desk controls`,
      !/Round clock/.test(h) && !/Crewmate ejected/.test(h) && !/Start meeting/.test(h));
    check(`${r}: keeps sabotage and pause`, /Sabotage —/.test(h) && /Pause game|Resume game/.test(h));
    check(`${r}: undo now lives with the Game Master`, !/btn-undo/.test(h));
  }
  // the phase row is rendered as "<b>1</b> report<span>0:30</span>" — match the
  // markup, not a prose label, or the check quietly passes on every view
  const gh = await html(pages.ghost);
  check("ghost: no longer holds the meeting stopwatch it never attends",
    !/report<span>/.test(gh) && !/phaserow/.test(gh),
    (gh.match(/phaserow|report<span>/g)||["none"]).join(","));

  for(const r of Object.keys(roles)){
    await act(pages[r],"tab","role");
    const h = await html(pages[r]);
    check(`${r}: role crib renders its briefing lines`, (h.match(/· /g)||[]).length>=4);
    await act(pages[r],"tab","controls");
  }
  // every role still writes to the same document
  await act(pages.referee,"sab");
  await until(pages.ghost,"window.__state().banner==='sabotage'");
  await act(pages.cc,"phasePre",30,"REPORT");
  await until(pages.gm,"window.__state().phase.label==='REPORT'");
  check("actions from any role reach every other role", (await st(pages.foreman)).sabItems.length===5);

  // the break-glass section must survive the re-render any other phone causes
  await act(pages.gm,"desk");
  check("gm: opening the takeover reveals the desk controls", /Crewmate ejected/.test(await html(pages.gm)));
  await act(pages.cc,"dAdj",1);
  await until(pages.gm,"window.__state().deaths===1");
  check("gm: the takeover stays open when another phone acts",
    /Crewmate ejected/.test(await html(pages.gm)));
  await act(pages.gm,"desk");
  check("gm: it closes again", !/Crewmate ejected/.test(await html(pages.gm)));

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
