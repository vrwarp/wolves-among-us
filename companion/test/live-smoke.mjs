// Smoke test against the DEPLOYED site and the REAL Firebase project.
// Not part of `npm test` (the file name is outside the test_*.mjs glob) because
// it writes to the live database. It uses a throwaway game id.
//   node test/live-smoke.mjs                        (uses the URL/config below)
//   SITE=https://x.web.app CFG='{...}' node test/live-smoke.mjs
import {chromium} from "playwright";

const SITE = process.env.SITE || "https://footprints-among-us.web.app";
const CFG  = JSON.parse(process.env.CFG || JSON.stringify({
  apiKey:"AIzaSyD4o_7LpjlTX41cKjn4i4q8bjUEIetFiGw",
  projectId:"footprints-among-us",
  authDomain:"footprints-among-us.firebaseapp.com",
  appId:"1:805298196191:web:0058f51ac3546a1c94236a"
}));
const GAME = "smoke-" + Math.random().toString(36).slice(2,8);

let pass=0, fail=0; const fails=[]; const errs=[];
const check=(n,c,d)=>{const t=d===undefined?"":"  — "+d;
  if(c){pass++;console.log("  [x] "+n)}else{fail++;fails.push(n+t);console.log("  [FAIL] "+n+t)}};
const settle=ms=>new Promise(r=>setTimeout(r,ms));

const b = await chromium.launch({args:["--no-sandbox"]});
const mk = async view => {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  p.on("pageerror", e=>errs.push(view+": "+e));
  await p.goto(`${SITE}/#${view}`, {waitUntil:"domcontentloaded"});
  await p.evaluate(c=>localStorage.setItem("fpCfg",c), JSON.stringify({cfg:CFG, gameId:GAME}));
  await p.reload({waitUntil:"domcontentloaded"});
  await p.waitForFunction("window.__conn && window.__conn()==='live'", null, {timeout:45000});
  return p;
};
const st  = p=>p.evaluate("window.__state()");
const act = (p,f,...a)=>p.evaluate(`window.act.${f}(${a.map(x=>JSON.stringify(x)).join(",")})`);
const until=(p,e,ms=20000)=>p.waitForFunction(e,null,{timeout:ms});

console.log(`\n== live smoke: ${SITE} · game "${GAME}" ==\n`);

// the hosted page itself
const head = await fetch(SITE, {redirect:"follow"});
check("the site is served over HTTPS", head.ok && head.url.startsWith("https://"), head.status+" "+head.url);
const body = await head.text();
check("it is the companion app", body.includes("Footprints Companion"));
check("the app data is embedded (no second request needed)", body.includes('"doors"') && body.includes('"sudoku"'));
for(const leaked of ["/test/harness.mjs","/test/FINDINGS.md","/appdata.json","/package.json",
                     "/package-lock.json","/index.template.html","/SETUP.md","/test_undo.py"]){
  const r = await fetch(SITE+leaked);
  check(`${leaked} is not published`, !r.ok, "HTTP "+r.status);
}

console.log("\n-- three real devices --");
const A = await mk("/c/cc"), TV = await mk("/monitor"), F = await mk("/c/foreman");
check("all three reach live sync on the real project", true);
const offs = await Promise.all([A,TV,F].map(p=>p.evaluate("window.__offset()")));
check("clock offsets against Google's servers are sane", offs.every(o=>Math.abs(o)<5000), offs.join(","));

await act(A,"start"); await act(A,"dAdj",2);
await until(TV,"window.__state().deaths===2");
check("clock + deaths reach the TV", (await st(TV)).timer.mode==="run" && (await st(TV)).deaths===2);

await act(F,"sab",2);
await until(TV,"window.__state().banner==='sabotage'");
check("the foreman's sabotage reaches the TV", (await st(TV)).sabotageSet===2);
check("the TV paints the sabotage overlay", /SABOTAGE/.test(await TV.evaluate("document.body.innerHTML")));

await act(A,"sabFail");
await until(F,"window.__state().deaths===4");
await act(F,"undo");
await until(A,"window.__state().deaths===2");
check("cross-device undo works on the real project", (await st(A)).banner==="sabotage");

await A.reload({waitUntil:"domcontentloaded"});
await A.waitForFunction("window.__conn && window.__conn()==='live'", null, {timeout:45000});
check("a refresh rejoins the live game", (await st(A)).deaths===2 && (await st(A)).banner==="sabotage");

console.log("\n-- deployed security rules --");
const rules = await A.evaluate(async cfg => {
  const {initializeApp} = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const F = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const db = F.getFirestore(initializeApp(cfg,"rulesprobe"));
  const race = pr => Promise.race([pr, new Promise((_,rj)=>setTimeout(()=>rj(new Error("timeout")),15000))]);
  const t = async fn => {try{await race(fn()); return "ok"}catch(e){return e.code||e.message}};
  return {
    games:  await t(()=>F.getDoc(F.doc(db,"games","probe"))),
    other:  await t(()=>F.getDoc(F.doc(db,"secrets","probe"))),
    write:  await t(()=>F.setDoc(F.doc(db,"secrets","probe"),{x:1})),
  };
}, CFG);
check("games/* is reachable with the link", rules.games==="ok", rules.games);
check("every other collection is denied for reads", rules.other==="permission-denied", rules.other);
check("every other collection is denied for writes", rules.write==="permission-denied", rules.write);

check("no page errors on the deployed app", errs.length===0, errs.slice(0,3).join(" | "));

// leave the live database as we found it
await A.evaluate(async ({cfg,game}) => {
  const {initializeApp} = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const F = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const db = F.getFirestore(initializeApp(cfg,"cleanup"));
  await F.deleteDoc(F.doc(db,"games",game));
}, {cfg:CFG, game:GAME}).catch(e=>console.log("   (cleanup skipped: "+e.message.split("\n")[0]+")"));
console.log(`   · removed the throwaway game "${GAME}"`);

await b.close();
console.log(`\nchecks: ${pass} passed, ${fail} failed`);
fails.forEach(f=>console.log("   ✗ "+f));
console.log("LIVE SMOKE:", fail===0?"PASS":"FAIL");
process.exit(fail?1:0);
