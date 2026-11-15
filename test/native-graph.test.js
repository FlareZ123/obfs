'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {performance}=require('node:perf_hooks');
const {virtualizeExpressionGraphs,obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {buildSample}=require('../examples/native-graph/build-sample.cjs');

const source='function mix(x){return ((x+7)*(x-5))^((x+3)&255);}module.exports=mix;';

/** @param {string} code @returns {(x:unknown)=>unknown} */
function load(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:2000});
  assert.equal(typeof context.module.exports,'function');
  return /** @type {(x:unknown)=>unknown} */ (context.module.exports);
}

/** @param {(x:unknown)=>unknown} fn @param {unknown} input @returns {{value?:unknown,name?:string,message?:string}} */
function observe(fn,input) {
  try{return {value:fn(input)};}
  catch(error){const e=/** @type {Error} */ (error);return {name:e.name,message:e.message};}
}

test('native graph flattens nested expressions with native coercion order and no bytecode dispatcher',()=>{
  const emitted=virtualizeExpressionGraphs(source,'commonjs',{
    seed:'native-coercion',names:['mix'],backend:'native'
  });
  assert.equal(emitted.functions,1);
  assert.equal(emitted.instructions,6);
  assert.doesNotMatch(emitted.code,/switch\(/u);
  assert.match(emitted.code,/_ng_[0-9a-f]+/u);
  assert.ok(!emitted.code.includes('((x+7)*(x-5))'));
  const original=load(source),processed=load(emitted.code);
  assert.equal(processed.length,original.length);
  assert.equal(processed.name,original.name);
  const inputs=[0,-0,1,-1,3.5,255,1024,Infinity,-Infinity,NaN,'3','',true,false,null,
    undefined,4n,Symbol('s')];
  for(const input of inputs)assert.deepEqual(observe(processed,input),observe(original,input),String(input));
  for(let i=0;i<1800;i++) {
    const input=(i*191)/13-401;
    assert.deepEqual(observe(processed,input),observe(original,input));
  }
  /** @param {(x:unknown)=>unknown} fn */
  const inspect=fn=>{
    /** @type {string[]} */
    const hints=[];
    const receiver={[Symbol.toPrimitive](hint){hints.push(hint);return hints.length;}};
    return {result:observe(fn,receiver),hints};
  };
  assert.deepEqual(inspect(processed),inspect(original));
  assert.deepEqual(inspect(processed).hints,['default','number','default']);
});

test('native graph recognizes only proven pure graph structures and declines source observers',()=>{
  const declines=[
    'function mix(x){return x.a+7;}module.exports=mix;',
    'function mix(x){return x+1;}module.exports=mix;',
    'function mix(x){return (x+3)*(x+outside);}module.exports=mix;',
    'function mix(x){return (x+3)*(x-5);}module.exports=mix.toString();',
    'function mix(x){return (x+3)*(x-5);}eval("x=2");module.exports=mix;',
    'function mix(x){if(x)return x+3;return x-2;}module.exports=mix;'
  ];
  for(const candidate of declines) {
    const out=virtualizeExpressionGraphs(candidate,'commonjs',{
      seed:'native-decline',names:['mix'],backend:'native'
    });
    assert.equal(out.functions,0);
    assert.equal(out.code,candidate);
  }
  assert.throws(()=>virtualizeExpressionGraphs(source,'commonjs',{
    seed:'bad',names:['mix'],backend:/** @type {any} */ ('unknown')
  }),/Expected source/u);
});

test('explicit native graph opt-in is integrated in COO and SNO; conflicts are rejected',()=>{
  for(const mode of /** @type {('coo'|'sno')[]} */ (['coo','sno'])) {
    const out=obfuscateFiles([{path:'index.cjs',sourceType:'commonjs',code:source}],{
      mode,seed:'native-integration',experimentalNativeGraph:{'index.cjs':['mix']}
    });
    assert.equal(out.files[0].metrics.nativeGraphFunctions,1);
    assert.equal(out.files[0].metrics.nativeGraphInstructions,6);
    assert.equal(out.files[0].metrics.expressionVmFunctions,undefined);
    assert.equal(observe(load(/** @type {string} */ (out.files[0].code)),5).value,observe(load(source),5).value);
    assert.throws(()=>obfuscateFiles([{path:'index.cjs',code:source,sourceType:'commonjs'}],{
      mode,seed:'native-conflict',
      experimentalNativeGraph:{'index.cjs':['mix']},
      experimentalExpressionVm:{'index.cjs':['mix']}
    }),/two expression graph backends/u);
  }
});

test('native graph generated sample matches compiler bytes on Windows and Linux',async()=>{
  await buildSample(true);
  const native=load(await fs.readFile(path.join(__dirname,'../examples/native-graph/before.cjs'),'utf8'));
  const published=load(await fs.readFile(path.join(__dirname,'../examples/native-graph/after.cjs'),'utf8'));
  for(const value of [0,1,5,999,'4',null,NaN,4n]) {
    assert.deepEqual(observe(published,value),observe(native,value));
  }
});

test('hot-loop native graph reports measured budget under a dense-call workload',()=>{
  const output=virtualizeExpressionGraphs(source,'commonjs',{
    seed:'native-hot-path',names:['mix'],backend:'native'
  });
  const native=load(source),processed=load(output.code);
  /** @param {(x:unknown)=>unknown} fn @returns {number} */
  const work=fn=>{let sum=0;for(let i=0;i<250000;i++)sum^=/** @type {number} */ (fn(i&255));return sum;};
  assert.equal(work(processed),work(native));
  /** @param {(x:unknown)=>unknown} fn @returns {number} */
  const time=fn=>{const start=performance.now();work(fn);return performance.now()-start;};
  for(let i=0;i<7;i++){time(native);time(processed);}
  const baseline=[],candidate=[];
  for(let i=0;i<15;i++) {
    if(i&1){candidate.push(time(processed));baseline.push(time(native));}
    else{baseline.push(time(native));candidate.push(time(processed));}
  }
  const median=/** @param {number[]} values @returns {number} */ values=>
    [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const ratio=median(candidate)/median(baseline);
  console.log('Native expression graph hot-function median ratio '+ratio.toFixed(3)+'x');
  assert.ok(Number.isFinite(ratio)&&ratio>0);
});

test('CLI native graph emits executable two-module COO and SNO entry',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-native-graph-'));
  try {
    const cooIn=path.join(root,'coo-in'),cooOut=path.join(root,'coo-out');
    const snoIn=path.join(root,'sno-in'),snoOut=path.join(root,'sno-out');
    await fs.mkdir(cooIn);
    await fs.mkdir(snoIn);
    await atomicWrite(path.join(cooIn,'math.mjs'),
      'export function mix(x){return ((x+7)*(x-5))^((x+3)&255);}\n');
    await atomicWrite(path.join(cooIn,'index.mjs'),
      'import {mix} from "./math.mjs";console.log(mix(9));\n');
    /** @param {string} executable @param {string[]} args @returns {string} */
    const run=(executable,args)=>{
      const child=spawnSync(process.execPath,[executable,...args],{encoding:'utf8'});
      assert.equal(child.status,0,String(child.stderr));
      return child.stdout.trim();
    };
    run(path.join(__dirname,'../bin/coo.js'),[
      '--root',cooIn,'--entry','index.mjs','--out',cooOut,
      '--seed','native-graph-cli','--native-graph','math.mjs:mix'
    ]);
    assert.match(await fs.readFile(path.join(cooOut,'math.mjs'),'utf8'),/function mix\(/u);
    assert.equal(run(path.join(cooOut,'index.mjs'),[]),String(((9+7)*(9-5))^((9+3)&255)));
    await atomicWrite(path.join(snoIn,'index.cjs'),source);
    run(path.join(__dirname,'../bin/sno.js'),[
      '--root',snoIn,'--entry','index.cjs','--out',snoOut,
      '--seed','native-graph-cli','--native-graph','index.cjs:mix'
    ]);
    assert.match(await fs.readFile(path.join(snoOut,'index.cjs'),'utf8'),/const /u);
    const launcher=path.join(snoOut,'sno-entry.cjs');
    const launch='console.log(require('+JSON.stringify(launcher)+')(9))';
    const protectedOutput=spawnSync(process.execPath,['-e',launch],{encoding:'utf8'});
    assert.equal(protectedOutput.status,0,String(protectedOutput.stderr));
    assert.equal(protectedOutput.stdout.trim(),String(((9+7)*(9-5))^((9+3)&255)));
    await atomicWrite(path.join(snoOut,'index.cjs'),'module.exports=()=>999;');
    const tampered=spawnSync(process.execPath,[launcher],{encoding:'utf8'});
    assert.notEqual(tampered.status,0);
    assert.match(tampered.stderr,/Integrity check failed/u);
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
