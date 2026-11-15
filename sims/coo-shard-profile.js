'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {shardTopLevelStrings}=require('../workplace/coo-shard-strings');

/** @typedef {{medianMs:number,samples:number[]}} Sample */
/** @typedef {{original:Sample,sharded:Sample,ratio:number}} Comparison */

/** @param {number[]} values @returns {number} */
function median(values) {
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/** @param {number[]} original @param {number[]} sharded @returns {Comparison} */
function compare(original,sharded) {
  return {original:{medianMs:median(original),samples:original},
    sharded:{medianMs:median(sharded),samples:sharded},
    ratio:median(sharded)/median(original)};
}

/** @param {Function} get @param {number} iterations @returns {number} */
function hot(get,iterations) {
  let checksum=0;
  for(let i=0;i<iterations;i++)checksum+=get()[2];
  return checksum;
}

/**
 * Distinguish whole-graph ESM load time from steady-state calls, using unique
 * package directory roots so each import must load its own decoder and shares.
 * This is wall time including disk/cache/loader, not a pure CPU-only budget.
 * All trial files are built before timing and deleted afterward.
 *
 * @param {{pairs?:number,hotIterations?:number,hotTrials?:number}} [options]
 * @returns {Promise<object>}
 */
async function profile(options={}) {
  const pairs=options.pairs??40;
  const hotIterations=options.hotIterations??750000;
  const hotTrials=options.hotTrials??16;
  if(!Number.isSafeInteger(pairs)||pairs<6||pairs>200||
      !Number.isSafeInteger(hotIterations)||hotIterations<1000||
      !Number.isSafeInteger(hotTrials)||hotTrials<6)throw TypeError('Invalid profile parameters');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs31-coo-profile-'));
  try{
    const source=await fs.readFile(path.join(__dirname,'../examples/coo-shards/before/main.mjs'),'utf8');
    const output=shardTopLevelStrings({
      path:'examples/coo-shards/after/main.mjs',code:source,sourceType:'module'
    },{seed:'agent31-coo-sample-v1',names:['license','feature']});
    assert.equal(output.sharded,2);
    const graphBytes=output.files.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0);
    const sourceBytes=Buffer.byteLength(source);
    for(let i=0;i<pairs;i++) {
      for(const kind of ['original','sharded']) {
        const parent=path.join(root,String(i),kind);
        const files=kind==='original'
          ? [{path:'main.mjs',code:source}]
          : output.files.map(file=>({path:path.basename(file.path),code:file.code}));
        for(const file of files)await atomicWrite(path.join(parent,file.path),file.code);
      }
    }
    const originalTimes=[];
    const shardedTimes=[];
    /** @type {{original:Function,sharded:Function}|null} */
    let callable=null;
    for(let i=0;i<pairs;i++) {
      const order=i%2===0?['original','sharded']:['sharded','original'];
      /** @type {{[key:string]:any}} */
      const exported={};
      for(const kind of order) {
        const filename=path.join(root,String(i),kind,'main.mjs');
        const started=performance.now();
        exported[kind]=await import(pathToFileURL(filename).href);
        (kind==='original'?originalTimes:shardedTimes).push(performance.now()-started);
      }
      assert.deepEqual(exported.original.get(),exported.sharded.get());
      if(i===0)callable={original:exported.original.get,sharded:exported.sharded.get};
    }
    assert.ok(callable);
    const expected=hot(callable.original,hotIterations);
    assert.equal(hot(callable.sharded,hotIterations),expected);
    for(let i=0;i<8;i++) {
      hot(callable.original,hotIterations);
      hot(callable.sharded,hotIterations);
    }
    const originalHot=[];
    const shardedHot=[];
    for(let i=0;i<hotTrials;i++) {
      const order=i%2===0?['original','sharded']:['sharded','original'];
      for(const kind of order) {
        const started=performance.now();
        const checksum=hot(callable[kind],hotIterations);
        assert.equal(checksum,expected);
        (kind==='original'?originalHot:shardedHot).push(performance.now()-started);
      }
    }
    return {
      node:process.version,platform:process.platform,
      originalBytes:sourceBytes,shardedBytes:graphBytes,sourceGrowth:graphBytes/sourceBytes,
      protectedStrings:output.sharded,protectedCodeUnits:output.codeUnits,
      coldLoadWall:compare(originalTimes,shardedTimes),
      hotCalls:compare(originalHot,shardedHot),
      hotIterations,scope:'cold includes ESM disk/cache/loader wall time; hot is repeated decoded-const access'
    };
  } finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module){
  profile().then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={profile};
