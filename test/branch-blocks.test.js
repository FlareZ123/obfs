'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {flattenBranchBlocks,obfuscateFiles}=require('../src');

/**
 * Execute the same CommonJS file under independent fresh module contexts.
 * @param {string} code
 * @param {string} name
 * @returns {Function}
 */
function loadFunction(code,name) {
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports},{timeout:1000});
  const task=/** @type {Record<string,Function>} */ (module.exports)[name];
  assert.equal(typeof task,'function');
  return task;
}

/**
 * Compare value, error class, and error message, including JavaScript
 * implicit coercion effects on externally supplied objects.
 * @param {Function} native
 * @param {Function} modified
 * @param {unknown} arg
 */
function same(native,modified,arg) {
  /** @param {Function} fn @returns {{value?:unknown,error?:string}} */
  function run(fn) {
    try{return {value:fn(arg)};}
    catch(error){return {error:String(/** @type {Error} */(error).name)+':'+String(/** @type {Error} */(error).message)};}
  }
  assert.deepEqual(run(modified),run(native));
}

const SAMPLE="'use strict';function choice(x){return ((x+23)^7)?((x*5)|4):((x-11)<<2);}module.exports={choice};";

test('branch superblocks compile genuine ternary control flow with native operators',()=>{
  const result=flattenBranchBlocks(SAMPLE,'commonjs',{seed:'branch-test',names:['choice']});
  assert.equal(result.functions,1);
  assert.equal(result.blocks,3);
  assert.equal(result.declined,0);
  assert.ok(result.code.includes('switch('));
  assert.ok(!result.code.includes('((x+23)^7)'));
  const native=loadFunction(SAMPLE,'choice');
  const transformed=loadFunction(result.code,'choice');
  for(let x=-1024;x<=1024;x++)same(native,transformed,x);
  for(const value of ['3','',true,false,null,undefined,NaN,Infinity,-Infinity,0n,3n,Symbol('x')]){
    same(native,transformed,value);
  }
  assert.equal(flattenBranchBlocks(SAMPLE,'commonjs',{seed:'branch-test',names:['choice']}).code,result.code);
  assert.notEqual(flattenBranchBlocks(SAMPLE,'commonjs',{seed:'another-seed',names:['choice']}).code,result.code);
});

test('nested conditionals preserve branch-only evaluation and original parameter restoration',()=>{
  const source="'use strict';function nested(x){return x?((x^1)?(x+7):(x-3)):(x*11);}module.exports={nested};";
  const result=flattenBranchBlocks(source,'commonjs',{seed:'nested',names:['nested']});
  assert.equal(result.functions,1);
  assert.equal(result.blocks,5);
  const native=loadFunction(source,'nested');
  const transformed=loadFunction(result.code,'nested');
  for(let x=-32;x<128;x++)same(native,transformed,x);
  for(const value of ['0','',true,false,null,undefined,3n,Symbol('x')])same(native,transformed,value);
});

test('object coercion occurs in the same order and only within selected arms',()=>{
  const source="'use strict';function f(x){return (x+2)?(x*7):(x-3);}module.exports={f};";
  const output=flattenBranchBlocks(source,'commonjs',{seed:'coerce',names:['f']});
  assert.equal(output.functions,1);
  for(const start of [-2,5]) {
    /** @param {string[]} trace */
    function make(trace) {
      return {valueOf(){trace.push('valueOf');return start;},toString(){trace.push('toString');return String(start);}};
    }
    const left=[],right=[];
    assert.equal(loadFunction(source,'f')(make(left)),
      loadFunction(output.code,'f')(make(right)));
    assert.deepEqual(right,left);
  }
});

test('an opt-in obfuscator pass returns the per-file basic block metrics',()=>{
  const result=obfuscateFiles([{path:'choice.cjs',sourceType:'commonjs',code:SAMPLE}],{
    mode:'sno',seed:'integration',properties:false,identifiers:false,strings:false,
    experimentalBranchBlocks:{'choice.cjs':['choice']}
  });
  assert.equal(result.files.length,1);
  assert.equal(result.files[0].metrics.branchFunctions,1);
  assert.equal(result.files[0].metrics.branchBlocks,3);
  const native=loadFunction(SAMPLE,'choice');
  const rewritten=loadFunction(/** @type {string} */ (result.files[0].code),'choice');
  for(let x=-64;x<64;x++)same(native,rewritten,x);
});

