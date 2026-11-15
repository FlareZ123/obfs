'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {virtualizeExpressionGraphs,obfuscateFiles}=require('../src');
const {buildSample}=require('../examples/expression-vm/build-sample.cjs');

const before='function mix(x){return ((x+7)*(x-5))^((x+3)&255);}module.exports=mix;';

/** @param {string} code @returns {(x:unknown)=>unknown} */
function load(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2500});
  assert.equal(typeof context.module.exports,'function');
  return /** @type {(x:unknown)=>unknown} */ (context.module.exports);
}

/** @param {(x:unknown)=>unknown} fn @param {unknown} input @returns {{value?:unknown,name?:string,message?:string}} */
function observe(fn,input) {
  try{return {value:fn(input)};}
  catch(error){const e=/** @type {Error} */ (error);return {name:e.name,message:e.message};}
}

test('expression VM supports nested value graphs without reordering native coercions',()=>{
  const result=virtualizeExpressionGraphs(before,'commonjs',{seed:'expression-diff',names:['mix']});
  assert.equal(result.functions,1);
  assert.equal(result.instructions,6);
  assert.ok(!result.code.includes('((x+7)*(x-5))'));
  const native=load(before),compiled=load(result.code);
  assert.equal(compiled.name,native.name);
  assert.equal(compiled.length,native.length);
  const inputs=[0,-0,1,-1,255,1000,1.5,Infinity,-Infinity,NaN,'3','',true,false,null,undefined,3n,Symbol('s')];
  for(const input of inputs)assert.deepEqual(observe(compiled,input),observe(native,input),String(input));
  for(let i=0;i<1500;i++) {
    const input=Math.imul(i,2654435761)/23457-10000;
    assert.deepEqual(observe(compiled,input),observe(native,input),String(input));
  }
  /** @param {(x:unknown)=>unknown} fn */
  function stateful(fn) {
    /** @type {string[]} */
    const calls=[];
    const input={[Symbol.toPrimitive](hint){calls.push(hint);return calls.length;}};
    return {output:observe(fn,input),calls};
  }
  assert.deepEqual(stateful(compiled),stateful(native));
  assert.deepEqual(stateful(compiled).calls,['default','number','default']);
});

test('lazy declarations and own register slots withstand prototype setter poisoning',()=>{
  const original='module.exports=mix(11);function mix(x){return (x+2)*(x-4);}';
  const output=virtualizeExpressionGraphs(original,'commonjs',{seed:'hoist',names:['mix']});
  assert.equal(output.functions,1);
  const context={module:{exports:null}};
  vm.runInNewContext(output.code,context,{timeout:2500});
  assert.equal(context.module.exports,(11+2)*(11-4));
  const poisoned=before+'Object.defineProperty(Array.prototype,"3",{set(){throw Error("inherited array slot");}});';
  const next=virtualizeExpressionGraphs(poisoned,'commonjs',{seed:'poison',names:['mix']});
  assert.equal(observe(load(next.code),9).value,observe(load(before),9).value);
});

test('unsupported expressions and source readers decline unchanged',()=>{
  const rejected=[
    'function mix(x){return x.key+x;}module.exports=mix;',
    'function mix(x){return (x+2)*outside;}module.exports=mix;',
    'function mix(x){return x>3?x+1:x-1;}module.exports=mix;',
    'function mix(x){return x+2;}module.exports=mix;',
    'function mix(x){return x+1+x+2;}module.exports=mix.toString();',
    'function mix(x){eval("x=4");return x+1+x+2;}module.exports=mix;',
    'function mix(x){return (x+2)*(x-1);}function mix(x){return x+1;}module.exports=mix;',
    'function mix(x,y){return (x+2)*(x-1);}module.exports=mix;'
  ];
  for(const source of rejected) {
    const out=virtualizeExpressionGraphs(source,'commonjs',{seed:'decline',names:['mix']});
    assert.equal(out.functions,0,source);
    assert.equal(out.code,source);
  }
});

test('COO and SNO opt in explicitly; external API keys remain intact',()=>{
  const source='const external=globalThis.gateway;function mix(x){return (x+2)*(x-4);}module.exports={mix,remote:external.remote};';
  for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])) {
    const out=obfuscateFiles([{path:'mix.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'expression-integration',identifiers:false,properties:false,strings:false,
      experimentalExpressionVm:{'mix.cjs':['mix']}
    });
    assert.equal(out.files[0].metrics.expressionVmFunctions,1);
    assert.equal(out.files[0].metrics.expressionVmInstructions,3);
    assert.match(/** @type {string} */ (out.files[0].code),/\.remote/u);
  }
});

