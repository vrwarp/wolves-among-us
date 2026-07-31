// Multi-device test of the REAL fbBackend code path.
// Default: mock backend (test/mock).  EMU=1: real Firestore emulator on 127.0.0.1:8080.
import {chromium} from "playwright";
const BASE="http://localhost:8124";
const CFG={cfg:process.env.EMU
    ?{apiKey:"demo",projectId:"demo-footprints",emulatorHost:"127.0.0.1",emulatorPort:8080}
    :{apiKey:"demo",projectId:"demo-footprints",sdkBase:BASE+"/test/mock"},
  gameId:"night-1"};
const errs=[],results=[];
const check=(name,cond)=>{results.push(!!cond);console.log((cond?"  [x] ":"  [FAIL] ")+name)};
const launch=async()=>{
  const opts={args:["--no-sandbox"]};
  if(process.env.CHROME_EXECUTABLE)opts.executablePath=process.env.CHROME_EXECUTABLE;
  return chromium.launch(opts);
};
const b=await launch();
const mk=async view=>{
  const ctx=await b.newContext();const p=await ctx.newPage();
  p.on("pageerror",e=>errs.push(view+": "+e));
  await p.goto(`${BASE}/#${view}`,{waitUntil:"domcontentloaded"});
  await p.evaluate(c=>localStorage.setItem("fpCfg",c),JSON.stringify(CFG));
  await p.reload({waitUntil:"domcontentloaded"});
  await p.waitForFunction("window.__conn && window.__conn()==='live'",null,{timeout:20000});
  return p;
};
const st=p=>p.evaluate("window.__state()");
const act=(p,f,...a)=>p.evaluate(`window.act.${f}(${a.map(x=>JSON.stringify(x)).join(",")})`);
const until=(p,expr)=>p.waitForFunction(expr,null,{timeout:10000});

console.log("== two devices connected live ==");
const A=await mk("/c/cc"), B=await mk("/monitor");
check("A and B both live",await st(A)&&await st(B));
await act(A,"start");await act(A,"dAdj",1);await act(A,"sab");
await until(B,"window.__state().banner==='sabotage' && window.__state().deaths===1");
let sB=await st(B);
check("B sees A's clock running",sB.timer.mode==="run");
check("B sees death=1, five props, phase SABOTAGE",sB.deaths===1&&sB.sabItems.length===5&&sB.phase.label==="SABOTAGE");
// The props are drawn, not picked from a printed set, so the only thing that
// can be asserted about them is that there is ONE draw and both screens have it.
let sA0=await st(A);
check("A and B hold the same drawn props, in the same order",
  JSON.stringify(sB.sabItems)===JSON.stringify(sA0.sabItems));
check("no prop was drawn twice",new Set(sB.sabItems).size===sB.sabItems.length);
const tvList=await B.evaluate(()=>{const d=document.querySelector(".overlay.sab .items");
  return d?d.innerHTML.split(/<br\s*\/?>/i).map(x=>x.replace(/<[^>]*>/g,"").trim()).filter(Boolean):null});
check("the TV has painted exactly that list",JSON.stringify(tvList)===JSON.stringify(sB.sabItems));

console.log("== mid-game join must NOT reset the game (regression) ==");
const C=await mk("/c/ghost");
await new Promise(r=>setTimeout(r,1200));
let sA=await st(A),sC=await st(C);
check("after C joins: deaths still 1 on A",sA.deaths===1);
check("after C joins: sabotage still active on A",sA.banner==="sabotage");
check("after C joins: clock still running on A",sA.timer.mode==="run");
check("C sees the live game, not defaults",sC.deaths===1&&sC.banner==="sabotage");
check("C reads the draw already in progress rather than making its own",
  JSON.stringify(sC.sabItems)===JSON.stringify(sA.sabItems)&&sC.sabItems.length===5);

console.log("== compound action + cross-device undo ==");
await act(A,"sabFail");
await until(C,"window.__state().deaths===3");
check("C sees sabotage-fail deaths=3",(await st(C)).deaths===3);
await act(C,"undo");
await until(A,"window.__state().deaths===1");
sA=await st(A);
check("A sees C's undo: deaths=1, sabotage restored",sA.deaths===1&&sA.banner==="sabotage"&&sA.phase.label==="SABOTAGE");
await act(A,"sabOk");
await until(B,"window.__state().banner==='none'");
check("B sees success clear the banner",(await st(B)).banner==="none");

console.log("== clock offset probe ==");
const offs=[];for(const p of [A,B,C])offs.push(await p.evaluate("window.__offset()"));
console.log("   offsets ms:",offs);
check("offsets sane (<5s)",offs.every(o=>Math.abs(o)<5000));
check("no page errors",errs.length===0);
if(errs.length)console.log("   ",errs.slice(0,4));
await b.close();
const pass=results.every(Boolean);
console.log("MULTI-DEVICE TEST:",pass?"PASS":"FAIL");
process.exit(pass?0:1);
