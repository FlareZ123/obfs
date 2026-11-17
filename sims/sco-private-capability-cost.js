'use strict';

const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
const {createScoCapabilityScope,createScoPrivateHandles}=require('../src/sco-capabilities');
const scope=createScoCapabilityScope(()=> 'alice');
const handles=createScoPrivateHandles(scope.currentPrincipal);
const request=/** @type {import('node:http').IncomingMessage} */ (/** @type {unknown} */ ({}));

/** @param {number} rounds @returns {number} */
function work(rounds){
 let hash=Buffer.alloc(32);
 for(let i=0;i<rounds;i++)hash=createHash('sha256').update(hash).digest();
 return hash[0];
}

/** @param {number} rounds @param {number} calls @returns {Promise<void>} */
async function bench(rounds,calls){
 let token='';
 await scope.runRpcIsolated(request,async()=>{token=handles.issue({rounds});});
 for(let trial=0;trial<3;trial++){
  let check=0;
  const nativeStart=performance.now();
  for(let k=0;k<calls;k++)check+=work(rounds);
  const nativeMs=performance.now()-nativeStart;
  let wrappedMs=0;
  await scope.runRpcIsolated(request,async()=>{
   const start=performance.now();
   for(let k=0;k<calls;k++){
    check+=handles.use(token,entry=>work(/** @type {{rounds:number}} */ (entry).rounds));
   }
   wrappedMs=performance.now()-start;
  });
  console.log(JSON.stringify({rounds,calls,trial,nativeMs,wrappedMs,
    ratio:wrappedMs/nativeMs,check}));
 }
}

(async()=>{
 for(const rounds of [1,64,256])await bench(rounds,1000);
})().catch(error=>{console.error(error);process.exitCode=1;});
