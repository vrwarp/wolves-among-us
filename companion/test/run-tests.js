// Orchestrator: start the static/mock server, wait for it, run the browser tests.
//   node test/run-tests.js mock            — app's real Firestore code path vs mock backend
//   node test/run-tests.js emu             — same, vs the real Firestore emulator on :8080
//   node test/run-tests.js emu a.mjs b.mjs — only those test files
// (use via: npm test / npm run test:emulator)
const {spawn}=require("child_process"),http=require("http"),path=require("path"),fs=require("fs");
const mode=process.argv[2]||"mock";
const only=process.argv.slice(3);
const files=only.length?only:fs.readdirSync(__dirname).filter(f=>/^test_.*\.mjs$/.test(f)).sort();
const server=spawn("node",[path.join(__dirname,"mock-server.js")],{stdio:"inherit"});
const waitPort=(tries=50)=>new Promise((res,rej)=>{
  const ping=n=>http.get("http://localhost:8124/db/doc?path=_/ping",r=>{r.resume();res()})
    .on("error",()=>n<=0?rej(new Error("server never came up")):setTimeout(()=>ping(n-1),200));
  ping(tries);
});
const run=file=>new Promise(res=>{
  console.log("\n─── "+file+" ───");
  const t=spawn("node",[path.join(__dirname,file)],
    {stdio:"inherit",env:{...process.env,...(mode==="emu"?{EMU:"1"}:{})}});
  t.on("exit",c=>res(c||0));
});
(async()=>{
  const bad=[];
  try{
    await waitPort();
    for(const f of files) if(await run(f)) bad.push(f);
  }catch(e){console.error(String(e));bad.push("harness")}
  server.kill();
  if(files.length>1){
    console.log(`\n════ ${files.length-bad.length}/${files.length} test files passed ════`);
    bad.forEach(f=>console.log("   ✗ "+f));
  }
  process.exit(bad.length?1:0);
})();
