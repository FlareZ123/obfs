export function normalize(value){return String(value).trim().toLowerCase();}
export const fastScore=value=>((value*31)^0x4d13)|0;
export function report(value){return globalThis.externalBridge.accept(fastScore(value));}
export async function combined(value){
  const digest=await protectedDigest(normalize(value));
  return fastScore(value.length)+':'+digest;
}
const _scorpc_ce197e6827b994207cf4=async(method,args)=>{const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({method,args})});const payload=await response.json();if(!response.ok||!payload||payload.ok!==true)throw Error("Remote operation failed");return payload.value;};
export async function protectedDigest(value){return await _scorpc_ce197e6827b994207cf4("m8d09c15d82e7887e71d44de0",[...arguments]);}
