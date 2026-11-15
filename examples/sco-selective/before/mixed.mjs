export function normalize(value){return String(value).trim().toLowerCase();}
export const fastScore=value=>((value*31)^0x4d13)|0;
function privateRound(current,key,createHmac){
  return createHmac('sha256',key).update(current).digest();
}
export async function protectedDigest(value){
  const {createHmac}=await import('node:crypto');
  const privateKey=Buffer.from('SCO_SELECTIVE_SERVER_ONLY_CANARY_73159');
  let current=Buffer.from(value,'utf8');
  for(let round=0;round<16000;round++)current=privateRound(current,privateKey,createHmac);
  return current.toString('hex');
}
export function report(value){return globalThis.externalBridge.accept(fastScore(value));}
export async function combined(value){
  const digest=await protectedDigest(normalize(value));
  return fastScore(value.length)+':'+digest;
}
