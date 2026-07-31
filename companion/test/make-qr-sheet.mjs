// Render the five device links as QR codes and write a self-contained sheet
// (images embedded as data URIs — no network needed once it exists).
// Open it on the laptop/TV and let each counsellor scan their own row.
//   GAME=night-z7fgk node test/make-qr-sheet.mjs [outfile]
import {chromium} from "playwright";
import {writeFileSync} from "fs";

const SITE = process.env.SITE || "https://footprints-among-us.web.app";
const OUT  = process.argv[2] || "device-links.html";
const CFG = {
  apiKey:"AIzaSyD4o_7LpjlTX41cKjn4i4q8bjUEIetFiGw",
  authDomain:"footprints-among-us.firebaseapp.com",
  projectId:"footprints-among-us",
  storageBucket:"footprints-among-us.firebasestorage.app",
  messagingSenderId:"805298196191",
  appId:"1:805298196191:web:0058f51ac3546a1c94236a"
};
const GAME = process.env.GAME || "night-1";
const b64url = o => Buffer.from(JSON.stringify(o),"utf8").toString("base64")
  .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const token = b64url({cfg:CFG, gameId:GAME});
const VIEWS = [
  ["/monitor","TV Monitor","the big screen — big clock, deaths, sabotage callouts"],
  ["/c/gm","Game Master","outside the game: the round clock, the death-count dial, New round, and the only Undo"],
  ["/c/cc","Central Command","in the game, at the desk: meetings and their phases, ejections, deaths, sabotage"],
  ["/c/foreman","Foreman","sabotage + answers + your role crib"],
  ["/c/referee","Roaming Referee","sabotage + answers + your role crib"],
  ["/c/ghost","Ghost Guide","sabotage + answers + your role crib"],
];
const link = v => `${SITE}/#${v}?cfg=${token}`;

const b = await chromium.launch({args:["--no-sandbox"]});
const p = await (await b.newContext()).newPage();
await p.goto(SITE, {waitUntil:"domcontentloaded"});          // same origin, has the CDN allowed
const pngs = await p.evaluate(async links => {
  await new Promise((res,rej)=>{const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    s.onload=res; s.onerror=rej; document.head.appendChild(s)});
  const out=[];
  for(const url of links){
    const el=document.createElement("div"); document.body.appendChild(el);
    new QRCode(el,{text:url,width:420,height:420,correctLevel:QRCode.CorrectLevel.M});
    await new Promise(r=>setTimeout(r,120));
    const c=el.querySelector("canvas"), i=el.querySelector("img");
    out.push(c ? c.toDataURL("image/png") : i.src);
    el.remove();
  }
  return out;
}, VIEWS.map(([v])=>link(v)));
await b.close();

const rows = VIEWS.map(([v,name,desc],i)=>`
  <section>
    <img src="${pngs[i]}" alt="QR for ${name}">
    <div>
      <h2>${name}</h2>
      <p class="d">${desc}</p>
      <p class="u">${link(v)}</p>
    </div>
  </section>`).join("");

writeFileSync(OUT, `<!doctype html><meta charset="utf-8">
<title>Footprints — device links (${GAME})</title>
<style>
 body{font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
   margin:0;padding:26px;color:#1c1a18;background:#faf9f7;max-width:900px}
 h1{margin:0 0 2px;font-size:24px}
 .lede{color:#6b6660;margin:0 0 18px}
 .game{display:inline-block;font-weight:800;background:#1c1a18;color:#fff;padding:3px 10px;border-radius:20px;
   font-size:13px;letter-spacing:.04em}
 section{display:flex;gap:18px;align-items:center;background:#fff;border:1px solid #e2ded8;
   border-radius:14px;padding:14px;margin-bottom:12px;page-break-inside:avoid}
 img{width:190px;height:190px;flex:none;image-rendering:pixelated}
 h2{margin:0 0 2px;font-size:19px}
 .d{margin:0 0 8px;color:#6b6660;font-size:13.5px}
 .u{margin:0;font-size:9px;color:#9a958e;word-break:break-all;line-height:1.35}
 .warn{background:#fff7ed;border:1px solid #f0c9a8;color:#8a4b12;border-radius:10px;padding:10px 13px;
   font-size:13.5px;margin:0 0 18px}
 @media print{body{background:#fff}section{border-color:#ccc}}
</style>
<h1>Footprints Companion — device links</h1>
<p class="lede">Scan the row for your job. The link carries the connection and the view, so there is
nothing to type. Game <span class="game">${GAME}</span></p>
<p class="warn"><b>Before round 1:</b> check the dot on every phone is <b>green</b>. Grey means that phone
is talking to nobody and its taps are lost — refresh it once. Red means offline; it will catch up on its
own, so don't refresh.</p>
${rows}
<p class="lede" style="margin-top:16px">Anyone with one of these links can change the game state, and
the page contains every answer. Keep it off student devices, and delete the Firebase project afterwards.</p>
`);
console.log(`wrote ${OUT} — ${VIEWS.length} QR codes for game "${GAME}"`);
