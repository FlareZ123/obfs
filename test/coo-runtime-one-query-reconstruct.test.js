'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const {createHash}=require('node:crypto');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../src/atomic');
const {obfuscateFiles}=require('../src');
const {build}=require('../examples/polyvariant-app/build.cjs');
const {reconstructFromRuntime}=require('../sims/coo-runtime-one-query-reconstruct');

/** @param {string} code @returns {Promise<any>} */
function importText(code){
  return import('data:text/javascript;base64,'+
    Buffer.from(code,'utf8').toString('base64'));
}

/** @param {(arg:any)=>unknown} fn @param {unknown} arg @returns {string} */
function invoke(fn,arg){
  try{return 'return:'+String(fn(arg));}
  catch(error){
    return 'throw:'+(error instanceof Error?error.name+':'+error.message:String(error));
  }
}

/**
 * @param {string} folder
 * @param {{path:string,code:string}[]} files
 * @returns {Promise<void>}
 */
async function materialize(folder,files){
  for(const file of files)
    await atomicWrite(path.join(folder,file.path),file.code);
}

test('three public runtime observations reproduce entire stateful COO application',async()=>{
  const generated=await build();
  assert.equal(generated.files.length,3);
  assert.equal(generated.files[0].metrics.polyvariantFunctions,3);
  assert.equal(generated.files[0].metrics.polyvariantPaths,6);
  const publishedCode=/** @type {string} */(generated.files[0].code);

  // No native source, compiler seed or compiler implementation is supplied
  // to the attacker. The verifier loads the native reference only afterward.
  const attack=await reconstructFromRuntime(publishedCode);
  assert.equal(attack.oracleCalls,3);
  assert.deepEqual(attack.functions.map(item=>item.name),[
    'round1','round2','round3'
  ]);
  assert.notEqual(attack.code,publishedCode);
  assert.ok(attack.reconstructedBytes<attack.publishedBytes);
  assert.doesNotMatch(attack.code,/_ap_input_[a-f0-9]{14}/u);

  const original=await import(pathToFileURL(path.join(__dirname,
    '../examples/polyvariant-app/native/math.mjs')).href);
  const rebuilt=await importText(attack.code);
  const published=await importText(publishedCode);
  const numeric=[-2147483648,-1,-0,0,1,2147483647,2147483648,
    Number.MAX_SAFE_INTEGER,Infinity,-Infinity,NaN,0.125,-1.125,
    null,undefined,true,false,'17','abc',Symbol('x'),1n];
  let numericComparisons=0;
  for(const {name,offset} of attack.functions){
    assert.equal(offset,original[name](0));
    for(const value of numeric){
      assert.equal(invoke(rebuilt[name],value),invoke(original[name],value),
        name+' original numeric/coercion value '+String(value));
      assert.equal(invoke(rebuilt[name],value),invoke(published[name],value),
        name+' published numeric/coercion value '+String(value));
      numericComparisons+=2;
    }
    for(let index=0;index<4096;index++){
      const input=(Math.imul(index^0x47d6a21e,0x9e3779b1)^0x6f13a4e2)|0;
      assert.equal(rebuilt[name](input),original[name](input));
      numericComparisons++;
    }
    for(const primitive of [5,'8',null,undefined,Symbol('test'),1n]){
      let nativeCalls=0,rebuiltCalls=0,publishedCalls=0;
      /** @param {()=>void} increment @returns {object} */
      const make=increment=>({
        [Symbol.toPrimitive](){increment();return primitive;}
      });
      const nativeArg=make(()=>nativeCalls++);
      const rebuiltArg=make(()=>rebuiltCalls++);
      const publicArg=make(()=>publishedCalls++);
      assert.equal(invoke(rebuilt[name],rebuiltArg),invoke(original[name],nativeArg));
      assert.equal(invoke(published[name],publicArg),invoke(original[name],
        make(()=>{})));
      assert.equal(nativeCalls,rebuiltCalls);
      assert.equal(publishedCalls,rebuiltCalls);
      assert.equal(rebuiltCalls,1);
    }
  }
  assert.equal(numericComparisons,3*(numeric.length*2+4096));

  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'coo-runtime-probe-'));
  try{
    const cloneDir=path.join(temporary,'clone');
    const publicDir=path.join(temporary,'published');
    const graph=generated.files.map(file=>({
      path:file.path,
      code:/** @type {string} */(file.code)
    }));
    await materialize(publicDir,graph);
    await materialize(cloneDir,graph.map(file=>({
      path:file.path,code:file.path==='math.mjs'?attack.code:file.code
    })));
    const originalEntry=await import(pathToFileURL(path.join(__dirname,
      '../examples/polyvariant-app/native/entry.mjs')).href);
    const publishedEntry=await import(pathToFileURL(path.join(publicDir,'entry.mjs')).href);
    const cloneEntry=await import(pathToFileURL(path.join(cloneDir,'entry.mjs')).href);
    for(const count of [1,50,1000,10000]){
      const records=Array.from({length:count},(_,index)=>({
        kind:['start','tick','pause','stop'][index%4],
        payload:'probe-'+index+(index%11===0?'終':'')+(index%13===0?'🧪':'')
      }));
      /** @type {unknown[]} */ const expectedTrace=[];
      /** @type {unknown[]} */ const publicTrace=[];
      /** @type {unknown[]} */ const cloneTrace=[];
      const originalJson=originalEntry.runScenario(-817,records,{
        /** @param {unknown} value */
        emit(value){expectedTrace.push(value);}
      });
      const publicJson=publishedEntry.runScenario(-817,records,{
        /** @param {unknown} value */
        emit(value){publicTrace.push(value);}
      });
      const cloneJson=cloneEntry.runScenario(-817,records,{
        /** @param {unknown} value */
        emit(value){cloneTrace.push(value);}
      });
      assert.equal(publicJson,originalJson,'published graph '+count);
      assert.equal(cloneJson,originalJson,'runtime-probe rebuilt graph '+count);
      assert.deepEqual(publicTrace,expectedTrace);
      assert.deepEqual(cloneTrace,expectedTrace);
      assert.equal(cloneTrace.length,count);
    }
  }finally{
    await fs.rm(temporary,{recursive:true,force:true});
  }
});

