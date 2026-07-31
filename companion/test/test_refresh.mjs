// What happens when a device refreshes — the single most likely thing to go
// wrong on the night (a phone locks, someone pull-to-refreshes, the TV browser
// reloads, wifi hiccups). Every game state is reloaded and compared field by
// field against what was on screen before.
//   EMU=1 node test/test_refresh.mjs
import {EMU, DEF, FIELDS, BASE, CFG, EMU_HOST, EMU_PORT, section, check, note,
        eq, pick, diff, gid, settle, boot, newCtx, mk, live, st, conn, act,
        until, softUntil, html, btnText, tap, confirmNewRound, allAgree, raw,
        pageErrs, finish} from "./harness.mjs";

await boot();
const reload = async p => {
  await p.reload({waitUntil:"domcontentloaded"});
  await live(p);
};
// Compare everything except the clocks' absolute deadlines, which are wall-clock
// values; those get their own tolerance check.
const NOCLOCK = FIELDS.filter(k=>k!=="timer"&&k!=="phase");
const remaining = s => s.timer.mode==="run" ? s.timer.endsAt-Date.now() : s.timer.remain;

/* ================================================================= */
section("1 · refresh in every game state");
{
  // Each case: set the state up on CC, snapshot it, reload CC, compare.
  const cases = [
    ["idle, nothing started",          async A => {}],
    ["clock running",                  async A => {await act(A,"start")}],
    ["clock paused mid-round",         async A => {await act(A,"start"); await settle(600); await act(A,"pause")}],
    ["clock adjusted twice",           async A => {await act(A,"start"); await act(A,"adj",30000); await act(A,"adj",-30000)}],
    ["meeting running",                async A => {await act(A,"start"); await act(A,"meeting")}],
    ["meeting + nominations phase",    async A => {await act(A,"meeting"); await act(A,"phasePre",90,"NOMINATIONS")}],
    ["sabotage running",               async A => {await act(A,"start"); await act(A,"sab",2)}],
    ["both sabotages spent",           async A => {await act(A,"sab",1); await act(A,"sabOk"); await act(A,"sab",3); await act(A,"sabFail")}],
    ["deaths past the threshold",      async A => {for(let i=0;i<7;i++) await act(A,"dAdj",1)}],
    ["clock run down to 0:00",         async A => {await act(A,"start"); await act(A,"adj",-600000)}],
    ["round 3, mid-game",              async A => {await confirmNewRound(A); await settle(400); await confirmNewRound(A);
                                                   await act(A,"start"); await act(A,"dAdj",2)}],
    ["right after an undo",            async A => {await act(A,"dAdj",1); await act(A,"sab",1); await settle(500); await act(A,"undo")}],
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
section("2 · refresh must never reseed a live game");
{
  const A = await mk("/c/cc","r-seed"), B = await mk("/monitor","r-seed");
  await act(A,"start"); await act(A,"dAdj",4); await act(A,"sab",1);
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

  // reload while a 2-minute sabotage phase is ticking: the phase clock must not restart
  await act(A,"sab",2); await settle(900);
  const ph0 = (await st(A)).phase.endsAt;
  await settle(1200);
  await reload(A);
  const ph1 = (await st(A)).phase.endsAt;
  check("a sabotage phase clock does not restart on refresh", ph0===ph1, `${ph0} → ${ph1}`);
  const shown = await A.evaluate("document.querySelector('[data-phclk]')?.textContent");
  check("the refreshed phone shows the phase counting down, not 2:00", shown && shown!=="2:00", shown);

  // reload the TV during a sabotage: overlay must come straight back
  await reload(B);
  check("the TV refreshed mid-sabotage still shows the overlay",
    /SABOTAGE/.test(await html(B)) && !!(await B.evaluate("!!document.querySelector('.overlay.sab')")));

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
  await act(A,"shareView","/c/referee"); await settle(300);
  const link = await A.evaluate("document.getElementById('sharelink').textContent");

  const ctx = await newCtx();
  const N = await ctx.newPage();
  N.on("pageerror", e=>pageErrs.push("link: "+e));
  await N.goto(link.replace("http://localhost:8124", BASE), {waitUntil:"domcontentloaded"});
  await live(N);
  check("a shared link joins the running game", (await st(N)).deaths===5, "deaths="+(await st(N)).deaths);
  await reload(N);
  check("refreshing a link-joined device keeps it in the game", (await st(N)).deaths===5);
  check("…and keeps the role it was sent", /Roaming Referee/.test(await html(N)));

  // the hash still carries ?cfg= after the reload; strip it and reload again
  await N.evaluate("location.hash='#/c/referee'");
  await reload(N);
  check("it stays connected from stored config once the link params are gone",
    (await st(N)).deaths===5 && await conn(N)==="live");

  // storage wiped (private tab, or "clear site data")
  await N.evaluate("localStorage.clear()");
  await N.reload({waitUntil:"domcontentloaded"});
  await settle(2500);
  check("a phone whose storage is wiped lands on the connect screen, not a fake game",
    /Paste the/.test(await html(N)) || await conn(N)!=="live", "conn="+await conn(N));
  note("recovery for a wiped phone: re-scan the QR — the link carries the config");
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
  await act(D,"dAdj",1); await act(D,"sab",1); await settle(1500);
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
