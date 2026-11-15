'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const {parse}=require('../src/ast');
const {obfuscateFiles}=require('../src');
const {transform}=require('../lib/transform');
const {virtualizeExpressionFunctions}=require('./expr-vm');
const {recoverExpressionVm}=require('./expr-vm-static-recover');

/**
 * A shared pure-kernel baseline for the main AST compiler, independent
 * TypeScript-checker pass, and experimental public postfix VM. All candidates
 * receive identical source and held-out input probes.
 */
const SOURCE='function compute(a,b){return (((a^b)+17)*3);}module.exports=compute;';
const SEEDS=Array.from({length:8},(_,i)=>'decision-grid-unpublished-'+i);
const HOT_CALLS=120000;
const MIXED_ITERATIONS=150000;

/** @param {string} value @returns {string} */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {number[]} values @returns {number} */
function median(values) {
  const ordered=[...values].sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}

/**
 * This local compiler is a benchmark harness only; the target JavaScript
 * source is parsed and run by Node's own engine with its normal semantics.
 * @param {string} source
 * @returns {(a:any,b:any)=>any}
 */
function compile(source) {
  const module={exports:null};
  const exported=new Function('module',source+'\nreturn module.exports;')(module);
  assert.equal(typeof exported,'function');
  return /** @type {(a:any,b:any)=>any} */ (exported);
}

/**
 * @param {(a:any,b:any)=>any} fn
 * @param {any} a
 * @param {any} b
 * @returns {string}
 */
function observe(fn,a,b) {
  try {
    const result=fn(a,b);
    if(typeof result==='number') {
      if(Number.isNaN(result))return 'number:NaN';
      if(Object.is(result,-0))return 'number:-0';
    }
    if(typeof result==='bigint')return 'bigint:'+String(result);
    return typeof result+':'+String(result);
  }catch(error) {
    return 'throw:'+/** @type {Error} */(error).name;
  }
}

/** @returns {[any,any][]} */
function heldoutInputs() {
  /** @type {[any,any][]} */
  const probes=[
    [0,0],[1,2],[-1,7],[512,-12],[1.5,3.7],[NaN,Infinity],
    [undefined,null],['7','42'],[true,false],[3n,5n],[-0,0]
  ];
  let value=0x93ba12d1;
  for(let i=0;i<256;i++) {
    value^=value<<13;
    value^=value>>>17;
    value^=value<<5;
    const left=value|0;
    value^=value<<13;
    value^=value>>>17;
    value^=value<<5;
    probes.push([left,value|0]);
  }
  return probes;
}

/**
 * Recover the public function expression from a plain AST output, without
 * knowing its input source or seed. This deliberately simple attacker treats
 * unobfuscated native operators as the already-recovered algorithm.
 * @param {string} code
 * @returns {(a:any,b:any)=>any}
 */
function recoverPlain(code) {
  const ast=parse(code,'commonjs');
  const functions=ast.body.filter(node=>
    node.type==='FunctionDeclaration'&&node.id?.name==='compute');
  if(functions.length!==1)throw new Error('Expected one externally named function');
  const fn=functions[0];
  const ret=fn.body.body.find(node=>node.type==='ReturnStatement');
  if(!ret?.argument || fn.params.some(node=>node.type!=='Identifier')) {
    throw new Error('Not an expression-only function');
  }
  const params=fn.params.map(node=>node.name);
  return /** @type {(a:any,b:any)=>any} */(
    new Function(...params,'return ('+code.slice(ret.argument.start,ret.argument.end)+');')
  );
}

/**
 * @param {(a:any,b:any)=>any} fn
 * @param {number} n
 * @returns {number}
 */
function hot(fn,n) {
  let total=0;
  for(let i=0;i<n;i++)total+=fn(i&1023,(i>>>3)&1023);
  return total;
}

/**
 * A fixed whole-application surrogate with native arithmetic dominating
 * most iterations. The candidate is called only once every 256 iterations.
 * @param {(a:any,b:any)=>any} fn
 * @param {number} n
 * @returns {number}
 */
function mixed(fn,n) {
  let total=0;
  for(let i=0;i<n;i++) {
    let value=i;
    for(let j=0;j<12;j++)value=(Math.imul(value,1664525)+1013904223)|0;
    if((i&255)===0)value^=fn(i&1023,(i>>>3)&1023);
    total^=value;
  }
  return total;
}

/**
 * @param {(a:any,b:any)=>any} baseline
 * @param {(a:any,b:any)=>any} candidate
 * @param {(fn:(a:any,b:any)=>any,n:number)=>number} workload
 * @param {number} count
 * @returns {{baseline_ms:number,candidate_ms:number,ratio:number,baseline_samples:number[],candidate_samples:number[]}}
 */
function compareRuntime(baseline,candidate,workload,count) {
  assert.equal(workload(baseline,count),workload(candidate,count));
  for(let i=0;i<4;i++) {
    workload(baseline,Math.max(10000,Math.floor(count/4)));
    workload(candidate,Math.max(10000,Math.floor(count/4)));
  }
  /** @type {number[]} */
  const before=[],after=[];
  /** @param {(a:any,b:any)=>any} fn @returns {number} */
  function measure(fn) {
    const start=performance.now();
    workload(fn,count);
    return performance.now()-start;
  }
  for(let i=0;i<7;i++) {
    if((i&1)===0){before.push(measure(baseline));after.push(measure(candidate));}
    else {after.push(measure(candidate));before.push(measure(baseline));}
  }
  const b=median(before),a=median(after);
  return {baseline_ms:b,candidate_ms:a,ratio:a/b,baseline_samples:before,candidate_samples:after};
}

