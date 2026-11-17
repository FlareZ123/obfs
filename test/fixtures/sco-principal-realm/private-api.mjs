import {createHmac} from 'node:crypto';
import {advance} from './private-counter.mjs';

// This original source belongs exclusively to the trusted SCO server.
const root=process.env.SCO_REALM_SECRET;
const principal=process.env.SCO_REALM_PRINCIPAL;
export async function tick(expectedSequence,input,bytes){
  const sequence=advance(expectedSequence);
  const work=Buffer.alloc(bytes,sequence&255);
  const key=createHmac('sha256',root).update(principal).digest();
  const tag=createHmac('sha256',key).update(String(sequence))
    .update(String(input)).update(work).digest('hex');
  return {sequence,tag};
}
