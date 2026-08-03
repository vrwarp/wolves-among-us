// What happens when a device refreshes — the single most likely thing to go
// wrong on the night (a phone locks, someone pull-to-refreshes, the TV browser
// reloads, wifi hiccups). Every game state is reloaded and compared field by
// field against what was on screen before.
//   EMU=1 node test/test_refresh.mjs
import {EMU, DEF, FIELDS, BASE, CFG, APP, EMU_HOST, EMU_PORT, section, check, note,
        eq, pick, diff, gid, settle, boot, newCtx, mk, live, st, conn, act,
        until, softUntil, html, btnText, tap, confirmNewRound, allAgree, raw,
        startMeeting, finishMeeting, stageFor, windMeeting,
        modal, CONFIRM_YES, pageErrs, finish} from "./harness.mjs";

await boot();
const reload = async p => {
  await p.reload({waitUntil:"domcontentloaded"});
  await live(p);
};
// Compare everything except the clocks' absolute deadlines, which are wall-clock
// values; those get their own tolerance check.
const NOCLOCK = FIELDS.filter(k=>k!=="timer"&&k!=="phase");
const remaining = s => s.timer.mode==="run" ? s.timer.endsAt-Date.now() : s.timer.remain;
// What a screen is actually showing for a sabotage: the TV separates the props
// with <br>, the phones list them in the desk card.
const tvItems = p => p.evaluate(()=>{
  const d=document.querySelector(".overlay.sab .items");
  return d ? d.innerHTML.split(/<br\s*\/?>/i).map(x=>x.replace(/<[^>]*>/g,"").trim()).filter(Boolean) : null;
});
const cardItems = p => p.evaluate(()=>{
  const ul=document.querySelector(".sabitems");
  return ul ? [...ul.querySelectorAll("li b")].map(b=>b.textContent.trim()) : null;
});

/* ================================================================= */
section("1 · refresh in every game state");
{
  // Each case: set the state up on CC, snapshot it, reload CC, compare.
  const cases = [
    ["idle, nothing started",          async A => {}],
    ["clock running",                  async A => {await act(A,"start")}],
    ["clock paused mid-round",         async A => {await act(A,"start"); await settle(600); await act(A,"pause")}],
    ["clock adjusted twice",           async A => {await act(A,"start"); await act(A,"adj",30000); await act(A,"adj",-30000)}],
    ["gathering for a meeting",        async A => {await act(A,"start"); await act(A,"doCallMeeting")}],
    ["meeting running",                async A => {await act(A,"start"); await startMeeting(A)}],
    ["meeting run out, vote not called", async A => {await startMeeting(A); await act(A,"callVote")}],
    // Half-recorded is a real state now: a tie, one name read out, the desk
    // reaching for the second when the phone reloads under its thumb.
    ["a tie, half of it recorded",     async A => {await startMeeting(A); await act(A,"callVote");
                                                   await act(A,"ejectCrew"); await act(A,"ejectImp")}],
    ["a sabotage held by a meeting",   async A => {await act(A,"start"); await act(A,"sab");
                                                   await settle(1200); await startMeeting(A)}],
    ["sabotage running",               async A => {await act(A,"start"); await act(A,"sab")}],
    ["both sabotages spent",           async A => {await act(A,"sab"); await act(A,"sabOk"); await act(A,"sab"); await act(A,"sabFail")}],
    ["deaths past the threshold",      async A => {for(let i=0;i<7;i++) await act(A,"dAdj",1)}],
    ["clock run down to 0:00",         async A => {await act(A,"start"); await act(A,"adj",-600000)}],
    ["round 3, mid-game",              async A => {await confirmNewRound(A); await settle(400); await confirmNewRound(A);
                                                   await act(A,"start"); await act(A,"dAdj",2)}],
    ["right after an undo",            async A => {await act(A,"dAdj",1); await act(A,"sab"); await settle(500); await act(A,"undo")}],
    ["ten-deep undo history",          async A => {for(let i=0;i<12;i++){await act(A,"dAdj",1); await settle(80)}}],
  ];
  for(const [name, setup] of cases){
    const A = await mk("/c/cc","r-"+name.replace(/[^a-z0-9]+/gi,"").slice(0,14));
    await setup(A);
    await settle(900);
    const before = await st(A), remBefore = remaining(before);
    await reload(A);
    const after = await st(A), remAfter = remaining(after);
    check(`reload · ${name}`, eq(pick(before,NOCLOCK), pick(after,NOCLOCK)), diff(before,after,NOCLOCK));
    check(`reload · ${name} — clock survives`, Math.abs(remBefore-remAfter)<2500,
      `${Math.round(remBefore)}ms → ${Math.round(remAfter)}ms`);
    check(`reload · ${name} — timer/phase modes survive`,
      before.timer.mode===after.timer.mode && before.phase.mode===after.phase.mode && before.phase.label===after.phase.label,
      `${before.timer.mode}/${before.phase.label} → ${after.timer.mode}/${after.phase.label}`);
    check(`reload · ${name} — undo history survives`, eq(before.hist, after.hist),
      `${before.hist.length} → ${after.hist.length} entries`);
  }
}

/* ================================================================= */
// A phone that reloads mid-meeting has to come back into the SAME meeting. The
// 3:00 is an absolute deadline in the shared document, so it must keep counting
// down rather than restarting — and because the stage is derived from that one
// deadline, a phone that comes back must land in the stage the room is actually
// in, with nothing having been written to tell it. It also has to remember that
// it was the meeting that stopped the round clock, or ending it afterwards
// leaves the round stranded with the clock off.
section("1b · the meeting, and the stage it is in, survive a refresh");
{
  const A = await mk("/c/cc","r-meet"), TV = await mk("/monitor","r-meet");
  const mrem = s => s.meet.mode==="run" ? s.meet.endsAt-Date.now() : s.meet.remain;

  await act(A,"start"); await until(TV,"window.__state().timer.mode==='run'");
  await startMeeting(A); await until(TV,"window.__state().meet.mode==='run'");
  // Put the room well inside NOMINATIONS, so a phone that came back at a fresh
  // 3:00 would be showing REPORT and the difference is unmistakable.
  const wound = await windMeeting(A, gid("r-meet"), 105000);
  await until(TV,`window.__state().meet.endsAt===${wound}`, 12000);
  await settle(2500);                        // let real seconds come off it

  const before = await st(A), r0 = mrem(before);
  check("the meeting clock is already counting down before the refresh",
    before.meet.mode==="run" && r0 < 179000, Math.round(r0)+"ms left");
  check("…and the room is in NOMINATIONS, two stages in",
    stageFor(r0)?.label==="NOMINATIONS", JSON.stringify(stageFor(r0)));

  await reload(A);
  const after = await st(A);
  check("the refreshed phone is still in the meeting",
    after.meet.mode==="run" && after.banner==="meeting", JSON.stringify(after.meet));
  check("the meeting clock did not restart at 3:00",
    Math.abs(mrem(after)-r0) < 2500 && mrem(after) < 179000,
    `${Math.round(r0)}ms → ${Math.round(mrem(after))}ms`);
  check("…because its deadline is the same absolute moment",
    after.meet.endsAt===before.meet.endsAt, `${before.meet.endsAt} → ${after.meet.endsAt}`);
  check("the refreshed phone still knows the meeting took the round clock",
    after.meet.clock===true && after.timer.mode==="pause", JSON.stringify(after.meet));
  // Nothing was written when REPORT ended, so the only way this phone can know
  // it is in NOMINATIONS is by working it out from the deadline it just read.
  const chip = await A.evaluate("document.querySelector('.strip .chip.phase')?.textContent.trim()");
  check("…and it works out the stage the room is in for itself, told nothing",
    /^NOMS\b/.test(chip||""), chip);
  const shown = await A.evaluate("document.querySelector('[data-mtclk]')?.textContent");
  check("the desk sees the meeting clock ticking, not a fresh 3:00",
    !!shown && shown!=="3:00", shown);

  // the TV mid-meeting is the screen the whole room is reading
  await reload(TV);
  check("the TV refreshed mid-meeting comes straight back to the meeting overlay",
    !!(await TV.evaluate("!!document.querySelector('.overlay.meet')")) &&
    /EMERGENCY MEETING/.test(await html(TV)));
  check("…showing the same meeting clock, not a restarted one",
    Math.abs(mrem(await st(TV))-r0) < 6000, Math.round(mrem(await st(TV)))+"ms");
  check("…and naming the same stage the desk is in",
    /NOMINATIONS/.test(await TV.evaluate("document.querySelector('[data-stlabel]')?.textContent||''")),
    await TV.evaluate("document.querySelector('[data-stlabel]')?.textContent||'(none)'"));

  // and the thing that actually matters at 8pm: it still ends properly
  await finishMeeting(A);
  await until(A,"window.__state().meet.mode==='idle'");
  await settle(500);
  check("closing it after a refresh still hands the round clock back",
    (await st(A)).timer.mode==="run", (await st(A)).timer.mode);
}

