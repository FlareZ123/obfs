export function normalize(value){return String(value).trim().toLowerCase();}
export async function run(value){return await protectedDigest(normalize(value));}
const _scorpc_5a34a50ba09df7ff4674=async(method,args)=>{const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({method,args})});const payload=await response.json();if(!response.ok||!payload||payload.ok!==true)throw Error("Remote operation failed");return payload.value;};
export async function protectedDigest(value){return await _scorpc_5a34a50ba09df7ff4674("md23be4e911e0a935c17a4866",[...arguments]);}
