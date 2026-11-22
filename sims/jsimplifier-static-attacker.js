'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {createRequire}=require('node:module');
const vm=require('node:vm');
const {transform}=require('esbuild');
const {pathToFileURL}=require('node:url');
const {prepare}=require('./polyvariant-app-four-way-control');

const TARGETS=['round1','round2','round3'];
const TOOL_COMMIT='eaa72ae63758957ac95b2f5e3391fefb96827987';

/** @param {string} value @returns {string} */
function sha256(value){return createHash('sha256').update(value).digest('hex');}

/**
 * @param {string} folder
 * @returns {Promise<string[]>}
 */
async function listFiles(folder){
  /** @type {string[]} */
  const result=[];
  /** @param {string} current @returns {Promise<void>} */
  async function visit(current){
    for(const entry of await fs.readdir(current,{withFileTypes:true})){
      const target=path.join(current,entry.name);
      if(entry.isDirectory())await visit(target);
      else if(entry.isFile())result.push(target);
    }
  }
  await visit(folder);
  return result.sort();
}

/**
 * Run the pinned JSIMPLIFIER CLI with LLM, dynamic and mixed plugins disabled.
 * The input is a disposable copy because JSIMPLIFIER rewrites it in place.
 *
 * @param {string} root
 * @param {string} source
 * @param {'minified'|'published'} variant
 * @param {string} scratch
 * @returns {Promise<{variant:string,outputDir:string,exitCode:number|null,signal:string|null,
 *   elapsedMs:number,modeFlagsConfirmed:boolean,stdout:string,stderr:string,
 *   outputs:{path:string,bytes:number,sha256:string,code:string}[],error?:string}>}
 */
async function runTool(root,source,variant,scratch){
  const inputDir=path.join(scratch,variant,'input');
  const outputDir=path.join(scratch,variant,'output');
  await fs.mkdir(inputDir,{recursive:true});
  await fs.mkdir(outputDir,{recursive:true});
  await fs.writeFile(path.join(inputDir,'math.mjs'),source,'utf8');
  const cli=path.join(root,'node_modules','tsx','dist','cli.mjs');
  const entry=path.join(root,'src','index.ts');
  const started=process.hrtime.bigint();
  const child=spawnSync(process.execPath,[
    cli,entry,'deobfuscate','--model=none',
    '--skip-dynamic-analysis','--skip-mixed-analysis','--skip-llm',
    '--outputDir',outputDir,'math.mjs'
  ],{
    cwd:inputDir,encoding:'utf8',timeout:240000,
    env:{...process.env,OPENAI_API_KEY:'',GEMINI_API_KEY:'',BASE_URL:''}
  });
  const elapsedMs=Number(process.hrtime.bigint()-started)/1e6;
  const logText=String(child.stdout??'')+'\n'+String(child.stderr??'');
  const modeFlagsConfirmed=['Skipping dynamic analysis module',
    'Skipping mixed analysis module','Skipping LLM renaming module'].every(
      marker=>logText.includes(marker));
  const outputs=[];
  if(child.status===0){
    for(const file of await listFiles(outputDir)){
      if(!/\.(?:m?js|cjs)$/u.test(file))continue;
      const code=await fs.readFile(file,'utf8');
      outputs.push({path:path.relative(outputDir,file),bytes:Buffer.byteLength(code),sha256:sha256(code),code});
    }
  }
  return {
    variant,outputDir,exitCode:child.status,signal:child.signal,elapsedMs,
    modeFlagsConfirmed,stdout:String(child.stdout??'').slice(-12000),
    stderr:String(child.stderr??'').slice(-6000),outputs,
    ...(child.error?{error:String(child.error)}:{})
  };
}

/**
 * Load a candidate output file as CommonJS after esbuild's syntax-only ESM
 * conversion. The tool output is isolated in a fresh VM context.
 *
 * @param {string} code
 * @param {string} filename
 * @param {string} toolRoot
 * @returns {Promise<Record<string,unknown>>}
 */
async function loadExports(code,filename,toolRoot){
  const converted=await transform(code,{
    loader:'js',format:'cjs',platform:'node',target:'node22',legalComments:'none'
  });
  const module={exports:{}};
  const outputRequire=createRequire(filename);
  const toolRequire=createRequire(path.join(toolRoot,'package.json'));
  /** @param {string} name */
  function localRequire(name){
    return name.startsWith('.')||path.isAbsolute(name)?outputRequire(name):toolRequire(name);
  }
  const context={
    module,exports:module.exports,
    require:localRequire,
    Buffer,process,console,
    setTimeout,clearTimeout,setInterval,clearInterval,
    global:undefined
  };
  context.global=context;
  context.globalThis=context;
  vm.runInNewContext(converted.code,context,{timeout:3000,filename});
  const result=module.exports&&typeof module.exports==='object'?
    /** @type {Record<string,unknown>} */(module.exports):{};
  const defaults=result.default&&typeof result.default==='object'?
    /** @type {Record<string,unknown>} */(result.default):{};
  return {...context,...result,...defaults};
}

