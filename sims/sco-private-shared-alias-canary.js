'use strict';
const {createScoCapabilityScope,createScoPrivateHandles}=require('../src/sco-capabilities');
/** @param {string} id @returns {import('node:http').IncomingMessage} */
function request(id){return /** @type {import('node:http').IncomingMessage} */ (/** @type {unknown} */({id}));}
const scope=createScoCapabilityScope(request=>/** @type {{id:string}} */(/** @type {unknown} */(request)).id);
const handles=createScoPrivateHandles(scope.currentPrincipal);
const shared={counter:0};
(async()=>{
 let tokenA='',tokenB='';
 await scope.runRpcIsolated(request('account-A'),async()=>{tokenA=handles.issue(shared);});
 await scope.runRpcIsolated(request('account-B'),async()=>{tokenB=handles.issue(shared);});
 await scope.runRpcIsolated(request('account-A'),async()=>{
  handles.use(tokenA,value=>{/** @type {{counter:number}} */(value).counter++;});
 });
 let observedB=0;
 await scope.runRpcIsolated(request('account-B'),async()=>{
  observedB=handles.use(tokenB,value=>/** @type {{counter:number}} */(value).counter);
 });
 console.log(JSON.stringify({crossPrincipalReferenceAliasObserved:observedB===1,observedB}));
 if(observedB!==1)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
