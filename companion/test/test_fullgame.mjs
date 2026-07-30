// A whole game night, end to end, on six devices at once: the TV, two phones on
// Central Command, the Foreman, the Roaming Referee and the Ghost Guide.
// Three rounds, run the way the playbook says — including the mistakes, the
// corrections, a phone that dies and comes back, and a wifi drop.
// After every single step all six devices must agree.
//   EMU=1 node test/test_fullgame.mjs
import {EMU, DEF, FIELDS, section, check, note, eq, pick, diff, gid, settle,
        boot, mk, live, st, conn, act, until, softUntil, html, tap,
        confirmNewRound, allAgree, raw, pageErrs, finish} from "./harness.mjs";

await boot();

const GAME = "night";
const TV  = await mk("/monitor",   GAME);
const CC  = await mk("/c/cc",      GAME);   // Central Command, at the desk
const CC2 = await mk("/c/cc",      GAME);   // a second CC phone — a co-leader
const FM  = await mk("/c/foreman", GAME);
const RF  = await mk("/c/referee", GAME);
const GH  = await mk("/c/ghost",   GAME);
const ALL = [TV,CC,CC2,FM,RF,GH];
const NAMES = ["TV","CC","CC2","Foreman","Referee","Ghost"];

let step = 0;
// Do a thing on one device, then require all six to land on the same state.
const beat = async (what, p, fn, expect) => {
  step++;
  await fn(p);
  const agree = await allAgree(ALL, 15000);
  const ok = agree.ok && (!expect || expect(agree.state));
  check(`${String(step).padStart(2," ")}. ${what}`, ok,
    !agree.ok ? "devices disagree:\n     "+agree.detail
              : expect ? JSON.stringify(pick(agree.state)).slice(0,200) : undefined);
  return agree.state || await st(CC);
};
const remaining = s => s.timer.mode==="run" ? Math.round((s.timer.endsAt-Date.now())/1000) : Math.round(s.timer.remain/1000);

/* ================================================================= */
section("setup — six devices on one game");
{
  const agree = await allAgree(ALL);
  check("all six devices connected and showing the same fresh game",
    agree.ok && eq(pick(agree.state), pick(DEF)), agree.ok?diff(DEF,agree.state):agree.detail);
  const conns = await Promise.all(ALL.map(p=>conn(p)));
  check("every device reports live sync", conns.every(c=>c==="live"), NAMES.map((n,i)=>n+"="+conns[i]).join(" "));
  const offs = await Promise.all(ALL.map(p=>p.evaluate("window.__offset()")));
  check("all six clock offsets agree within a second", Math.max(...offs)-Math.min(...offs) < 1000, offs.join(","));
}

