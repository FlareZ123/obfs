'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {createHash} = require('node:crypto');
const {transformSync} = require('esbuild');
const {obfuscateFiles} = require('../src');

/**
 * The protected private owner changes a numeric primitive on every call.
 * Its only exported callable invokes a locally private helper whose actual
 * source is unavailable to ordinary importers. This is not an obfuscation
 * secrecy claim against an instrumented or filesystem-owning adversary.
 */
const original = "'use strict';" +
  'const owner={acc:5,step:3};' +
  'function hidden(x){owner.acc+=((x&7)+owner.step);return owner.acc|0;}' +
  'module.exports=function compute(x){return hidden(x);};';

/** @typedef {{checksum:number,wallMs:number,cpuMs:number}} Sample */
/** @typedef {{native:Sample,emitted:Sample,wallRatio:number,cpuRatio:number|null}} Pair */

/**
 * @param {string} source
 * @returns {(x:number)=>number}
 */
function load(source) {
  /** @type {{exports:unknown}} */
  const module={exports:null};
  new Function('module','exports',source)(module,module.exports);
  assert.equal(typeof module.exports,'function');
  return /** @type {(x:number)=>number} */ (module.exports);
}

/**
 * @param {(x:number)=>number} fn
 * @param {number} count
 * @returns {number}
 */
function work(fn,count) {
  let checksum=0;
  for(let i=0;i<count;i++) {
    const input=((i*13)^(i>>>5))|0;
    checksum^=fn(input);
  }
  return checksum|0;
}

/**
 * @param {string} source
 * @param {number} warm
 * @param {number} hot
 * @returns {Sample}
 */
function measure(source,warm,hot) {
  const fn=load(source);
  work(fn,warm);
  const cpuStart=process.cpuUsage();
  const wallStart=process.hrtime.bigint();
  const checksum=work(fn,hot);
  const wallMs=Number(process.hrtime.bigint()-wallStart)/1e6;
  const cpu=process.cpuUsage(cpuStart);
  return {checksum,wallMs,cpuMs:(cpu.user+cpu.system)/1000};
}

/**
 * @param {string} native
 * @param {string} emitted
 * @param {number} warm
 * @param {number} hot
 * @param {number} index
 * @returns {Pair}
 */
function pair(native,emitted,warm,hot,index) {
  const first=index%2===0?measure(native,warm,hot):measure(emitted,warm,hot);
  const second=index%2===0?measure(emitted,warm,hot):measure(native,warm,hot);
  const control=index%2===0?first:second;
  const candidate=index%2===0?second:first;
  assert.equal(candidate.checksum,control.checksum,
    'This comparison requires exactly the same real executed work');
  return {
    native:control,emitted:candidate,
    wallRatio:candidate.wallMs/control.wallMs,
    cpuRatio:control.cpuMs>0 && candidate.cpuMs>0 ?
      candidate.cpuMs/control.cpuMs:null
  };
}

/**
 * @param {string} code
 * @returns {{sha256:string,bytes:number}}
 */
function identity(code) {
  return {
    sha256:createHash('sha256').update(code).digest('hex'),
    bytes:Buffer.byteLength(code)
  };
}

