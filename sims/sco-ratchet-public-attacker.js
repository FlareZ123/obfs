'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');

/** @param {number} index @returns {string} */
function challenge(index){
  return createHash('sha256').update('held-out/'+index).digest('hex');
}

/**
 * This attacker process receives a service URL and an authenticated A cookie.
 * It fetches only the actually published ESM client and calls it through an
 * instrumented fetch binding. No B cookie, server key, transition code or
 * original implementation is passed into this process. The same local
 * filesystem remains visible, so this is process separation rather than an
 * operating-system sandbox.
 *
 * @param {string} base
 * @param {string} credential
 * @returns {Promise<{publicSha256:string,guessesForB:string[]}>}
 */
async function attack(base,credential){
  const realFetch=globalThis.fetch;
  const sourceResponse=await realFetch(base+'/obfs/public.mjs',{
    headers:{cookie:'session='+credential}
  });
  assert.equal(sourceResponse.status,200);
  const source=await sourceResponse.text();
  const publicSha256=createHash('sha256').update(source).digest('hex');
  // Hostile client instrumentation can wrap global fetch. Here it routes the
  // compiler's same-origin absolute RPC URL to the real A-authorized server.
  globalThis.fetch=(input,options)=>realFetch(new URL(/** @type {string} */(input),base),{
    ...options,
    headers:{...options?.headers,cookie:'session='+credential}
  });
  const clientUrl='data:text/javascript;base64,'+Buffer.from(source).toString('base64');
  const client=/** @type {{default:{step:(seq:number,input:string)=>Promise<string>}}} */
    (await import(clientUrl)).default;
  /** @type {string[]} */
  const guessesForB=[];
  for(let index=0;index<32;index++){
    guessesForB.push(await client.step(index,challenge(index)));
  }
  return {publicSha256,guessesForB};
}

if(require.main===module){
  const base=process.argv[2],credential=process.argv[3];
  if(!base||!credential)throw new TypeError('A-only attacker requires URL and authorized token A');
  attack(base,credential).then(result=>process.stdout.write(JSON.stringify(result)+'\n'),
    error=>{process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;});
}
module.exports={attack};