/* ================================================================= */
// A scramble held by a meeting is the state most likely to be lost by a reload:
// the props live in one field, the stopped 2:00 in another, and the fact that
// the meeting is holding them in a third. Lose any one and the sabotage is
// silently spent for nothing.
section("1b2 · a sabotage held by a meeting survives a refresh");
{
  const A = await mk("/c/cc","r-hold"), TV = await mk("/monitor","r-hold");
  await act(A,"start"); await until(TV,"window.__state().timer.mode==='run'");
  await act(A,"sab"); await until(TV,"window.__state().banner==='sabotage'");
  await settle(2200);
  await act(A,"doCallMeeting"); await until(TV,"window.__state().meet.mode==='gather'");
  const held = await st(A);
  check("the scramble is being held by the gather",
    held.meet.sab===true && held.phase.mode==="pause" && held.sabItems.length===5,
    JSON.stringify({sab:held.meet.sab, phase:held.phase.mode, items:held.sabItems.length}));

  await reload(A);
  let after = await st(A);
  check("reload · the props are still drawn",
    eq(after.sabItems, held.sabItems), JSON.stringify(after.sabItems));
  check("reload · the 2:00 is still stopped at the time it stopped",
    after.phase.mode==="pause" && after.phase.remain===held.phase.remain,
    `${held.phase.remain} → ${after.phase.remain}`);
  check("reload · and the meeting still knows it is holding one",
    after.meet.sab===true, JSON.stringify(after.meet));
  check("reload · the desk still says so on screen",
    /scramble is holding at/.test(await html(A)));
  check("reload · and its sabotage button is still dead",
    await A.evaluate(()=>{const b=document.querySelector("button.btn-sab");return !!b&&b.disabled}),
    await A.evaluate(()=>{const b=document.querySelector("button.btn-sab");return b?b.textContent.trim():"(no button)"}));

  // start the 3:00, reload again mid-meeting, then let it out
  await act(A,"meeting"); await until(TV,"window.__state().meet.mode==='run'");
  await reload(A);
  after = await st(A);
  check("reload mid-meeting · the hold rode through the start of the 3:00",
    after.meet.sab===true && after.phase.mode==="pause" && eq(after.sabItems, held.sabItems),
    JSON.stringify(after.meet));
  const stopped = after.phase.remain;
  await finishMeeting(A,{imp:1}); await until(TV,"window.__state().meet.mode==='idle'");
  await settle(500);
  after = await st(A);
  check("…and the scramble comes back at the time it stopped, after all that",
    after.banner==="sabotage" && after.phase.mode==="run" &&
    Math.abs((after.phase.endsAt-Date.now())-stopped) < 3000,
    `${stopped}ms held → ${Math.round(after.phase.endsAt-Date.now())}ms`);
  check("…having counted as exactly one sabotage", after.sabotagesUsed===1, "used="+after.sabotagesUsed);
}

/* ================================================================= */
// The three dials the Game Master sets before the night are the ones nobody
// wants to re-enter at 7:30 with thirty students waiting. They are ordinary
// fields in the shared document, so a reload has to bring them back — including
// the round length, which is the one field the clock comparison above skips.
section("1c · the Game Master's settings survive a refresh");
{
  const GM = await mk("/c/gm","r-gmset"), TV = await mk("/monitor","r-gmset");
  await act(GM,"impAdj",1); await act(GM,"impAdj",1);       // five imposters
  await act(GM,"sabMaxAdj",1);                              // three sabotages a round
  await act(GM,"sabPropsAdj",-1);                           // four props a scramble
  await act(GM,"durAdj",-120000);                           // six-minute rounds
  await settle(1000);
  const before = await st(GM);
  check("the settings are what the Game Master set",
    before.imposters===5 && before.sabotageMax===3 && before.sabProps===4 && before.timer.dur===360000,
    `imposters=${before.imposters} sabotageMax=${before.sabotageMax} sabProps=${before.sabProps} dur=${before.timer.dur}`);

  await reload(GM);
  const after = await st(GM);
  check("reload · the Game Master's settings come back",
    eq(pick(before,NOCLOCK), pick(after,NOCLOCK)), diff(before,after,NOCLOCK));
  check("reload · the round length comes back too",
    after.timer.dur===360000 && after.timer.remain===360000, JSON.stringify(after.timer));
  check("reload · the dials are on screen at the new values",
    /Imposters — <b>5<\/b>/.test(await html(GM)) && /Sabotages — <b>3<\/b>/.test(await html(GM)) &&
    /Props per sabotage — <b>4<\/b>/.test(await html(GM)),
    ((await html(GM)).match(/(Imposters|Sabotages|Props per sabotage) — <b>\d<\/b>/g)||["none"]).join(" | "));

  // a phone that was never told about them reads them off the document
  const LATE = await mk("/c/gm","r-gmset");
  const late = await st(LATE);
  check("a phone joining later picks the settings up on its own",
    late.imposters===5 && late.sabotageMax===3 && late.sabProps===4 && late.timer.dur===360000,
    `imposters=${late.imposters} sabotageMax=${late.sabotageMax} sabProps=${late.sabProps} dur=${late.timer.dur}`);
  check("…and the TV agrees",
    (await st(TV)).imposters===5 && (await st(TV)).sabotageMax===3 && (await st(TV)).sabProps===4,
    JSON.stringify({i:(await st(TV)).imposters, s:(await st(TV)).sabotageMax, p:(await st(TV)).sabProps}));

  // a dial that survived the reload is only worth something if the next draw obeys it
  await act(GM,"sab");
  await until(TV,"window.__state().banner==='sabotage'");
  await settle(400);
  const drew = (await st(TV)).sabItems;
  check("the props-per-sabotage dial still drives the draw after the refresh",
    drew.length===4 && new Set(drew).size===4, JSON.stringify(drew));
  check("…and the Game Master, the TV and the late phone all show that same four",
    eq(drew,(await st(GM)).sabItems) && eq(drew,(await st(LATE)).sabItems) && eq(await tvItems(TV), drew),
    JSON.stringify({gm:(await st(GM)).sabItems, late:(await st(LATE)).sabItems, tv:await tvItems(TV)}));
  await act(GM,"sabOk"); await until(TV,"window.__state().banner==='none'");
}

