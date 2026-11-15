const formatCount=function(value){return value.toString(16);};
function normalizeInput(value){return String(value).trim().toLowerCase();}
export function normalize(value){return normalizeInput(value);}
export function label(value){return formatCount(value.length);}
export async function combined(value){return formatCount(await secret(normalizeInput(value)));}
const _scorpc_268a6449d2a248fadcdf=async(method,args)=>{const response=await fetch("/obfs/rpc",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({method,args})});const payload=await response.json();if(!response.ok||!payload||payload.ok!==true)throw Error("Remote operation failed");return payload.value;};
export async function secret(value){return await _scorpc_268a6449d2a248fadcdf("m354b5b6db9469c3f90d67bff",[...arguments]);}