test('seed changes output and generated source is committed byte for byte',async()=>{
  const left=virtualizeExpressionGraphs(before,'commonjs',{seed:'left',names:['mix']});
  const right=virtualizeExpressionGraphs(before,'commonjs',{seed:'right',names:['mix']});
  assert.notEqual(left.code,right.code);
  assert.deepEqual(observe(load(left.code),14),observe(load(right.code),14));
  await buildSample(true);
});

test('mixed-workload performance is observed without asserting a universal bound',()=>{
  const transformed=virtualizeExpressionGraphs(before,'commonjs',{seed:'perf',names:['mix']});
  const native=load(before),compiled=load(transformed.code);
  /** @param {(x:unknown)=>unknown} fn @returns {number} */
  const run=fn=>{let value=0;for(let i=0;i<150000;i++){
    value^=Math.imul(i,13)^1234567;
    if(i%512===0)value^=/** @type {number} */ (fn(i));
  }return value;};
  assert.equal(run(native),run(compiled));
  /** @param {(x:unknown)=>unknown} fn @returns {number} */
  const time=fn=>{const start=performance.now();run(fn);return performance.now()-start;};
  for(let i=0;i<4;i++){time(native);time(compiled);}
  const baseline=[],candidate=[];
  for(let i=0;i<7;i++){if(i%2){candidate.push(time(compiled));baseline.push(time(native));}
    else{baseline.push(time(native));candidate.push(time(compiled));}}
  const median=/** @param {number[]} arr @returns {number} */ arr=>
    [...arr].sort((a,b)=>a-b)[Math.floor(arr.length/2)];
  const ratio=median(candidate)/median(baseline);
  console.log('Expression VM, 1/512 call density median ratio '+ratio.toFixed(3)+'x');
  assert.ok(Number.isFinite(ratio)&&ratio>0);
});

test('COO and SNO CLIs emit real, executable VM-protected entries',async()=>{
  const fs=require('node:fs/promises');
  const os=require('node:os');
  const path=require('node:path');
  const {spawnSync}=require('node:child_process');
  const {atomicWrite}=require('../src/atomic');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-expression-vm-e2e-'));
  /** @param {string} executable @param {string[]} argv @returns {string} */
  const run=(executable,argv)=>{
    const child=spawnSync(process.execPath,[executable,...argv],{encoding:'utf8'});
    assert.equal(child.status,0,String(child.stderr));
    return child.stdout.trim();
  };
  try {
    const cooIn=path.join(root,'coo-input'),cooOut=path.join(root,'coo-output');
    const snoIn=path.join(root,'sno-input'),snoOut=path.join(root,'sno-output');
    await fs.mkdir(cooIn);
    await fs.mkdir(snoIn);
    await atomicWrite(path.join(cooIn,'worker.mjs'),
      'export function mix(x){return ((x+7)*(x-5))^((x+3)&255);}\n');
    await atomicWrite(path.join(cooIn,'index.mjs'),
      'import {mix} from "./worker.mjs";console.log(mix(11));\n');
    run(path.join(__dirname,'../bin/coo.js'),[
      '--root',cooIn,'--entry','index.mjs','--out',cooOut,
      '--seed','expression-vm-cli-coo','--expression-vm','worker.mjs:mix'
    ]);
    assert.match(await fs.readFile(path.join(cooOut,'worker.mjs'),'utf8'),/_egvm_/u);
    assert.equal(run(path.join(cooOut,'index.mjs'),[]),String(((11+7)*(11-5))^((11+3)&255)));

    await atomicWrite(path.join(snoIn,'index.cjs'),
      'function mix(x){return ((x+7)*(x-5))^((x+3)&255);}\nmodule.exports=mix(11);\n');
    run(path.join(__dirname,'../bin/sno.js'),[
      '--root',snoIn,'--entry','index.cjs','--out',snoOut,
      '--seed','expression-vm-cli-sno','--expression-vm','index.cjs:mix'
    ]);
    assert.match(await fs.readFile(path.join(snoOut,'index.cjs'),'utf8'),/_egvm_/u);
    const expression='console.log(require('+JSON.stringify(path.join(snoOut,'sno-entry.cjs'))+'))';
    const result=spawnSync(process.execPath,['-e',expression],{encoding:'utf8'});
    assert.equal(result.status,0,String(result.stderr));
    assert.equal(result.stdout.trim(),String(((11+7)*(11-5))^((11+3)&255)));
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
