'use strict';

/**
 * Independent, LLM-free source-only deobfuscator audit of an exact three-file
 * app. This is NOT an attacker-effort study or proof of source recovery:
 * preserved execution and original formula reconstruction are distinct.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {webcrack}=require('webcrack');
const {prepare}=require('./polyvariant-app-four-way-control');

const FUNCTION_NAMES=Object.freeze(['round1','round2','round3']);
const TARGETS=Object.freeze(['minified','published']);

/** @param {string|Buffer} data @returns {string} */
function sha256(data){return createHash('sha256').update(data).digest('hex');}

/** @param {string} file @returns {Promise<object>} */
async function recordToolProvenance(file){
  const packagePath=path.resolve(path.dirname(require.resolve('webcrack')),'..','package.json');
  const pkg=JSON.parse(await fs.readFile(packagePath,'utf8'));
  assert.equal(pkg.name,'webcrack');
  assert.equal(pkg.version,'2.16.0','Pinned external deobfuscator version drift');
  return {name:pkg.name,version:pkg.version,entrySha256:sha256(await fs.readFile(file)),
    packageJsonSha256:sha256(await fs.readFile(packagePath)),
    node:process.version,platform:process.platform,
    method:'published source only, unminify/deobfuscate, unpack:false, jsx:false, no sandbox'};
}

/** @param {number} i @returns {number} */
function testInput(i){
  return i<7?[-2147483648,-1,0,1,2147483647,-0,0x12345678|0][i]:
    Math.imul(i^0x5ac31eed,0x9e3779b1)|0;
}

