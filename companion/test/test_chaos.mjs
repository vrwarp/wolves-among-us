// The abnormal night: mis-taps and undos, four counsellors on four phones
// hitting things at once, wifi flapping, and sequences nobody planned for.
//   EMU=1 node test/test_chaos.mjs
import {EMU, DEF, FIELDS, section, check, note, eq, pick, diff, gid, settle,
        boot, mk, live, st, conn, act, until, softUntil, html, btnText, btnBy,
        tap, confirmNewRound, allAgree, raw, pageErrs, finish} from "./harness.mjs";

await boot();
const CLOCKLESS = FIELDS.filter(k=>k!=="timer"&&k!=="phase");

/* ================================================================= */
section("1 · every single action can be taken back");
{
  const A = await mk("/c/cc","x-undo"), W = await mk("/monitor","x-undo");
  // setup → the action → what it must have changed
  const set = async (...steps) => {for(const s of steps){await act(A,...s); await settle(220)}};
  const cases = [
    ["Start clock",        ()=>set(["resetT"]),                     ["start"],            s=>s.timer.mode==="run"],
    ["Pause clock",        ()=>set(["resetT"],["start"]),           ["pause"],            s=>s.timer.mode==="pause"],
    ["Resume clock",       ()=>set(["resetT"],["start"],["pause"]), ["start"],            s=>s.timer.mode==="run"],
    ["+0:30 while running",()=>set(["resetT"],["start"]),           ["adj",30000],        s=>s.timer.mode==="run"],
    ["−0:30 while running",()=>set(["resetT"],["start"]),           ["adj",-30000],       s=>s.timer.mode==="run"],
    ["+0:30 while paused", ()=>set(["resetT"],["start"],["pause"]), ["adj",30000],        s=>s.timer.remain>480000],
    ["−0:30 while paused", ()=>set(["resetT"],["start"],["pause"]), ["adj",-30000],       s=>s.timer.remain<480000],
    ["Reset clock",        ()=>set(["resetT"],["start"]),           ["resetT"],           s=>s.timer.mode==="idle"],
    ["Start meeting",      ()=>set(["endMeeting"],["resetT"],["start"]), ["meeting"],     s=>s.banner==="meeting"],
    ["End meeting",        ()=>set(["meeting"]),                    ["endMeeting"],       s=>s.banner==="none"],
    ["Phase REPORT",       ()=>set(["phaseStop"]),                  ["phasePre",30,"REPORT"],      s=>s.phase.label==="REPORT"],
    ["Phase NOMINATIONS",  ()=>set(["phaseStop"]),                  ["phasePre",90,"NOMINATIONS"], s=>s.phase.label==="NOMINATIONS"],
    ["Phase CORNERS",      ()=>set(["phaseStop"]),                  ["phasePre",30,"CORNERS"],     s=>s.phase.label==="CORNERS"],
    ["Phase VOTE",         ()=>set(["phaseStop"]),                  ["phasePre",30,"VOTE"],        s=>s.phase.label==="VOTE"],
    ["Phase SABOTAGE",     ()=>set(["phaseStop"]),                  ["phasePre",120,"SABOTAGE"],   s=>s.phase.label==="SABOTAGE"],
    ["Phase stop",         ()=>set(["phasePre",90,"NOMINATIONS"]),  ["phaseStop"],        s=>s.phase.mode==="idle"],
    ["Crewmate ejected",   ()=>set(["meeting"]),                    ["ejectCrew"],        s=>s.banner==="none"],
    ["Imposter caught",    ()=>set(["meeting"]),                    ["ejectImp"],         s=>s.banner==="none"],
    ["Sabotage set 1",     ()=>set(["endMeeting"],["phaseStop"]),   ["sab",1],            s=>s.sabotageSet===1],
    ["Sabotage success",   ()=>set(["sab",2]),                      ["sabOk"],            s=>s.sabotageSet===0],
    ["Sabotage set 3",     ()=>set(["sabOk"]),                      ["sab",3],            s=>s.sabotageSet===3],
    ["Sabotage failed",    ()=>set(["sabOk"],["sab",1]),            ["sabFail"],          s=>s.sabotageSet===0],
    ["Sab success, clock paused", ()=>set(["resetT"],["start"],["pause"],["sab",2]), ["sabOk"],   s=>s.sabotageSet===0],
    ["Sab failed, clock paused",  ()=>set(["resetT"],["start"],["pause"],["sab",1]), ["sabFail"], s=>s.sabotageSet===0],
    ["Death +1",           ()=>set(["dAdj",-1],["dAdj",-1]),        ["dAdj",1],           s=>s.deaths>0],
    ["Death −1",           ()=>set(["dAdj",1],["dAdj",1]),          ["dAdj",-1],          s=>s.deaths>=0],
    ["Threshold +1",       ()=>set(["thAdj",-1]),                   ["thAdj",1],          s=>s.threshold>1],
    ["Threshold −1",       ()=>set(["thAdj",1],["thAdj",1]),        ["thAdj",-1],         s=>s.threshold>=1],
    ["Target +1",          ()=>set(["tgAdj",-1]),                   ["tgAdj",1],          s=>s.targetPts<=11],
    ["Target −1",          ()=>set(["tgAdj",1]),                    ["tgAdj",-1],         s=>s.targetPts>=1],
  ];
  for(const [name, setup, action, changed] of cases){
    await setup();
    await settle(450);
    const before = await st(A);
    await act(A, ...action);
    await settle(500);
    const mid = await st(A);
    check(`${name} — actually does something`, changed(mid) && !eq(pick(before),pick(mid)),
      diff(before,mid) || "no change at all");
    await act(A,"undo");
    await settle(600);
    const after = await st(A);
    check(`${name} — undo puts everything back exactly`, eq(pick(before), pick(after)), diff(before,after));
    const seen = await softUntil(W, `JSON.stringify(window.__state().deaths)===${JSON.stringify(String(before.deaths))}`, 6000)
      .then(()=>true,()=>true);
  }
  // and the witness device agrees at the end
  const agree = await allAgree([A,W]);
  check("the TV agrees with CC after 30 do/undo pairs", agree.ok, agree.detail);

  // Buttons with no guard write an undo entry even when nothing changes, which
  // silently costs a slot in the 10-deep window.
  await act(A,"endMeeting"); await settle(400);        // no meeting is open
  const h0 = (await st(A)).hist.length;
  const s0 = await st(A);
  await act(A,"endMeeting"); await settle(500);
  await act(A,"phaseStop"); await settle(500);
  const s1 = await st(A), h1 = s1.hist.length;
  check("harmless taps change nothing", eq(pick(s0), pick(s1)), diff(s0,s1));
  if(h1 > h0) note(`taps that do nothing (End meeting / stop with none running) still use up ${h1-h0} undo slots — the window is only 10 deep, so undo the real mistake first`);
}

