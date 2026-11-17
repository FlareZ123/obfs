'use strict';

const assert=require('node:assert/strict');
const {Script}=require('node:vm');
const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');

/** @typedef {'native'|'ordinary-array'|'typed-array'} Decoder */
/** @typedef {'clean'|'array-index-accessor'|'object-index-accessor'|'typed-array-iterator'} Mutation */
/** @typedef {{name:string,value:string}} Scenario */

/** @param {string} value @param {number} key @returns {string} */
function xor(value,key) {
  let out='';
  for(let i=0;i<value.length;i++)out+=String.fromCharCode(value.charCodeAt(i)^key);
  return out;
}

/** @param {Mutation} mutation @returns {string} */
function mutationCode(mutation) {
  switch(mutation) {
    case 'clean':return '';
    case 'array-index-accessor':
      return "Object.defineProperty(Array.prototype,'0',{get(){return 0;},set(v){},configurable:true});";
    case 'object-index-accessor':
      return "Object.defineProperty(Object.prototype,'0',{get(){return 0;},set(v){},configurable:true});";
    case 'typed-array-iterator':
      return 'Uint16Array.prototype[Symbol.iterator]=function*(){yield 0;};';
  }
}

/**
 * Build executable comparisons independent of production compiler.
 * Both decoder candidates receive the same XOR UTF-16 code units.
 * @param {string} value
 * @param {Decoder} decoder
 * @param {Mutation} mutation
 * @returns {Script}
 */
function compile(value,decoder,mutation) {
  const header="'use strict';"+mutationCode(mutation);
  if(decoder==='native')return new Script(header+'globalThis.payload='+JSON.stringify(value)+';');
  const key=33709;
  const init='const raw='+JSON.stringify(xor(value,key))+';let decoded="";';
  const allocation=decoder==='typed-array'?'new Uint16Array(size)':'new Array(size)';
  const chunk='for(let start=0;start<raw.length;start+=4096){'+
    'const size=Math.min(4096,raw.length-start);'+
    'const units='+allocation+';'+
    'for(let j=0;j<size;j++)units[j]=raw.charCodeAt(start+j)^'+key+';'+
    'decoded+=String.fromCharCode(...units);'+
    '}';
  return new Script(header+init+chunk+'globalThis.payload=decoded;');
}

/**
 * @param {Script} script
 * @param {number} trials
 * @returns {{times:number[],last:string}}
 */
function sample(script,trials) {
  /** @type {number[]} */
  const times=[];
  let last='';
  for(let i=0;i<3+trials;i++){
    /** @type {{payload?:string}} */
    const context={};
    const start=performance.now();
    script.runInNewContext(context,{timeout:5000});
    const duration=performance.now()-start;
    last=context.payload??'';
    if(i>=3)times.push(duration);
  }
  return {times,last};
}

/** @param {number[]} arr @returns {number} */
function median(arr) {
  const sorted=[...arr].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/** @returns {Scenario[]} */
function scenarios() {
  const seed='alpha\\\0😀\uD800\uDC00\uD800-ΩZ';
  return [
    {name:'two-kibibyte-codeunits',value:seed.repeat(200).slice(0,2049)},
    {name:'sixty-four-kibibyte-codeunits',value:seed.repeat(5500).slice(0,65536)}
  ];
}

/** @returns {void} */
function main() {
  /** @type {Array<{scenario:string,units:number,results:Record<string,{medianMs:number,ratioToNative:number,valid:boolean}>}>} */
  const clean=[];
  for(const scenario of scenarios()){
    const reference=sample(compile(scenario.value,'native','clean'),11);
    assert.equal(reference.last,scenario.value);
    /** @type {Record<string,{medianMs:number,ratioToNative:number,valid:boolean}>} */
    const results={};
    for(const method of /** @type {Decoder[]} */(['native','ordinary-array','typed-array'])){
      const first=sample(compile(scenario.value,method,'clean'),11);
      const second=sample(compile(scenario.value,method,'clean'),11);
      const observedMedian=median([...first.times,...second.times]);
      assert.equal(first.last,scenario.value);
      assert.equal(second.last,scenario.value);
      results[method]={medianMs:observedMedian,
        ratioToNative:observedMedian/median(reference.times),valid:true};
    }
    clean.push({scenario:scenario.name,units:scenario.value.length,results});
  }
  const sampleValue=scenarios()[0].value;
  /** @type {Array<{mutation:Mutation,nativeOK:boolean,arrayOK:boolean,typedOK:boolean}>} */
  const mutationChecks=[];
  for(const mutation of /** @type {Mutation[]} */([
    'array-index-accessor','object-index-accessor','typed-array-iterator'
  ])) {
    const native=sample(compile(sampleValue,'native',mutation),1).last;
    const plain=sample(compile(sampleValue,'ordinary-array',mutation),1).last;
    const typed=sample(compile(sampleValue,'typed-array',mutation),1).last;
    assert.equal(native,sampleValue,'The native literal itself must survive mutation');
    const arrayOK=plain===native,typedOK=typed===native;
    assert.equal(arrayOK,mutation==='typed-array-iterator',
      'Ordinary arrays must exhibit inherited-accessor vulnerability');
    assert.equal(typedOK,mutation!=='typed-array-iterator',
      'Typed arrays bypass numeric setters but not a poisoned typed iterator');
    mutationChecks.push({mutation,nativeOK:true,arrayOK,typedOK});
  }
  const digest=createHash('sha256').update(sampleValue).digest('hex');
  process.stdout.write(JSON.stringify({
    node:process.version,platform:process.platform,
    scope:'cold fresh-realm VM execution, precompiled script, 11 baseline and 22 candidate trials',
    sampleDigest:digest,clean,mutationChecks
  },null,2)+'\n');
}
if(require.main===module)main();
module.exports={main};
