'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {piggybackShards}=require('../workplace/coo-piggyback-shards');

/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  return (sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2;
}

/**
 * Cold function calls begin only after independent ESM graphs are loaded.
 * No generated decoder has run before its timed first call. Native and
 * encoded imports are interleaved to avoid a fixed ordering advantage.
 *
 * @param {number} [pairs]
 * @returns {Promise<object>}
 */
async function firstUseCurve(pairs=48){
  if(!Number.isSafeInteger(pairs)||pairs<8||pairs>256)throw new RangeError('Expected 8..256 pairs');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-piggyback-first-'));
  /** @type {Array<object>} */
  const observations=[];
  try{
    for(const codeUnits of [52,512,4096]){
      const value='A\\u0000\\ud800\\u2603Z0123456789'.repeat(Math.ceil(codeUnits/15)).slice(0,codeUnits);
      assert.equal(value.length,codeUnits);
      const consumer='import {factor} from "./constants.mjs";\\n'+
        'export function message(){return '+JSON.stringify(value)+';}\\n';
      const donor='export const factor=7;\\n';
      const generated=piggybackShards({
        consumer:{path:'app.mjs',code:consumer,sourceType:'module'},
        donor:{path:'constants.mjs',code:donor,sourceType:'module'}
      },{seed:'firstuse-'+codeUnits,functionName:'message',closedWorld:true});
      assert.equal(generated.transformed,true);
      /** @type {number[]} */
      const nativeNs=[];
      /** @type {number[]} */
      const encodedNs=[];
      /** @type {number[]} */
      const pairRatios=[];
      for(let index=0;index<pairs;index++){
        const originalRoot=path.join(dir,String(codeUnits),String(index),'original');
        const encodedRoot=path.join(dir,String(codeUnits),String(index),'encoded');
        await Promise.all([
          atomicWrite(path.join(originalRoot,'app.mjs'),consumer),
          atomicWrite(path.join(originalRoot,'constants.mjs'),donor),
          ...generated.files.map(file=>atomicWrite(path.join(encodedRoot,file.path),file.code))
        ]);
        const first=index%2===0?'original':'encoded';
        const second=first==='original'?'encoded':'original';
        /** @type {Record<string,()=>string>} */
        const calls={};
        for(const variant of [first,second]){
          const root=variant==='original'?originalRoot:encodedRoot;
          const mod=await import(pathToFileURL(path.join(root,'app.mjs')).href);
          calls[variant]=mod.message;
        }
        /** @type {Record<string,number>} */
        const elapsed={};
        for(const variant of [first,second]){
          const start=process.hrtime.bigint();
          const actual=calls[variant]();
          elapsed[variant]=Number(process.hrtime.bigint()-start);
          assert.equal(actual,value);
        }
        nativeNs.push(elapsed.original);
        encodedNs.push(elapsed.encoded);
        pairRatios.push(elapsed.encoded/elapsed.original);
      }
      observations.push({
        codeUnits,pairs,
        firstUse:{
          nativeMedianNs:median(nativeNs),encodedMedianNs:median(encodedNs),
          medianOfPairedRatios:median(pairRatios),
          ratioOfMedians:median(encodedNs)/median(nativeNs),
          strictPairedBreaches:pairRatios.filter(ratio=>ratio>2.5).length,
          maximumPairedRatio:Math.max(...pairRatios)
        },
        samples:{nativeNs,encodedNs}
      });
    }
    return {node:process.version,platform:process.platform,
      scope:'native Node ESM, first function call after graph import; excludes module import time',
      strictCeiling:2.5,
      observations};
  }finally{await fs.rm(dir,{recursive:true,force:true});}
}

if(require.main===module){
  firstUseCurve().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={firstUseCurve};
