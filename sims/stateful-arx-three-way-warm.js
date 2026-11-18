'use strict';

const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const esbuild=require('esbuild');
const {recordsFor}=require('./stateful-arx-minifier-control');

/** @typedef {{kind:unknown,payload:unknown}} InputRecord */
/** @typedef {{runScenario:(seed:number,records:InputRecord[],host:{emit:(event:unknown)=>void})=>string}} App */
/** @typedef {'native'|'minified'|'wasm'} Mode */

/** @param {number[]} values @returns {number} */
function median(values){
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * Hot-stateful-session CPU cost, including exactly the same JSON output
 * and one public host callback per record. This does not include COO startup,
 * and therefore cannot rescue a failed cold-start admission.
 *
 * @param {number} [trials]
 * @returns {Promise<{node:string,scenarios:unknown[]}>}
 */
async function runThreeWayWarmBudget(trials=9){
  const entry=path.join(__dirname,'../examples/stateful-arx-app/native/entry.mjs');
  const candidate=path.join(__dirname,'../examples/stateful-arx-app/wasm/entry.mjs');
  const bundle=await esbuild.build({entryPoints:[entry],bundle:true,write:false,
    minify:true,platform:'neutral',format:'esm',target:'es2022',
    sourcemap:false,logLevel:'silent'});
  assert.equal(bundle.outputFiles?.length,1);
  const bytes=/** @type {import('esbuild').OutputFile[]} */(bundle.outputFiles)[0].contents;
  const minifiedURL='data:text/javascript;base64,'+Buffer.from(bytes).toString('base64');
  /** @type {Record<Mode,App>} */
  const arms={
    native:/** @type {App} */(await import(pathToFileURL(entry).href)),
    wasm:/** @type {App} */(await import(pathToFileURL(candidate).href)),
    minified:/** @type {App} */(await import(minifiedURL))
  };
  /** @type {unknown[]} */
  const scenarios=[];
  for(const [count,repetitions] of [[1,50000],[50,600],[1000,30],[10000,3]]){
    const records=recordsFor(count);
    /** @param {App} app @returns {{cpuMs:number,bytes:number,callbacks:number}} */
    function measure(app){
      let callbacks=0,outputBytes=0;
      const start=process.cpuUsage();
      for(let trial=0;trial<repetitions;trial++){
        const result=app.runScenario(-817,records,{emit(){callbacks++;}});
        outputBytes+=result.length;
      }
      const cpu=process.cpuUsage(start);
      return {cpuMs:(cpu.user+cpu.system)/1000,bytes:outputBytes,callbacks};
    }
    for(let i=0;i<4;i++)for(const app of Object.values(arms))measure(app);
    /** @type {{native:number,minified:number,wasm:number}[]} */
    const rows=[];
    const orders=/** @type {Mode[][]} */([
      ['native','minified','wasm'],['wasm','minified','native'],
      ['minified','native','wasm']
    ]);
    for(let trial=0;trial<trials;trial++){
      /** @type {Partial<Record<Mode,ReturnType<typeof measure>>>} */
      const sample={};
      for(const mode of orders[trial%orders.length]){
        sample[mode]=measure(arms[mode]);
        assert.equal(sample[mode]?.callbacks,count*repetitions);
      }
      assert.ok(sample.native&&sample.minified&&sample.wasm);
      assert.equal(sample.minified.bytes,sample.native.bytes);
      assert.equal(sample.wasm.bytes,sample.native.bytes);
      for(const measured of [sample.native,sample.minified,sample.wasm])
        assert.ok(measured.cpuMs>0,'CPU sample beneath Windows timer resolution');
      rows.push({native:sample.native.cpuMs,
        minified:sample.minified.cpuMs,wasm:sample.wasm.cpuMs});
    }
    const ratios=rows.map(row=>({
      wasm:row.wasm/row.native,
      minified:row.minified/row.native,
      incremental:row.wasm/row.minified
    }));
    scenarios.push({recordsPerSession:count,repetitions,trials,
      nativeCpuMs:rows.map(row=>row.native),
      minifiedCpuMs:rows.map(row=>row.minified),
      wasmCpuMs:rows.map(row=>row.wasm),
      wasmOriginalRatios:ratios.map(row=>row.wasm),
      minifiedOriginalRatios:ratios.map(row=>row.minified),
      wasmMinifierRatios:ratios.map(row=>row.incremental),
      wasmMedian:median(ratios.map(row=>row.wasm)),
      minifiedMedian:median(ratios.map(row=>row.minified)),
      wasmStrictBreaches:ratios.filter(row=>row.wasm>2.5).length,
      minifiedStrictBreaches:ratios.filter(row=>row.minified>2.5).length
    });
  }
  return {node:process.version,scenarios};
}
module.exports={runThreeWayWarmBudget};
if(require.main===module){
  runThreeWayWarmBudget().then(result=>
    console.log('STATEFUL_ARX_THREE_WAY_WARM_CPU '+JSON.stringify(result)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