/* ================================================================= */
section("round 1 — by the book");
{
  await beat("CC sets the threshold to 4 for a calm group", CC,
    async p=>{await act(p,"thAdj",-1); await settle(250); await act(p,"thAdj",-1)}, s=>s.threshold===4);
  await beat("CC starts the 8:00 round clock", CC, p=>act(p,"start"),
    s=>s.timer.mode==="run");
  const s0 = await st(TV);
  check("the TV shows about 8:00 left", Math.abs(remaining(s0)-480)<3, remaining(s0)+"s");

  await beat("Foreman reports a kill — CC ticks a death", CC, p=>act(p,"dAdj",1), s=>s.deaths===1);
  await beat("a second kill", CC, p=>act(p,"dAdj",1), s=>s.deaths===2);

  await beat("an imposter taps the Referee — Referee starts Sabotage set 2", RF,
    p=>act(p,"sab",2), s=>s.banner==="sabotage" && s.sabotageSet===2 && s.sabotagesUsed===1);
  const sab = await st(TV), tvHtml = await html(TV);
  const props = ["FUSE","BATTERY","KEYCARD","O2 TANK","REACTOR ROD"];
  check("the TV lists set 2's five props with their doors",
    /SABOTAGE/.test(tvHtml) && props.every(x=>tvHtml.includes(x)),
    props.filter(x=>!tvHtml.includes(x)).join(",")||"all present");
  check("the sabotage phase clock is running at 2:00 on every device",
    sab.phase.label==="SABOTAGE" && sab.phase.remain===120000,
    sab.phase.label+"/"+sab.phase.remain);
  check("the Foreman is told CC resolves it", /Central Command resolves it/.test(await html(FM)));

  await beat("the crew makes it — CC hits SUCCESS", CC, p=>act(p,"sabOk"),
    s=>s.banner==="none" && s.sabotageSet===0);
  const afterOk = await st(TV);
  check("SUCCESS bought the crew a minute", remaining(afterOk) > 480, remaining(afterOk)+"s");

  await beat("someone calls an emergency meeting", CC, p=>act(p,"meeting"),
    s=>s.banner==="meeting" && s.timer.mode==="pause");
  await beat("Ghost runs the 0:30 report phase", GH, p=>act(p,"phasePre",30,"REPORT"),
    s=>s.phase.label==="REPORT");
  await beat("Ghost runs 1:30 of nominations", GH, p=>act(p,"phasePre",90,"NOMINATIONS"),
    s=>s.phase.label==="NOMINATIONS");
  await beat("Ghost runs 0:30 in the corners", GH, p=>act(p,"phasePre",30,"CORNERS"),
    s=>s.phase.label==="CORNERS");
  await beat("Ghost runs the 0:30 vote", GH, p=>act(p,"phasePre",30,"VOTE"),
    s=>s.phase.label==="VOTE");
  await beat("the vote ejects a crewmate — reveal on the spot", CC, p=>act(p,"ejectCrew"),
    s=>s.deaths===3 && s.banner==="none");

  await beat("CC resumes the clock", CC, p=>act(p,"start"), s=>s.timer.mode==="run");
  await beat("the second sabotage — Foreman gets tapped, set 3", FM, p=>act(p,"sab",3),
    s=>s.sabotagesUsed===2 && s.sabotageSet===3);
  const sets = await CC.evaluate(()=>[...document.querySelectorAll("button")]
    .filter(x=>/^Set [123]$/.test(x.textContent.trim())).map(x=>x.disabled));
  check("with both sabotages spent the Set buttons are dead on every phone",
    sets.length===0 || sets.every(Boolean), JSON.stringify(sets));
  await beat("the crew blows it — FAILED costs 2 deaths and 1:30", CC, p=>act(p,"sabFail"),
    s=>s.deaths===5 && s.banner==="none");

  const now = await st(TV);
  check("deaths are past the threshold — the TV calls it for the imposters",
    now.deaths>=now.threshold && /IMPOSTERS WIN/.test(await html(TV)), `${now.deaths}/${now.threshold}`);
}

/* ================================================================= */
section("round 1 — the corrections");
{
  // "wait — I hit FAILED, they actually got it"
  await beat("the second CC phone undoes the mis-tapped FAILED", CC2, p=>act(p,"undo"),
    s=>s.deaths===3 && s.banner==="sabotage");
  const gone = await softUntil(TV,"!document.querySelector('.overlay.win')",10000);
  check("the win screen comes off the TV the moment the number is fixed", gone,
    (await st(TV)).deaths+"/"+(await st(TV)).threshold);
  await beat("CC resolves it properly as SUCCESS instead", CC, p=>act(p,"sabOk"),
    s=>s.banner==="none" && s.deaths===3);

  // "and that ejection was the imposter, not a crewmate"
  await beat("CC corrects the ejection: −1 death …", CC, p=>act(p,"dAdj",-1), s=>s.deaths===2);
  await beat("…and records the imposter catch", CC2, p=>act(p,"ejectImp"),
    s=>s.impostersCaught===1 && s.deaths===2);
  await beat("threshold nudged back to 6 for the rest of the night", CC2,
    async p=>{await act(p,"thAdj",1); await settle(250); await act(p,"thAdj",1)}, s=>s.threshold===6);

  // a mis-tap and an instant take-back, from a different phone than made it
  const clean = await st(CC);
  await beat("the Foreman fat-fingers Death + …", FM, p=>act(p,"dAdj",1), s=>s.deaths===3);
  await beat("…and the other CC phone takes it straight back", CC2, p=>act(p,"undo"),
    s=>s.deaths===2);
  check("the take-back restored everything, not just the number",
    eq(pick(clean), pick(await st(CC))), diff(clean, await st(CC)));

  // SUCCESS/FAILED are inert when nothing is running — a common panic tap
  const settled = await st(CC);
  await act(CC,"sabFail"); await settle(700);
  check("a stray FAILED tap with no sabotage running changes nothing",
    eq(pick(settled), pick(await st(CC))), diff(settled, await st(CC)));
}

