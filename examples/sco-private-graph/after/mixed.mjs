export function format(value){return value.trim().toUpperCase();}
export async function combined(value){return format(value)+':'+await protectedDigest(value);}
const _scorpc_6e682e0795fcad9e0d0f=async(method,args)=>{const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({method,args})});const payload=await response.json();if(!response.ok||!payload||payload.ok!==true)throw Error("Remote operation failed");return payload.value;};
export async function protectedDigest(value){return await _scorpc_6e682e0795fcad9e0d0f("m9d8dfc9e9a3e84269ffca9c0",[...arguments]);}