/* ================================================================= */
section("2 · New round, taken back");
{
  const A = await mk("/c/cc","x-nr"), W = await mk("/monitor","x-nr");
  await act(A,"start"); await act(A,"dAdj",3); await act(A,"sab",2); await act(A,"sabFail");
  await settle(900);
  const before = await st(A);
  await confirmNewRound(A);
  await until(W,"window.__state().round===2");
  check("New round wipes the round", (await st(A)).deaths===0 && (await st(A)).sabotagesUsed===0);
  await act(A,"undo");
  await settle(800);
  check("undo of New round restores deaths, sabotages, clock and round",
    eq(pick(before), pick(await st(A))), diff(before, await st(A)));
  check("the TV followed the undo", (await st(W)).round===1 && (await st(W)).deaths===before.deaths);
}

/* ================================================================= */
// The 3:00 hard stop is a clock of its own in the shared document. Undo restores
// whole snapshots, so if `meet` were ever left out of one, a take-back would
// strand the room: the TV counting down a meeting that no longer exists, or a
// meeting reinstated with no memory that it was holding the round clock.
section("2b · undo puts the 3:00 hard stop back too");
{
  const A = await mk("/c/cc","x-meet"), W = await mk("/monitor","x-meet");
  await act(A,"start"); await settle(400);
  await act(A,"meeting"); await settle(500);
  await act(A,"phasePre",90,"NOMINATIONS"); await settle(600);
  const mid = await st(A);
  check("a meeting is running with its own hard stop under a phase",
    mid.meet.mode==="run" && mid.meet.clock===true && mid.phase.label==="NOMINATIONS",
    JSON.stringify(mid.meet));

  await act(A,"ejectCrew"); await settle(700);
  check("the ejection cleared the hard stop", (await st(A)).meet.mode==="idle",
    JSON.stringify((await st(A)).meet));

  await act(A,"undo"); await settle(800);
  const back = await st(A);
  check("undo brings the meeting back, hard stop and all", eq(pick(mid), pick(back)), diff(mid,back));
  check("…including exactly how much of the 3:00 was left",
    back.meet.mode==="run" && back.meet.endsAt===mid.meet.endsAt,
    `${mid.meet.endsAt} → ${back.meet.endsAt}`);
  check("…and that it was the meeting holding the round clock",
    back.meet.clock===true && back.timer.mode==="pause", JSON.stringify(back.meet));
  check("the TV shows the restored meeting as well",
    await softUntil(W,"window.__state().meet.mode==='run'",10000),
    JSON.stringify((await st(W)).meet));

  // step further back: past the phase, then past the meeting itself
  await act(A,"undo"); await settle(800);
  check("undoing the phase leaves the meeting standing",
    (await st(A)).meet.mode==="run" && (await st(A)).phase.mode==="idle",
    JSON.stringify((await st(A)).meet));
  await act(A,"undo"); await settle(800);
  const gone = await st(A);
  check("undoing the meeting itself clears the hard stop entirely",
    gone.meet.mode==="idle" && gone.meet.remain===0 && gone.meet.clock===false,
    JSON.stringify(gone.meet));
  check("…and hands the round clock back the way it was", gone.timer.mode==="run", gone.timer.mode);
  const agree = await allAgree([A,W]);
  check("the TV agrees after the whole meeting was undone", agree.ok, agree.detail);
}