/* ================================================================= */
section("2 · refresh must never reseed a live game");
{
  const A = await mk("/c/cc","r-seed"), B = await mk("/monitor","r-seed");
  await act(A,"start"); await act(A,"dAdj",4); await act(A,"sab");
  await until(B,"window.__state().deaths===4 && window.__state().banner==='sabotage'");
  await settle(500);                    // let every field of that burst land
  const before = await st(B);

  // the device that CREATED the document reloading is the risky one
  await reload(A);
  check("the creating device's reload does not reset the game",
    eq(pick(await st(A),NOCLOCK), pick(before,NOCLOCK)), diff(before, await st(A), NOCLOCK));

  // reload it three times fast
  for(let i=0;i<3;i++) await reload(A);
  check("three rapid reloads in a row still show the live game", (await st(A)).deaths===4, "deaths="+(await st(A)).deaths);
  check("…and the other device never saw a blip", (await st(B)).deaths===4);

  // every device reloading at the same moment (power flicker on the wifi)
  const C = await mk("/c/foreman","r-seed"), D = await mk("/c/ghost","r-seed"), E = await mk("/c/referee","r-seed");
  const all = [A,B,C,D,E];
  await settle(800);
  await Promise.all(all.map(p=>p.reload({waitUntil:"domcontentloaded"})));
  await Promise.all(all.map(p=>live(p)));
  const agree = await allAgree(all);
  check("all five devices reloading simultaneously keeps the game", agree.ok && agree.state.deaths===4,
    agree.ok ? "deaths="+agree.state.deaths : agree.detail);

  if(EMU){
    const d = await raw(gid("r-seed"));
    check("the document was never rewritten to defaults", d.fields.deaths.integerValue==="4",
      JSON.stringify(d.fields.deaths));
    const pings = Object.keys(d.fields);
    check("reloads leave exactly one _ping field, not a pile", pings.filter(k=>k.startsWith("_ping")).length===1,
      pings.join(","));
  }
}

/* ================================================================= */
section("3 · refresh timing edges");
{
  const A = await mk("/c/cc","r-edge"), B = await mk("/monitor","r-edge");

  // reload the instant after a tap, before the write is acknowledged
  await act(A,"dAdj",1);
  await A.reload({waitUntil:"domcontentloaded"});   // no settle — race the write
  await live(A);
  await settle(1500);
  const landed = (await st(B)).deaths;
  check("a tap immediately followed by a refresh is not silently half-applied",
    landed===(await st(A)).deaths, `B=${landed} A=${(await st(A)).deaths}`);
  if(landed===0) note("a tap can be LOST if the phone reloads before the write is acknowledged — re-check the number after any refresh");
  else note("the tap survived a refresh issued in the same tick");

  // Reload while a 2-minute sabotage phase is ticking: the phase clock must not
  // restart — and now that the props are drawn rather than picked from a printed
  // set, the phone must come back to the SAME five. A re-draw on refresh would
  // send that phone's holder hunting a different list from everyone else.
  await act(A,"sab"); await settle(900);
  const ph0 = (await st(A)).phase.endsAt;
  const drew = (await st(A)).sabItems;
  check("the scramble has a five-prop draw behind it", drew.length===5, JSON.stringify(drew));
  await settle(1200);
  await reload(A);
  const ph1 = (await st(A)).phase.endsAt;
  check("a sabotage phase clock does not restart on refresh", ph0===ph1, `${ph0} → ${ph1}`);
  const shown = await A.evaluate("document.querySelector('[data-phclk]')?.textContent");
  check("the refreshed phone shows the phase counting down, not 2:00", shown && shown!=="2:00", shown);
  check("a refresh mid-scramble comes back to the same props, it does not re-draw",
    eq((await st(A)).sabItems, drew),
    `${JSON.stringify(drew)} → ${JSON.stringify((await st(A)).sabItems)}`);
  check("…and the desk card is painted with that same list",
    eq(await cardItems(A), drew), JSON.stringify(await cardItems(A)));

  // reload the TV during a sabotage: overlay must come straight back
  await reload(B);
  check("the TV refreshed mid-sabotage still shows the overlay",
    /SABOTAGE/.test(await html(B)) && !!(await B.evaluate("!!document.querySelector('.overlay.sab')")));
  check("…listing the same props it was showing before the reload",
    eq(await tvItems(B), drew), JSON.stringify(await tvItems(B)));

  // hash navigation between views should not disturb state
  const before = await st(A);
  await A.evaluate("location.hash='#/'"); await settle(400);
  await A.evaluate("location.hash='#/c/ghost'"); await settle(400);
  await A.evaluate("history.back()"); await settle(500);
  await A.evaluate("location.hash='#/c/cc'"); await settle(500);
  check("switching views and going back never touches the game",
    eq(pick(before,NOCLOCK), pick(await st(A),NOCLOCK)), diff(before, await st(A), NOCLOCK));
  check("the app is still live after view hopping", await conn(A)==="live");
}

/* ================================================================= */
section("4 · two tabs on one phone");
{
  const ctx = await newCtx();
  const T1 = await mk("/c/cc","r-tabs",{ctx});
  const T2 = await mk("/monitor","r-tabs",{ctx});     // same context = same localStorage
  await act(T1,"dAdj",2);
  const seen = await softUntil(T2,"window.__state().deaths===2");
  check("a second tab on the same phone syncs like a separate device", seen, "deaths="+(await st(T2)).deaths);
  await reload(T1); await reload(T2);
  const agree = await allAgree([T1,T2]);
  check("both tabs survive a refresh together", agree.ok && agree.state.deaths===2,
    agree.ok?"deaths="+agree.state.deaths:agree.detail);
  await T2.close();
  await act(T1,"dAdj",1); await settle(800);
  check("closing one tab leaves the other working", (await st(T1)).deaths===3);
}

/* ================================================================= */
section("5 · refresh while the network is down");
if(EMU){
  /* --- 5a: wifi completely gone. The page itself cannot even be fetched. --- */
  const A = await mk("/c/cc","r-off"), B = await mk("/monitor","r-off");
  await act(A,"start"); await act(A,"dAdj",3);
  await until(B,"window.__state().deaths===3");

  await A.context().setOffline(true);
  check("the dot goes offline when wifi drops", await softUntil(A,"window.__conn()==='off'",45000));
  check("the phone keeps showing the last known state while offline", (await st(A)).deaths===3);

  const navErr = await A.reload({waitUntil:"domcontentloaded"}).then(()=>null, e=>String(e.message).split("\n")[0]);
  check("refreshing with wifi fully down fails to load the page at all", !!navErr, navErr);
  note("there is no offline cache: a refresh with no wifi gives a browser error page, not the app. Do NOT refresh until the dot is green or wifi is back.");

  await A.context().setOffline(false);
  await A.reload({waitUntil:"domcontentloaded"});
  await live(A);
  check("once wifi is back, one refresh restores the real game", (await st(A)).deaths===3,
    "deaths="+(await st(A)).deaths);
  check("the other device kept the real state the whole time", (await st(B)).deaths===3);

  /* --- 5b: page loads, but Firestore is unreachable (flaky link / outage). --- */
  const C = await mk("/c/foreman","r-off");
  check("third device sees the live game", (await st(C)).deaths===3);
  await C.context().route(`http://${"127.0.0.1"}:8080/**`, r=>r.abort());
  await C.reload({waitUntil:"domcontentloaded"});
  await settle(12000);                       // fbBackend gets 8s, then the app gives up
  const blindConn = await conn(C), blindState = await st(C);
  check("a phone that reloads with the database unreachable does not crash", pageErrs.length===0,
    pageErrs.slice(0,2).join(" | "));
  note(`reload with the database unreachable → dot="${blindConn}", deaths shown=${blindState.deaths} (truth is 3)`);
  const misleading = blindConn==="demo" && blindState.deaths===0;
  if(misleading) note("HAZARD: it lands in DEMO mode showing a fresh 0-death game with a GREY dot — taps there go nowhere and are lost. Grey dot = not connected: stop and refresh.");
  check("it never claims to be live while showing stale/blank numbers",
    blindConn!=="live" || blindState.deaths===3, `conn=${blindConn} deaths=${blindState.deaths}`);

  const tapped = await act(C,"dAdj",1).then(()=>true,()=>false);
  await settle(1500);
  check("taps made in that state do not corrupt the real game", (await st(B)).deaths===3,
    "B deaths="+(await st(B)).deaths);

  await C.context().unroute(`http://${"127.0.0.1"}:8080/**`);
  const selfHeals = await softUntil(C,"window.__conn()==='live'",20000);
  if(!selfHeals) note("it does NOT reconnect by itself — the fix is one refresh once the database is reachable again");
  await C.reload({waitUntil:"domcontentloaded"});
  await live(C);
  check("one refresh puts it back in the real game", (await st(C)).deaths===3, "deaths="+(await st(C)).deaths);
} else note("skipped (needs the real emulator)");

