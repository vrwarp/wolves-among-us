// The two game-night features: sound cues, and a game-wide pause any role can
// call. Sounds are asserted through window.__sound(), which records every cue
// the app decided to emit (muted = nothing recorded at all).
//   EMU=1 node test/test_features.mjs
import {EMU, DEF, FIELDS, section, check, note, eq, pick, diff, gid, settle,
        boot, mk, live, st, snd, sndReset, clearSounds, conn, act, until,
        softUntil, html, btnText, tap, confirmNewRound, confirmPause, modal,
        CONFIRM_YES, allAgree, raw, pageErrs, finish} from "./harness.mjs";

await boot();
const NOCLOCK = FIELDS.filter(k=>k!=="timer"&&k!=="phase");
const rem = s => s.timer.mode==="run" ? s.timer.endsAt-Date.now() : s.timer.remain;
// pause asks first: the tap opens the dialog, the dialog stops the game
const pauseNow = p => confirmPause(p);

/* ================================================================= */
section("1 · the countdown, on every device");
{
  const CC = await mk("/c/cc","f-count"), TV = await mk("/monitor","f-count"),
        FM = await mk("/c/foreman","f-count");
  const all=[CC,TV,FM];
  await act(CC,"start");
  await until(TV,"window.__state().timer.mode==='run'");
  await act(CC,"adj",-(480000-12500));                 // ~12.5s left
  await until(TV,"window.__state().timer.endsAt-Date.now()<13000");
  await clearSounds(all);
  await settle(14500);                                 // run it through zero

  for(const [p,name] of [[CC,"CC"],[TV,"the TV"],[FM,"the Foreman"]]){
    const s = await snd(p);
    const ticks = s.log.filter(x=>x==="tick").length;
    check(`${name} beeps through the last ten seconds`, ticks>=9 && ticks<=11, `${ticks} ticks: ${s.log.join(",")}`);
    check(`${name} sounds the end of the round at 0:00`, s.log.includes("timeUp"), s.log.slice(-3).join(","));
  }
  const order = (await snd(TV)).log;
  check("the ten beeps come before the end tone",
    order.lastIndexOf("tick") < order.indexOf("timeUp"), order.join(","));
}

/* ================================================================= */
section("2 · the minute chime is the TV's alone");
{
  const CC = await mk("/c/cc","f-min"), TV = await mk("/monitor","f-min"),
        GH = await mk("/c/ghost","f-min");
  const all=[CC,TV,GH];
  await act(CC,"start");
  await until(TV,"window.__state().timer.mode==='run'");
  await act(CC,"adj",-(480000-303000));                // ~5:03 → crosses 5:00
  await until(TV,"window.__state().timer.endsAt-Date.now()<304000");
  await clearSounds(all);
  await settle(6000);

  const tv = await snd(TV), cc = await snd(CC), gh = await snd(GH);
  check("the TV chimes on the minute", tv.log.includes("minute"), tv.log.join(",")||"(silent)");
  check("a counsellor phone stays quiet on the minute", !cc.log.includes("minute"), cc.log.join(",")||"(silent)");
  check("…and so does the ghost's", !gh.log.includes("minute"), gh.log.join(",")||"(silent)");
  check("nobody beeps the countdown this far out",
    !tv.log.includes("tick") && !cc.log.includes("tick"), tv.log.join(","));
}

