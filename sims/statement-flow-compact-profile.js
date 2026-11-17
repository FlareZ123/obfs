'use strict';

const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {createHash}=require('node:crypto');
const {flattenStatementFlow}=require('../src/statement-flow');
const {recoverStatementFlow}=require('./statement-flow-recover');

/** @typedef {(value:number,flag:boolean,hook:(tag:string)=>void)=>number} Kernel */

/**
 * Evaluate the already verified local sample in an isolated CommonJS export
 * object. This profile does not run attacker-controlled source.
 * @param {string} code
 * @returns {Kernel}
 */
function compile(code){
  /** @type {{exports:{route?:Kernel}}} */
  const mod={exports:{}};
  const initialize=new Function('module',code);
  initialize(mod);
  assert.equal(typeof mod.exports.route,'function');
  return /** @type {Kernel} */ (mod.exports.route);
}

/** @param {number[]} numbers @returns {number} */
function median(numbers){
  const sorted=[...numbers].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Fully execute external callbacks while measuring real work. Native,
 * default, compact and reconstructed implementations receive the same
 * deterministic inputs and returned callback effects.
 * @param {Kernel} fn
 * @param {number} iterations
 * @param {boolean} heavy
 * @returns {{ms:number,checksum:number}}
 */
function measure(fn,iterations,heavy){
  let checksum=0;
  const started=performance.now();
  for(let i=0;i<iterations;i++){
    const input=(i&2047)-1024;
    const flag=(i%13)<5;
    let observed=0;
    const hook=/** @param {string} tag */ tag=>{
      observed=heavy?createHash('sha256').update(tag).update(String(input)).digest()[0]:tag.length;
    };
    checksum=(checksum+fn(input,flag,hook)+observed)|0;
  }
  return {ms:performance.now()-started,checksum};
}

/**
 * @param {string} label
 * @param {string} source
 * @param {number} iterations
 * @param {boolean} heavy
 */
function profile(label,source,iterations,heavy){
  const original=compile(source);
  const normal=flattenStatementFlow(source,'commonjs',{seed:'compact-profile-20261117',names:['route']});
  const compact=flattenStatementFlow(source,'commonjs',{seed:'compact-profile-20261117',
    names:['route'],compactCases:true});
  assert.equal(normal.functions,1);
  assert.equal(compact.functions,1);
  const normalCases=(normal.code.match(/case\s+\d+:/gu)||[]).length;
  const compactCases=(compact.code.match(/case\s+\d+:/gu)||[]).length;
  assert.ok(compactCases<normalCases);
  const recovered=recoverStatementFlow(compact.code,'route');
  const functions=[original,compile(normal.code),compile(compact.code),compile(recovered.code)];
  for(const sample of [128,8192]){
    const baseline=measure(original,sample,heavy);
    for(const fn of functions.slice(1))assert.equal(measure(fn,sample,heavy).checksum,baseline.checksum);
  }
  /** @type {number[][]} */
  const samples=functions.map(()=>[]);
  for(let trial=0;trial<9;trial++){
    const order=[trial%3,(trial+1)%3,(trial+2)%3];
    for(const index of order){
      measure(functions[index],10000,heavy);
      const actual=measure(functions[index],iterations,heavy);
      samples[index].push(actual.ms);
    }
  }
  const times=samples.map(median);
  return {
    label,iterations,heavy,originalBlocks:normal.blocks,
    standardCases:normalCases,compactCases,sourceBytes:source.length,
    emittedStandardBytes:normal.code.length,emittedCompactBytes:compact.code.length,
    nativeMedianMs:times[0],standardMedianMs:times[1],compactMedianMs:times[2],
    standardVsNative:times[1]/times[0],compactVsNative:times[2]/times[0],
    compactVsStandard:times[2]/times[1],
    compactPasses2_5x:times[2]<=2.5*times[0],
    recoveredBlocks:recovered.blocks,
    rawSamples:samples.slice(0,3)
  };
}

const router=readFileSync(path.join(__dirname,'../examples/statement-flow/before/router.cjs'),'utf8');

const dense=[
  "'use strict';",
  'function route(value,flag,hook){',
  'var a=value|0;',
  'var b=(a+7)|0;',
  'var c=(b*5)|0;',
  'if(flag){',
  "hook('allowed');",
  ...Array.from({length:12},(_,i)=>'a=(a+'+(11+i)+')|0;'),
  '}else{',
  "hook('denied');",
  ...Array.from({length:12},(_,i)=>'a=(a^'+(31+i)+')|0;'),
  '}',
  ...Array.from({length:12},(_,i)=>'c=(c+a+'+(13+i)+')|0;'),
  'return (c^a)|0;',
  '}',
  'module.exports={route};'
].join('\n');

const records=[
  profile('existing-router-light',router,650000,false),
  profile('dense-arithmetic-light',dense,300000,false),
  profile('existing-router-hash-callback',router,45000,true)
];
process.stdout.write(JSON.stringify({platform:process.platform,node:process.version,
  seed:'compact-profile-20261117',trials:9,
  invocation:'one process, alternating unpaired medians, includes callback work, excludes startup',
  records},null,2)+'\n');

if(process.env.OBFS_ENFORCE_BUDGET==='1'&&records.some(record=>!record.compactPasses2_5x)){
  process.exitCode=1;
}