test('unsupported or source-observed functions decline without mutation',()=>{
  const rejected=[
    'function f(x){return x?foo(x):x+1;}module.exports={f};',
    'function f(x){return x?x+999:x;}module.exports={f};',
    'function f(x){return x?x[0]:x;}module.exports={f};',
    'function f(x){return x?(x+1):x;return 0;}module.exports={f};',
    'async function f(x){return x?x+1:x;}module.exports={f};',
    'function f(x,y){return x?x+1:y;}module.exports={f};',
    'function f(x){return x?x+1:x;}function f(x){return x?x+2:x;}module.exports={f};',
    'function f(x){return x?x+1:x;}module.exports={f};String(f);',
    'function f(x){return x?x+1:x;}eval("0");module.exports={f};'
  ];
  for(const source of rejected) {
    const result=flattenBranchBlocks(source,'commonjs',{seed:'decline',names:['f']});
    assert.equal(result.functions,0,source);
    assert.equal(result.declined,1,source);
    assert.equal(result.code,source,source);
  }
  assert.throws(()=>flattenBranchBlocks(SAMPLE,'script',{seed:'no',names:['choice']}),TypeError);
  assert.throws(()=>obfuscateFiles([
    {path:'choice.cjs',sourceType:'commonjs',code:SAMPLE},
    {path:'observe.cjs',sourceType:'commonjs',code:"String(require('./choice.cjs').choice);"}
  ],{mode:'sno',experimentalBranchBlocks:{'choice.cjs':['choice']}}),/cross-file source observation/);
});