/* ================================================================= */
section("3 · sabotage, meeting and pause cues");
{
  const CC = await mk("/c/cc","f-cue"), TV = await mk("/monitor","f-cue"),
        RF = await mk("/c/referee","f-cue");
  const all=[CC,TV,RF];
  await act(CC,"start"); await allAgree(all);

  await clearSounds(all);
  await act(RF,"sab",2);
  await until(TV,"window.__state().banner==='sabotage'");
  await settle(700);
  for(const [p,n] of [[CC,"CC"],[TV,"the TV"],[RF,"the Referee"]])
    check(`${n} plays the sabotage alert`, (await snd(p)).log.includes("sabotage"), (await snd(p)).log.join(","));

  await clearSounds(all);
  await act(CC,"sabOk");
  await until(TV,"window.__state().banner==='none'");
  await settle(600);
  check("clearing a sabotage does not re-alarm the room",
    !(await snd(TV)).log.includes("sabotage"), (await snd(TV)).log.join(",")||"(silent)");

  await clearSounds(all);
  await act(CC,"meeting");
  await until(TV,"window.__state().banner==='meeting'");
  await settle(700);
  for(const [p,n] of [[CC,"CC"],[TV,"the TV"],[RF,"the Referee"]])
    check(`${n} chimes the emergency meeting`, (await snd(p)).log.includes("meeting"), (await snd(p)).log.join(","));
  await act(CC,"endMeeting"); await allAgree(all);

  await clearSounds(all);
  await pauseNow(RF);
  await until(TV,"window.__state().paused.on===true");
  await settle(600);
  for(const [p,n] of [[CC,"CC"],[TV,"the TV"],[RF,"the Referee"]])
    check(`${n} chimes on pause`, (await snd(p)).log.includes("paused"), (await snd(p)).log.join(","));

  await clearSounds(all);
  await act(CC,"resumeGame");
  await until(TV,"window.__state().paused.on===false");
  await settle(600);
  for(const [p,n] of [[CC,"CC"],[TV,"the TV"],[RF,"the Referee"]])
    check(`${n} chimes on resume`, (await snd(p)).log.includes("resumed"), (await snd(p)).log.join(","));
}

/* ================================================================= */
section("4 · sound restraint");
{
  const CC = await mk("/c/cc","f-quiet");
  await act(CC,"start"); await act(CC,"sab",1);
  await until(CC,"window.__state().banner==='sabotage'");
  await settle(500);

  // a phone picked up mid-sabotage must not blare at whoever picked it up
  const LATE = await mk("/c/foreman","f-quiet");
  await settle(1200);
  const s = await snd(LATE);
  check("a device joining mid-sabotage stays silent", !s.log.includes("sabotage"), s.log.join(",")||"(silent)");
  check("…and mid-sabotage is still what it sees", (await st(LATE)).banner==="sabotage");

  // muting really means nothing
  await act(CC,"sabOk"); await settle(400);
  await sndReset(CC);
  await act(CC,"mute");
  check("mute reports itself muted", (await snd(CC)).muted===true);
  await sndReset(CC);
  await act(CC,"meeting"); await settle(700);
  await act(CC,"sab",2);   await settle(700);
  check("a muted phone records no cues at all", (await snd(CC)).count===0, JSON.stringify((await snd(CC)).log));
  await act(CC,"mute");
  check("unmuting turns it back on", (await snd(CC)).muted===false);

  // the countdown must not run while the game is paused
  const CC2 = await mk("/c/cc","f-quiet2");
  await act(CC2,"start");
  await act(CC2,"adj",-(480000-8000));
  await until(CC2,"window.__state().timer.endsAt-Date.now()<9000");
  await pauseNow(CC2);
  await until(CC2,"window.__state().paused.on===true");
  await sndReset(CC2);
  await settle(4000);
  check("a paused clock does not beep its way to zero", (await snd(CC2)).count===0,
    JSON.stringify((await snd(CC2)).log));
}

