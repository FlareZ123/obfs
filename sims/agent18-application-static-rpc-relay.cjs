'use strict';

const fs=require('node:fs/promises');
const {recoverStaticRpcContract}=require('./agent18-application-static-rpc-extractor.cjs');

/**
 * Fully independent static public-source clone. Its only code input is one
 * published SCO/ordinary facade file; it does not import or execute that file
 * and never imports any protected server implementation. Its only dynamic
 * authority is the legitimately supplied account token.
 *
 * @returns {Promise<void>}
 */
async function main(){
  const [publicFile,origin,token,serializedInputs]=process.argv.slice(2);
  if(!publicFile||!origin||!token||!serializedInputs){
    throw TypeError('Expected public facade, server origin, token, inputs');
  }
  const source=await fs.readFile(publicFile,'utf8');
  const contract=recoverStaticRpcContract(source);
  /** @type {[number,number][]} */
  const cases=JSON.parse(serializedInputs);
  if(!Array.isArray(cases)||cases.some(pair=>
    !Array.isArray(pair)||pair.length!==2||
    pair.some(item=>typeof item!=='number'||!Number.isInteger(item)))){
    throw TypeError('Expected numeric heldout pairs');
  }
  const endpoint=new URL(contract.endpoint,origin);
  /** @type {unknown[]} */
  const results=[];
  for(const args of cases){
    const response=await fetch(endpoint,{
      method:'POST',
      headers:{'content-type':'application/json','x-demo-token':token},
      body:JSON.stringify({method:contract.method,args})
    });
    if(!response.ok)throw Error('Authorized static RPC clone was denied: '+response.status);
    /** @type {{ok?:boolean,value?:unknown}} */
    const payload=await response.json();
    if(!payload||payload.ok!==true)throw Error('Invalid static RPC clone response');
    results.push(payload.value);
  }
  process.stdout.write(JSON.stringify(results)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
