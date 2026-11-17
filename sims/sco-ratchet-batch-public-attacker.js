'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');

/** @param {number} index @returns {string} */
function challenge(index){
  return createHash('sha256').update('batch-event/'+index).digest('hex');
}

/**
 * An A-only runtime attacker imports the *actually emitted* SCO ESM facade in
 * a separate Node process and instruments its fetch to attach the caller's
 * valid A cookie. The attacker has no B cookie, HMAC root or private module.
 * Process separation is not a hardened filesystem/memory sandbox.
 *
 * @param {string} base
 * @param {string} token
 * @returns {Promise<{publicSha256:string,outputs:string[]}>}
 */
async function attack(base,token){
  const realFetch=globalThis.fetch;
  const response=await realFetch(base+'/obfs/batch.mjs',{
    headers:{cookie:'session='+token}
  });
  assert.equal(response.status,200);
  const source=await response.text();
  const publicSha256=createHash('sha256').update(source).digest('hex');
  globalThis.fetch=(input,options)=>realFetch(new URL(/** @type {string} */(input),base),{
    ...options,
    headers:{...options?.headers,cookie:'session='+token}
  });
  const clientUrl='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
  const imported=/** @type {{default:{batch:(seq:number,inputs:string[])=>Promise<string[]>}}} */
    (await import(clientUrl));
  const inputs=Array.from({length:32},(_,index)=>challenge(index));
  const outputs=await imported.default.batch(0,inputs);
  assert.equal(outputs.length,32);
  return {publicSha256,outputs};
}

if(require.main===module){
  const base=process.argv[2],token=process.argv[3];
  if(!base||!token)throw new TypeError('Missing A-only attacker endpoint or credential');
  attack(base,token).then(value=>process.stdout.write(JSON.stringify(value)+'\n'),
    error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});
}
module.exports={attack};