/**
 * @param {string} root
 * @returns {Promise<Record<string,unknown>>}
 */
async function runEvidence(root){
  assert.ok(root&&path.isAbsolute(root),'OBFS_JSIMPLIFIER_ROOT must be absolute');
  const cli=path.join(root,'node_modules','tsx','dist','cli.mjs');
  await fs.access(cli);
  const revision=spawnSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'});
  assert.equal(revision.status,0,'Unable to verify JSIMPLIFIER checkout revision');
  assert.equal(revision.stdout.trim(),TOOL_COMMIT,'JSIMPLIFIER checkout is not the pinned source');
  const packageJson=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const licenseText=await fs.readFile(path.join(root,'LICENSE'),'utf8');
  const lockText=await fs.readFile(path.join(root,'package-lock.json'),'utf8');
  const {graphs}=await prepare();
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-jsimplifier-'));
  try{
    const originalDir=path.join(scratch,'original');
    await fs.mkdir(originalDir,{recursive:true});
    await fs.writeFile(path.join(originalDir,'math.mjs'),graphs.native[0].code,'utf8');
    const native=await import(pathToFileURL(path.join(originalDir,'math.mjs')).href);
    /** @type {Record<string,unknown>} */
    const results={};
    for(const variant of /** @type {const} */(['minified','published'])){
      const run=await runTool(root,graphs[variant][0].code,variant,scratch);
      let best={recovered:0,verified:0,comparisons:0,mismatches:0,loadErrors:[]};
      for(const output of run.outputs){
        try{
          const exports=await loadExports(output.code,path.join(run.outputDir,output.path),root);
          let recovered=0,verified=0,mismatches=0,comparisons=0;
          for(const name of TARGETS){
            const fn=exports[name];
            if(typeof fn!=='function')continue;
            recovered++;
            for(let index=0;index<4096;index++){
              const input=index<7?
                [-2147483648,-1,0,1,2147483647,-0,0x12345678|0][index]:
                Math.imul(index^0x5ac31eed,0x9e3779b1)|0;
              let actual;
              try{actual=fn(input);}catch(e){mismatches++;comparisons++;continue;}
              comparisons++;
              if(Object.is(actual,native[name](input)))verified++;
              else mismatches++;
            }
          }
          if(recovered>best.recovered||
             (recovered===best.recovered&&verified>best.verified)){
            best={recovered,verified,comparisons,mismatches,loadErrors:[]};
          }
        }catch(error){
          best.loadErrors.push(String(error));
        }
      }
      results[variant]={
        toolCommit:TOOL_COMMIT,exitCode:run.exitCode,signal:run.signal,
        elapsedMs:run.elapsedMs,modeFlagsConfirmed:run.modeFlagsConfirmed,
        stdout:run.stdout,stderr:run.stderr,
        outputs:run.outputs.map(({path,bytes,sha256})=>({path,bytes,sha256})),
        best:{...best,cloneSucceeded:run.modeFlagsConfirmed&&run.exitCode===0&&
          best.recovered===TARGETS.length&&best.verified===TARGETS.length*4096&&best.mismatches===0}
      };
    }
    return {
      tool:'XingTuLab/JSIMPLIFIER',toolCommit:TOOL_COMMIT,
      packageLicense:packageJson.license,
      licenseHeader:licenseText.split(/\r?\n/u).slice(0,2).join(' '),
      licenseMetadataMismatch:packageJson.license==='MIT'&&
        licenseText.includes('GNU GENERAL PUBLIC LICENSE'),
      packageLockSha256:process.env.JSIMPLIFIER_LOCK_SHA256??sha256(lockText),
      mode:'--model=none --skip-dynamic-analysis --skip-mixed-analysis --skip-llm',
      originalMathSha256:sha256(graphs.native[0].code),
      minifiedMathSha256:sha256(graphs.minified[0].code),
      publishedMathSha256:sha256(graphs.published[0].code),
      comparisonsPerRecoveredFunction:4096,
      results
    };
  }finally{
    await fs.rm(scratch,{recursive:true,force:true});
  }
}

if(require.main===module){
  const root=process.env.OBFS_JSIMPLIFIER_ROOT;
  if(!root)throw new Error('Set OBFS_JSIMPLIFIER_ROOT to the pinned external checkout');
  runEvidence(root).then(report=>{
    const json=JSON.stringify(report,null,2)+'\n';
    if(process.env.OBFS_JSIMPLIFIER_REPORT)
      return fs.writeFile(process.env.OBFS_JSIMPLIFIER_REPORT,json,'utf8')
        .then(()=>process.stdout.write(json));
    process.stdout.write(json);
  }).catch(error=>{
    console.error(error);process.exitCode=1;
  });
}

module.exports={runEvidence,runTool,loadExports};