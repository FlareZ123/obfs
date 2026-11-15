'use strict';

const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {pathToFileURL}=require('node:url');
const {shardNativeBitvectorModule}=require('../workplace/coo-native-shards');

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {(x:number)=>number} fn @param {number} calls @returns {number} */
function execute(fn,calls) {
  let checksum=0;
  for(let i=0;i<calls;i++)checksum^=fn((Math.imul(i,1664525)+1013904223)|0);
  return checksum|0;
}

/**
 * @param {string} uri
 * @param {number} calls
 * @returns {Promise<{elapsedMs:number,checksum:number}>}
 */
async function timedSession(uri,calls) {
  const begin=performance.now();
  const imported=await import(uri);
  const checksum=execute(/** @type {(x:number)=>number} */(imported.scramble),calls);
  return {elapsedMs:performance.now()-begin,checksum};
}

/**
 * Compare completed one-shot lifetimes, including module loading and work,
 * while excluding offline obfuscation and file writes from the interval.
 * This measures wall time, including asynchronous module graph loading.
 * @returns {Promise<void>}
 */
async function main() {
  const topology=process.argv.includes('--split')?'split':'paired';
  const source='export function scramble(x){return (((x^137)&(x>>>3))|(x<<7));}\n';
  const transformed=shardNativeBitvectorModule(
    {path:'main.mjs',sourceType:'module',code:source},
    {seed:'native-shard-session-2026',names:['scramble'],topology}).files;
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-native-shard-session-'));
  try {
    /** @param {string} name @param {{path:string,code:string}[]} files @returns {string} */
    function writeGraph(name,files) {
      const directory=path.join(root,name);
      fs.mkdirSync(directory,{recursive:true});
      for(const file of files) {
        fs.writeFileSync(path.join(directory,file.path),file.code,'utf8');
      }
      return pathToFileURL(path.join(directory,'main.mjs')).href;
    }
    /** @type {{calls:number,nativeMs:number,shardedMs:number,ratio:number}[]} */
    const rows=[];
    for(const calls of [0,1,16,1024,8192,65536]) {
      /** @type {number[]} */
      const native=[];
      /** @type {number[]} */
      const sharded=[];
      for(let trial=0;trial<52;trial++) {
        const n=writeGraph('n-'+calls+'-'+trial,[{path:'main.mjs',code:source}]);
        const s=writeGraph('s-'+calls+'-'+trial,transformed);
        const order=trial%2===0?[[n,native],[s,sharded]]:
          [[s,sharded],[n,native]];
        /** @type {number|undefined} */
        let nativeChecksum;
        /** @type {number|undefined} */
        let shardChecksum;
        for(const [uri,target] of order) {
          const result=await timedSession(/** @type {string} */(uri),calls);
          if(uri===n)nativeChecksum=result.checksum;
          else shardChecksum=result.checksum;
          if(trial>=12)(/** @type {number[]} */(target)).push(result.elapsedMs);
        }
        if(nativeChecksum!==shardChecksum)throw Error('Session checksum mismatch: '+calls);
      }
      const nativeMs=median(native),shardedMs=median(sharded);
      rows.push({calls,nativeMs,shardedMs,ratio:shardedMs/nativeMs});
    }
    console.log(JSON.stringify({node:process.version,topology,trialsPerCallCount:40,
      excludedWarmups:12,rows},null,2));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
