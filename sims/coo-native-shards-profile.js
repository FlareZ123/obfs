'use strict';

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {shardNativeBitvectorModule}=require('../workplace/coo-native-shards');

const source='export function scramble(x){return (((x^137)&(x>>>3))|(x<<7));}\n';

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {(x:number)=>number} fn @param {number} calls @returns {number} */
function work(fn,calls) {
  let value=0;
  for(let i=0;i<calls;i++)value^=fn((Math.imul(i,1664525)+1013904223)|0);
  return value;
}

/** @returns {Promise<void>} */
async function main() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-native-shard-profile-'));
  try {
    /** @type {number[]} */
    const native=[];
    /** @type {number[]} */
    const sharded=[];
    const graph=shardNativeBitvectorModule({path:'main.mjs',code:source,sourceType:'module'},
      {seed:'native-shard-cost',names:['scramble']}).files;
    /**
     * @param {string} folder
     * @param {{path:string,code:string}[]} files
     * @returns {string}
     */
    function emit(folder,files) {
      fs.mkdirSync(folder,{recursive:true});
      for(const file of files)fs.writeFileSync(path.join(folder,file.path),file.code,'utf8');
      return pathToFileURL(path.join(folder,'main.mjs')).href;
    }
    /**
     * @param {string} uri
     * @param {number[]} times
     * @returns {Promise<(x:number)=>number>}
     */
    async function timedImport(uri,times) {
      const start=performance.now();
      const imported=await import(uri);
      const result=imported.scramble(42);
      times.push(performance.now()-start);
      if(result!==(((42^137)&(42>>>3))|(42<<7)))throw Error('Changed result');
      return /** @type {(x:number)=>number} */ (imported.scramble);
    }
    /** @type {((x:number)=>number)|undefined} */
    let firstNative;
    /** @type {((x:number)=>number)|undefined} */
    let firstSharded;
    for(let i=0;i<88;i++) {
      const n=emit(path.join(root,'n'+i),[{path:'main.mjs',code:source}]);
      const s=emit(path.join(root,'s'+i),graph);
      const order=i%2===0?[[n,native,0],[s,sharded,1]]:
        [[s,sharded,1],[n,native,0]];
      for(const [uri,times,kind] of order) {
        const fn=await timedImport(/** @type {string} */(uri),/** @type {number[]} */(times));
        if(i===0 && kind===0)firstNative=fn;
        if(i===0 && kind===1)firstSharded=fn;
      }
    }
    if(!firstNative||!firstSharded)throw Error('Missing profile functions');
    for(let i=0;i<10;i++) {
      if(work(firstNative,200000)!==work(firstSharded,200000))throw Error('Hot mismatch');
    }
    /** @type {number[]} */
    const hotNative=[];
    /** @type {number[]} */
    const hotSharded=[];
    for(let i=0;i<21;i++) {
      const order=i%2===0?[[firstNative,hotNative],[firstSharded,hotSharded]]:
        [[firstSharded,hotSharded],[firstNative,hotNative]];
      for(const [fn,times] of order) {
        const start=performance.now();
        work(fn,600000);
        times.push(performance.now()-start);
      }
    }
    // Discard the first 16 imports to avoid startup JIT/loader warmup.
    const graphNative=median(native.slice(16)),graphSharded=median(sharded.slice(16));
    const hotN=median(hotNative),hotS=median(hotSharded);
    console.log(JSON.stringify({node:process.version,importPairs:72,hotTrials:21,hotCalls:600000,
      nativeLoadMs:graphNative,shardLoadMs:graphSharded,loadRatio:graphSharded/graphNative,
      nativeHotMs:hotN,shardHotMs:hotS,hotRatio:hotS/hotN},null,2));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
