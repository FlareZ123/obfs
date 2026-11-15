'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {virtualizeExpressionFunctions}=require('../sims/expr-vm');

/** @param {string} source @returns {(...args:any[])=>any} */
function fromCommonJs(source) {
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return /** @type {(...args:any[])=>any} */ (context.module.exports);
}

/** @param {(...args:any[])=>any} fn @param {any[]} args @returns {any} */
function observe(fn,args) {
  try {
    const value=fn(...args);
    return {ok:true,type:typeof value,value:typeof value==='number' && Number.isNaN(value)?'NaN':
      typeof value==='bigint' ? value.toString()+'n' : value};
  } catch(error) {
    return {ok:false,name:/** @type {Error} */ (error).name};
  }
}

test('opt-in VM preserves arithmetic and native bitwise semantics in a CJS function',()=>{
  const source=[
    'function compute(a,b){return (((a^b)&255)>>>1)+((a|b)*3);}',
    'module.exports=compute;'
  ].join('\n');
  const result=virtualizeExpressionFunctions(source,'commonjs',{
    seed:'expr-vm/bitwise',names:['compute']
  });
  assert.equal(result.functions,1);
  assert.equal(result.declined,0);
  assert.ok(result.instructions>=9);
  assert.notEqual(result.code,source);
  assert.match(result.code,/switch\(inst\[0\]\)/u);
  const native=fromCommonJs(source);
  const transformed=fromCommonJs(result.code);
  assert.equal(transformed.name,native.name);
  assert.equal(transformed.length,native.length);
  const cases=[
    [0,0],[1,2],[-50,17],[99999,0],[-1,-1],[1.8,2.9],
    [Number.MAX_SAFE_INTEGER,Number.MIN_SAFE_INTEGER],[NaN,Infinity],
    [true,false],[null,2],['7','2'],[2n,3n],[Symbol('a'),1]
  ];
  for(const args of cases) {
    assert.deepEqual(observe(transformed,args),observe(native,args),
      'Differential failure for '+args.map(String).join(','));
  }
});

test('postfix VM preserves custom primitive conversion ordering',()=>{
  const source='function compute(a,b){return (a+b)*(a-b);}module.exports=compute;';
  const transformed=virtualizeExpressionFunctions(source,'commonjs',{
    seed:'expr-vm/order',names:['compute']
  });
  assert.equal(transformed.functions,1);
  /** @param {(...args:any[])=>any} target */
  function measure(target) {
    /** @type {string[]} */
    const trace=[];
    const left={[Symbol.toPrimitive](hint){trace.push('left/'+hint);return 9;}};
    const right={[Symbol.toPrimitive](hint){trace.push('right/'+hint);return 5;}};
    const value=target(left,right);
    return {trace,value};
  }
  assert.deepEqual(measure(fromCommonJs(transformed.code)),measure(fromCommonJs(source)));
});

test('ES module exports retain their callable name and arity',async()=>{
  const source='export function compute(a,b){return ((a|b)^5)+2;}';
  const output=virtualizeExpressionFunctions(source,'module',{
    seed:'expr-vm/esm',names:['compute']
  });
  assert.equal(output.functions,1);
  /** @param {string} code @returns {Promise<{compute:(a:number,b:number)=>number}>} */
  async function load(code) {
    const namespace=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
    return /** @type {{compute:(a:number,b:number)=>number}} */ (namespace);
  }
  const native=await load(source);
  const compiled=await load(output.code);
  assert.equal(compiled.compute.name,'compute');
  assert.equal(compiled.compute.length,2);
  for(let i=-15;i<=15;i++)for(let j=-15;j<=15;j++) {
    assert.equal(compiled.compute(i,j),native.compute(i,j));
  }
});

test('VM does not depend on mutable Array prototype helpers',()=>{
  const source=[
    'function compute(a,b){return (a^b)+17;}',
    'module.exports=compute;',
    'Array.prototype.push=function(){throw Error("push is patched");};',
    'Array.prototype.pop=function(){throw Error("pop is patched");};',
    'Array.prototype[Symbol.iterator]=function(){throw Error("iterator is patched");};'
  ].join('\n');
  const output=virtualizeExpressionFunctions(source,'commonjs',{
    seed:'expr-vm/patched-array',names:['compute']
  });
  assert.equal(output.functions,1);
  const native=fromCommonJs(source);
  const compiled=fromCommonJs(output.code);
  for(const [a,b] of [[1,2],[17,-9],[0,0]]) {
    assert.equal(compiled(a,b),native(a,b));
  }
});

test('VM declines source-observing, dynamic-scope and unsupported expressions',()=>{
  const fixtures=[
    ['function f(a){return a.value;}module.exports=f;',1],
    ['function f(a){return a&&17;}module.exports=f;',1],
    ['function f(a){return a()+1;}module.exports=f;',1],
    ['function f(a){return a[0];}module.exports=f;',1],
    ["function f(a){return a+1;}module.exports=f.toString();",1],
    ['function f(a){eval("a=2");return a+1;}module.exports=f;',1],
    ['function f(a){return a+1;}module.exports=f;',0]
  ];
  for(const [source,refused] of fixtures) {
    const output=virtualizeExpressionFunctions(/** @type {string} */ (source),'commonjs',{
      seed:'expr-vm/refusal',names:['f']
    });
    assert.equal(output.functions,refused?0:1,source);
    if(refused)assert.equal(output.code,source);
  }
});

test('opt-in VM hot-path ratio is recorded, never assumed under 2.5x',()=>{
  const source='function compute(a,b){return ((a^b)+17)*3;}module.exports=compute;';
  const result=virtualizeExpressionFunctions(source,'commonjs',{
    seed:'expr-vm/hot',names:['compute']
  });
  assert.equal(result.functions,1);
  const native=fromCommonJs(source);
  const compiled=fromCommonJs(result.code);
  /** @param {(...args:any[])=>any} fn @returns {number} */
  function sample(fn) {
    let sum=0;
    const start=performance.now();
    for(let i=0;i<75000;i++)sum+=fn(i,i+1);
    const ms=performance.now()-start;
    assert.ok(Number.isFinite(sum));
    return ms;
  }
  for(let i=0;i<2;i++){sample(native);sample(compiled);}
  const ratios=[];
  for(let i=0;i<5;i++){
    const a=sample(native);
    const b=sample(compiled);
    ratios.push(b/a);
  }
  ratios.sort((a,b)=>a-b);
  console.log('Experimental expression VM hot-function median ratio: '+ratios[2].toFixed(2)+'x');
});
