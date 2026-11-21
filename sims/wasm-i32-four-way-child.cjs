'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');

/** @typedef {{a:number,b:number,c:number,d:number,label:string}} InputRecord */

/** @param {string} text @returns {string} */
function digest(text){return createHash('sha256').update(text).digest('hex');}

/**
 * One variant in one newly spawned Node process. This deliberately avoids
 * cross-variant JIT feedback and ESM module-cache reuse. The process setup
 * remains outside the child timeline and is measured by the parent.
 * @returns {Promise<void>}
 */
async function main(){
  const folder=process.argv[2];
  assert.ok(folder&&path.isAbsolute(folder),'Expected absolute graph folder');
  const inputs=/** @type {InputRecord[]} */ (
    JSON.parse(fs.readFileSync(0,'utf8')));
  assert.ok(Array.isArray(inputs)&&inputs.length>0);
  /** @type {{value:number,label:string}[]} */
  const callbacks=[];
  (/** @type {any} */(globalThis)).externalBridge={
    /** @param {number} value @param {string} label @returns {string} */
    deliver(value,label){
      callbacks.push({value,label});
      return label+':'+(value>>>0).toString(16);
    }
  };
  const before=performance.now();
  const app=/** @type {{run:(a:number,b:number,c:number,d:number,label:string)=>string}} */ (
    await import(pathToFileURL(path.join(folder,'entry.mjs')).href));
  const imported=performance.now();
  /** @type {string[]} */
  const outputs=[];
  for(const row of inputs)
    outputs.push(app.run(row.a,row.b,row.c,row.d,row.label));
  const finished=performance.now();
  assert.equal(callbacks.length,inputs.length);
  assert.ok(imported-before>0&&finished-imported>0);
  process.stdout.write(JSON.stringify({
    importMs:imported-before,
    workMs:finished-imported,
    totalMs:finished-before,
    outputHash:digest(JSON.stringify(outputs)),
    callbackHash:digest(JSON.stringify(callbacks)),
    callbacks:callbacks.length
  })+'\n');
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