/* ================================================================= */
section("3 · fat fingers — repeats and rapid undo");
{
  const A = await mk("/c/cc","x-fat");
  await settle(400);
  const base = await st(A);

  await act(A,"dAdj",1); await settle(300);
  await act(A,"dAdj",1); await settle(300);
  check("tapping Death + twice really adds two", (await st(A)).deaths===base.deaths+2);
  await act(A,"undo"); await settle(400);
  await act(A,"undo"); await settle(400);
  check("two undos take both back", eq(pick(base), pick(await st(A))), diff(base, await st(A)));

  // three undo taps fired without waiting — the classic panic sequence
  for(let i=0;i<5;i++){await act(A,"dAdj",1); await settle(250)}
  const five = await st(A);
  check("five taps land", five.deaths===base.deaths+5, "deaths="+five.deaths);
  await Promise.all([act(A,"undo"), act(A,"undo"), act(A,"undo")]);
  await settle(2000);
  const after = await st(A);
  const walked = five.deaths - after.deaths;
  check("panic-tapping undo never overshoots or corrupts", walked>=1 && walked<=3 && after.deaths>=base.deaths,
    `walked back ${walked} of 3 taps, deaths=${after.deaths}`);
  if(walked<3) note(`three fast Undo taps only walked back ${walked} step(s) — undo reads the current state, so tap it once, wait for the number to move, then tap again`);

  // undo, then a fresh action, then undo again
  const p1 = await st(A);
  await act(A,"thAdj",1); await settle(400);
  await act(A,"undo"); await settle(500);
  check("undo still works after the history was rewound", eq(pick(p1), pick(await st(A))), diff(p1, await st(A)));
}