test('COO ESM export remains callable by a native module loader',async()=>{
  const source='export function gate(x){return x?((x^3)?((x+7)*2):(x>>>1)):(x-11);}';
  const compiled=obfuscateFiles([{
    path:'gate.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',seed:'esm-branch',properties:false,identifiers:false,strings:false,
    experimentalBranchBlocks:{'gate.mjs':['gate']}
  });
  assert.equal(compiled.files[0].metrics.branchFunctions,1);
  /** @param {string} code @returns {Promise<{gate:(x:unknown)=>unknown}>} */
  async function load(code){
    const uri='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
    return /** @type {Promise<{gate:(x:unknown)=>unknown}>} */ (import(uri));
  }
  const original=await load(source);
  const transformed=await load(/** @type {string} */ (compiled.files[0].code));
  for(let x=-1024;x<=1024;x++)same(original.gate,transformed.gate,x);
  for(const v of ['10',0n,Symbol('k'),undefined,null])same(original.gate,transformed.gate,v);
});


test('operand-tied state masking preserves original branch truthiness and coercion',()=>{
  const protectedSource=flattenBranchBlocks(SAMPLE,'commonjs',{
    seed:'masked-v1',names:['choice'],stateBlinding:true
  });
  assert.equal(protectedSource.functions,1);
  assert.equal(protectedSource.blocks,3);
  assert.ok(protectedSource.code.includes('typeof '));
  assert.ok(protectedSource.code.includes('>>>0'));
  assert.notEqual(protectedSource.code,flattenBranchBlocks(SAMPLE,'commonjs',{
    seed:'masked-v1',names:['choice'],stateBlinding:false
  }).code);
  const native=loadFunction(SAMPLE,'choice');
  const modified=loadFunction(protectedSource.code,'choice');
  for(let x=-4096;x<=4096;x++)same(native,modified,x);
  for(const x of ['3','',true,false,null,undefined,NaN,Infinity,-Infinity,0n,1n,
    Symbol('tag'),{valueOf(){return 2;}},{[Symbol.toPrimitive](){return '7';}}])same(native,modified,x);
  assert.throws(()=>flattenBranchBlocks(SAMPLE,'commonjs',{
    seed:'invalid-mask',names:['choice'],stateBlinding:'yes'
  }),/Expected source/);
});

test('state-blinded core option retains browser ESM behavior and metric contracts',async()=>{
  const source='export function f(x){return x?((x+7)?(x|1):(x^2)):(x*3);}';
  const output=obfuscateFiles([{path:'f.mjs',sourceType:'module',code:source}],{
    mode:'coo',seed:'masked-browser',strings:false,properties:false,identifiers:false,
    experimentalBranchBlocks:{'f.mjs':['f']},
    experimentalBranchStateBlinding:true
  });
  assert.equal(output.files[0].metrics.branchFunctions,1);
  assert.equal(output.files[0].metrics.branchBlocks,5);
  const raw=/** @type {string} */ (output.files[0].code);
  assert.ok(raw.includes('typeof '));
  /** @param {string} code @returns {Promise<{f:(x:unknown)=>unknown}>} */
  const load=async code=>/** @type {Promise<{f:(x:unknown)=>unknown}>} */ (
    import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
  );
  const original=await load(source),transformed=await load(raw);
  for(let x=-512;x<=512;x++)same(original.f,transformed.f,x);
  for(const x of [0n,1n,Symbol('tag'),null,undefined,'7',NaN])
    same(original.f,transformed.f,x);
});


test('long left-deep native operation chains decline safely above fixed budget',()=>{
  /** @param {number} count */
  function expression(count) {
    let current='x';
    for(let i=0;i<count;i++)current='('+current+'+'+(i&255)+')';
    return current;
  }
  /** @param {number} count */
  const source=count=>'function f(x){return x?'+expression(count)+':x;}module.exports={f};';
  const accepted=flattenBranchBlocks(source(32),'commonjs',{
    seed:'bounded-native-chains',names:['f']
  });
  assert.equal(accepted.functions,1);
  assert.equal(accepted.blocks,3);
  const normal=loadFunction(source(32),'f'),modified=loadFunction(accepted.code,'f');
  for(let x=-256;x<=256;x++)same(normal,modified,x);
  for(const length of [33,64,128,512]) {
    const original=source(length);
    const declined=flattenBranchBlocks(original,'commonjs',{
      seed:'bounded-native-chains',names:['f']
    });
    assert.equal(declined.functions,0,'expected predictable decline at '+length);
    assert.equal(declined.declined,1);
    assert.equal(declined.code,original);
  }
});


test('state masking never adds observable user-defined coercion or branch effects',()=>{
  const source='function f(x){return (x+7)?((x*3)^5):((x-2)|1);}module.exports={f};';
  const plain=flattenBranchBlocks(source,'commonjs',{
    seed:'effect-trace',names:['f']
  });
  const masked=flattenBranchBlocks(source,'commonjs',{
    seed:'effect-trace',names:['f'],stateBlinding:true
  });
  assert.equal(masked.functions,1);
  const original=loadFunction(source,'f'),baseline=loadFunction(plain.code,'f'),
    hardened=loadFunction(masked.code,'f');
  for(const start of [-7,0,3,99]){
    /** @param {string[]} steps */
    function observed(steps){
      return {[Symbol.toPrimitive](hint){
        steps.push('coerce:'+hint);
        return start;
      }};
    }
    const originalSteps=[],plainSteps=[],maskedSteps=[];
    const native=original(observed(originalSteps));
    assert.equal(baseline(observed(plainSteps)),native);
    assert.equal(hardened(observed(maskedSteps)),native);
    assert.deepEqual(plainSteps,originalSteps);
    assert.deepEqual(maskedSteps,originalSteps);
    /** @param {string[]} steps */
    function throwing(steps){
      return {[Symbol.toPrimitive](hint){
        steps.push('throw:'+hint);
        throw new RangeError('sentinel');
      }};
    }
    for(const [fn,trace] of [[original,originalSteps],[baseline,plainSteps],[hardened,maskedSteps]]){
      const logs=/** @type {string[]} */ ([]);
      assert.throws(()=>fn(throwing(logs)),/sentinel/);
      assert.deepEqual(logs,['throw:number']);
    }
  }
});