/* ================================================================= */
section("round 1 — a phone dies and comes back");
{
  const truth = pick(await st(CC));
  await FM.reload({waitUntil:"domcontentloaded"});
  await live(FM);
  check("the Foreman's phone came back into the live game", eq(pick(await st(FM)), truth),
    diff(await st(FM), {...truth, timer:(await st(FM)).timer, phase:(await st(FM)).phase}));

  if(EMU){
    const frozen = pick(await st(GH));
    await GH.context().setOffline(true);
    check("the Ghost's phone notices it lost wifi", await softUntil(GH,"window.__conn()==='off'",45000));
    const was = frozen.deaths;
    await act(CC,"dAdj",1);
    const online = await allAgree(ALL.filter(p=>p!==GH), 15000);
    check("the other five keep running the game while the Ghost is offline",
      online.ok && online.state.deaths===was+1, online.ok?"deaths="+online.state.deaths:online.detail);
    check("the offline Ghost freezes on its last known numbers, it does not blank",
      eq(pick(await st(GH)), frozen), diff(frozen, await st(GH)));
    check("the Ghost's dot is red, not green", await conn(GH)==="off", await conn(GH));

    await GH.context().setOffline(false);
    check("the Ghost reconnects on its own", await softUntil(GH,"window.__conn()==='live'",45000));
    const back = await allAgree(ALL, 25000);
    check("and catches up to everyone else without a refresh",
      back.ok && back.state.deaths===was+1, back.ok?"deaths="+back.state.deaths:back.detail);
  }
}

/* ================================================================= */
section("round 1 — the clock runs out");
{
  await allAgree(ALL, 20000);
  await beat("CC winds the clock all the way down", CC, p=>act(p,"adj",-600000),
    s=>s.timer.mode==="run");
  await until(TV,"!!document.querySelector('.mon.crit')||!!document.querySelector('.overlay.crew')",15000);
  await until(TV,"!!document.querySelector('.overlay.crew')||!!document.querySelector('.overlay.win')",20000);
  const h = await html(TV);
  check("the TV ends the round on its own at 0:00", /ROUND OVER|IMPOSTERS WIN/.test(h),
    (h.match(/<h2>[^<]*<\/h2>/)||[""])[0]);
}

/* ================================================================= */
section("round 2 — reset and replay");
{
  const before = await st(CC);
  await confirmNewRound(CC);
  const landed = await softUntil(TV,`window.__state().round===${before.round+1}`,15000);
  check("New round from CC reaches the TV", landed, "round="+(await st(TV)).round);
  const agree = await allAgree(ALL, 15000);
  check("New round from CC lands on all six devices", agree.ok, agree.detail);
  const s = agree.state || await st(CC);
  check("round 2 starts clean: no deaths, no catches, no sabotages, full clock",
    s.round===2 && s.deaths===0 && s.impostersCaught===0 && s.sabotagesUsed===0 &&
    s.sabotageSet===0 && s.banner==="none" && s.timer.mode==="idle" && s.timer.remain===480000,
    JSON.stringify(pick(s)).slice(0,200));
  check("the threshold and the point target carry over",
    s.threshold===before.threshold && s.targetPts===before.targetPts,
    `thr ${before.threshold}→${s.threshold}, target ${before.targetPts}→${s.targetPts}`);
  check("the TV is showing Round 2", /Round 2/.test(await html(TV)));

  await beat("clock on", CC, p=>act(p,"start"), s=>s.timer.mode==="run");
  await beat("+0:30 because a station jammed", RF, p=>act(p,"adj",30000));
  await beat("−0:30 to put it back", RF, p=>act(p,"adj",-30000));
  await beat("three quick deaths", CC, async p=>{
    for(let i=0;i<3;i++){await act(p,"dAdj",1); await settle(300)}}, s=>s.deaths===3);
  await beat("Ghost starts the 2:00 sabotage stopwatch by hand", GH,
    p=>act(p,"phasePre",120,"SABOTAGE"), s=>s.phase.label==="SABOTAGE");
  await beat("Ghost stops it", GH, p=>act(p,"phaseStop"), s=>s.phase.mode==="idle");
  await beat("target bumped to 9 points", CC2, p=>act(p,"tgAdj",1), s=>s.targetPts===9);
}