/* ================================================================= */
section("4 · two counsellors, same instant");
{
  const A = await mk("/c/cc","x-race"), B = await mk("/c/foreman","x-race"),
        C = await mk("/c/referee","x-race"), D = await mk("/c/ghost","x-race");
  const all = [A,B,C,D];
  await settle(600);

  // different fields at the same instant — merge should keep all three
  const s0 = await st(A);
  await Promise.all([act(A,"dAdj",1), act(B,"thAdj",1), act(C,"tgAdj",1)]);
  const agree1 = await allAgree(all);
  const s1 = agree1.state || await st(A);
  check("simultaneous edits to different fields all converge", agree1.ok, agree1.detail);
  const kept = [s1.deaths===s0.deaths+1, s1.threshold===s0.threshold+1, s1.targetPts===s0.targetPts+1];
  check("simultaneous edits to DIFFERENT fields all survive", kept.every(Boolean),
    `deaths ${s0.deaths}→${s1.deaths}, thresh ${s0.threshold}→${s1.threshold}, target ${s0.targetPts}→${s1.targetPts}`);
  if(!kept.every(Boolean)) note("edits to different fields can still collide — re-read the numbers after a flurry of taps");

  // the same field at the same instant — one tap is expected to lose
  const s2 = await st(A);
  await Promise.all([act(A,"dAdj",1), act(B,"dAdj",1), act(C,"dAdj",1), act(D,"dAdj",1)]);
  const agree2 = await allAgree(all);
  check("four simultaneous taps on the SAME button still converge", agree2.ok, agree2.detail);
  const gained = (agree2.state||await st(A)).deaths - s2.deaths;
  check("…and the number never goes backwards or wild", gained>=1 && gained<=4, "gained "+gained);
  note(`four counsellors tapping "Death +" in the same instant moved it by ${gained}, not 4 — one phone owns the count, or check the TV after`);

  // Death + and Death − at the same instant
  const s3 = await st(A);
  await Promise.all([act(A,"dAdj",1), act(B,"dAdj",-1)]);
  const agree3 = await allAgree(all);
  check("a + and a − at the same instant leave one consistent number", agree3.ok, agree3.detail);
  note(`"+1" and "−1" together landed on ${(agree3.state||await st(A)).deaths} (was ${s3.deaths})`);

  // two phones undo at the same time
  await act(A,"dAdj",1); await settle(500);
  await act(A,"dAdj",1); await allAgree(all);
  const s4 = await st(A);
  await Promise.all([act(B,"undo"), act(C,"undo")]);
  const agree4 = await allAgree(all);
  check("two phones undoing at once still converge", agree4.ok, agree4.detail);
  check("…and never leave the history malformed",
    (agree4.states||[]).every(s=>Array.isArray(s.hist)) &&
    (await st(A)).hist.every(h=>h && typeof h.label==="string" && h.s && typeof h.s.deaths==="number"));
  note(`two simultaneous Undos moved deaths ${s4.deaths} → ${(agree4.state||await st(A)).deaths}`);

  // a phone that is behind taps Undo
  await act(A,"resetT"); await allAgree(all);
  for(let i=0;i<6;i++) await act(A,"dAdj",1);        // fast burst, D will lag
  await settle(120);
  await act(D,"undo");                               // D undoes from whatever it had
  const agree5 = await allAgree(all, 15000);
  check("an undo from a phone that is behind still converges everywhere", agree5.ok, agree5.detail);
  note(`undo tapped on a lagging phone → deaths landed on ${(agree5.state||await st(A)).deaths}; the fix is to look at the TV, not your own screen`);
}

