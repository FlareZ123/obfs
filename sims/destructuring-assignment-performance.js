'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {obfuscateFiles}=require('../src');
const {normalizeDistributedFiles}=require('./attacker-token-normalize');

/** @typedef {'coo'|'sno'} Mode */
/** @typedef {'direct'|'default'|'forwarded'} Shape */
/** @typedef {{nativeMs:number,obfuscatedMs:number,ratio:number}} Sample */

/**
 * The owned object remains private and its two fields are primitive.
 * @param {Shape} shape
 * @returns {string}
 */
function fixture(shape) {
  const reader=shape==='forwarded' ?
    'function read(value){let captured=0;({score:captured}=value);return captured;}' : '';
  const body=shape==='forwarded' ?
    'total+=read(owner)+owner.weight;owner.score++;' :
    'let captured=0;({score:captured'+(shape==='default'?'=999':'')+'}=owner);'+
    'total+=captured+owner.weight;owner.score++;';
  return "'use strict';const owner={score:17,weight:13};"+reader+
    'function work(count){let total=0;for(let i=0;i<count;i++){'+body+
    '}return total;}module.exports=0;';
}

/**
 * Fresh VM compilation and context creation.
 * @param {string} source
 * @returns {(count:number)=>number}
 */
function instantiate(source) {
  /** @type {{module:{exports:number},work?:(count:number)=>number}} */
  const context={module:{exports:0}};
  vm.runInNewContext(source,context,{timeout:10000});
  if(typeof context.work!=='function')throw new TypeError('Missing benchmark function');
  return context.work;
}

/** @param {number[]} values @returns {number} */
function median(values) {
  if(!values.length)throw new RangeError('Expected nonempty measurements');
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2===0?(sorted[middle-1]+sorted[middle])/2:sorted[middle];
}

/** @param {number} number @returns {number} */
function rounded(number) {
  return Number(number.toFixed(5));
}

/** @param {()=>number} task @returns {{result:number,ms:number}} */
function timed(task) {
  const start=performance.now();
  const result=task();
  return {result,ms:performance.now()-start};
}

/**
 * Alternating run order controls some effects of JIT and runner variability.
 * @param {(count:number)=>number} original
 * @param {(count:number)=>number} obfuscated
 * @returns {{nativeMedianMs:number,obfuscatedMedianMs:number,medianRatio:number,passes2_5x:boolean,samples:number}}
 */
function hotBenchmark(original,obfuscated) {
  for(let i=0;i<5;i++)assert.equal(original(80000),obfuscated(80000));
  /** @type {Sample[]} */
  const samples=[];
  for(let i=0;i<16;i++) {
    const nativeFirst=i%2===0;
    const first=timed(()=>(nativeFirst?original:obfuscated)(300000));
    const second=timed(()=>(nativeFirst?obfuscated:original)(300000));
    assert.equal(first.result,second.result);
    const nativeMs=nativeFirst?first.ms:second.ms;
    const obfuscatedMs=nativeFirst?second.ms:first.ms;
    samples.push({nativeMs,obfuscatedMs,ratio:obfuscatedMs/nativeMs});
  }
  const ratio=median(samples.map(item=>item.ratio));
  return {
    nativeMedianMs:rounded(median(samples.map(item=>item.nativeMs))),
    obfuscatedMedianMs:rounded(median(samples.map(item=>item.obfuscatedMs))),
    medianRatio:rounded(ratio),passes2_5x:ratio<=2.5,samples:samples.length
  };
}

/**
 * Charge fresh VM compilation, context startup and one small invocation.
 * @param {string} original
 * @param {string} obfuscated
 * @returns {{nativeMedianMs:number,obfuscatedMedianMs:number,medianRatio:number,passes2_5x:boolean,samples:number}}
 */
function coldBenchmark(original,obfuscated) {
  /** @type {Sample[]} */
  const samples=[];
  for(let i=0;i<24;i++) {
    const nativeFirst=i%2===0;
    const first=timed(()=>instantiate(nativeFirst?original:obfuscated)(500));
    const second=timed(()=>instantiate(nativeFirst?obfuscated:original)(500));
    assert.equal(first.result,second.result);
    const nativeMs=nativeFirst?first.ms:second.ms;
    const obfuscatedMs=nativeFirst?second.ms:first.ms;
    samples.push({nativeMs,obfuscatedMs,ratio:obfuscatedMs/nativeMs});
  }
  const ratio=median(samples.map(item=>item.ratio));
  return {
    nativeMedianMs:rounded(median(samples.map(item=>item.nativeMs))),
    obfuscatedMedianMs:rounded(median(samples.map(item=>item.obfuscatedMs))),
    medianRatio:rounded(ratio),passes2_5x:ratio<=2.5,samples:samples.length
  };
}

/**
 * Reproducible Node performance and source-only attack comparison.
 * @returns {{node:string,platform:string,fixtures:number,rows:{
 *   shape:Shape,mode:Mode,properties:number,attackNormalizedKeys:number,
 *   hot:ReturnType<typeof hotBenchmark>,cold:ReturnType<typeof coldBenchmark>}[]}}
 */
function run() {
  /** @type {ReturnType<typeof run>['rows']} */
  const rows=[];
  for(const shape of /** @type {Shape[]} */ (['direct','default','forwarded'])) {
    const original=fixture(shape);
    for(const mode of /** @type {Mode[]} */ (['coo','sno'])) {
      const transformed=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
        mode,seed:'assignment-performance/'+shape+'/'+mode,
        identifiers:false,strings:false
      });
      const changed=String(transformed.files[0].code);
      assert.equal(transformed.files[0].metrics.objects,1,shape+' '+mode);
      assert.equal(transformed.files[0].metrics.properties,2,shape+' '+mode);
      const attacked=normalizeDistributedFiles([{path:'entry.cjs',sourceType:'commonjs',code:changed}]);
      assert.equal(attacked.properties,2,shape+' '+mode);
      assert.equal(instantiate(original)(4096),instantiate(changed)(4096));
      assert.equal(instantiate(original)(4096),instantiate(attacked.files[0].code)(4096));
      rows.push({
        shape,mode,properties:2,attackNormalizedKeys:attacked.properties,
        hot:hotBenchmark(instantiate(original),instantiate(changed)),
        cold:coldBenchmark(original,changed)
      });
    }
  }
  return {node:process.version,platform:process.platform,fixtures:rows.length,rows};
}

if(require.main===module) {
  try {process.stdout.write(JSON.stringify(run(),null,2)+'\n');}
  catch(error){console.error(error);process.exitCode=1;}
}
module.exports={run,fixture,instantiate,median};
