'use strict';

const assert=require('node:assert/strict');
const {mkdtemp,rm}=require('node:fs/promises');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const path=require('node:path');
const os=require('node:os');
const esbuild=require('esbuild');
const {atomicWrite}=require('../src/atomic');

/** @typedef {'native'|'minified'|'wasm'} Mode */
/** @typedef {{importMs:number,workMs:number,totalMs:number,callbacks:number,outputSHA256:string}} Receipt */
/** @typedef {{native:Receipt,minified:Receipt,wasm:Receipt}} Trial */

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}
/** @param {number} value @returns {string} */
function digit(value){return Number(value.toFixed(5)).toString();}

/**
 * Fixed-source, first-use Node CPU comparison. A strict >2.5x sample
 * is a veto for that tested workload, irrespective of passing medians.
 * Each arm's new Node child independently imports its actual artifact,
 * then executes one full stateful session with the same deterministic input.
 * @param {number} [trials]
 * @returns {Promise<{sourceSHA256:Record<string,string>,node:string,results:unknown[]}>}
 */
async function runThreeWayColdBudget(trials=7){
  const root=path.join(__dirname,'../examples/stateful-arx-app');
  const control=await esbuild.build({entryPoints:[path.join(root,'native/entry.mjs')],
    bundle:true,write:false,minify:true,platform:'neutral',format:'esm',
    target:'es2022',sourcemap:false,logLevel:'silent'});
  assert.equal(control.outputFiles?.length,1);
  const bytes=/** @type {import('esbuild').OutputFile[]} */(control.outputFiles)[0].contents;
  const directory=await mkdtemp(path.join(os.tmpdir(),'obfs-stateful-arx-cost-'));
  const controlPath=path.join(directory,'ordinary-control.mjs');
  try{
    await atomicWrite(controlPath,Buffer.from(bytes));
    /** @type {Record<Mode,string>} */
    const paths={
      native:path.join(root,'native/entry.mjs'),
      minified:controlPath,
      wasm:path.join(root,'wasm/entry.mjs')
    };
    /** @type {unknown[]} */
    const results=[];
    for(const count of [1,50,1000,10000]){
      /** @type {Trial[]} */
      const rows=[];
      const orders=/** @type {Mode[][]} */([
        ['native','minified','wasm'],
        ['wasm','minified','native'],
        ['minified','native','wasm']
      ]);
      for(let trial=0;trial<trials;trial++){
        /** @type {Partial<Trial>} */
        const row={};
        for(const mode of orders[trial%orders.length]){
          const result=execFileSync(process.execPath,
            [path.join(__dirname,'stateful-arx-cold-child.cjs'),paths[mode],String(count)],
            {encoding:'utf8',timeout:30000,windowsHide:true});
          row[mode]=/** @type {Receipt} */(JSON.parse(result));
          assert.equal(row[mode]?.callbacks,count);
        }
        assert.ok(row.native&&row.minified&&row.wasm);
        assert.equal(row.minified.outputSHA256,row.native.outputSHA256);
        assert.equal(row.wasm.outputSHA256,row.native.outputSHA256);
        rows.push(/** @type {Trial} */(row));
      }
      const wasmTotal=rows.map(row=>row.wasm.totalMs/row.native.totalMs);
      const minifiedTotal=rows.map(row=>row.minified.totalMs/row.native.totalMs);
      const wasmWork=rows.map(row=>row.wasm.workMs/row.native.workMs);
      const minifiedWork=rows.map(row=>row.minified.workMs/row.native.workMs);
      results.push({records:count,trials,
        wasmTotalRatios:wasmTotal.map(digit),
        minifiedTotalRatios:minifiedTotal.map(digit),
        wasmWorkRatios:wasmWork.map(digit),
        minifiedWorkRatios:minifiedWork.map(digit),
        wasmTotalMedian:median(wasmTotal),minifiedTotalMedian:median(minifiedTotal),
        wasmStrictTotalBreaches:wasmTotal.filter(x=>x>2.5).length,
        minifiedStrictTotalBreaches:minifiedTotal.filter(x=>x>2.5).length,
        wasmStrictWorkBreaches:wasmWork.filter(x=>x>2.5).length,
        minifiedStrictWorkBreaches:minifiedWork.filter(x=>x>2.5).length,
        firstSHA256:rows[0].native.outputSHA256
      });
    }
    return {sourceSHA256:{
      control:createHash('sha256').update(bytes).digest('hex'),
      wasm:'820810c29949179df5e2cc2d7246b15efe1267fe898390703fc77e3df4f9a96f'
    },node:process.version,results};
  }finally{
    await rm(directory,{recursive:true,force:true});
  }
}
module.exports={runThreeWayColdBudget};
if(require.main===module){
  runThreeWayColdBudget().then(result=>
    console.log('STATEFUL_ARX_THREE_WAY_COLD_CPU '+JSON.stringify(result)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