/* ================================================================= */
section("5 · sequences nobody planned");
{
  const A = await mk("/c/cc","x-seq"), G = await mk("/c/ghost","x-seq"), M = await mk("/monitor","x-seq");
  await act(A,"start"); await settle(500);

  await act(A,"sab",1); await settle(500);
  await act(A,"meeting"); await settle(700);
  let s = await st(A);
  // the meeting's 3:00 hard stop is its own clock; it replaces the sabotage phase
  check("a meeting called during a sabotage takes over the banner",
    s.banner==="meeting" && s.meet.mode==="run" && s.phase.mode==="idle",
    `banner=${s.banner} meet=${s.meet.mode} phase=${s.phase.label}`);
  check("…and cancels the sabotage outright rather than leaving it half-live",
    s.sabotageSet===0, "set="+s.sabotageSet);
  check("…but that sabotage still counts against the two per round", s.sabotagesUsed===1, "used="+s.sabotagesUsed);
  const inMeeting = await st(A);
  await act(A,"endMeeting"); await settle(600);
  await act(A,"undo"); await settle(700);
  check("undoing End meeting puts the meeting back exactly as it was",
    eq(pick(inMeeting), pick(await st(A))), diff(inMeeting, await st(A)));
  await act(A,"endMeeting"); await settle(500);
  await act(A,"phaseStop"); await settle(500);

  // SUCCESS / FAILED with no sabotage running must be complete no-ops
  const before = await st(A);
  await act(A,"sabOk"); await settle(600);
  check("SUCCESS with no sabotage running does nothing at all",
    eq(pick(before), pick(await st(A))), diff(before, await st(A)));
  await act(A,"sabFail"); await settle(600);
  s = await st(A);
  check("FAILED with no sabotage running does nothing at all", eq(pick(before), pick(s)), diff(before,s));
  check("…and neither one burns an undo slot", s.hist.length===before.hist.length,
    `${before.hist.length} → ${s.hist.length}`);

  // ejection with no meeting open
  const b2 = await st(A);
  await act(A,"ejectCrew"); await settle(600);
  check("an ejection with no meeting open still records the death", (await st(A)).deaths===b2.deaths+1);
  await act(A,"undo"); await settle(600);
  check("…and undoes cleanly", eq(pick(b2), pick(await st(A))), diff(b2, await st(A)));

  // the UI guard on a third sabotage — start the round clean so the count is exact
  await confirmNewRound(A); await settle(800);
  await act(A,"sab",1); await settle(400); await act(A,"sabOk"); await settle(400);
  await act(A,"sab",2); await settle(400); await act(A,"sabOk"); await settle(600);
  check("two sabotages used", (await st(A)).sabotagesUsed===2, "used="+(await st(A)).sabotagesUsed);
  const before3 = await st(A);
  const clicked = await tap(A,"Set 1");
  await settle(700);
  check("a third sabotage cannot be started from the buttons",
    (await st(A)).sabotagesUsed===2 && eq(pick(before3), pick(await st(A))), diff(before3, await st(A)));
  const ghostBtns = await G.evaluate(()=>[...document.querySelectorAll("button")]
    .filter(x=>/^Set [123]$/.test(x.textContent.trim())).map(x=>x.disabled));
  check("…on the ghost's phone too", ghostBtns.length===3 && ghostBtns.every(Boolean), JSON.stringify(ghostBtns));

  // new round while a meeting is open
  await act(A,"meeting"); await settle(600);
  const r0 = (await st(A)).round;
  await confirmNewRound(A);
  await until(M,`window.__state().round===${r0+1}`);
  s = await st(M);
  check("New round during a meeting clears the meeting too",
    s.banner==="none" && s.phase.mode==="idle" && s.round===r0+1,
    `banner=${s.banner} phase=${s.phase.mode} round=${s.round}`);

  // deaths pushed past the threshold, then pulled back
  while((await st(A)).deaths < (await st(A)).threshold){await act(A,"dAdj",1); await settle(200)}
  await until(M,"!!document.querySelector('.overlay.win')",12000);
  check("the TV declares IMPOSTERS WIN past the threshold", /IMPOSTERS WIN/.test(await html(M)));
  await act(A,"dAdj",-1); await settle(400);            // "that ejection was the imposter"
  while((await st(A)).threshold <= (await st(A)).deaths){await act(A,"thAdj",1); await settle(200)}
  const gone = await softUntil(M,"!document.querySelector('.overlay.win')",10000);
  check("correcting the numbers takes the win screen back off the TV", gone,
    "deaths="+(await st(M)).deaths+" thr="+(await st(M)).threshold);
}

/* ================================================================= */
section("6 · wifi flapping mid-game");
if(EMU){
  const A = await mk("/c/cc","x-net"), B = await mk("/monitor","x-net"), C = await mk("/c/foreman","x-net");
  await act(A,"start"); await settle(500);

  for(let i=1;i<=4;i++){
    await A.context().setOffline(true);
    await softUntil(A,"window.__conn()==='off'",30000);
    await act(A,"dAdj",1);                       // tapped while offline
    await settle(400);
    await A.context().setOffline(false);
    await softUntil(A,"window.__conn()==='live'",30000);
    await settle(600);
  }
  const agree = await allAgree([A,B,C], 20000);
  check("four wifi drops with a tap in each still converge everywhere", agree.ok, agree.detail);
  check("every offline tap eventually landed", (agree.state||await st(A)).deaths===4,
    "deaths="+(agree.state||await st(A)).deaths);

  // both phones offline at once, both making changes
  await A.context().setOffline(true); await C.context().setOffline(true);
  await softUntil(A,"window.__conn()==='off'",30000);
  await softUntil(C,"window.__conn()==='off'",30000);
  await act(A,"dAdj",1); await act(A,"thAdj",1);
  await act(C,"tgAdj",-1); await act(C,"sab",2);
  await settle(1000);
  check("each islanded phone still updates its own screen", (await st(A)).deaths===5 && (await st(C)).sabotageSet===2);
  await A.context().setOffline(false); await C.context().setOffline(false);
  await softUntil(A,"window.__conn()==='live'",30000);
  await softUntil(C,"window.__conn()==='live'",30000);
  const agree2 = await allAgree([A,B,C], 25000);
  check("two phones that were offline together reconcile to one state", agree2.ok, agree2.detail);
  const s = agree2.state || await st(A);
  check("nothing is left corrupt after the merge",
    typeof s.deaths==="number" && s.deaths>=0 && [0,1,2,3].includes(s.sabotageSet) &&
    ["none","meeting","sabotage"].includes(s.banner), JSON.stringify(pick(s)).slice(0,180));
  note(`after both phones were offline and both tapped: deaths=${s.deaths}, target=${s.targetPts}, sabotage set=${s.sabotageSet} — the later write wins per field`);

  // a long blackout with a pile of queued taps
  await A.context().setOffline(true);
  await softUntil(A,"window.__conn()==='off'",30000);
  for(let i=0;i<6;i++){await act(A,"dAdj",1); await settle(120)}
  await settle(6000);
  await A.context().setOffline(false);
  await softUntil(A,"window.__conn()==='live'",30000);
  const agree3 = await allAgree([A,B,C], 25000);
  check("a long blackout with six queued taps still reconciles", agree3.ok, agree3.detail);
  note(`six taps during a blackout arrived as deaths=${(agree3.state||await st(A)).deaths}`);
} else note("skipped (needs the real emulator)");

