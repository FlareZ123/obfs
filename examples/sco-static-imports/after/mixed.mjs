export function format(value){return value.trim().toUpperCase();}
export async function combined(value){return format(value)+':'+await protectedDigest(value);}
const _scorpc_0e3dca508e54dc438ae4=async(method,args)=>{const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({method,args})});const payload=await response.json();if(!response.ok||!payload||payload.ok!==true)throw Error("Remote operation failed");return payload.value;};
export async function protectedDigest(value){return await _scorpc_0e3dca508e54dc438ae4("m3219835f95b93ae28d4e3c1e",[...arguments]);}