/**
 * @param {string} code
 * @returns {number[]}
 */
function coldCompile(code) {
  const times=[];
  for(let i=0;i<9;i++) {
    const start=performance.now();
    compile(code);
    times.push(performance.now()-start);
  }
  return times;
}

const baseline=compile(SOURCE);
const inputs=heldoutInputs();
const baselineOutputs=inputs.map(([a,b])=>observe(baseline,a,b));
/** @type {Record<string,any>} */
const samples={};
for(const variant of ['main-ast','checker','postfix-vm']) {
  const started=performance.now();
  let code='';
  let coverage={};
  if(variant==='main-ast') {
    const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:SOURCE}],{
      mode:'sno',seed:SEEDS[0],strings:false
    }).files[0];
    code=output.code;
    coverage=output.metrics;
  }else if(variant==='checker') {
    const transformed=transform({'entry.cjs':SOURCE},{seed:SEEDS[0],closedWorld:true});
    code=transformed.files['entry.cjs'];
    coverage={renamed:transformed.renamed,diagnostics:transformed.diagnostics};
  }else {
    const transformed=virtualizeExpressionFunctions(SOURCE,'commonjs',{
      seed:SEEDS[0],names:['compute']
    });
    code=transformed.code;
    coverage={functions:transformed.functions,instructions:transformed.instructions,
      declined:transformed.declined};
    assert.equal(transformed.functions,1,'VM candidate must virtualize exactly one function');
  }
  const build_ms=performance.now()-started;
  const candidate=compile(code);
  const same=inputs.every(([a,b],i)=>observe(candidate,a,b)===baselineOutputs[i]);
  assert.ok(same,variant+' changed held-out primitive behavior');

  const attacker=[];
  for(const seed of SEEDS) {
    let submitted;
    if(variant==='main-ast') {
      submitted=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:SOURCE}],{
        mode:'sno',seed,strings:false
      }).files[0].code;
    }else if(variant==='checker') {
      submitted=transform({'entry.cjs':SOURCE},{seed,closedWorld:true}).files['entry.cjs'];
    }else {
      submitted=virtualizeExpressionFunctions(SOURCE,'commonjs',{seed,names:['compute']}).code;
    }
    const attackStart=performance.now();
    let recovered;
    let expressionLength=0;
    if(variant==='postfix-vm') {
      const proof=recoverExpressionVm(submitted,'compute','commonjs');
      recovered=new Function(...proof.parameterNames,'return '+proof.expression+';');
      expressionLength=proof.expression.length;
    }else {
      recovered=recoverPlain(submitted);
    }
    const attackMs=performance.now()-attackStart;
    const successful=inputs.every(([a,b],i)=>observe(recovered,a,b)===baselineOutputs[i]);
    attacker.push({seed_id:sha256(seed).slice(0,12),success:successful,
      static_attack_ms:attackMs,recovered_expression_length:expressionLength});
  }
  const hotTime=compareRuntime(baseline,candidate,hot,HOT_CALLS);
  const mixedTime=compareRuntime(baseline,candidate,mixed,MIXED_ITERATIONS);
  const coldOriginal=coldCompile(SOURCE);
  const coldCandidate=coldCompile(code);
  samples[variant]={
    source_sha256:sha256(SOURCE),seed_ids:SEEDS.map(seed=>sha256(seed).slice(0,12)),
    build_ms,original_bytes:Buffer.byteLength(SOURCE),
    candidate_bytes:Buffer.byteLength(code),coverage,
    semantic_cases:inputs.length,semantic_preserved:same,
    attacker:{model:'source-only, no source or seed, no runtime oracle',
      goal:'recover executable compute(a,b) algorithm',
      heldout_validation_cases:inputs.length,attempts:attacker.length,
      successes:attacker.filter(a=>a.success).length,seed_details:attacker},
    pure_hot:hotTime,mixed_application: mixedTime,
    cold_compile:{original_median_ms:median(coldOriginal),
      candidate_median_ms:median(coldCandidate),ratio:median(coldCandidate)/median(coldOriginal),
      original_samples:coldOriginal,candidate_samples:coldCandidate},
    whole_app_within_2_5x:mixedTime.ratio<=2.5,
    pure_hot_within_2_5x:hotTime.ratio<=2.5
  };
}
const report={
  scope:'pinned same-source comparison of main AST, TS checker and experimental postfix VM',
  commit:process.env.GITHUB_SHA??'unavailable',
  environment:{node:process.version,platform:process.platform,arch:process.arch},
  workload:{source_sha256:sha256(SOURCE),source:SOURCE,
    pure_hot_calls:HOT_CALLS,mixed_iterations:MIXED_ITERATIONS,mixed_vm_call_frequency:256},
  controls:{seed_count:SEEDS.length,heldout_cases:inputs.length,paired_trials:7,warmups:4,
    cold_compile_samples:9,compiler_included_in_hot_or_mixed:false},
  samples
};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