/* ================================================================= */
section("5 · any role can pause, and it asks first");
{
  for(const role of ["gm","cc","foreman","referee","ghost"]){
    const A = await mk("/c/"+role,"f-pause-"+role), TV = await mk("/monitor","f-pause-"+role);
    await act(A,"start");
    await until(TV,"window.__state().timer.mode==='run'");

    const before = await st(A);
    await act(A,"pauseGame");                      // opens the dialog, nothing more
    await settle(500);
    check(`${role}: asking does not stop the game`, (await st(A)).paused.on===false,
      JSON.stringify((await st(A)).paused));
    check(`${role}: asking changes nothing at all`, eq(pick(before,NOCLOCK), pick(await st(A),NOCLOCK)),
      diff(before, await st(A), NOCLOCK));
    const dlg = await modal(A);
    check(`${role}: the dialog asks before pausing`,
      !!dlg && /Pause the game\?/.test(dlg.title) && dlg.buttons.includes(CONFIRM_YES.pauseGame),
      JSON.stringify(dlg));
    check(`${role}: the dialog says what it will do to the room`,
      !!dlg && /clock/i.test(dlg.body) && /resume/i.test(dlg.body), dlg && dlg.body);

    // backing out must leave the game exactly as it was
    await act(A,"confirmNo"); await settle(400);
    check(`${role}: cancelling closes the dialog and pauses nothing`,
      (await modal(A))===null && (await st(A)).paused.on===false, JSON.stringify(await st(A)).slice(0,120));
    check(`${role}: cancelling leaves no trace in the history`,
      !(await st(A)).hist.some(h=>h.label==="Game paused"), (await st(A)).hist.map(h=>h.label).join(","));

    await act(A,"pauseGame");
    await act(A,"confirmYes");                     // confirmed
    const landed = await softUntil(TV,"window.__state().paused.on===true",12000);
    check(`${role}: confirming pauses the game everywhere`, landed, "TV paused="+JSON.stringify((await st(TV)).paused));
    check(`${role}: the TV shows PAUSED`, /PAUSED/.test(await html(TV)) &&
      !!(await TV.evaluate("!!document.querySelector('.overlay.paused')")));
    check(`${role}: the counsellor strip shows PAUSED`, /chip paused/.test(await html(A)));

    const agree = await allAgree([A,TV]);
    check(`${role}: both devices agree on the paused state`, agree.ok, agree.detail);
    await act(A,"resumeGame");
    await until(TV,"window.__state().paused.on===false");
  }
}

/* ================================================================= */
section("6 · pause really freezes, and resume restores exactly");
{
  const CC = await mk("/c/cc","f-freeze"), TV = await mk("/monitor","f-freeze"),
        GH = await mk("/c/ghost","f-freeze");
  await act(CC,"start");
  await until(TV,"window.__state().timer.mode==='run'");
  await pauseNow(GH);
  await until(TV,"window.__state().paused.on===true");

  const r0 = rem(await st(TV));
  await settle(3000);
  const r1 = rem(await st(TV));
  check("the round clock does not move while paused", Math.abs(r1-r0)<50, `${Math.round(r0)} → ${Math.round(r1)}`);
  const shown0 = await TV.evaluate("document.querySelector('[data-clk]').textContent");
  await settle(2000);
  check("the TV's digits do not move either",
    shown0===await TV.evaluate("document.querySelector('[data-clk]').textContent"), shown0);

  await act(CC,"resumeGame");
  await until(TV,"window.__state().paused.on===false");
  const r2 = rem(await st(TV));
  check("resuming gives back the time the pause held, not the wall clock",
    Math.abs(r2-r0)<1200, `${Math.round(r0)} → ${Math.round(r2)} after a 5s pause`);
  check("the clock is running again", (await st(TV)).timer.mode==="run");

  // a clock that was NOT running must not start on resume
  await act(CC,"pause");
  await until(TV,"window.__state().timer.mode==='pause'");
  await pauseNow(GH);
  await until(TV,"window.__state().paused.on===true");
  await act(CC,"resumeGame");
  await until(TV,"window.__state().paused.on===false");
  check("resume does not start a clock that was already stopped",
    (await st(TV)).timer.mode==="pause", (await st(TV)).timer.mode);

  // the phase clock freezes and comes back too
  await act(CC,"start"); await act(CC,"sab",3);
  await until(TV,"window.__state().phase.mode==='run'");
  await pauseNow(GH);
  await until(TV,"window.__state().paused.on===true");
  const p0 = (await st(TV)).phase.remain;
  check("the phase clock freezes as well", (await st(TV)).phase.mode==="pause", (await st(TV)).phase.mode);
  await settle(2500);
  check("…and holds its remaining time", (await st(TV)).phase.remain===p0, `${p0} → ${(await st(TV)).phase.remain}`);
  check("the TV shows PAUSED, not the sabotage board", /PAUSED/.test(await html(TV)) &&
    !(await TV.evaluate("!!document.querySelector('.overlay.sab')")));
  await act(CC,"resumeGame");
  await until(TV,"window.__state().paused.on===false");
  const back = await st(TV);
  check("the sabotage phase picks up where it stopped",
    back.phase.mode==="run" && Math.abs((back.phase.endsAt-Date.now())-p0)<1500,
    `${p0} → ${Math.round(back.phase.endsAt-Date.now())}`);
  check("the TV is back to the sabotage board", !!(await TV.evaluate("!!document.querySelector('.overlay.sab')")));
}

