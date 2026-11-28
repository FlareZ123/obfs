'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {prepare}=require('./polyvariant-app-four-way-control');
const {loadExports}=require('./jsimplifier-static-attacker');

const TARGETS=['round1','round2','round3'];
/** @param {string|Buffer} value @returns {string} */
const sha256=value=>createHash('sha256').update(value).digest('hex');

/**
 * A separate, version-pinned external static/structural deobfuscator runs on
 * the same minified and published ESM math bytes as the established four-way
 * comparison. This tool never sees original source; the original is loaded
 * only by the *verifier* after the attacker output has been produced.
 *
 * @param {string} toolRoot
 * @returns {Promise<Record<string,unknown>>}
 */
async function runEvidence(toolRoot) {
  assert.ok(path.isAbsolute(toolRoot),'OBFS_WEBCRACK_ROOT must be absolute');
  const pkgPath=path.join(toolRoot,'node_modules','webcrack','package.json');
  const pkg=JSON.parse(await fs.readFile(pkgPath,'utf8'));
  assert.equal(pkg.version,'2.16.0','Webcrack attacker source must be pinned to 2.16.0');
  const entry=path.join(toolRoot,'node_modules','webcrack','dist','index.js');
  const installedEntry=await fs.readFile(entry);
  const lock=await fs.readFile(path.join(toolRoot,'package-lock.json'));
  const imported=await import(pathToFileURL(entry).href);
  assert.equal(typeof imported.webcrack,'function','The declared webcrack ESM API is unavailable');
  /** @type {(source:string)=>Promise<{code:string}>} */
  const attack=imported.webcrack;
  const {graphs}=await prepare();
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-webcrack-comparison-'));
  try{
    const nativeDir=path.join(scratch,'native');
    await fs.mkdir(nativeDir,{recursive:true});
    await fs.writeFile(path.join(nativeDir,'math.mjs'),graphs.native[0].code,'utf8');
    const native=await import(pathToFileURL(path.join(nativeDir,'math.mjs')).href);
    /** @type {Record<string,unknown>} */
    const results={};
    for(const variant of /** @type {const} */ (['minified','published'])){
      const input=String(graphs[variant][0].code);
      const started=process.hrtime.bigint();
      /** @type {{output:string,elapsedMs:number,error:string|null}} */
      const outcome={output:'',elapsedMs:0,error:null};
      try{
        // Fixed default API, not an adaptive attack chosen after seeing output.
        const result=await attack(input);
        assert.equal(typeof result.code,'string','webcrack returned no code');
        outcome.output=result.code;
      }catch(error){
        outcome.error=String(error);
      }finally{
        outcome.elapsedMs=Number(process.hrtime.bigint()-started)/1e6;
      }
      /** @type {{recovered:number,verified:number,comparisons:number,mismatches:number,loadError:string|null}} */
      const best={recovered:0,verified:0,comparisons:0,mismatches:0,loadError:null};
      const outPath=path.join(scratch,variant,'output.mjs');
      if(!outcome.error){
        await fs.mkdir(path.dirname(outPath),{recursive:true});
        await fs.writeFile(outPath,outcome.output,'utf8');
        try{
          const exports=await loadExports(outcome.output,outPath,toolRoot);
          for(const name of TARGETS){
            const candidate=exports[name];
            if(typeof candidate!=='function')continue;
            best.recovered++;
            for(let index=0;index<4096;index++){
              const inputValue=index<7?
                [-2147483648,-1,0,1,2147483647,-0,0x12345678|0][index]:
                Math.imul(index^0x5ac31eed,0x9e3779b1)|0;
              let actual;
              try{actual=candidate(inputValue);}catch(error){
                best.comparisons++;
                best.mismatches++;
                continue;
              }
              best.comparisons++;
              if(Object.is(actual,native[name](inputValue)))best.verified++;
              else best.mismatches++;
            }
          }
        }catch(error){
          best.loadError=String(error);
        }
      }
      results[variant]={
        inputSha256:sha256(input),inputBytes:Buffer.byteLength(input),
        toolElapsedMs:outcome.elapsedMs,
        error:outcome.error,
        outputSha256:outcome.error?null:sha256(outcome.output),
        outputBytes:outcome.error?null:Buffer.byteLength(outcome.output),
        outputChanged:outcome.error?null:outcome.output!==input,
        best:{...best,cloneSucceeded:!outcome.error&&!best.loadError&&
          best.recovered===TARGETS.length&&
          best.verified===TARGETS.length*4096&&best.mismatches===0}
      };
    }
    return {
      tool:'j4k0xb/webcrack',
      version:pkg.version,
      declaredLicense:pkg.license,
      installedIndexSha256:sha256(installedEntry),
      installedLockSha256:sha256(lock),
      nodeVersion:process.version,
      api:'webcrack(code), defaults; no LLM service configured',
      originalMathSha256:sha256(graphs.native[0].code),
      minifiedMathSha256:sha256(graphs.minified[0].code),
      publishedMathSha256:sha256(graphs.published[0].code),
      comparisonMethod:'4096 deterministic original-vs-attacker outputs per recovered name',
      results
    };
  }finally{
    await fs.rm(scratch,{recursive:true,force:true});
  }
}

if(require.main===module){
  const root=process.env.OBFS_WEBCRACK_ROOT;
  if(!root)throw new Error('Set OBFS_WEBCRACK_ROOT to the isolated pinned npm installation');
  runEvidence(root).then(async report=>{
    const json=JSON.stringify(report,null,2)+'\n';
    if(process.env.OBFS_WEBCRACK_REPORT)
      await fs.writeFile(process.env.OBFS_WEBCRACK_REPORT,json,'utf8');
    process.stdout.write('WEBCRACK_INDEPENDENT_ATTACK '+JSON.stringify(report)+'\n');
  }).catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={runEvidence};