const PRIVATE_KEY="SCO_PUBLIC_HELPER_PRIVATE_CANARY_5317";
const privateFold=value=>value.length+PRIVATE_KEY.length;
function normalizeInput(value){return String(value).trim().toLowerCase();}
const formatCount=function(value){return value.toString(16);};
export async function secret(value){return privateFold(value);}
export function normalize(value){return normalizeInput(value);}
export function label(value){return formatCount(value.length);}
export async function combined(value){return formatCount(await secret(normalizeInput(value)));}