test('24 independently seeded published layouts all admit three-probe numeric cloning',async()=>{
  const inputFile=path.join(__dirname,'../examples/polyvariant-app/native/math.mjs');
  const nativeText=(await fs.readFile(inputFile,'utf8')).replace(/\r\n/g,'\n');
  const native=await import(pathToFileURL(inputFile).href);
  const digests=new Set();
  let observed=0,heldout=0;
  for(let index=0;index<24;index++){
    const result=obfuscateFiles([{
      path:'math.mjs',sourceType:/** @type {const} */ ('module'),code:nativeText
    }],{
      mode:'coo',seed:'runtime-three-probe/public-seed-'+index,
      closedWorld:false,strings:false,
      experimentalPolyvariantAffine:{'math.mjs':['round1','round2','round3']},
      experimentalPolyvariantCount:2
    });
    assert.equal(result.files[0].metrics.polyvariantFunctions,3);
    assert.equal(result.files[0].metrics.polyvariantPaths,6);
    const distributed=/** @type {string} */ (result.files[0].code);
    digests.add(createHash('sha256').update(distributed).digest('hex'));
    // The independent attacker receives only distributed source text,
    // even though this verifier holds the corresponding trusted original.
    const recovered=await reconstructFromRuntime(distributed);
    assert.equal(recovered.oracleCalls,3);
    observed+=recovered.oracleCalls;
    const rebuilt=await importText(recovered.code);
    for(const name of ['round1','round2','round3']){
      for(let trial=0;trial<128;trial++){
        const input=(Math.imul((index*131+trial)^0x761ec55d,0x9e3779b1)|0);
        assert.equal(rebuilt[name](input),native[name](input),
          'Randomized output '+index+'/'+name+'/'+trial);
        heldout++;
      }
    }
  }
  assert.equal(digests.size,24);
  assert.equal(observed,72);
  assert.equal(heldout,24*3*128);
});

test('one-probe affine inference declines non-Int32 public outputs',async()=>{
  const unsupported='export function round1(x){return "not-an-int32";}'+
    'export function round2(x){return x;}'+
    'export function round3(x){return x;}';
  await assert.rejects(reconstructFromRuntime(unsupported),/outside signed-Int32/u);
});

test('runtime reconstruction requires all advertised direct exported functions',async()=>{
  await assert.rejects(
    reconstructFromRuntime('export function round1(x){return x|0;}'),
    /Expected one direct public ESM function round2/u
  );
});
