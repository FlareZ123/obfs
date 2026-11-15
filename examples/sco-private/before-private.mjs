import {createHmac} from 'node:crypto';

// The original implementation stays on the trusted server. Do not publish it
// as a client file or let the client request its source.
const secretHex=process.env.OBFS_SCO_DEMO_KEY;
if(typeof secretHex!=='string'||!/^[0-9a-f]{64}$/.test(secretHex)) {
  throw new Error('Set a private 32-byte hexadecimal OBFS_SCO_DEMO_KEY');
}
const secret=Buffer.from(secretHex,'hex');

/**
 * Coarse-grained server-private keyed computation.
 * 15,000 rounds make the RPC hop small relative to actual work on loopback.
 * This demonstration API is still a callable oracle for an authorized client.
 * @param {string} value A lowercase 128-bit hexadecimal input.
 * @returns {Promise<string>} A lowercase 256-bit hexadecimal output.
 */
export async function derive(value) {
  if(typeof value!=='string'||!/^[0-9a-f]{32}$/.test(value)){
    throw new TypeError('Input must be 128-bit lowercase hex');
  }
  let state=Buffer.from(value,'hex');
  for(let i=0;i<15000;i++) {
    state=createHmac('sha256',secret).update(state).digest();
  }
  return state.toString('hex');
}
