'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {build}=require('../examples/polyvariant-app/build.cjs');

/** @param {number[]} values @returns {number} */
function median(values) {
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * @param {string} directory
 * @param {{path:string,code:string}[]} files
 * @returns {Promise<void>}
 */
async function materialize(directory,files) {
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
}

/**
 * Measure a full ESM module-graph import, all application event processing
 * and the external host emission contract. Files have already been copied.
 * Every invocation uses a fresh directory and thus uncached ESM module URLs.
 * @param {string} directory
 * @param {{kind:string,payload:string}[]} records
 * @returns {Promise<{ms:number,output:string,emitted:number}>}
 */
async function run(directory,records) {
  const start=performance.now();
  const app=await import(pathToFileURL(path.join(directory,'entry.mjs')).href);
  let emitted=0;
  const output=app.runScenario(-817,records,{emit(){emitted++;}});
  return {ms:performance.now()-start,output,emitted};
}

/** @returns {Promise<void>} */
async function main() {
  const names=['math.mjs','state.mjs','entry.mjs'];
  const native=await Promise.all(names.map(async name=>({
    path:name,code:(await fs.readFile(path.join(__dirname,
      '../examples/polyvariant-app/native',name),'utf8')).replace(/\r\n/g,'\n')
  })));
  const protectedFiles=(await build()).files.map(file=>({
    path:file.path,code:/** @type {string} */ (file.code)
  }));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-polyvariant-app-budget-'));
  /** @type {{events:number,nativeMs:number,protectedMs:number,ratio:number}[]} */
  const results=[];
  try {
    for(const events of [1,50,1000,10000]) {
      const records=Array.from({length:events},(_,i)=>({
        kind:['start','tick','pause','stop'][i%4],
        payload:'data-'+i+(i%11===0?'終':'')
      }));
      const nativeTrials=[],protectedTrials=[];
      for(let trial=0;trial<7;trial++) {
        /** @type {string|null} */
        let expected=null;
        const order=trial%2===0?['native','protected']:['protected','native'];
        const pair={
          native:path.join(root,'native-'+events+'-'+trial),
          protected:path.join(root,'protected-'+events+'-'+trial)
        };
        await materialize(pair.native,native);
        await materialize(pair.protected,protectedFiles);
        for(const variant of order) {
          const measured=await run(variant==='native'?pair.native:pair.protected,records);
          assert.equal(measured.emitted,events);
          if(expected===null)expected=measured.output;
          else assert.equal(measured.output,expected);
          (variant==='native'?nativeTrials:protectedTrials).push(measured.ms);
        }
      }
      const nativeMs=median(nativeTrials),protectedMs=median(protectedTrials);
      results.push({events,nativeMs,protectedMs,ratio:protectedMs/nativeMs});
    }
    process.stdout.write(JSON.stringify({
      node:process.version,platform:process.platform,
      sourceBytes:native.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0),
      transformedBytes:protectedFiles.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0),
      method:'Seven alternating fresh 3-file ESM import + stateful-event sessions; external host callbacks and outputs verified',
      results
    },null,2)+'\n');
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
