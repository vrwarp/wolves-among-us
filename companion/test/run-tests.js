// Orchestrator: start the mock/static server, wait for it, run the browser test.
//   node test/run-tests.js mock   — app's real Firestore code path vs mock backend
//   node test/run-tests.js emu    — same, vs the real Firestore emulator on :8080
//                                   (use via: npm run test:emulator)
const {spawn}=require("child_process"),http=require("http"),path=require("path");
const mode=process.argv[2]||"mock";
const root=path.join(__dirname,"..");
const server=spawn("node",[path.join(__dirname,"mock-server.js")],{stdio:"inherit"});
const waitPort=(tries=50)=>new Promise((res,rej)=>{
  const ping=n=>http.get("http://localhost:8124/db/doc?path=_/ping",r=>{r.resume();res()})
    .on("error",()=>n<=0?rej(new Error("server never came up")):setTimeout(()=>ping(n-1),200));
  ping(tries);
});
(async()=>{
  try{
    await waitPort();
    const test=spawn("node",[path.join(__dirname,"test_multidevice.mjs")],
      {stdio:"inherit",env:{...process.env,...(mode==="emu"?{EMU:"1"}:{})}});
    test.on("exit",code=>{server.kill();process.exit(code)});
  }catch(e){console.error(String(e));server.kill();process.exit(1)}
})();
