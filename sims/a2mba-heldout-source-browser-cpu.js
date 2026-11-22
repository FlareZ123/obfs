'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const puppeteer=require('puppeteer-core');
const esbuild=require('esbuild');
const {recoverRotatedCoreSource}=require('./a2mba-rotated-core-static-recover');
const {selectedHeldoutSources}=require('./a2mba-heldout-source-paired-cpu');

/** @typedef {'native'|'minNative'|'protected'|'minProtected'} Lane */
/** @typedef {Record<Lane,number[]>} Timings */

/** @param {number[]} nums @returns {number} */
function median(nums) {
  const copy=[...nums].sort((a,b)=>a-b);
  return copy[Math.floor(copy.length/2)];
}

/**
 * Measure the same published held-out generated protected source and its
 * native/native-minified/protected-minified controls in actual Chromium.
 * The paired inner loops run in the renderer, with kernel functions captured
 * before timing. performance.now() is a wall clock, NOT process CPU time.
 * Browser/page startup and all JavaScript parsing/compilation are excluded.
 *
 * @param {{count?:number,trials?:number}} [options]
 * @returns {Promise<{chrome:string,node:string,count:number,trials:number,
 *   clock:string,rows:Array<{index:number,rotation:number,sourceSha256:string,
 *   minProtectedSha256:string,ratios:Record<'protectedOverNative'|
 *   'protectedOverMinNative'|'minProtectedOverNative'|'minProtectedOverMinNative',number>,
 *   breaches:Record<'protectedOverNative'|'protectedOverMinNative'|
 *   'minProtectedOverNative'|'minProtectedOverMinNative',number>,samples:Timings}>}>}
 */
