// Shared plumbing for the browser-driven test files.
//   default : protocol mock backend (test/mock)
//   EMU=1   : the real Google Firestore emulator on 127.0.0.1:8080
// Every "device" is its own browser context, so localStorage, BroadcastChannel
// and the network are as separate as two phones in a church basement.
import {chromium} from "playwright";
import {readFileSync} from "fs";
import {fileURLToPath} from "url";
import {dirname, join} from "path";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const BASE = "http://localhost:8124";
export const EMU = !!process.env.EMU;
export const PROJECT = "demo-footprints";
export const EMU_HOST = "127.0.0.1", EMU_PORT = 8080;
export const SDK_CDN = "https://www.gstatic.com/firebasejs/10.12.2";
export const CFG = EMU
  ? {apiKey:"demo", projectId:PROJECT, emulatorHost:EMU_HOST, emulatorPort:EMU_PORT}
  : {apiKey:"demo", projectId:PROJECT, sdkBase:BASE+"/test/mock"};
export const APP = JSON.parse(readFileSync(join(HERE,"..","appdata.json"),"utf8"));

// The app's own documented starting state. Key order matters: section 1 of the
// comprehensive suite compares this against the seeded document verbatim.
export const DEF = {round:1,targetPts:8,deaths:0,threshold:6,impostersCaught:0,sabotagesUsed:0,
  // the Game Master's dials — set once for the night and carried across rounds
  imposters:3,sabotageMax:2,
  sabotageSet:0,banner:"none",hist:[],
  paused:{on:false,clock:false,phase:false,meet:false},
  // the 3:00 meeting hard stop is its own clock, kept apart from `phase` so the
  // sub-phases (report / nominations / corners / vote) can run underneath it
  meet:{mode:"idle",endsAt:0,remain:0,clock:false},
  timer:{mode:"idle",endsAt:0,remain:480000,dur:480000},
  phase:{mode:"idle",endsAt:0,remain:0,label:""}};
// The fields an undo snapshot restores — everything except the history itself.
export const FIELDS = ["round","targetPts","deaths","threshold","imposters","sabotageMax",
  "impostersCaught","sabotagesUsed","sabotageSet","banner","paused","timer","phase","meet"];

/* ---------------- reporting ---------------- */
let pass=0, failed=0, sec="";
const fails=[], notes=[];
export const pageErrs=[];
export const section = t => {sec=t; console.log("\n== "+t+" ==")};
export const check = (n,c,d) => {
  const tail = d===undefined || d===null ? "" : "  — "+String(d).slice(0,220);
  if(c){pass++; console.log("  [x] "+n+(process.env.VERBOSE?tail:""))}
  else{failed++; fails.push(sec+" › "+n+tail); console.log("  [FAIL] "+n+tail)}
  return !!c;
};
export const note = m => {notes.push(sec+": "+m); console.log("   · "+m)};
export const eq = (a,b) => JSON.stringify(a)===JSON.stringify(b);
export const pick = (s,keys=FIELDS) => keys.reduce((o,k)=>(o[k]=s[k],o),{});
export const diff = (a,b,keys=FIELDS) => keys.filter(k=>!eq(a[k],b[k]))
  .map(k=>`${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`).join("; ");

/* ---------------- browser ---------------- */
export const RUN = process.env.RUN_ID || Math.random().toString(36).slice(2,8);
export const gid = n => n+"-"+RUN;
export const settle = ms => new Promise(r=>setTimeout(r,ms));

let browser=null; const contexts=[];
export const boot = async () => {
  browser = await chromium.launch({
    // let AudioContext start without a gesture so the sound paths run for real
    args:["--no-sandbox","--autoplay-policy=no-user-gesture-required","--mute-audio"],
    ...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{})});
  return browser;
};
export const newCtx = async opts => {const c = await browser.newContext(opts||{}); contexts.push(c); return c};

// One device. `name` is the logical game name; it is suffixed per run so a
// long-lived emulator never leaks yesterday's state into a "fresh game" check.
export const mk = async (view, name, {connect=true, ctx=null, gameId=null}={}) => {
  const id = gameId || gid(name);
  const context = ctx || await newCtx();
  const p = await context.newPage();
  p.__game = id; p.__view = view;
  p.on("pageerror", e => pageErrs.push(`${id}${view}: ${e}`));
  await p.goto(`${BASE}/#${view}`, {waitUntil:"domcontentloaded"});
  if(connect){
    await p.evaluate(c => localStorage.setItem("fpCfg",c), JSON.stringify({cfg:CFG, gameId:id}));
    await p.reload({waitUntil:"domcontentloaded"});
    // The app gives fbBackend 8s and then falls back to demo mode for good, so a
    // slow first connect is unrecoverable without a reload. That hazard has its
    // own test (test_refresh "a slow first connect"); here we just retry once so
    // a busy machine does not flake every other suite.
    try{ await live(p, 25000) }
    catch(e){
      await p.reload({waitUntil:"domcontentloaded"});
      await live(p, 40000);
    }
  }
  return p;
};
export const live = async (p, ms=40000) => {
  const ok = await p.waitForFunction("window.__conn && window.__conn()==='live'", null, {timeout:ms})
    .then(()=>true, ()=>false);
  if(!ok){
    const c = await p.evaluate("window.__conn && window.__conn()").catch(()=>"?");
    throw new Error(`device never reached live sync in ${ms}ms (dot="${c}"). `+
      `The app gives fbBackend 8s and then falls back to demo mode for good — `+
      `a slow first connect looks exactly like this.`);
  }
  return true;
};

