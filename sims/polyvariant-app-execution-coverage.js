'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {parse,applyEdits}=require('../src/ast');
const {atomicWrite}=require('../src/atomic');
const {build}=require('../examples/polyvariant-app/build.cjs');
const {reconstructPublicMath}=require('./polyvariant-app-static-clone');

/** @typedef {{path:string,code:string}[]} SourceGroup */
/** @typedef {{kind:unknown,payload:unknown}[]} Records */
/** @typedef {{round1:number,round2:number,round3:number}} CallCounts */
/** @typedef {{events:number,codeUnits:number,expectedPerFunction:number,actual:Record<string,CallCounts>,hostEmissions:Record<string,number>}} CoverageRow */

const selected=Object.freeze(['round1','round2','round3']);
const fileNames=Object.freeze(['math.mjs','state.mjs','entry.mjs']);

/** @param {string} data @returns {string} */
function sha256(data){
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Identify the three actual exported arithmetic functions from delivered
 * source without trusting compiler transformation metrics.
 * @param {string} source
 * @returns {Map<string,import('../src/ast').AstNode>}
 */
function selectedFunctions(source){
  const ast=parse(source,'module');
  /** @type {Map<string,import('../src/ast').AstNode>} */
  const found=new Map();
  for(const item of ast.body){
    const fn=item.type==='ExportNamedDeclaration'?item.declaration:null;
    if(fn?.type!=='FunctionDeclaration'||!selected.includes(fn.id?.name))continue;
    assert.ok(!found.has(fn.id.name),'Duplicated selected function: '+fn.id.name);
    found.set(fn.id.name,fn);
  }
  assert.deepEqual([...found.keys()].sort(),[...selected].sort());
  return found;
}

/**
 * Instrument a disposable copy after compilation or independent attacker
 * rebuilding. The distributed application itself remains byte-for-byte
 * untouched. Each selected function counts entry independently of callers.
 * @param {string} source
 * @returns {string}
 */
function countFunctionEntries(source){
  const candidates=selectedFunctions(source);
  const edits=[];
  for(const [name,fn] of candidates){
    assert.equal(fn.body.type,'BlockStatement');
    edits.push({
      start:fn.body.start+1,
      end:fn.body.start+1,
      text:'globalThis.__obfsCoverageCounts.'+name+'++;'
    });
  }
  const output=applyEdits(source,edits);
  parse(output,'module');
  return output;
}

/**
 * @param {string} root
 * @param {SourceGroup} files
 * @returns {Promise<void>}
 */
async function writeGroup(root,files){
  await fs.mkdir(root,{recursive:true});
  for(const file of files){
    await atomicWrite(path.join(root,file.path),file.code);
  }
}

/** @returns {CallCounts} */
function freshCounts(){return {round1:0,round2:0,round3:0};}

/**
 * @param {{runScenario:(seed:number,records:Records,host:{emit:(value:unknown)=>void})=>string}} app
 * @param {Records} records
 * @returns {{value:string,counts:CallCounts,emitted:number}}
 */
function observe(app,records){
  const counts=freshCounts();
  /** @type {{__obfsCoverageCounts?:CallCounts}} */ (globalThis).__obfsCoverageCounts=counts;
  let emitted=0;
  const value=app.runScenario(-817,records,{emit(){emitted++;}});
  return {value,counts:{...counts},emitted};
}

/** @param {number} count @returns {Records} */
function records(count){
  return Array.from({length:count},(_,index)=>({
    kind:['start','tick','pause','stop'][index%4],
    payload:'data-'+index+(index%11===0?'終':'')+(index%13===0?'🧪':'')
  }));
}

/**
 * Check observed calls through native, compiler-generated and independently
 * recovered full three-file ESM graphs on exactly the same input sessions.
 * The counter does not estimate exclusive CPU time or security hardness.
 * @returns {Promise<{originalSourceSha256:string,distributedMathSha256:string,reconstructedMathSha256:string,selectedSourceBytes:number,selectedFunctionAstBytes:number,totalOriginalBytes:number,originalSelectedFraction:number,distributedMathBytes:number,reconstructedMathBytes:number,reconstructedFunctions:number,rows:CoverageRow[]}>}
 */
async function runEvidence(){
  const native=/** @type {SourceGroup} */ (await Promise.all(fileNames.map(async name=>({
    path:name,
    code:(await fs.readFile(path.join(__dirname,'../examples/polyvariant-app/native',name),'utf8')).replace(/\r\n/g,'\n')
  }))));
  const generated=/** @type {SourceGroup} */ ((await build()).files.map(file=>({
    path:file.path,code:/** @type {string} */ (file.code)
  })));
  assert.deepEqual(generated.map(file=>file.path),[...fileNames]);
  const nativeMath=native[0].code;
  const publishedMath=generated[0].code;
  const recovered=reconstructPublicMath(publishedMath);
  const recoveredFiles=generated.map(file=>({
    ...file,code:file.path==='math.mjs'?recovered.code:file.code
  }));
  const selectedFunctionAstBytes=[...selectedFunctions(nativeMath).values()].reduce(
    (total,fn)=>total+Buffer.byteLength(nativeMath.slice(fn.start,fn.end)),0);
  const selectedStart=nativeMath.indexOf('export function round1(');
  const selectedEnd=nativeMath.indexOf('/**',selectedStart);
  assert.ok(selectedStart>=0 && selectedEnd>selectedStart);
  const selectedSourceBytes=Buffer.byteLength(nativeMath.slice(selectedStart,selectedEnd));
  const totalOriginalBytes=native.reduce((total,file)=>
    total+Buffer.byteLength(file.code),0);
  assert.equal(selectedSourceBytes,309,'Frozen selected function source changed');
  assert.equal(totalOriginalBytes,2467,'Frozen original graph changed');
  assert.equal(recovered.functions.length,3);
  for(const name of fileNames.slice(1)){
    assert.equal(native.find(file=>file.path===name)?.code,
      generated.find(file=>file.path===name)?.code);
  }

  const variants={
    native,
    published:generated,
    reconstructed:recoveredFiles
  };
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-polyvariant-coverage-'));
  const prior=/** @type {{__obfsCoverageCounts?:CallCounts}} */ (globalThis).__obfsCoverageCounts;
  try{
    /** @type {Record<string,{runScenario:(seed:number,records:Records,host:{emit:(value:unknown)=>void})=>string}>} */
    const programs={};
    for(const [name,files] of Object.entries(variants)){
      const location=path.join(root,name);
      await writeGroup(location,files.map(file=>({
        ...file,
        code:file.path==='math.mjs'?countFunctionEntries(file.code):file.code
      })));
      programs[name]=await import(pathToFileURL(path.join(location,'entry.mjs')).href);
    }
    /** @type {CoverageRow[]} */
    const rows=[];
    for(const eventCount of [1,50,1000,10000]){
      const inputs=records(eventCount);
      const codeUnits=inputs.reduce((sum,input)=>
        sum+(String(input.kind)+':'+String(input.payload)).length,0);
      const expectedPerFunction=codeUnits;
      const observations=Object.fromEntries(Object.entries(programs).map(
        ([name,program])=>[name,observe(program,inputs)]));
      const expected=observations.native.value;
      /** @type {Record<string,CallCounts>} */
      const actual={};
      /** @type {Record<string,number>} */
      const hostEmissions={};
      for(const [name,observed] of Object.entries(observations)){
        assert.equal(observed.value,expected,
          'Full application output differs: '+name+' / '+eventCount);
        assert.equal(observed.emitted,eventCount,'External host trace length changed');
        for(const method of selected){
          assert.equal(observed.counts[/** @type {'round1'|'round2'|'round3'} */ (method)],
            expectedPerFunction,name+' did not execute protected function '+method+
            ' once per UTF-16 input unit');
        }
        actual[name]=observed.counts;
        hostEmissions[name]=observed.emitted;
      }
      rows.push({events:eventCount,codeUnits,expectedPerFunction,
        actual,hostEmissions});
    }
    return {
      originalSourceSha256:sha256(native.map(file=>file.path+'\0'+file.code+'\0').join('')),
      distributedMathSha256:sha256(publishedMath),
      reconstructedMathSha256:sha256(recovered.code),
      selectedSourceBytes,selectedFunctionAstBytes,totalOriginalBytes,
      originalSelectedFraction:selectedSourceBytes/totalOriginalBytes,
      distributedMathBytes:Buffer.byteLength(publishedMath),
      reconstructedMathBytes:Buffer.byteLength(recovered.code),
      reconstructedFunctions:recovered.functions.length,rows
    };
  }finally{
    if(prior===undefined)delete /** @type {{__obfsCoverageCounts?:CallCounts}} */ (globalThis).__obfsCoverageCounts;
    else /** @type {{__obfsCoverageCounts?:CallCounts}} */ (globalThis).__obfsCoverageCounts=prior;
    await fs.rm(root,{recursive:true,force:true});
  }
}

async function main(){
  const result=await runEvidence();
  process.stdout.write('POLYVARIANT_EXECUTION_COVERAGE '+
    JSON.stringify({node:process.version,platform:process.platform,...result})+'\n');
}
if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={runEvidence,countFunctionEntries};