async function runChromium(options={}) {
  const count=options.count??5000000;
  const trials=options.trials??7;
  assert.ok(Number.isSafeInteger(count)&&count>0);
  assert.ok(Number.isSafeInteger(trials)&&trials>0);
  const browser=await puppeteer.launch({
    executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
    headless:true,protocolTimeout:180000,
    args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
  });
  /** @type {Array<{index:number,rotation:number,sourceSha256:string,
   * minProtectedSha256:string,ratios:Record<'protectedOverNative'|
   * 'protectedOverMinNative'|'minProtectedOverNative'|'minProtectedOverMinNative',number>,
   * breaches:Record<'protectedOverNative'|'protectedOverMinNative'|
   * 'minProtectedOverNative'|'minProtectedOverMinNative',number>,samples:Timings}>} */
  const rows=[];
  try {
    const chrome=await browser.version();
    for(const example of selectedHeldoutSources()){
      const recovered=recoverRotatedCoreSource(example.source);
      assert.equal(recovered.rotation,example.rotation);
      const target=[...example.source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\(/gm)]
        .at(-1)?.[1];
      assert.ok(target);
      const native=recovered.recoveredSource;
      const rawProtected='globalThis.__protected=(function(){\n'+example.source+
        '\nreturn '+target+';})();';
      const nativeMin=esbuild.transformSync(
        'globalThis.__minNative=('+native+');',
        {target:'es2022',format:'iife',minify:true}).code;
      const protectedMin=esbuild.transformSync(
        rawProtected.replace('globalThis.__protected=','globalThis.__minProtected='),
        {target:'es2022',format:'iife',minify:true}).code;
      const page=await browser.newPage();
      try {
        await page.goto('about:blank');
        await page.addScriptTag({content:
          'globalThis.__native=('+native+');\n'+rawProtected+'\n'+
          nativeMin+'\n'+protectedMin});
        const measured=await page.evaluate(({count,trials})=>{
          /** @type {('native'|'minNative'|'protected'|'minProtected')[]} */
          const names=['native','minNative','protected','minProtected'];
          const globals=/** @type {Record<string,any>} */ (globalThis);
          const kernels={
            native:/** @type {(a:number,b:number,c:number,d:number)=>number} */(globals.__native),
            minNative:/** @type {(a:number,b:number,c:number,d:number)=>number} */(globals.__minNative),
            protected:/** @type {(a:number,b:number,c:number,d:number)=>number} */(globals.__protected),
            minProtected:/** @type {(a:number,b:number,c:number,d:number)=>number} */(globals.__minProtected)
          };
          /** @param {(a:number,b:number,c:number,d:number)=>number} kernel */
          function makeWork(kernel) {
            /** @param {number} size @param {number} seed */
            return function work(size,seed){
              let state=seed|0;
              let sum=0;
              for(let index=0;index<size;index++){
                state=(Math.imul(state,1664525)+1013904223)|0;
                sum=(sum+kernel(state,index|0,(state^index)|0,
                  Math.imul(state,0x45d9f3b)))|0;
              }
              return sum|0;
            };
          }
          const work={
            native:makeWork(kernels.native),
            minNative:makeWork(kernels.minNative),
            protected:makeWork(kernels.protected),
            minProtected:makeWork(kernels.minProtected)
          };
          /** @type {Record<'native'|'minNative'|'protected'|'minProtected',number[]>} */
          const samples={native:[],minNative:[],protected:[],minProtected:[]};
          for(let warmup=0;warmup<4;warmup++){
            const seed=(0x12345678^Math.imul(warmup+1,0x9e3779b1))|0;
            const expected=work.native(200000,seed);
            for(const name of names)
              if(work[name](200000,seed)!==expected)throw Error('warmup parity '+name);
          }
          /** @type {number[]} */
          const checksums=[];
          for(let trial=0;trial<trials;trial++){
            const seed=(0x12345678^Math.imul(trial+17,0x9e3779b1))|0;
            const sequence=names.slice(trial%4).concat(names.slice(0,trial%4));
            /** @type {number|null} */
            let previous=null;
            for(const lane of sequence) {
              const start=performance.now();
              const checksum=work[lane](count,seed);
              const time=performance.now()-start;
              if(previous===null){previous=checksum;checksums.push(checksum);}
              else if(checksum!==previous)throw Error('protected-native parity '+lane);
              if(!Number.isFinite(time)||time<=0)throw Error('invalid browser clock');
              samples[lane].push(time);
            }
          }
          if(new Set(checksums).size<2)throw Error('nonvarying benchmark checksums');
          return {samples,checksums,clock:'Chromium renderer performance.now wall milliseconds'};
        },{count,trials});
        /** @type {Timings} */
        const samples=measured.samples;
        const pairs={
          protectedOverNative:samples.protected.map((t,i)=>t/samples.native[i]),
          protectedOverMinNative:samples.protected.map((t,i)=>t/samples.minNative[i]),
          minProtectedOverNative:samples.minProtected.map((t,i)=>t/samples.native[i]),
          minProtectedOverMinNative:samples.minProtected.map((t,i)=>t/samples.minNative[i])
        };
        /** @type {Record<'protectedOverNative'|'protectedOverMinNative'|'minProtectedOverNative'|'minProtectedOverMinNative',number>} */
        const ratios={
          protectedOverNative:median(samples.protected)/median(samples.native),
          protectedOverMinNative:median(samples.protected)/median(samples.minNative),
          minProtectedOverNative:median(samples.minProtected)/median(samples.native),
          minProtectedOverMinNative:median(samples.minProtected)/median(samples.minNative)
        };
        const breaches={
          protectedOverNative:pairs.protectedOverNative.filter(x=>x>2.5).length,
          protectedOverMinNative:pairs.protectedOverMinNative.filter(x=>x>2.5).length,
          minProtectedOverNative:pairs.minProtectedOverNative.filter(x=>x>2.5).length,
          minProtectedOverMinNative:pairs.minProtectedOverMinNative.filter(x=>x>2.5).length
        };
        rows.push({index:example.index,rotation:example.rotation,
          sourceSha256:createHash('sha256').update(example.source).digest('hex'),
          minProtectedSha256:createHash('sha256').update(protectedMin).digest('hex'),
          ratios,breaches,samples});
      }finally {
        await page.close();
      }
    }
    return {chrome,node:process.version,count,trials,
      clock:'Chromium renderer performance.now wall milliseconds',rows};
  }finally {
    await browser.close();
  }
}

if(require.main===module)runChromium().then(result=>
  console.log(JSON.stringify(result,null,2))).catch(error=>{
  console.error(error);
  process.exitCode=1;
});
module.exports={runChromium};
