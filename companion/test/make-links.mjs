// Build the five ready-to-open device links for a game night, then prove two of
// them actually join the same live game on the deployed site — and leave the
// game document pristine afterwards.
//   node test/make-links.mjs                 (random game id)
//   GAME=night-1 node test/make-links.mjs    (pick your own)
import {chromium} from "playwright";

const SITE = process.env.SITE || "https://footprints-among-us.web.app";
const CFG = {
  apiKey:"AIzaSyD4o_7LpjlTX41cKjn4i4q8bjUEIetFiGw",
  authDomain:"footprints-among-us.firebaseapp.com",
  projectId:"footprints-among-us",
  storageBucket:"footprints-among-us.firebasestorage.app",
  messagingSenderId:"805298196191",
  appId:"1:805298196191:web:0058f51ac3546a1c94236a"
};
// The game id is the only thing protecting the game — anyone with a link can
// change the state — so make it unguessable rather than "footprints".
const GAME = process.env.GAME ||
  "night-" + [...crypto.getRandomValues(new Uint8Array(5))].map(b=>"abcdefghjkmnpqrstuvwxyz23456789"[b%31]).join("");

// same encoding the app's own share button uses
const b64url = o => Buffer.from(JSON.stringify(o),"utf8").toString("base64")
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const token = b64url({cfg:CFG, gameId:GAME});
const VIEWS = [["/monitor","TV Monitor"],["/c/gm","Game Master"],["/c/cc","Central Command"],
               ["/c/foreman","Foreman (all floor counselors)"],["/kiosk","Sabotage Kiosk"]];
const link = v => `${SITE}/#${v}?cfg=${token}`;

console.log(`\ngame id: ${GAME}\n`);
for(const [v,name] of VIEWS) console.log(`${name.padEnd(16)} ${link(v)}\n`);

/* ---- prove two of them really join the same live game ---- */
const b = await chromium.launch({args:["--no-sandbox"]});
const errs=[];
const open = async v => {
  const p = await (await b.newContext()).newPage();     // no storage: a fresh phone
  p.on("pageerror", e=>errs.push(v+": "+e));
  await p.goto(link(v), {waitUntil:"domcontentloaded"});
  await p.waitForFunction("window.__conn && window.__conn()==='live'", null, {timeout:45000});
  return p;
};
let ok = true;
const say = (n,c)=>{ok = ok && c; console.log((c?"  [x] ":"  [FAIL] ")+n)};
try{
  const CC = await open("/c/cc"), TV = await open("/monitor");
  say("a fresh phone opening the CC link is live, no typing", true);
  const gid = await CC.evaluate("JSON.parse(localStorage.getItem('fpCfg')).gameId");
  say(`both devices landed on game "${GAME}"`, gid===GAME);
  say("CC shows the Central Command view", /Central Command/.test(await CC.evaluate("document.body.innerHTML")));
  await CC.evaluate("window.act.dAdj(1)");
  await TV.waitForFunction("window.__state().deaths===1", null, {timeout:20000});
  say("a tap on CC reaches the TV", true);
  say("no page errors", errs.length===0);

  // leave the night's game document untouched
  await CC.evaluate(async ({cfg,game}) => {
    const {initializeApp} = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    const F = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    await F.deleteDoc(F.doc(F.getFirestore(initializeApp(cfg,"cleanup")),"games",game));
  }, {cfg:CFG, game:GAME});
  console.log(`\n  · reset "${GAME}" — the first device to open a link will start it fresh`);
}catch(e){ ok=false; console.log("  [FAIL] "+String(e).split("\n")[0]) }
await b.close();
console.log("\nLINKS:", ok?"VERIFIED":"FAILED");
process.exit(ok?0:1);
