// Protocol-faithful mock of the slice of Firestore the app uses.
// Semantics mirrored from docs: setDoc replaces; setDoc{merge:true} deep-merges
// maps, REPLACES arrays/primitives; serverTimestamp resolves server-side.
const BASE=location.origin;
export const getFirestore=app=>({app});
export const connectFirestoreEmulator=()=>{};
export const doc=(db,col,id)=>({path:col+"/"+id});
export const serverTimestamp=()=>({__st:1});
const wrap=v=>{
  if(v&&typeof v==="object"){
    if("__ts" in v)return{toMillis:()=>v.__ts};
    const o=Array.isArray(v)?[]:{};for(const k in v)o[k]=wrap(v[k]);return o;
  }return v;
};
export async function getDoc(ref){
  const r=await fetch(`${BASE}/db/doc?path=${encodeURIComponent(ref.path)}`);
  const j=await r.json();
  return{exists:()=>j.exists,data:()=>wrap(j.data)};
}
export async function setDoc(ref,data,opts){
  const r=await fetch(`${BASE}/db/set`,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({path:ref.path,data,merge:!!(opts&&opts.merge)})});
  if(!r.ok)throw new Error("set failed "+r.status);
}
export function onSnapshot(ref,_opts,cb,errCb){
  const es=new EventSource(`${BASE}/db/watch?path=${encodeURIComponent(ref.path)}`);
  es.onmessage=e=>{const j=JSON.parse(e.data);
    cb({data:()=>wrap(j.data),metadata:{hasPendingWrites:false,fromCache:false}})};
  es.onerror=()=>{if(errCb)errCb(new Error("watch lost"))};
  return()=>es.close();
}
