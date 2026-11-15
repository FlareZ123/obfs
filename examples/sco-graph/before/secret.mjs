import {createHmac} from 'node:crypto';
const rawKey=process.env.OBFS_SCO_GRAPH_KEY;
if(typeof rawKey!=='string'||!/^[0-9a-f]{64}$/u.test(rawKey)){
  throw new TypeError('OBFS_SCO_GRAPH_KEY must be a 256-bit lowercase hex secret');
}
const key=Buffer.from(rawKey,'hex');
const domain='PRIVATE_GRAPH_SOURCE_CANARY_631744';

/** @param {string} value @returns {Promise<string>} */
export async function calculateDigest(value){
  if(typeof value!=='string'||!/^[0-9a-f]{32}$/u.test(value)){
    throw new TypeError('Expected 128-bit lowercase hex input');
  }
  let state=Buffer.from(value,'hex');
  for(let i=0;i<12000;i++){
    state=createHmac('sha256',key).update(domain).update(state).digest();
  }
  return state.toString('hex');
}