export const st     = p => p.evaluate("window.__state()");
export const snd    = p => p.evaluate("window.__sound()");
export const sndReset = p => p.evaluate("window.__soundReset()");
// Fresh sound logs on a set of devices, so a check only sees what it caused.
export const clearSounds = ps => Promise.all(ps.map(sndReset));
export const conn   = p => p.evaluate("window.__conn()");
export const act    = (p,f,...a) => p.evaluate(`window.act.${f}(${a.map(x=>JSON.stringify(x)).join(",")})`);
export const until  = (p,expr,ms=15000) => p.waitForFunction(expr,null,{timeout:ms});
export const softUntil = (p,expr,ms=15000) => until(p,expr,ms).then(()=>true,()=>false);
export const html   = p => p.evaluate("document.getElementById('app').innerHTML");
export const btnText= p => p.evaluate(()=>[...document.querySelectorAll("button")].map(b=>b.textContent.trim()));

// Buttons are matched on the START of their label: the Undo button embeds the
// last action's name ("↩ Undo — New round"), so a substring match picks the
// wrong one. Also waits, because any snapshot re-renders the whole view.
export const btnBy = async (p, startsWith, {ms=8000, soft=false}={}) => {
  const ok = await p.waitForFunction(
    t=>[...document.querySelectorAll("button")].some(b=>b.textContent.trim().startsWith(t)),
    startsWith, {timeout:ms}).then(()=>true,()=>false);
  if(!ok){
    if(soft) return null;
    throw new Error(`no button starting "${startsWith}" — have: ${(await btnText(p)).join(" | ")}`);
  }
  const h = await p.evaluateHandle(
    t=>[...document.querySelectorAll("button")].find(b=>b.textContent.trim().startsWith(t))||null, startsWith);
  return h.asElement();
};
// Click by label, tolerating the re-render that any incoming snapshot causes.
export const tap = async (p, startsWith) => {
  for(let i=0;i<4;i++){
    const el = await btnBy(p, startsWith, {soft:true, ms:i?1500:6000});
    if(!el) {await settle(150); continue}
    try{ await el.click({timeout:4000}); return true }
    catch(e){ await settle(150) }        // element detached mid-render — re-query
  }
  return false;
};
// The destructive actions open a confirmation dialog: act.<x>() only asks, and
// act.confirmYes() does the work. These are the dialog's confirm labels, so a
// click-driven test can find the right button (CONFIRMS in index.html).
export const CONFIRM_YES = {pauseGame:"Pause the game", newRound:"Start the new round", forget:"Disconnect"};
// Ask and answer in one go, by script. Deliberately not click-driven: most
// callers only want the round moved on as setup, and several drive it from a
// desk phone, where the button itself no longer lives — New round belongs to
// the Game Master now. Sections that test the buttons click them for real.
export const confirmAct = async (p, fn) => {
  await act(p, fn);
  await settle(140);
  await act(p, "confirmYes");
};
export const confirmPause = p => confirmAct(p, "pauseGame");
// New round, verified. Snapshots re-render the view constantly, so a call can
// land mid-repaint and be dropped — check the round actually moved and retry.
export const confirmNewRound = async (p, tries=3) => {
  const r0 = (await st(p)).round;
  for(let i=0;i<tries;i++){
    await act(p,"confirmNo");                 // drop any dialog an earlier try left open
    await confirmAct(p,"newRound");
    for(let w=0; w<24; w++){
      if((await st(p)).round === r0+1) return true;
      await settle(150);
    }
  }
  return (await st(p)).round === r0+1;
};
// Is the confirmation dialog on screen, and what does it say?
export const modal = p => p.evaluate(()=>{
  const m=document.querySelector(".modal"); if(!m)return null;
  return {title:m.querySelector("h2")?.textContent||"", body:m.querySelector("p")?.textContent||"",
    buttons:[...m.querySelectorAll("button")].map(b=>b.textContent.trim())};
});

// Poll until every device reports identical game state (history excluded — it
// is deliberately last-write-wins). Returns {ok, state} or {ok:false, detail}.
export const allAgree = async (pages, ms=12000) => {
  const t0 = Date.now(); let states = [];
  while(Date.now()-t0 < ms){
    states = await Promise.all(pages.map(p=>st(p)));
    const base = JSON.stringify(pick(states[0]));
    if(states.every(s=>JSON.stringify(pick(s))===base)) return {ok:true, state:states[0], states};
    await settle(250);
  }
  return {ok:false, states,
    detail: states.map((s,i)=>`${i}:${JSON.stringify(pick(s))}`).join("\n     ").slice(0,600)};
};

/* ---------------- emulator ground truth ---------------- */
export const raw = async gameId => {
  const r = await fetch(`http://${EMU_HOST}:${EMU_PORT}/v1/projects/${PROJECT}/databases/(default)/documents/games/${gameId}`,
    {headers:{Authorization:"Bearer owner"}});
  return r.ok ? r.json() : null;
};

/* ---------------- finish ---------------- */
export const finish = async label => {
  for(const c of contexts) await c.close().catch(()=>{});
  if(browser) await browser.close().catch(()=>{});
  console.log("\n────────────────────────────────────────────");
  console.log(`backend: ${EMU?"REAL Firestore emulator @ "+EMU_HOST+":"+EMU_PORT:"protocol mock"}   run id: ${RUN}`);
  console.log(`checks : ${pass} passed, ${failed} failed`);
  if(notes.length){console.log("notes:"); notes.forEach(n=>console.log("   · "+n))}
  if(fails.length){console.log("failures:"); fails.forEach(f=>console.log("   ✗ "+f))}
  console.log(`${label}:`, failed===0?"PASS":"FAIL");
  process.exit(failed===0?0:1);
};