/* ================================================================= */
section("7 · pause behaves like every other action");
{
  const CC = await mk("/c/cc","f-pact"), FM = await mk("/c/foreman","f-pact");
  await act(CC,"start"); await settle(400);
  const before = await st(CC);

  await pauseNow(FM);
  await until(CC,"window.__state().paused.on===true");
  await act(CC,"undo");
  await settle(800);
  check("undo takes a pause back completely", eq(pick(before), pick(await st(CC))), diff(before, await st(CC)));

  await pauseNow(FM);
  await until(CC,"window.__state().paused.on===true");
  await pauseNow(FM);
  await settle(600);
  check("pausing an already paused game does nothing", (await st(CC)).paused.on===true);
  check("…and does not stack up history", (await st(CC)).hist.filter(h=>h.label==="Game paused").length===1,
    (await st(CC)).hist.map(h=>h.label).join(","));

  await act(CC,"resumeGame"); await settle(500);
  await act(CC,"resumeGame"); await settle(500);
  check("resuming a running game does nothing", (await st(CC)).paused.on===false);

  // Start on CC is the familiar control; while paused it should resume the game
  await pauseNow(FM);
  await until(CC,"window.__state().paused.on===true");
  await act(CC,"start");
  await settle(700);
  check("CC's Start button resumes a paused game", (await st(CC)).paused.on===false);

  // HAZARD, same family as a stale undo: a phone that has not yet seen the
  // resume still believes the game is paused, so its pause tap does nothing.
  await until(FM,"window.__state().paused.on===false");   // let the floor phone catch up

  // a new round clears any pause
  await pauseNow(FM);
  await until(CC,"window.__state().paused.on===true");
  await confirmNewRound(CC);
  await until(CC,"window.__state().round===2");
  check("New round clears the pause", (await st(CC)).paused.on===false, JSON.stringify((await st(CC)).paused));

  // and prove the stale case explicitly rather than just working around it
  const SLOW = await mk("/c/referee","f-pact");
  await until(SLOW,"window.__state().paused.on===false");
  await pauseNow(CC);                     // CC pauses
  await until(SLOW,"window.__state().paused.on===true");
  await act(CC,"resumeGame");                      // CC resumes…
  await pauseNow(SLOW);                   // …SLOW taps pause before it hears about it
  await settle(2500);
  const agree = await allAgree([CC,SLOW], 15000);
  check("a pause tapped from a phone that is behind still converges", agree.ok, agree.detail);
  note(`pause tapped on a lagging phone landed on paused=${(agree.state||await st(CC)).paused.on} — like undo, it reads that phone's screen, so watch the TV`);
}