/** @returns {Promise<object>} */
async function runEvidence(){
  const {graphs,protectedFunctions}=await prepare();
  assert.equal(protectedFunctions,3,'Protected test must actually rewrite three selected functions');
  const tool=await recordToolProvenance(require.resolve('webcrack'));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-webcrack-audit-'));
  try{
    const originalPath=path.join(root,'reference.mjs');
    await fs.writeFile(originalPath,graphs.native[0].code,'utf8');
    const reference=await import(pathToFileURL(originalPath).href);
    // A deliberately type-changing native-only mutation preserves the text
    // rendered by console/String but must be rejected by Object.is.
    const originalMath=graphs.native[0].code;
    const mutatedMath=originalMath.replace(
      'export function round1(input)',
      'function round1Original(input)')+
      '\nexport function round1(input){return String(round1Original(input));}\n';
    assert.notEqual(mutatedMath,originalMath,'Mutation control missing target');
    const mutationPath=path.join(root,'mutation-control.mjs');
    await fs.writeFile(mutationPath,mutatedMath,'utf8');
    const mutation=await import(pathToFileURL(mutationPath).href);
    assert.equal(String(mutation.round1(0)),String(reference.round1(0)),
      'Mutation must evade lossy text-only output comparison');
    assert.equal(Object.is(mutation.round1(0),reference.round1(0)),false,
      'Exact typed source oracle must reject console-equivalent mutation');
    const oracleMutationControl={textComparatorWouldMiss:true,
      exactTypedComparatorRejects:true};
    // Keep the original *complete* three-file graph as the heldout
    // behavioral reference, including the opaque host callback trace.
    const nativeDir=path.join(root,'original-graph');
    await fs.mkdir(nativeDir,{recursive:true});
    for(const file of graphs.native)
      await fs.writeFile(path.join(nativeDir,file.path),file.code,'utf8');
    const nativeApp=await import(pathToFileURL(path.join(nativeDir,'entry.mjs')).href);
    const events=Array.from({length:17},(_,index)=>({
      kind:['start','tick','pause','stop'][index%4],
      payload:'data-'+index+(index%11===0?'終':'')+(index%13===0?'🧪':'')
    }));
    const nativeTrace=[];
    const nativeOutput=nativeApp.runScenario(-817,events,{
      emit(value){nativeTrace.push(value);}
    });
    /** @type {Record<string,unknown>} */
    const variants={};
    for(const variant of TARGETS){
      const input=graphs[variant][0].code;
      const started=process.hrtime.bigint();
      /** @type {Record<string,unknown>} */
      const result={
        sourceSha256:sha256(input),inputBytes:Buffer.byteLength(input),
        outputBytes:null,outputSha256:null,elapsedMs:null,
        exportedFunctions:0,compared:0,mismatches:0,firstMismatches:[],
        executionParity:false,fullAppOutputParity:false,fullAppHostTraceParity:false,
        staticOriginalFormulaRecovered:'not measured',
        artifactIsStandaloneFunctionClone:false,
        error:null
      };
      try{
        // Deliberately supply no executable sandbox, opaque host callbacks, or
        // original source to the external tool.
        const transformed=await webcrack(input,{
          deobfuscate:true,unminify:true,unpack:false,jsx:false
        });
        const code=transformed.code;
        assert.equal(typeof code,'string');
        result.outputBytes=Buffer.byteLength(code);
        result.outputSha256=sha256(code);
        const outputPath=path.join(root,variant+'-webcrack.mjs');
        await fs.writeFile(outputPath,code,'utf8');
        const candidate=await import(pathToFileURL(outputPath).href);
        for(const name of FUNCTION_NAMES){
          if(typeof candidate[name]!=='function')continue;
          result.exportedFunctions=Number(result.exportedFunctions)+1;
          for(let i=0;i<4096;i++){
            const actual=candidate[name](testInput(i));
            const expected=reference[name](testInput(i));
            result.compared=Number(result.compared)+1;
            if(!Object.is(actual,expected)){
              result.mismatches=Number(result.mismatches)+1;
              if(result.firstMismatches.length<4)result.firstMismatches.push({name,index:i,actual,expected});
            }
          }
        }
        result.executionParity=result.exportedFunctions===3&&
          result.compared===3*4096&&result.mismatches===0;
        // Re-executability of public functions is a weak cloning signal; it
        // cannot show recovered source formulas or bypass of host locking.
        result.artifactIsStandaloneFunctionClone=result.executionParity;
        const graphDir=path.join(root,variant+'-complete-graph');
        await fs.mkdir(graphDir,{recursive:true});
        for(const file of graphs[variant])
          await fs.writeFile(path.join(graphDir,file.path),
            file.path==='math.mjs'?code:file.code,'utf8');
        const candidateApp=await import(pathToFileURL(path.join(graphDir,'entry.mjs')).href);
        const candidateTrace=[];
        const candidateOutput=candidateApp.runScenario(-817,events,{
          emit(value){candidateTrace.push(value);}
        });
        result.fullAppOutputParity=candidateOutput===nativeOutput;
        result.fullAppHostTraceParity=
          JSON.stringify(candidateTrace)===JSON.stringify(nativeTrace);
      }catch(error){
        result.error=String(error&&error.stack||error).slice(0,2000);
      }
      result.elapsedMs=Number(process.hrtime.bigint()-started)/1e6;
      variants[variant]=result;
    }
    return {scope:'frozen public math module only, two independent transformations',
      tool,sourceCommit:'a8a22f9aef6e7f0d487cebc23c87063376df55cb',
      protectedFunctions,oracleMutationControl,variants,
      interpretation:'Exact output parity is NOT original source reconstruction, anti-LLM evaluation, or a proof of tamper resistance. Full application checks cover one fixed stateful trace, not the unknown-host/source-observer matrix. Existing static attack runs independently recover 3/3 arithmetic functions.'};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module){
  runEvidence().then(async result=>{
    const json=JSON.stringify(result,null,2)+'\n';
    if(process.env.OBFS_WEBCRACK_REPORT)
      await fs.writeFile(process.env.OBFS_WEBCRACK_REPORT,json,'utf8');
    process.stdout.write(json);
    // Negative candidate performance is evidence, not a harness crash. A
    // failed ordinary-minification control, however, invalidates the method.
    const baseline=result.variants.minified;
    if(baseline.error||!baseline.executionParity||
       !baseline.fullAppOutputParity||!baseline.fullAppHostTraceParity)
      process.exitCode=2;
  }).catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={runEvidence,testInput,sha256};
