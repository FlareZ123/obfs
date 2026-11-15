'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {virtualizeRegisterChains,obfuscateFiles}=require('../src');

/** @param {string} code @returns {(x:unknown)=>unknown} */
function load(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2500});
  assert.equal(typeof context.module.exports,'function');
  return /** @type {(x:unknown)=>unknown} */ (context.module.exports);
}

/**
 * @param {(x:unknown)=>unknown} fn
 * @param {unknown} x
 * @returns {{value?:unknown,name?:string,error?:boolean}}
 */
function observe(fn,x) {
  try{return {value:fn(x)};}
  catch(error){return {error:true,name:/** @type {Error} */ (error).name};}
}

const before='function transform(x){return (((x+7)*3)^90)-5;}module.exports=transform;';

test('register VM preserves native coercion, errors, name and arity',()=>{
  const out=virtualizeRegisterChains(before,'commonjs',{
    seed:'register-vm-probe',names:['transform']
  });
  assert.equal(out.functions,1);
  assert.equal(out.instructions,4);
  assert.match(out.code,/switch\(\(bytes\[pc\+\+\]-/u);
  assert.ok(!out.code.includes('((x+7)*3)^90'));
  const old=load(before),next=load(out.code);
  assert.equal(next.name,old.name);
  assert.equal(next.length,old.length);
  const values=[0,-0,1,-1,255,1000,1.5,-7.5,Infinity,-Infinity,NaN,
    '3','',true,false,null,undefined,3n,Symbol('x')];
  for(const x of values)assert.deepEqual(observe(next,x),observe(old,x),String(x));
  const received=[];
  const input={[Symbol.toPrimitive](hint){received.push(hint);return 11;}};
  assert.deepEqual(observe(next,input),observe(old,input));
  assert.deepEqual(received,['default','default']);
});

test('register VM lazy initialization preserves call-before-text and mutated array helpers',()=>{
  const source='module.exports=transform(9);function transform(x){return (((x+7)*3)^90)-5;}';
  const out=virtualizeRegisterChains(source,'commonjs',{seed:'hoisted',names:['transform']});
  assert.equal(out.functions,1);
  const context={module:{exports:null}};
  vm.runInNewContext(out.code,context,{timeout:2000});
  assert.equal(context.module.exports,(((9+7)*3)^90)-5);
  const mutated=before+
    'Array.prototype.push=function(){throw Error("push touched");};'+
    'Array.prototype.pop=function(){throw Error("pop touched");};';
  const vmMutated=virtualizeRegisterChains(mutated,'commonjs',{
    seed:'mutated-arrays',names:['transform']
  });
  assert.equal(observe(load(vmMutated.code),15).value,observe(load(before),15).value);
});

test('unsupported shapes and in-scope source observation preserve exact source',()=>{
  const declines=[
    'function transform(x){return x+outside;}module.exports=transform;',
    'function transform(x){return x+13.5;}module.exports=transform;',
    'function transform(x){return (x+2)*(x-5);}module.exports=transform;',
    'function transform(x){return x+7;}module.exports=transform.toString();',
    'function transform(x){eval("x=8");return x+7;}module.exports=transform;',
    'function transform(x){return x.value+7;}module.exports=transform;',
    'function transform(x){if(x)return x+7;return x+8;}module.exports=transform;',
    'function transform(x){return x+7;}function transform(x){return x+9;}module.exports=transform;'
  ];
  for(const source of declines) {
    const result=virtualizeRegisterChains(source,'commonjs',{seed:'decline',names:['transform']});
    assert.equal(result.functions,0,source);
    assert.equal(result.code,source,source);
  }
});

test('integrated COO/SNO opt-in VM transforms and preserves behavior',()=>{
  for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])) {
    const result=obfuscateFiles([{path:'compute.cjs',sourceType:'commonjs',code:before}],{
      mode,seed:'integrated-register-vm',strings:false,
      experimentalRegisterVm:{'compute.cjs':['transform']}
    });
    const file=result.files[0];
    assert.equal(file.metrics.vmFunctions,1);
    assert.equal(file.metrics.vmInstructions,4);
    assert.ok(typeof file.code==='string');
    const native=load(before),compiled=load(file.code);
    for(const x of [0,1,-2,9,1000,'12',null,NaN,5n]) {
      assert.deepEqual(observe(compiled,x),observe(native,x),mode+'/'+String(x));
    }
  }
});

test('register VM changes source spelling and records performance without claiming a universal bound',()=>{
  const out=virtualizeRegisterChains(before,'commonjs',{seed:'perf',names:['transform']});
  const native=load(before),encoded=load(out.code);
  /** @param {(x:unknown)=>unknown} fn @returns {number} */
  const workload=fn=>{
    let value=0;
    for(let i=0;i<120000;i++) {
      let n=Math.imul(i,1103515245)|0;
      n=(Math.imul(n+5,1664525)+1013904223)|0;
      if(i%256===0)n^=/** @type {number} */ (fn(i));
      value^=n;
    }
    return value;
  };
  assert.equal(workload(native),workload(encoded));
  const time=/** @param {(x:unknown)=>unknown} fn @returns {number} */ fn=>{
    const start=performance.now();
    workload(fn);
    return performance.now()-start;
  };
  for(let i=0;i<5;i++){time(native);time(encoded);}
  const baseline=[],candidate=[];
  for(let i=0;i<9;i++) {
    if(i%2===0){baseline.push(time(native));candidate.push(time(encoded));}
    else{candidate.push(time(encoded));baseline.push(time(native));}
  }
  const median=/** @param {number[]} arr @returns {number} */ arr=>
    [...arr].sort((a,b)=>a-b)[Math.floor(arr.length/2)];
  const ratio=median(candidate)/median(baseline);
  console.log('Experimental register VM at 1/256 call density median ratio: '+ratio.toFixed(3)+'x');
  assert.ok(Number.isFinite(ratio) && ratio>0);
});