/* ================================================================= */
section("8 · pause survives the things that break state");
{
  const CC = await mk("/c/cc","f-psurv"), TV = await mk("/monitor","f-psurv");
  await act(CC,"start"); await act(CC,"dAdj",2);
  await pauseNow(CC);
  await until(TV,"window.__state().paused.on===true");
  const before = await st(TV);

  await CC.reload({waitUntil:"domcontentloaded"});
  await live(CC);
  check("a refresh comes back into the paused game",
    (await st(CC)).paused.on===true && (await st(CC)).deaths===2, JSON.stringify((await st(CC)).paused));
  check("the frozen clock survives the refresh", Math.abs(rem(await st(CC))-rem(before))<1500,
    `${Math.round(rem(before))} → ${Math.round(rem(await st(CC)))}`);

  await TV.reload({waitUntil:"domcontentloaded"});
  await live(TV);
  await settle(500);
  check("the refreshed TV still shows PAUSED", /PAUSED/.test(await html(TV)));

  if(EMU){
    const d = await raw(gid("f-psurv"));
    check("paused is stored as a map, not a string", !!d.fields.paused?.mapValue,
      JSON.stringify(d.fields.paused).slice(0,90));
    check("…with the booleans Firestore expects",
      d.fields.paused.mapValue.fields.on?.booleanValue===true, JSON.stringify(d.fields.paused.mapValue.fields));
  }

  // two phones pausing at the same instant
  const A = await mk("/c/referee","f-prace"), B = await mk("/c/ghost","f-prace"), M = await mk("/monitor","f-prace");
  await act(A,"start"); await allAgree([A,B,M]);
  await Promise.all([pauseNow(A), pauseNow(B)]);
  const agree = await allAgree([A,B,M], 15000);
  check("two phones pausing at once converge", agree.ok, agree.detail);
  check("…on paused, not on something in between", (agree.state||await st(M)).paused.on===true,
    JSON.stringify((agree.state||await st(M)).paused));
}

/* ================================================================= */
section("9 · real taps, not scripted calls");
{
  // REGRESSION: unlocking audio used to re-render on every pointerdown, which
  // swapped the button out mid-click and silently dropped the tap. Everything
  // here goes through actual clicks rather than window.act.
  // the clock and New round are the GM's; deaths are the desk's
  const A = await mk("/c/gm","f-taps"), CC = await mk("/c/cc","f-taps"),
        TV = await mk("/monitor","f-taps");
  check("the very first real tap registers", await tap(A,"Start"), (await btnText(A)).join(" | "));
  await until(TV,"window.__state().timer.mode==='run'",12000);
  check("…and reached the TV", (await st(TV)).timer.mode==="run");

  check("a real tap on the desk's phone registers too", await tap(CC,"Death +"));
  await until(TV,"window.__state().deaths===1",12000);
  check("…and that one too", (await st(TV)).deaths===1);

  check("the pause button opens the dialog by real click", await tap(A,"Pause game"));
  await settle(220);
  check("…the dialog is really on screen", !!(await modal(A)), JSON.stringify(await modal(A)));
  check("…and its confirm button clicks", await tap(A,CONFIRM_YES.pauseGame));
  check("…and the confirm lands", await softUntil(TV,"window.__state().paused.on===true",12000),
    JSON.stringify((await st(TV)).paused));
  check("Resume game works by real click", await tap(A,"Resume game"));
  await until(TV,"window.__state().paused.on===false",12000);

  // New round, by clicks, while the game is paused
  await tap(A,"Pause game"); await settle(200); await tap(A,CONFIRM_YES.pauseGame);
  await until(A,"window.__state().paused.on===true",12000);
  const r0 = (await st(A)).round;
  check("New round opens its dialog by real click", await tap(A,"New round"));
  await settle(220);
  check("…and its confirm button clicks", await tap(A,CONFIRM_YES.newRound));
  check("New round works by real clicks even while paused",
    await softUntil(A,`window.__state().round===${r0+1}`,12000), "round="+(await st(A)).round);
  check("…and starting the round clears the pause", (await st(A)).paused.on===false);

  const sb = (await btnText(A)).find(t=>/sound/.test(t));
  check("the sound control is on the counsellor view", !!sb, sb);
  check("tapping it mutes and unmutes", await tap(A,"🔇")||await tap(A,"🔊"));
  await settle(300);
  check("…and the game is untouched by it", (await st(A)).round===r0+1);
}

/* ================================================================= */
section("10 · no page errors");
check("no uncaught exceptions from the new features", pageErrs.length===0, pageErrs.slice(0,4).join(" | "));

await finish("FEATURES TEST");