/* ================================================================= */
section("7 · soak — four phones, one minute, random taps");
{
  const A = await mk("/c/cc","x-soak"), B = await mk("/c/foreman","x-soak"),
        C = await mk("/c/referee","x-soak"), D = await mk("/c/ghost","x-soak"),
        M = await mk("/monitor","x-soak");
  const phones = [A,B,C,D];
  const MOVES = [
    ["dAdj",1],["dAdj",-1],["thAdj",1],["thAdj",-1],["tgAdj",1],["tgAdj",-1],
    ["start"],["pause"],["adj",30000],["adj",-30000],["resetT"],
    ["meeting"],["endMeeting"],["phasePre",30,"REPORT"],["phasePre",90,"NOMINATIONS"],["phaseStop"],
    ["ejectCrew"],["ejectImp"],["sab",1],["sab",2],["sab",3],["sabOk"],["sabFail"],["undo"],
  ];
  let fired = 0;
  const t0 = Date.now();
  let seed = 12345;                              // deterministic, so a failure can be replayed
  const rnd = n => (seed = (seed*1103515245 + 12345) & 0x7fffffff) % n;
  while(Date.now()-t0 < 60000){
    const p = phones[rnd(phones.length)], mv = MOVES[rnd(MOVES.length)];
    await act(p, ...mv).catch(()=>{});
    fired++;
    await settle(20 + rnd(120));
  }
  console.log(`   · fired ${fired} random taps from 4 phones in 60s`);
  const agree = await allAgree([...phones, M], 30000);
  check("after a minute of random taps every device shows the same game", agree.ok, agree.detail);
  const s = agree.state || await st(A);
  check("the state is still structurally sane",
    Number.isInteger(s.deaths) && s.deaths>=0 &&
    Number.isInteger(s.round) && s.round>=1 &&
    s.threshold>=1 && s.targetPts>=1 && s.targetPts<=11 &&
    ["none","meeting","sabotage"].includes(s.banner) &&
    ["idle","run","pause"].includes(s.timer.mode) &&
    ["idle","run"].includes(s.phase.mode) &&
    s.timer.remain>=0 && s.timer.dur===480000,
    JSON.stringify(pick(s)).slice(0,240));
  const h = (await st(A)).hist;
  check("the undo history is still well formed and capped",
    Array.isArray(h) && h.length<=10 && h.every(e=>e&&typeof e.label==="string"&&e.s&&Number.isInteger(e.s.deaths)),
    "len="+h.length);
  const stillLive = await Promise.all([...phones,M].map(p=>conn(p)));
  check("every phone is still connected after the soak", stillLive.every(c=>c==="live"), stillLive.join(","));

  // and undo still works after all that
  const pre = await st(A);
  await act(A,"dAdj",1); await settle(600);
  await act(A,"undo");   await settle(700);
  check("undo still works after a minute of abuse", eq(pick(pre), pick(await st(A))), diff(pre, await st(A)));

  if(EMU){
    const d = await raw(gid("x-soak"));
    const bytes = JSON.stringify(d).length;
    check("the game document stays far below Firestore's 1 MiB limit", bytes < 200000, bytes+" bytes");
    check("every top-level field is still the right shape",
      !!d.fields.timer.mapValue && !!d.fields.phase.mapValue && !!d.fields.hist.arrayValue &&
      "integerValue" in d.fields.deaths && "stringValue" in d.fields.banner);
  }
}

/* ================================================================= */
section("8 · no page errors");
check("no uncaught exceptions through all of that", pageErrs.length===0, pageErrs.slice(0,5).join(" | "));

await finish("CHAOS TEST");