/** @param {number[]} values @returns {number} */
function median(values) {
  assert.ok(values.length>0);
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

test('real COO protected private string and Symbol keys preserve behavior and report paired hot CPU',
  () => {
    const input=[{path:'entry.cjs',sourceType:/** @type {const} */ ('commonjs'),code:original}];
    const base={mode:/** @type {const} */ ('coo'),seed:'symbol-private-hot-cpu-20261122',
      identifiers:false,strings:false,properties:true};
    const hashed=obfuscateFiles(input,base).files[0];
    const symbol=obfuscateFiles(input,{...base,experimentalSymbolKeys:true}).files[0];
    assert.equal(typeof hashed.code,'string');
    assert.equal(typeof symbol.code,'string');
    assert.equal(hashed.metrics.properties,2,
      'The string-key trial must actually rename both hot own fields');
    assert.equal(symbol.metrics.symbolKeys,2,
      'The opt-in Symbol-key trial must actually replace both hot own fields');
    assert.notEqual(hashed.code,original);
    assert.notEqual(symbol.code,original);
    const hashedCode=/** @type {string} */ (hashed.code);
    const symbolCode=/** @type {string} */ (symbol.code);
    const quick=[load(original),load(hashedCode),load(symbolCode)];
    for(let i=0;i<10000;i++) {
      const x=((i*73)^(i>>>2))|0;
      const expected=quick[0](x);
      assert.equal(quick[1](x),expected);
      assert.equal(quick[2](x),expected);
    }

    const handwrittenSymbol="'use strict';" +
      'const keyAcc=Symbol(),keyStep=Symbol();' +
      'const owner={[keyAcc]:5,[keyStep]:3};' +
      'function hidden(x){owner[keyAcc]+=((x&7)+owner[keyStep]);return owner[keyAcc]|0;}' +
      'module.exports=function compute(x){return hidden(x);};';
    const handwrittenComputedString="'use strict';" +
      'const keyAcc="_acc",keyStep="_step";' +
      'const owner={[keyAcc]:5,[keyStep]:3};' +
      'function hidden(x){owner[keyAcc]+=((x&7)+owner[keyStep]);return owner[keyAcc]|0;}' +
      'module.exports=function compute(x){return hidden(x);};';
    const minified=transformSync(original,{
      loader:'js',platform:'node',target:'node22',minify:true
    }).code;
    const extra=[handwrittenSymbol,handwrittenComputedString,minified].map(load);
    const native=load(original);
    for(let i=0;i<10000;i++) {
      const x=((i*73)^(i>>>2))|0;
      const expected=native(x);
      for(const fn of extra)assert.equal(fn(x),expected);
    }

    const warm=15000000;
    const hot=25000000;
    const pairs=7;
    const variants=[
      {name:'hashed-string',code:hashedCode,fields:hashed.metrics.properties},
      {name:'unregistered-symbol',code:symbolCode,fields:symbol.metrics.symbolKeys},
      {name:'handwritten-symbol',code:handwrittenSymbol,fields:0},
      {name:'handwritten-computed-string',code:handwrittenComputedString,fields:0},
      {name:'ordinary-esbuild-minified',code:minified,fields:0},
      {name:'same-code-control',code:original,fields:0}
    ];
    // The first native/alternate call previously changed the shared work()
    // inline cache from monomorphic to polymorphic, confounding first-pair
    // ratios. Prime every distinct callable shape before the paired clock.
    // These precondition calls are explicitly outside each timed interval.
    for(const variant of variants)work(load(variant.code),2000000);
    /** @type {Array<{variant:string,fields:number,emitted:{sha256:string,bytes:number},pairs:Pair[],medianWallRatio:number,medianCpuRatio:number|null,strictWallBreaches:number,strictCpuBreaches:number,zeroCpuPairs:number}>} */
    const results=[];
    for(const variant of variants) {
      /** @type {Pair[]} */
      const measured=[];
      for(let i=0;i<pairs;i++)measured.push(pair(original,variant.code,warm,hot,i));
      const cpuRatios=measured.map(p=>p.cpuRatio).filter(
        /** @returns {v is number} */ v=>v!==null);
      results.push({
        variant:variant.name,fields:variant.fields,
        emitted:identity(variant.code),pairs:measured,
        medianWallRatio:median(measured.map(p=>p.wallRatio)),
        medianCpuRatio:cpuRatios.length?median(cpuRatios):null,
        strictWallBreaches:measured.filter(p=>p.wallRatio>2.5).length,
        strictCpuBreaches:cpuRatios.filter(r=>r>2.5).length,
        zeroCpuPairs:pairs-cpuRatios.length
      });
    }
    console.log('PRIVATE_KEY_CPU_PROFILE '+JSON.stringify({
      source:identity(original),node:process.version,platform:process.platform,
      warmCallsPerArm:warm,hotCallsPerArm:hot,pairedSamplesPerVariant:pairs,
      protectionSelected:true,results
    }));
    assert.equal(results.length,6);
  }
);