/* ================================================================= */
section("round 3 — everyone is tired and tapping at once");
{
  await confirmNewRound(CC);
  await until(TV,"window.__state().round===3",15000);
  check("round 3 started", (await st(TV)).round===3);

  await act(CC,"start"); await allAgree(ALL);
  // four counsellors acting in the same second, as happens at the end of a night
  await Promise.all([
    act(CC,"dAdj",1),
    act(FM,"sab",1),
    act(RF,"adj",30000),
    act(GH,"phasePre",30,"REPORT"),
  ]);
  const agree = await allAgree(ALL, 20000);
  check("four phones acting in the same second still converge", agree.ok, agree.detail);
  const s = agree.state || await st(CC);
  check("the state is coherent, not a mash-up",
    ["none","meeting","sabotage"].includes(s.banner) &&
    (s.banner!=="sabotage" || (s.sabotageSet>=1 && s.sabotageSet<=3)) &&
    ["idle","run","pause"].includes(s.timer.mode) && s.deaths>=0,
    JSON.stringify(pick(s)).slice(0,220));
  note(`four-at-once landed on: deaths=${s.deaths} banner=${s.banner} set=${s.sabotageSet} phase=${s.phase.label||"—"}`);

  // everybody looks at the answers tab at the same time while the game runs
  await Promise.all([CC,FM,RF,GH].map(p=>act(p,"tab","answers")));
  await Promise.all([CC,FM,RF,GH].map((p,i)=>act(p,"padMode", i%2?"sud":"grp")));
  await Promise.all([CC,FM,RF,GH].map((p,i)=>act(p,"pad", String((i%9)+1))));
  await settle(600);
  const cards = await Promise.all([CC,FM,RF,GH].map(p=>p.evaluate("document.getElementById('ansres')?.querySelector('h1')?.textContent")));
  check("all four phones can look up answers at once", cards.every(Boolean), cards.join(" | "));
  await beat("…and the game keeps running underneath", CC, p=>act(p,"dAdj",1));
  await Promise.all([CC,FM,RF,GH].map(p=>act(p,"tab","controls")));
}

/* ================================================================= */
section("end of the night");
{
  const final = await allAgree(ALL, 20000);
  check("all six devices finish on the identical state", final.ok, final.detail);
  const s = final.state || await st(CC);
  check("final state is sane", s.round===3 && s.deaths>=0 && s.threshold>=1 &&
    s.targetPts>=1 && s.targetPts<=11, JSON.stringify(pick(s)).slice(0,200));

  const conns = await Promise.all(ALL.map(p=>conn(p)));
  check("every device is still live after the whole night", conns.every(c=>c==="live"),
    NAMES.map((n,i)=>n+"="+conns[i]).join(" "));

  if(EMU){
    const d = await raw(gid(GAME));
    check("the stored document is still well formed",
      !!d.fields.timer.mapValue && !!d.fields.hist.arrayValue && "integerValue" in d.fields.round,
      Object.keys(d.fields).join(","));
    check("the document is small enough to be free", JSON.stringify(d).length < 200000,
      JSON.stringify(d).length+" bytes");
  }
  check("no uncaught exceptions on any device all night", pageErrs.length===0, pageErrs.slice(0,4).join(" | "));
}

await finish("FULL GAME NIGHT");
