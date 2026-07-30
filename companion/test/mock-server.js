const http=require("http"),fs=require("fs"),path=require("path"),url=require("url");
const ROOT=path.join(__dirname,"..");            // serves companion/
const docs={},watchers={};                        // path -> data / [res]
const deep=(a,b)=>{for(const k in b){const v=b[k];
  if(v&&typeof v==="object"&&!Array.isArray(v)&&!("__st"in v)&&a[k]&&typeof a[k]==="object"&&!Array.isArray(a[k]))deep(a[k],v);
  else a[k]=resolve(v);}return a};
const resolve=v=>{if(v&&typeof v==="object"){if("__st"in v)return{__ts:Date.now()};
  const o=Array.isArray(v)?[]:{};for(const k in v)o[k]=resolve(v[k]);return o}return v};
const emit=p=>{const msg=`data: ${JSON.stringify({data:docs[p]||null})}\n\n`;
  (watchers[p]||[]).forEach(r=>r.write(msg))};
http.createServer((req,res)=>{
  const u=url.parse(req.url,true);
  if(u.pathname==="/db/doc"){const p=u.query.path;
    res.setHeader("content-type","application/json");
    return res.end(JSON.stringify({exists:p in docs,data:docs[p]||null}));}
  if(u.pathname==="/db/set"){let b="";req.on("data",c=>b+=c);req.on("end",()=>{
    const {path:p,data,merge}=JSON.parse(b);
    // artificial 40ms server latency to mimic real round-trips
    setTimeout(()=>{docs[p]=merge?deep(docs[p]||{},data):resolve(data);emit(p);
      res.end("{}")},40)});return;}
  if(u.pathname==="/db/watch"){const p=u.query.path;
    res.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-cache"});
    (watchers[p]=watchers[p]||[]).push(res);
    res.write(`data: ${JSON.stringify({data:docs[p]||null})}\n\n`);
    req.on("close",()=>watchers[p]=watchers[p].filter(x=>x!==res));return;}
  let f=path.join(ROOT,u.pathname==="/"?"index.html":u.pathname);
  if(!f.startsWith(ROOT))return res.end();
  fs.readFile(f,(e,d)=>{if(e){res.statusCode=404;return res.end()}
    res.setHeader("content-type",f.endsWith(".js")?"application/javascript":f.endsWith(".html")?"text/html":"application/octet-stream");
    res.end(d)});
}).listen(8124,()=>console.log("mock firestore + static on :8124"));
