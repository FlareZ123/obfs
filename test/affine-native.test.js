'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {lowerAffineNative}=require('../src/affine-native');
const {recoverAffine}=require('../sims/affine-native-recover');

/** @param {string} source @returns {(input:unknown)=>unknown} */
function load(source) {
  const sandbox={module:{exports:null}};
  vm.runInNewContext(source,sandbox,{timeout:1000});
  return /** @type {(input:unknown)=>unknown} */ (sandbox.module.exports);
}

/** @param {(input:unknown)=>unknown} fn @param {unknown} input */
function observe(fn,input) {
  try{return {value:fn(input)};}
  catch(error){const e=/** @type {Error} */ (error);return {name:e.name,message:e.message};}
}

/** @param {number[]} deltas @param {string} [name] @returns {string} */
function makeSource(deltas,name='encode') {
  let expression='(x|0)';
  for(const delta of deltas)expression='('+expression+(delta<0?'-':'+')+Math.abs(delta)+')';
  return 'function '+name+'(x){return ('+expression+'|0);}module.exports='+name+';';
}

const steps=[11,-4,31,-5,1,-40,15,18,-22,3,41,-20,5,-9,18,-1];
const before=makeSource(steps);

test('affine native: exactly preserves 32-bit wrapping, exotic coercions and errors',()=>{
  const output=lowerAffineNative(before,'commonjs',{seed:'affine-semantics',names:['encode']});
  assert.equal(output.functions,1);
  assert.equal(output.steps,steps.length);
  assert.equal(output.declined,0);
  assert.doesNotMatch(output.code,/\+11\)-4/u);
  const original=load(before),compiled=load(output.code);
  const inputs=[0,-0,1,-1,2147483647,-2147483648,2147483648,-2147483649,
    4294967295,4294967296,2**53,-(2**53),1.25,-1.25,Infinity,-Infinity,NaN,
    '12','',true,false,null,undefined,0n,5n,Symbol('sym')];
  for(const x of inputs)assert.deepEqual(observe(compiled,x),observe(original,x),String(x));
  for(let n=0;n<20000;n++) {
    const x=(Math.imul(n,1664525)+1013904223)|0;
    assert.deepEqual(observe(compiled,x),observe(original,x),String(x));
  }
  /** @param {(input:unknown)=>unknown} fn */
  function stateful(fn) {
    const events=[];
    const object={[Symbol.toPrimitive](hint){events.push(hint);return 5;}};
    return {events,result:observe(fn,object)};
  }
  assert.deepEqual(stateful(compiled),stateful(original));
  assert.deepEqual(stateful(compiled).events,['number']);
  assert.equal(compiled.length,original.length);
  assert.equal(compiled.name,original.name);
});

test('affine native: repeatable seeded output, disjoint bindings, and ESM named exports',()=>{
  const source='export function encode(x){return '+makeSource(steps).match(/return (.*?);/u)[1]+';}'+
    'export function other(y){return y+7;}';
  const a=lowerAffineNative(source,'module',{seed:'same',names:['encode','other']});
  const b=lowerAffineNative(source,'module',{seed:'same',names:['encode','other']});
  const c=lowerAffineNative(source,'module',{seed:'different',names:['encode']});
  assert.equal(a.code,b.code);
  assert.notEqual(a.code,c.code);
  assert.equal(a.functions,1);
  assert.equal(a.declined,1);
  assert.match(a.code,/export function other\(y\)\{return y\+7;\}/u);
  assert.doesNotMatch(a.code,/\b_egvm_/u);
});

test('affine native: soundness refusals remain byte-for-byte unchanged',()=>{
  const declined=[
    'function encode(x){return x+1+2+3+4+5+6+7+8;}module.exports=encode;',
    'function encode(x){return (x|0)+1+2+3+4+5+6+7+8;}module.exports=encode;',
    'function encode(x){return ((x|0)+1+2+3+4+5+6+7+foo)|0;}module.exports=encode;',
    'function encode(x){return ((x|0)+1+2+3+4+5+6+7+(x+1))|0;}module.exports=encode;',
    'function encode(x){return ((x|0)+1+2+3+4+5+6+7+256)|0;}module.exports=encode;',
    'function encode(x){return (((x|0)+1+2+3+4+5+6+7+8)|0)+1;}module.exports=encode;',
    'function encode(x){return (((x|0)+1+2+3+4+5+6+7+8)|0); eval("0");}module.exports=encode;',
    'function encode(x,y){return ((x|0)+1+2+3+4+5+6+7+8)|0;}module.exports=encode;',
    'function encode(x){return ((x|0)+1+2+3+4+5+6+7+8)|0;}function encode(x){return x;}module.exports=encode;'
  ];
  for(const source of declined) {
    const a=lowerAffineNative(source,'commonjs',{seed:'refuse',names:['encode']});
    assert.equal(a.code,source,source);
    assert.equal(a.functions,0,source);
  }
});