/* ================================================================= */
section("6 · refresh from a share link, and losing the config");
{
  const A = await mk("/c/cc","r-link");
  await act(A,"dAdj",5); await settle(700);
  await A.evaluate("location.hash='#/'"); await settle(500);
  await act(A,"shareView","/kiosk"); await settle(300);   // the new picker's fifth view
  const link = await A.evaluate("document.getElementById('sharelink').textContent");
  check("the picker can send the kiosk view", link.includes("#/kiosk?cfg="), link.slice(0,60));

  const ctx = await newCtx();
  const N = await ctx.newPage();
  N.on("pageerror", e=>pageErrs.push("link: "+e));
  await N.goto(link.replace("http://localhost:8124", BASE), {waitUntil:"domcontentloaded"});
  await live(N);
  check("a shared link joins the running game", (await st(N)).deaths===5, "deaths="+(await st(N)).deaths);
  await reload(N);
  check("refreshing a link-joined device keeps it in the game", (await st(N)).deaths===5);
  check("…and keeps the view it was sent — the buttonless kiosk board",
    !!(await N.evaluate("!!document.querySelector('.kiosk')")) &&
    (await N.evaluate("document.querySelectorAll('button').length"))===0);

  // the hash still carries ?cfg= after the reload; strip it and reload again.
  // An old printed referee QR is also still a valid destination — it lands on
  // the Foreman view.
  await N.evaluate("location.hash='#/c/referee'");
  await reload(N);
  check("…and the old referee hash renders the Foreman view",
    /<b>Foreman<\/b>/.test(await html(N)), ((await html(N)).match(/<b>[^<]*<\/b>/)||["?"])[0]);
  check("it stays connected from stored config once the link params are gone",
    (await st(N)).deaths===5 && await conn(N)==="live");

  // Storage wiped ("clear site data", or a browser that never had it). The URL
  // still carries the connection, so the phone puts itself back together.
  await N.evaluate("localStorage.clear()");
  await N.reload({waitUntil:"domcontentloaded"});
  const healed = await softUntil(N,"window.__conn()==='live'",30000);
  check("a phone whose storage is wiped recovers from the link in its address bar", healed,
    "conn="+await conn(N));
  check("…and comes back to the real game, not a fresh one", (await st(N)).deaths===5,
    "deaths="+(await st(N)).deaths);
  note("wiped storage is survivable now: the address bar is itself a working share link");

  // A genuinely fresh phone — no storage, no link — must ask to connect rather
  // than quietly showing a plausible empty game.
  const fresh = await (await newCtx()).newPage();
  fresh.on("pageerror", e=>pageErrs.push("bare: "+e));
  await fresh.goto(`${BASE}/#/`, {waitUntil:"domcontentloaded"});
  await settle(2500);
  check("a phone opening the bare URL is asked to connect, not shown a fake game",
    /Paste the/.test(await html(fresh)), "conn="+await conn(fresh));
  check("…and does not claim to be live", await conn(fresh)!=="live", await conn(fresh));
  note("recovery for a phone that has lost both: re-scan the QR — the link carries the config");
}

/* ================================================================= */
section("6b · a slow first connect (crowded church wifi)");
if(EMU){
  // The app races fbBackend against a timer (25s since a real cold-start deploy
  // blew the old 8s). If the first connect is slower than that it gives up and
  // falls back to demo mode — permanently. This holds every request past that
  // budget to prove the give-up is still visible rather than silent.
  const ctx = await newCtx();
  let slow = true;
  await ctx.route("**/*", async route => {
    if(slow && route.request().url().includes(`${EMU_HOST}:${EMU_PORT}`)) await settle(32000);
    route.continue().catch(()=>{});
  });
  const S = await mk("/c/cc","r-slow",{ctx, connect:false});
  await S.evaluate(c => localStorage.setItem("fpCfg",c),
    JSON.stringify({cfg:CFG, gameId:gid("r-slow")}));
  await S.reload({waitUntil:"domcontentloaded"});
  await settle(30000);                      // past the app's give-up

  const dot = await conn(S);
  check("a slow first connect does not crash the app", pageErrs.length===0, pageErrs.slice(0,2).join(" | "));
  check("it never shows a green dot while it is not actually connected", dot!=="live", "dot="+dot);
  note(`a first connect slower than the give-up ends on dot="${dot}"`);

  slow = false;                              // wifi recovers
  const heals = await softUntil(S,"window.__conn()==='live'",25000);
  if(!heals) note("the give-up is permanent — a phone that connects too slowly stays in demo mode until someone refreshes it. Check every dot is GREEN before the first round.");
  check("either it heals, or a refresh fixes it", heals || await (async()=>{
    await S.reload({waitUntil:"domcontentloaded"});
    return live(S).then(()=>true,()=>false);
  })(), "healed="+heals);
  check("after recovery it is on the real game", await conn(S)==="live", await conn(S));
  await ctx.unroute("**/*").catch(()=>{});
} else note("skipped (needs the real emulator)");

/* ================================================================= */
section("6c · a scanned QR keeps working after switching roles");
{
  // REGRESSION: role switching used to drop ?cfg= from the URL, leaving the
  // connection only in localStorage. A scanned QR often lands in a private tab
  // or an in-app browser where localStorage throws and the app falls back to an
  // in-memory store — so the next reload put the phone on the connect screen.
  const A = await mk("/c/cc","r-qr");
  await act(A,"dAdj",3); await settle(600);
  await A.evaluate("location.hash='#/'"); await settle(500);
  await act(A,"shareView","/c/foreman"); await settle(400);   // a role view, as a counsellor would be sent
  const link = await A.evaluate("document.getElementById('sharelink')?.textContent||''");
  check("a share link is available to scan", link.includes("cfg=")&&link.includes("/c/foreman"), link.slice(0,60));

  for(const storage of [true,false]){
    const ctx = await newCtx();
    if(!storage) await ctx.addInitScript(()=>{           // private tab / in-app browser
      Object.defineProperty(window,"localStorage",{configurable:true,get(){throw new Error("blocked")}});
    });
    const P = await ctx.newPage();
    const label = storage ? "with storage" : "with localStorage blocked";
    P.on("pageerror", e=>pageErrs.push("qr("+label+"): "+e));
    await P.goto(link.replace("http://localhost:8124", BASE), {waitUntil:"domcontentloaded"});
    await live(P);
    check(`${label}: the scanned link joins the game`, (await st(P)).deaths===3, "deaths="+(await st(P)).deaths);

    await P.click('a:has-text("switch role")');
    await settle(900);
    check(`${label}: switching role stays connected`, await conn(P)==="live", await conn(P));
    check(`${label}: it does not fall back to the connect screen`, !/Paste the/.test(await html(P)));
    check(`${label}: the address bar still carries the connection`,
      (await P.evaluate("location.hash")).includes("cfg="), await P.evaluate("location.hash"));

    const cc = await P.$('button:has-text("Central Command")');
    if(cc){await cc.click(); await settle(900)}
    check(`${label}: picking a role from there is still live`,
      await conn(P)==="live" && (await st(P)).deaths===3, await conn(P)+" deaths="+(await st(P)).deaths);

    // the thing that actually broke it on a phone: a reload after switching
    await P.reload({waitUntil:"domcontentloaded"});
    await settle(1500);
    const back = await softUntil(P,"window.__conn()==='live'",30000);
    check(`${label}: a reload after switching rejoins the game`, back, "conn="+await conn(P));
    check(`${label}: …with the real numbers, not a fresh game`, (await st(P)).deaths===3,
      "deaths="+(await st(P)).deaths);
  }
}

