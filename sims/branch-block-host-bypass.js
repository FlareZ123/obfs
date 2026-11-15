'use strict';

const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/**
 * Strip a published, visible, body-level host guard from a generated ESM
 * module. This attacker needs neither its build seed nor its source input.
 * The exact guard syntax is public and static in the distributed bundle.
 * @param {string} published
 * @returns {string}
 */
function stripPublicHostGuard(published) {
  const prefix=';(()=>{const h=globalThis.location?.hostname?.toLowerCase();';
  const start=published.indexOf(prefix);
  if(start<0)throw new TypeError('Published host guard was not found');
  const end=published.indexOf('})();',start);
  if(end<0)throw new TypeError('Published host guard termination missing');
  return published.slice(0,start)+published.slice(end+5);
}

/**
 * Test that an instrumented, attacker-owned ESM environment can remove
 * authorization logic from distributed output. A Node global location
 * simulation isolates the host check without claiming a real browser
 * origin spoof, and the protected function remains functional afterward.
 * @returns {Promise<void>}
 */
async function main() {
  const original='export function gate(x){return x?((x^5)?((x*7)|3):((x+9)>>>1)):((x-13)^2);}';
  const selected=obfuscateFiles([{
    path:'gate.mjs',sourceType:'module',code:original
  }],{
    mode:'coo',seed:'host-guard-test',
    properties:false,identifiers:false,strings:false,
    experimentalBranchBlocks:{'gate.mjs':['gate']},
    experimentalBranchStateBlinding:true,
    allowedHosts:['allowed.example']
  });
  assert.equal(selected.files[0].metrics.branchFunctions,1);
  const published=/** @type {string} */ (selected.files[0].code);
  const attack=stripPublicHostGuard(published);
  assert.notEqual(attack,published);
  assert.ok(!attack.includes('Unauthorized execution host'));
  /** @param {string} code */
  async function load(code){
    return /** @type {Promise<{gate:(x:number)=>number}>} */ (
      import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
    );
  }
  const originalLocation=Object.getOwnPropertyDescriptor(globalThis,'location');
  Object.defineProperty(globalThis,'location',{
    configurable:true,value:{hostname:'untrusted.example'}
  });
  try {
    await assert.rejects(load(published),/Unauthorized execution host/u);
    const modified=await load(attack);
    assert.equal(modified.gate(5),7);
    assert.equal(modified.gate(0),-15);
    console.log(JSON.stringify({
      host:'untrusted.example',authorizedHost:'allowed.example',
      unmodifiedDenied:true,modifiedExecuted:true,
      patchedBytes:published.length-attack.length
    }));
  }finally{
    if(originalLocation===undefined)Reflect.deleteProperty(globalThis,'location');
    else Object.defineProperty(globalThis,'location',originalLocation);
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={stripPublicHostGuard};