test('affine native: seeded property-based differential and static affine recovery',()=>{
  let s=0x1234abcd;
  /** @returns {number} */
  const next=()=>{s=(Math.imul(s,1664525)+1013904223)|0;return s>>>0;};
  for(let trial=0;trial<60;trial++) {
    const deltas=Array.from({length:8+(next()%56)},()=>((next()%255)+1)*(next()%2?-1:1));
    const source=makeSource(deltas);
    const output=lowerAffineNative(source,'commonjs',{
      seed:'affine-case-'+trial,names:['encode']
    });
    assert.equal(output.functions,1);
    const original=load(source),transformed=load(output.code);
    const recovered=recoverAffine(output.code,'encode');
    assert.equal(recovered.multiplier,1);
    assert.equal(recovered.offset,deltas.reduce((a,b)=>(a+b)|0,0));
    for(let input=0;input<200;input++) {
      const value=next()|0;
      assert.equal(transformed(value),original(value));
      assert.equal(((Math.imul(recovered.multiplier,value)+recovered.offset)|0),original(value));
    }
  }
});

test('affine native: hot-path performance is measured without assuming universal 2.5x',()=>{
  const output=lowerAffineNative(before,'commonjs',{seed:'affine-perf',names:['encode']});
  const original=load(before),compiled=load(output.code);
  /** @param {(input:unknown)=>unknown} fn @returns {number} */
  function loop(fn) {
    let total=0;
    for(let n=0;n<450000;n++)total^=/** @type {number} */ (fn((n*97)|0));
    return total;
  }
  assert.equal(loop(original),loop(compiled));
  /** @param {(input:unknown)=>unknown} fn @returns {number} */
  function time(fn) {const start=performance.now();loop(fn);return performance.now()-start;}
  for(let i=0;i<6;i++){time(original);time(compiled);}
  const baseline=[],candidate=[];
  for(let n=0;n<11;n++) {
    if(n&1){candidate.push(time(compiled));baseline.push(time(original));}
    else {baseline.push(time(original));candidate.push(time(compiled));}
  }
  /** @param {number[]} data @returns {number} */
  const median=data=>[...data].sort((a,b)=>a-b)[Math.floor(data.length/2)];
  const ratio=median(candidate)/median(baseline);
  console.log('Affine native hot ratio: '+ratio.toFixed(3)+'x, original '+
    median(baseline).toFixed(3)+'ms, masked '+median(candidate).toFixed(3)+'ms');
  assert.ok(Number.isFinite(ratio)&&ratio>0);
});


test('affine native: two-file ESM public bridge remains unrenamed and functional',async()=>{
  const expression=makeSource(steps).match(/return (.*?);/u)[1];
  const moduleCode='export function encode(x){return '+expression+';}'+
    'export function publish(x){return globalThis.externalBridge.accept(encode(x));}';
  const candidate=lowerAffineNative(moduleCode,'module',{seed:'esm-graph',names:['encode']});
  assert.equal(candidate.functions,1);
  assert.match(candidate.code,/\.externalBridge\.accept\(/u);
  const messages=[];
  const former=globalThis.externalBridge;
  globalThis.externalBridge={accept(x){messages.push(x);return x;}};
  try {
    const before=await import('data:text/javascript;base64,'+Buffer.from(moduleCode).toString('base64'));
    const after=await import('data:text/javascript;base64,'+Buffer.from(candidate.code).toString('base64'));
    for(const x of [0,1,-1,2147483647,-2147483648,2**53,'4',null]) {
      assert.equal(after.publish(x),before.publish(x));
      assert.equal(after.encode(x),before.encode(x));
    }
    assert.equal(messages.length,16);
  } finally {globalThis.externalBridge=former;}
});

test('affine native: committed before/after can be reproduced exactly',async()=>{
  const fs=require('node:fs/promises');
  const path=require('node:path');
  const root=path.join(__dirname,'../examples/affine-native');
  const before=(await fs.readFile(path.join(root,'before.cjs'),'utf8')).replace(/\r\n/gu,'\n');
  const after=(await fs.readFile(path.join(root,'after.cjs'),'utf8')).replace(/\r\n/gu,'\n');
  assert.equal(lowerAffineNative(before,'commonjs',{
    seed:'affine-native-example-v1',names:['encode']
  }).code,after);
});