/* ================================================================= */
section("6d · Disconnect remembers the config for a one-tap reconnect");
{
  // Disconnect sits one mis-tap away on the home screen, and finding the
  // Firebase console on a phone mid-game is a bad five minutes. The live config
  // still goes — the device really is disconnected and nothing syncs — but the
  // last good one is kept aside, used for nothing except pre-filling the form.
  const A = await mk("/c/cc","r-memo"), B = await mk("/monitor","r-memo");
  await act(A,"dAdj",4);
  await until(B,"window.__state().deaths===4");
  await A.evaluate("location.hash='#/'"); await settle(500);

  // driven through the dialog, as a thumb would. The confirm button lives in
  // the modal, and the home screen's own "Disconnect this device" comes first
  // in the DOM, so the click has to be scoped to the dialog.
  await tap(A,"Disconnect this device"); await settle(400);
  const dq = await modal(A);
  check("Disconnect still asks first", !!dq && dq.buttons.includes(CONFIRM_YES.forget), JSON.stringify(dq));
  await A.click(`.modal button:text-is("${CONFIRM_YES.forget}")`).catch(()=>{});   // reloads under us
  await A.waitForFunction("!!document.getElementById('cfgtxt')",null,{timeout:20000});

  const kept = await A.evaluate(()=>({live:localStorage.getItem("fpCfg"),
                                      memo:localStorage.getItem("fpLastCfg")}));
  check("Disconnect drops the live config", !kept.live, kept.live);
  check("…so the device really is disconnected", await conn(A)!=="live", await conn(A));
  check("…but the last good config is remembered for the form",
    !!kept.memo && JSON.parse(kept.memo).gameId===gid("r-memo"), String(kept.memo).slice(0,140));
  check("…and the game keeps running for everyone else", (await st(B)).deaths===4, "B deaths="+(await st(B)).deaths);

  const form = await A.evaluate(()=>({
    cfg: document.getElementById("cfgtxt").value,
    gid: document.getElementById("gid").value,
    clearable: [...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="clear it")}));
  check("the connect form comes back pre-filled with the last config",
    /const firebaseConfig\s*=\s*\{/.test(form.cfg) && form.cfg.includes(CFG.projectId), form.cfg.slice(0,90));
  check("…and with the game id it was in, not a fresh random one", form.gid===gid("r-memo"), form.gid);
  check("…and offers a way to clear the memo", form.clearable);

  // the whole point of the change: one tap on Connect, nothing typed
  await A.click('button:text-is("Connect")').catch(()=>{});
  await settle(1500);
  check("one tap on Connect, nothing typed, reconnects the device",
    await softUntil(A,"window.__conn()==='live'",30000), "conn="+await conn(A));
  check("…to the same game id",
    await A.evaluate("JSON.parse(localStorage.getItem('fpCfg')||'{}').gameId")===gid("r-memo"));
  check("…and the same room, not a fresh game", (await st(A)).deaths===4, "deaths="+(await st(A)).deaths);
  await act(A,"dAdj",1);
  check("…with writes that reach the other phone again",
    await softUntil(B,"window.__state().deaths===5",12000), "B deaths="+(await st(B)).deaths);

  // "clear it", for a phone that should not keep the memo at all
  await act(A,"forget"); await settle(300);
  await act(A,"confirmYes").catch(()=>{});
  await A.waitForFunction("!!document.getElementById('cfgtxt')",null,{timeout:20000});
  await A.click('button:text-is("clear it")');
  await settle(500);
  const cleared = await A.evaluate(()=>({
    memo: localStorage.getItem("fpLastCfg"),
    cfg:  document.getElementById("cfgtxt").value,
    gid:  document.getElementById("gid").value,
    filled: /Filled in from/.test(document.getElementById("app").innerHTML)}));
  check("“clear it” drops the remembered config", !cleared.memo, cleared.memo);
  check("…and the form goes back to empty", cleared.cfg==="" && !cleared.filled, cleared.cfg.slice(0,60));
  check("…with a fresh random game id", /^footprints-[a-z0-9]+$/.test(cleared.gid) && cleared.gid!==gid("r-memo"),
    cleared.gid);

  // and nothing leaks onto a device that never connected in the first place
  const V = await (await newCtx()).newPage();
  V.on("pageerror", e=>pageErrs.push("never-connected: "+e));
  await V.goto(`${BASE}/#/`, {waitUntil:"domcontentloaded"});
  await V.waitForFunction("!!document.getElementById('cfgtxt')",null,{timeout:15000});
  const v = await V.evaluate(()=>({
    cfg: document.getElementById("cfgtxt").value,
    gid: document.getElementById("gid").value,
    memo: localStorage.getItem("fpLastCfg"),
    filled: /Filled in from/.test(document.getElementById("app").innerHTML)}));
  check("a device that has never connected shows an empty box", v.cfg==="" && !v.filled, v.cfg.slice(0,60));
  check("…and a random game id, with nothing remembered",
    /^footprints-[a-z0-9]+$/.test(v.gid) && !v.memo, v.gid+" memo="+v.memo);

  // The game id is not the device's own secret: a share link carries {cfg,gameId}
  // in ?cfg=, so whoever sends the QR chooses it, and the pre-filled box reflects
  // it straight into value="…". This caught a real one: esc() escaped & and < but
  // not the quote that closes the attribute, so a hostile link plus one Disconnect
  // ran script on the app's own origin. Only reachable once the pre-fill landed —
  // the field used to hold a fresh random string. esc() now escapes quotes too.
  const EVIL = 'g" onmouseover="window.__xss=1" x="';
  const token = Buffer.from(JSON.stringify({cfg:CFG, gameId:EVIL})).toString("base64")
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const X = await (await newCtx()).newPage();
  X.on("pageerror", e=>pageErrs.push("hostile-link: "+e));
  await X.goto(`${BASE}/#/?cfg=${token}`, {waitUntil:"domcontentloaded"});
  await settle(800);
  await act(X,"forget"); await settle(200);
  await act(X,"confirmYes").catch(()=>{});                 // reloads under us
  await X.waitForFunction("!!document.getElementById('gid')",null,{timeout:20000});
  const probe = await X.evaluate(()=>{
    const el = document.getElementById("gid");
    el.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
    return {value:el.value, injected:el.getAttribute("onmouseover"), ran:!!window.__xss};
  });
  check("a hostile game id from a share link cannot break out of the pre-filled input",
    probe.injected===null && !probe.ran && probe.value===EVIL,
    `injected=${probe.injected} ran=${probe.ran} value=${JSON.stringify(probe.value)}`);
}

/* ================================================================= */
section("6e · the escaping never reaches anyone's eyes");
{
  // esc() escapes " and ' as well as & < >, because a share link's game id
  // lands inside value="…" (6d). Every one of its call sites feeds innerHTML,
  // where the parser turns the entity straight back into the character — in a
  // text node, in an attribute and inside <textarea> alike — so nobody should
  // ever see one. The day a site moves into a raw-text context (<script>,
  // <style>) or onto .textContent, a counsellor reads a literal &#39; off a
  // phone at the front of a dark room and there is no fixing it mid-game.
  const ENT = /&(?:amp|lt|gt|quot|apos|#0*39|#x0*27);/i;
  // Everything a person can actually read: the text, the attributes that
  // surface as tooltips and placeholders, and the boxes they are about to edit.
  const readable = p => p.evaluate(()=>{
    const root = document.getElementById("app"), bits = [root.textContent||""];
    root.querySelectorAll("[title],[aria-label],[placeholder]").forEach(e=>
      ["title","aria-label","placeholder"].forEach(a=>{if(e.hasAttribute(a))bits.push(e.getAttribute(a))}));
    root.querySelectorAll("input,textarea").forEach(e=>bits.push(e.value));
    return bits.join("\n");
  });
  const noEntity = async (p, where) => {
    const t = await readable(p), m = t.match(ENT);
    return check(`nothing shows a raw entity — ${where}`, !m,
      m ? `saw ${m[0]} in “${t.slice(Math.max(0,m.index-45), m.index+45).replace(/\s+/g," ")}”` : undefined);
  };
  // A goto that only changes the hash is a same-document navigation: the app
  // re-renders on hashchange but never re-boots, so ?demo=live / ?tab= / ?grp=
  // would silently never be read. Reload to make each one a real load.
  const open = async (p, hash) => {
    await p.goto(`${BASE}/#${hash}`, {waitUntil:"domcontentloaded"});
    await p.reload({waitUntil:"domcontentloaded"});
    await p.waitForFunction("document.getElementById('app').children.length>0",null,{timeout:15000});
    if(/demo=live/.test(hash))
      await p.waitForFunction("window.__state && window.__state().round===2",null,{timeout:15000});
    await settle(200);
  };

  // (a) The config box is nearly all quotes, and it is the one place the
  // escaping could be read literally. A <textarea> is escapable raw text: the
  // parser decodes on the way in, so .value must hold the real characters —
  // and Connect parses that value straight back into what gets stored.
  const T = await mk("/c/cc","r-esc");
  await act(T,"forget"); await settle(200);
  await act(T,"confirmYes").catch(()=>{});                       // reloads under us
  await T.waitForFunction("!!document.getElementById('cfgtxt')",null,{timeout:20000});
  const WANT = "const firebaseConfig = "+JSON.stringify(CFG,null,2)+";";
  const box = await T.evaluate(()=>{const e=document.getElementById("cfgtxt");
    return {value:e.value, shown:e.textContent}});
  check("the config box holds the real characters, byte for byte",
    box.value===WANT, JSON.stringify(box.value).slice(0,180));
  check("…with real quotes in it, and no entity for the counsellor to see",
    box.value.includes('"') && !ENT.test(box.value), JSON.stringify(box.value).slice(0,180));
  check("…and reads the same through .textContent, which is what a copy takes",
    box.shown===WANT, JSON.stringify(box.shown).slice(0,180));
  await T.click('button:text-is("Connect")').catch(()=>{});
  const back = await softUntil(T,"window.__conn()==='live'",30000);
  const stored = await T.evaluate("localStorage.getItem('fpCfg')");
  check("…so one tap on Connect stores the config identical to what was remembered",
    back && JSON.stringify(JSON.parse(stored||"{}").cfg)===JSON.stringify(CFG),
    `conn=${await conn(T)} stored=${String(stored).slice(0,180)}`);

  // (b) The game id is chosen by whoever sends the QR, and the home screen
  // prints it back inside curly quotes. Every character esc() touches at once.
  // No connection is waited on — the id is deliberately absurd and the home
  // screen paints before the backend is reached anyway.
  const NASTY = gid(`a&b<c>d"e'f`);
  const H = await (await newCtx()).newPage();
  H.on("pageerror", e=>pageErrs.push("nasty-id: "+e));
  await H.goto(`${BASE}/#/`, {waitUntil:"domcontentloaded"});
  await H.evaluate(c=>localStorage.setItem("fpCfg",c), JSON.stringify({cfg:CFG, gameId:NASTY}));
  await open(H,"/");
  const sub = await H.evaluate(()=>{const e=document.querySelector(".sub");
    return {text:e.textContent, tags:e.querySelectorAll("*").length}});
  check("the home screen prints an odd game id exactly as it is",
    sub.text===`Game “${NASTY}” · every device with the link shares this state` && sub.tags===0,
    JSON.stringify(sub.text));
  await noEntity(H,"home screen, connected");
  await H.close().catch(()=>{});

  // (c) Every view, with something on every screen: a phase chip running, a
  // banner up, deaths on the board and an action in the history for Undo to
  // name. Demo-seeded, so this costs no emulator time.
  const D = await (await newCtx()).newPage();
  D.on("pageerror", e=>pageErrs.push("entity-sweep: "+e));
  for(const [hash,where] of [
    ["/","home screen, not connected"],
    ["/c/gm?demo=live&banner=meeting","Game Master, meeting running"],
    ["/c/cc?demo=live&banner=sabotage","Central Command, sabotage up"],
    ["/c/foreman?demo=live&banner=sabotage&tab=answers&grp=7","Foreman, answers"],
    ["/c/referee?demo=live&tab=role","old referee link (Foreman crib)"],
    ["/c/ghost?demo=live&banner=meeting","old ghost link (Foreman controls)"],
    ["/kiosk?demo=live&banner=sabotage","kiosk status board"],
    ["/monitor?demo=live&banner=meeting","TV monitor, meeting overlay"],
    ["/monitor?demo=live&banner=sabotage","TV monitor, sabotage"],
  ]) { await open(D,hash); await noEntity(D,where) }

  await open(D,"/c/gm?demo=live&banner=sabotage");
  // the Undo label carries a literal &nbsp; in the template. Decoded, as it
  // should be — so flatten it to an ordinary space before matching.
  const gmTxt = (await D.evaluate(()=>document.getElementById("app").innerText)).replace(/\u00a0/g," ");
  check("the Undo button names the last action in plain words",
    /Undo — Sabotage — 5 props/.test(gmTxt), gmTxt.split("\n").find(l=>/Undo/.test(l)));
  check("…and the phase chip is the short word, not an entity", /\bSAB\b/.test(gmTxt),
    gmTxt.slice(0,90).replace(/\n/g," "));

  // (d) A share link picks the number on the answers pad, unchecked — the one
  // esc() input on that screen a stranger controls. It has to come back out as
  // the characters that went in, with no markup and no handler.
  const PAYLOAD = `5" onmouseover="window.__pad=1" <b>x</b>&'`;
  await open(D,"/c/foreman?tab=answers&grp="+encodeURIComponent(PAYLOAD));
  const pad = await D.evaluate(()=>{
    const r=document.querySelector(".padread");
    if(!r)return {text:"(no pad on screen)"};
    r.dispatchEvent(new MouseEvent("mouseover",{bubbles:true}));
    return {text:r.textContent, tags:r.querySelectorAll("*").length, inj:r.getAttribute("onmouseover"),
            ran:!!window.__pad, miss:(document.getElementById("ansres")||{}).textContent||""};
  });
  check("the answers pad prints a link-chosen number exactly as it is",
    pad.text===PAYLOAD && pad.tags===0 && pad.inj===null && !pad.ran,
    `text=${JSON.stringify(pad.text)} tags=${pad.tags} inj=${pad.inj} ran=${pad.ran}`);
  check("…and the “no such group” line says it back the same way",
    pad.miss===`No group ${PAYLOAD} — highest is 32.`, JSON.stringify(pad.miss));

  // (e) The gospel line is the one esc() input that is a real sentence, read
  // aloud off a phone. Today's six phrases carry no apostrophe, so this is a
  // fidelity check — but (d) proved the very same card decodes ' and " in a
  // text node, so the day a phrase gains one it will still read right.
  await open(D,"/c/foreman?tab=answers&grp=7");
  const gos = await D.evaluate(()=>(document.querySelector(".gospel")||{}).textContent||"(no gospel line)");
  const want = APP.gospel["7"].toUpperCase()+" "+APP.gospelPhrase[APP.gospel["7"]];
  check("the gospel line reads exactly as the data file writes it", gos===want,
    JSON.stringify(gos)+" want "+JSON.stringify(want));

  // (f) The dialogs — title, body and the button a thumb is about to hit.
  await open(D,"/c/gm?demo=live");
  for(const [fn,where] of [["pauseGame","Pause"],["newRound","New round"],["forget","Disconnect"]]){
    await act(D,fn); await settle(200);
    const m = await modal(D);
    check(`the ${where} dialog reads as written`,
      !!m && !!m.title && !!m.body && !ENT.test(m.title+" "+m.body+" "+m.buttons.join(" ")),
      JSON.stringify(m));
    await noEntity(D,`${where} dialog`);
    await act(D,"confirmNo"); await settle(120);
  }
}

/* ================================================================= */
section("6f · the connect form can actually be typed in");
{
  // The form lives on the home screen, and the home screen is the one view that
  // never paints the sound button — so `shownSound` stays null and every single
  // keydown makes unlockAudio → syncSound schedule a render() 120ms later, i.e.
  // mid-word. render() replaces the page wholesale, so anything left only in the
  // DOM was thrown away: the box reverted to the pre-fill under a moving thumb
  // and the caret went with it. Typed text now lives in module state (uiCfgTxt /
  // uiGid, set by act.typed on oninput, which deliberately does not render), and
  // render() puts the focus and the caret back afterwards.
  // Everything here is driven with real click + type on purpose: page.fill()
  // sets .value and fires one input event with no keydown at all, so it never
  // schedules the repaint — the bug is completely invisible to it.
  const formState = p => p.evaluate(()=>{
    const c=document.getElementById("cfgtxt"), g=document.getElementById("gid"), a=document.activeElement;
    return {cfg:c?c.value:null, gid:g?g.value:null, focus:a?a.id||a.tagName:null,
            caret:a&&typeof a.selectionStart==="number"?a.selectionStart:null};
  });
  // Count real repaints from outside the app: render() rewrites #app's children,
  // and #app itself is cached once and outlives every repaint.
  const watchPaints = p => p.evaluate(()=>{window.__paints=0;
    new MutationObserver(m=>{window.__paints+=m.length}).observe(document.getElementById("app"),{childList:true})});
  const paints = p => p.evaluate("window.__paints||0");
  const toForm = async p => {
    await act(p,"forget"); await settle(250);
    await act(p,"confirmYes").catch(()=>{});                     // reloads under us
    await p.waitForFunction("!!document.getElementById('cfgtxt')",null,{timeout:20000});
  };

  const PREFILL_GID = gid("r-typed"), TYPED_GID = gid("r-typed2");
  const TYPED_CFG = "const firebaseConfig = "+JSON.stringify({...CFG, appId:"typed-"+TYPED_GID})+";";

  const A = await mk("/c/cc","r-typed");
  await toForm(A);

  // the §6d guarantee, restated as this section's starting point: nothing typed
  // yet means uiCfgTxt/uiGid are still null and the pre-fill is what shows.
  const pre = await formState(A);
  check("nothing typed yet, so the form still shows the pre-fill untouched",
    pre.gid===PREFILL_GID && /const firebaseConfig\s*=\s*\{/.test(pre.cfg) && pre.cfg.includes(CFG.projectId),
    `gid=${pre.gid} cfg=${String(pre.cfg).slice(0,60)}`);

  // (a) the game id, typed over the pre-fill with real keys
  await watchPaints(A);
  await A.click("#gid",{clickCount:3});               // triple-tap selects the pre-fill, as a thumb would
  await A.keyboard.type(TYPED_GID,{delay:35});        // ~35ms a character — the 120ms render lands mid-word
  await settle(500);                                  // and well past it before anything is read
  const t1 = await formState(A);
  check("something really does repaint while the game id is being typed",
    await paints(A) > 0, "repaints="+await paints(A));
  check("…and a game id typed over the pre-fill survives every one of them",
    t1.gid===TYPED_GID, `want ${TYPED_GID} got ${t1.gid}`);
  check("…and the field still has the focus, so the next character lands in it",
    t1.focus==="gid", "focus="+t1.focus);

  // (b) the config box, same treatment
  await A.click("#cfgtxt");
  await A.keyboard.press("ControlOrMeta+a");          // select the pre-filled block
  await A.keyboard.type(TYPED_CFG,{delay:8});
  await settle(500);
  const t2 = await formState(A);
  check("a config typed into the box survives the repaints too", t2.cfg===TYPED_CFG,
    `got ${JSON.stringify(String(t2.cfg).slice(0,90))}`);
  check("…and the config box keeps the focus", t2.focus==="cfgtxt", "focus="+t2.focus);
  check("…and the game id typed before it is still there, untouched by the second field",
    t2.gid===TYPED_GID, t2.gid);

  // (c) a repaint forced from somewhere else entirely, mid-word, with the caret
  // parked in the middle of what was typed. The audio unlock is only the repaint
  // that happens to be guaranteed; another tab, the clock or a hashchange will
  // do it just as well, and none of them should move anyone's cursor.
  await A.click("#gid",{clickCount:3});
  await A.keyboard.type(TYPED_GID,{delay:20});
  await A.keyboard.press("ArrowLeft");
  await A.keyboard.press("ArrowLeft");
  await settle(300);
  const mid = await A.evaluate(()=>{
    const before=document.getElementById("gid");
    const was={value:before.value, caret:before.selectionStart};
    window.dispatchEvent(new HashChangeEvent("hashchange"));     // the app renders synchronously on this
    const after=document.getElementById("gid");
    return {was, replaced:after!==before, value:after.value, caret:after.selectionStart,
            focus:document.activeElement?document.activeElement.id:null};
  });
  check("a repaint forced mid-typing really does replace the field node",
    mid.replaced && mid.was.caret===TYPED_GID.length-2,
    `replaced=${mid.replaced} caretBefore=${mid.was.caret}`);
  check("…and the half-typed value comes through it unchanged", mid.value===TYPED_GID,
    `want ${TYPED_GID} got ${mid.value}`);
  check("…and the focus is still on the field afterwards", mid.focus==="gid", "focus="+mid.focus);
  check("…and the caret is where it was left, not shoved to the end",
    mid.caret===TYPED_GID.length-2, `caret=${mid.caret} of ${TYPED_GID.length}`);

  // (d) and Connect uses what was typed, not what was pre-filled. The typed
  // config is the working one plus a marker key, so "the typed one was stored"
  // and "the device still connects" are both answerable.
  const W = await mk("/monitor","r-typed2");          // the phone already in the typed-at game
  await act(W,"dAdj",2);
  await until(W,"window.__state().deaths===2");
  await A.click('button:text-is("Connect")').catch(()=>{});
  const up = await softUntil(A,"window.__conn()==='live'",30000);
  const stored = await A.evaluate("JSON.parse(localStorage.getItem('fpCfg')||'{}')");
  check("Connect after typing stores the typed game id, not the pre-filled one",
    stored.gameId===TYPED_GID, `stored=${stored.gameId} prefill=${PREFILL_GID}`);
  check("…and the typed config, not the pre-filled one",
    !!stored.cfg && stored.cfg.appId==="typed-"+TYPED_GID, JSON.stringify(stored.cfg||null).slice(0,160));
  check("…and the device comes up live in the game the typed id names",
    up && (await st(A)).deaths===2, `conn=${await conn(A)} deaths=${(await st(A)).deaths}`);
  await act(A,"dAdj",1);
  check("…with writes that reach the phone already in that game",
    await softUntil(W,"window.__state().deaths===3",12000), "W deaths="+(await st(W)).deaths);

  // (e) "clear it" has to forget the typed text as well as the memo — otherwise
  // the box would look cleared and Connect would still use the old characters.
  await toForm(A);
  await A.click("#gid",{clickCount:3});
  await A.keyboard.type("typed-then-cleared",{delay:20});
  await A.click("#cfgtxt");
  await A.keyboard.press("ControlOrMeta+a");
  await A.keyboard.type("nonsense pasted by mistake",{delay:8});
  await settle(400);
  const beforeClear = await formState(A);
  check("both boxes hold what was typed before the clear",
    beforeClear.gid==="typed-then-cleared" && beforeClear.cfg==="nonsense pasted by mistake",
    `gid=${beforeClear.gid} cfg=${String(beforeClear.cfg).slice(0,40)}`);
  await A.click('button:text-is("clear it")');
  await settle(500);
  const cl = await A.evaluate(()=>({cfg:document.getElementById("cfgtxt").value,
    gid:document.getElementById("gid").value, memo:localStorage.getItem("fpLastCfg"),
    filled:/Filled in from/.test(document.getElementById("app").innerHTML)}));
  check("“clear it” empties the config box of what was typed into it",
    cl.cfg==="" && !cl.filled && !cl.memo, `cfg=${JSON.stringify(cl.cfg.slice(0,40))} memo=${cl.memo}`);
  check("…and drops the typed game id for a fresh random one",
    /^footprints-[a-z0-9]+$/.test(cl.gid) && cl.gid!=="typed-then-cleared" && cl.gid!==TYPED_GID, cl.gid);
  await A.click("#gid",{clickCount:3});
  await A.keyboard.type("after-the-clear",{delay:35});
  await settle(500);
  const post = await formState(A);
  check("…and the form is still typeable afterwards, with the focus kept",
    post.gid==="after-the-clear" && post.focus==="gid", `${post.gid} focus=${post.focus}`);

  // (f) A device that never connected has no memo, so the box shows a random id
  // for the room to use. It used to be dealt inside the template — a fresh one
  // every repaint, while someone was reading the old one aloud to a second phone.
  const V = await (await newCtx()).newPage();
  V.on("pageerror", e=>pageErrs.push("typed-fresh: "+e));
  await V.goto(`${BASE}/#/`, {waitUntil:"domcontentloaded"});
  await V.waitForFunction("!!document.getElementById('gid')",null,{timeout:15000});
  const first = await V.evaluate("document.getElementById('gid').value");
  const seen = [first];
  for(let i=0;i<4;i++){
    await V.evaluate(()=>window.dispatchEvent(new HashChangeEvent("hashchange")));
    await settle(160);
    seen.push(await V.evaluate("document.getElementById('gid').value"));
  }
  await V.click("h1").catch(()=>{});                  // a real tap: unlocks audio, schedules its own render
  await settle(500);
  seen.push(await V.evaluate("document.getElementById('gid').value"));
  check("a never-connected device offers a random game id",
    /^footprints-[a-z0-9]+$/.test(first) && !(await V.evaluate("localStorage.getItem('fpLastCfg')")), first);
  check("…and shows the same one across every repaint, so it can be read aloud safely",
    seen.every(x=>x===first), seen.join(" | "));
  await act(V,"forgetAll"); await settle(300);
  const rolled = await V.evaluate("document.getElementById('gid').value");
  check("…and only “clear it” deals a new one",
    /^footprints-[a-z0-9]+$/.test(rolled) && rolled!==first, `${first} → ${rolled}`);
}

/* ================================================================= */
section("7 · someone taps “Skip — demo mode” by mistake");
{
  const REAL = await mk("/c/cc","r-demo");
  await act(REAL,"dAdj",4); await settle(700);

  // a fresh phone that hits the demo button instead of scanning the QR
  const ctx = await newCtx();
  const D = await ctx.newPage();
  D.on("pageerror", e=>pageErrs.push("demo: "+e));
  await D.goto(`${BASE}/#/`, {waitUntil:"domcontentloaded"});
  const tapped = await D.evaluate(()=>{
    const b=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("demo mode"));
    if(!b)return false; b.click(); return true});
  check("the connect screen offers a demo-mode button", tapped);
  await settle(2500);

  check("demo mode shows a grey dot, never green", await conn(D)==="demo", await conn(D));
  check("the home screen says in words that it is not connected",
    /Not connected/.test(await html(D)) && /this device only/.test(await html(D)));
  const dot = await D.evaluate("document.querySelector('.dot')?.className||'(none on home)'");

  await D.evaluate("location.hash='#/c/cc'"); await settle(600);
  check("a counsellor view in demo mode still flags itself grey",
    /dot demo/.test(await html(D)), (await html(D)).match(/class="dot [a-z]+"/)?.[0]);
  const before = await st(REAL);
  await act(D,"dAdj",1); await act(D,"sab"); await settle(1500);
  check("nothing tapped in demo mode touches the real game",
    eq(pick(before), pick(await st(REAL))), diff(before, await st(REAL)));
  check("the demo phone shows its own private numbers", (await st(D)).deaths===1 && (await st(REAL)).deaths===4,
    `demo=${(await st(D)).deaths} real=${(await st(REAL)).deaths}`);
  note("a phone in demo mode looks like a working game but is talking to nobody — grey dot is the only tell. Recovery: back to #/ and re-scan the QR");

  // recovery: the connect screen is right there, and the QR link fixes it
  await D.evaluate("location.hash='#/'"); await settle(600);
  check("demo mode still offers the connect form to get back", /Paste the/.test(await html(D)));
  await REAL.evaluate("location.hash='#/'"); await settle(600);
  const link = await REAL.evaluate("document.getElementById('sharelink')?.textContent||''");
  await D.goto(link.replace("http://localhost:8124", BASE), {waitUntil:"domcontentloaded"});
  const straightIn = await softUntil(D,"window.__conn()==='live'",12000);
  if(!straightIn){
    note("opening the share link in a tab that ALREADY has the app open only changes the hash — the app does not re-connect until that tab is reloaded. Scanning the QR opens a fresh tab, so that path is fine.");
    await D.reload({waitUntil:"domcontentloaded"});
    await live(D);
  }
  check("re-scanning the QR pulls the demo phone into the real game", (await st(D)).deaths===4,
    "deaths="+(await st(D)).deaths);
  check("…and it is genuinely live now", await conn(D)==="live", await conn(D));
}

/* ================================================================= */
section("8 · no page errors");
check("no uncaught exceptions in any refresh scenario", pageErrs.length===0, pageErrs.slice(0,4).join(" | "));

await finish("REFRESH TEST");
