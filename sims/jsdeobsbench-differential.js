'use strict';

const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {atomicWrite}=require('../src/atomic');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');

/**
 * @typedef {{filename:string,original:string,test_cases:unknown[]}} OriginalRow
 * @typedef {OriginalRow & {obfuscated:string,obfs_source_sha256:string,obfs_output_sha256:string,obfs_source_type?:'script'|'commonjs'}} ObfuscatedRow
 * @typedef {{sample:number,cases:number,timeoutMs:number,seed:string}} Options
 * @typedef {{file:string,caseIndex:number,kind:string,detail?:string}} FailureRecord
 * @typedef {{samplePrograms:number,sourcePrograms:number,commonjsPrograms:number,
 *   transformedPrograms:number,totalCases:number,baselinePass:number,
 *   baselineFailure:number,baselineExpectedDisagrees:number,
 *   transformedMatches:number,transformedMismatches:number,transformedErrors:number,
 *   processLevelWallRatioMedian:number|null,processLevelWallRatioP95:number|null,
 *   processLevelWallRatioMax:number|null,processLevelWallRatioOverBudget:number,
 *   timingScope:string,failures:FailureRecord[]}} DifferentialReport
 */

/**
 * @param {string} file
 * @returns {Promise<Record<string,unknown>[]>}
 */
async function readJsonl(file) {
  const contents=await fs.readFile(file,'utf8');
  return contents.split(/\r?\n/u).filter(line=>line.trim()).map(line=>{
    const value=JSON.parse(line);
    if(!value||typeof value!=='object'||Array.isArray(value)) {
      throw new TypeError('Invalid JSONL object');
    }
    return /** @type {Record<string,unknown>} */ (value);
  });
}

/**
 * @param {string} source
 * @param {string} input
 * @param {number} timeoutMs
 * @param {string} [stdinFile] If supplied, attach a regular-file stdin for programs that reopen /dev/stdin.
 * @param {string} [entryFile] If supplied, execute a Node.js file with CommonJS wrapper semantics.
 * @returns {{status:number|null,stdout:string,stderr:string,timeout:boolean,nanoseconds:number}}
 */
function runSource(source,input,timeoutMs,stdinFile,entryFile) {
  /** @type {number|undefined} */
  let inputDescriptor;
  try {
    if(stdinFile!==undefined)inputDescriptor=fsSync.openSync(stdinFile,'r');
    const before=process.hrtime.bigint();
    const result=spawnSync(process.execPath,entryFile?[entryFile]:['-e',source],{
      ...(inputDescriptor===undefined ? {input}:{stdio:[inputDescriptor,'pipe','pipe']}),
      encoding:'utf8',timeout:timeoutMs,maxBuffer:1024*1024,windowsHide:true
    });
    const elapsed=Number(process.hrtime.bigint()-before);
    return {
      status:result.status,
      stdout:result.stdout??'',
      stderr:result.stderr??'',
      timeout:(/** @type {NodeJS.ErrnoException|undefined} */ (result.error))?.code==='ETIMEDOUT',
      nanoseconds:elapsed
    };
  } finally {
    if(inputDescriptor!==undefined)fsSync.closeSync(inputDescriptor);
  }
}

/**
 * @param {OriginalRow[]} rows
 * @param {number} count
 * @param {string} seed
 * @returns {OriginalRow[]}
 */
function selectSample(rows,count,seed) {
  return [...rows].sort((a,b)=>{
    /** @param {string} filename @returns {string} */
    const key=filename=>createHash('sha256')
      .update(seed).update('\0').update(filename).digest('hex');
    return key(a.filename).localeCompare(key(b.filename));
  }).slice(0,count===0?rows.length:count);
}

/**
 * Execute differential tests for trusted, previously audited benchmark data.
 * The intended CLI execution environment is a network-disabled, read-only
 * Docker container with a CPU and memory limit, since dataset source code is
 * third-party JavaScript. The script itself is not an OS sandbox.
 *
 * @param {string} originalFile
 * @param {string} transformedFile
 * @param {Options} options
 * @returns {Promise<DifferentialReport>}
 */
async function compareCorpus(originalFile,transformedFile,options) {
  const originals=await readJsonl(originalFile);
  const transformed=await readJsonl(transformedFile);
  /** @type {Map<string,ObfuscatedRow>} */
  const byName=new Map();
  for(const candidate of transformed) {
    if(typeof candidate.filename!=='string'||typeof candidate.obfuscated!=='string'||
        typeof candidate.obfs_source_sha256!=='string'||typeof candidate.obfs_output_sha256!=='string'||
        byName.has(candidate.filename)) {
      throw new TypeError('Invalid or duplicate transformed benchmark identity');
    }
    const digest=createHash('sha256').update(candidate.obfuscated).digest('hex');
    if(candidate.obfs_output_sha256!==digest) {
      throw new Error('Obfuscated output mismatch: '+candidate.filename);
    }
    byName.set(candidate.filename,/** @type {ObfuscatedRow} */ (/** @type {unknown} */ (candidate)));
  }
  /** @type {OriginalRow[]} */
  const compatible=[];
  for(const source of originals) {
    if(typeof source.filename!=='string'||typeof source.original!=='string'||
        !Array.isArray(source.test_cases))throw new TypeError('Malformed original item');
    const match=byName.get(source.filename);
    if(!match)continue;
    const digest=createHash('sha256').update(source.original).digest('hex');
    if(match.obfs_source_sha256!==digest)throw new Error('Source mismatch: '+source.filename);
    compatible.push(/** @type {OriginalRow} */ (/** @type {unknown} */ (source)));
  }
  if(!compatible.length)throw new Error('No matching input and obfuscated items');
  const selected=selectSample(compatible,options.sample,options.seed);
  let total=0;
  let baselinePass=0;
  let baselineFailure=0;
  let baselineExpectedDisagrees=0;
  let transformedMatches=0;
  let transformedMismatches=0;
  let transformedErrors=0;
  /** @type {number[]} */
  const ratios=[];
  /** @type {FailureRecord[]} */
  const failures=[];
  // A pipe passed as a child process's stdin cannot be reopened through
  // /dev/stdin on Linux: open('/proc/self/fd/0') may return ENXIO. Benchmark
  // fixtures often rely on this exact path, so supply a regular read-only
  // descriptor backed by a bounded temporary filesystem.
  const tempRoot=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-bench-'));
  const stdinFile=path.join(tempRoot,'stdin.txt');
  try {
  for(const item of selected) {
    const candidate=byName.get(item.filename);
    if(!candidate)throw new Error('Lost matched row');
    if(candidate.obfs_source_type!==undefined &&
        !['script','commonjs'].includes(candidate.obfs_source_type)) {
      throw new TypeError('Unknown compiled source type');
    }
    const commonjs=candidate.obfs_source_type==='commonjs';
    const originalFile=path.join(tempRoot,'original.cjs');
    const transformedFile=path.join(tempRoot,'compiled.cjs');
    if(commonjs) {
      await atomicWrite(originalFile,item.original);
      await atomicWrite(transformedFile,candidate.obfuscated);
    }
    for(let index=0;index<Math.min(options.cases,item.test_cases.length);index++) {
      const pair=item.test_cases[index];
      if(!Array.isArray(pair)||pair.length!==2||
          typeof pair[0]!=='string'||typeof pair[1]!=='string') {
        throw new TypeError('Invalid input/output test pair');
      }
      total++;
      await atomicWrite(stdinFile,pair[0]);
      const original=runSource(item.original,pair[0],options.timeoutMs,stdinFile,commonjs?originalFile:undefined);
      if(original.timeout||original.status!==0) {
        baselineFailure++;
        if(failures.length<10)failures.push({file:item.filename,caseIndex:index,kind:'baseline-error',
          detail:'status='+original.status+' timeout='+original.timeout+' stderr='+original.stderr.slice(0,240)});
        continue;
      }
      baselinePass++;
      if(original.stdout.trim()!==pair[1].trim())baselineExpectedDisagrees++;
      const output=runSource(candidate.obfuscated,pair[0],options.timeoutMs,stdinFile,commonjs?transformedFile:undefined);
      if(output.timeout||output.status!==0) {
        transformedErrors++;
        if(failures.length<10)failures.push({file:item.filename,caseIndex:index,kind:'transformed-error',
          detail:'status='+output.status+' timeout='+output.timeout+' stderr='+output.stderr.slice(0,240)});
      } else if(output.stdout!==original.stdout||output.stderr!==original.stderr) {
        transformedMismatches++;
        if(failures.length<10)failures.push({file:item.filename,caseIndex:index,kind:'differential-output',
          detail:'expected='+original.stdout.slice(0,120)+' actual='+output.stdout.slice(0,120)});
      } else {
        transformedMatches++;
        ratios.push(output.nanoseconds/original.nanoseconds);
      }
    }
  }
  } finally {
    await fs.rm(tempRoot,{recursive:true,force:true});
  }
  ratios.sort((a,b)=>a-b);
  return {
    samplePrograms:selected.length,sourcePrograms:originals.length,
    commonjsPrograms:selected.filter(item=>byName.get(item.filename)?.obfs_source_type==='commonjs').length,
    transformedPrograms:transformed.length,totalCases:total,
    baselinePass,baselineFailure,baselineExpectedDisagrees,
    transformedMatches,transformedMismatches,transformedErrors,
    processLevelWallRatioMedian:ratios.length?ratios[Math.floor(ratios.length/2)]:null,
    processLevelWallRatioP95:ratios.length?ratios[Math.floor(ratios.length*0.95)]:null,
    processLevelWallRatioMax:ratios.length?ratios[ratios.length-1]:null,
    processLevelWallRatioOverBudget:ratios.filter(ratio=>ratio>2.5).length,
    timingScope:'whole Node process, includes spawn and V8 startup, not a hot-path 2.5x measurement',
    failures
  };
}

/** @param {string[]} args @returns {{originalFile:string,transformedFile:string,options:Options,minimumBaselineRate:number}} */
function parseArgs(args) {
  /** @type {Record<string,string>} */
  const values={};
  for(let i=0;i<args.length;i+=2) {
    if(!['--original','--transformed','--sample','--cases','--timeout','--seed','--min-baseline-rate'].includes(args[i])||
        args[i+1]===undefined||Object.hasOwn(values,args[i]))throw new TypeError('Invalid argument pairs');
    values[args[i]]=args[i+1];
  }
  if(!values['--original']||!values['--transformed'])throw new TypeError('Missing benchmark JSONL paths');
  const options={
    sample:Number(values['--sample']??50),
    cases:Number(values['--cases']??2),
    timeoutMs:Number(values['--timeout']??3000),
    seed:values['--seed']??'obfs-evaluation-v1'
  };
  if(!Number.isSafeInteger(options.sample)||options.sample<0||
      !Number.isSafeInteger(options.cases)||options.cases<1||
      !Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<100) {
    throw new TypeError('Invalid numeric evaluation parameter');
  }
  const minimumBaselineRate=Number(values['--min-baseline-rate']??0.95);
  if(!Number.isFinite(minimumBaselineRate)||minimumBaselineRate<0||minimumBaselineRate>1) {
    throw new TypeError('--min-baseline-rate must be in [0,1]');
  }
  return {originalFile:values['--original'],transformedFile:values['--transformed'],options,minimumBaselineRate};
}

if(require.main===module) {
  const {originalFile,transformedFile,options,minimumBaselineRate}=parseArgs(process.argv.slice(2));
  compareCorpus(originalFile,transformedFile,options).then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    // Ineligible original fixtures are excluded from paired comparisons, but
    // insufficient native coverage must fail CI rather than falsely appear green.
    if(result.totalCases===0 || result.baselinePass/result.totalCases<minimumBaselineRate ||
        result.transformedMismatches || result.transformedErrors)process.exitCode=1;
  }).catch(error=>{
    process.stderr.write(String(error?.stack??error)+'\n');
    process.exitCode=1;
  });
}

module.exports={runSource,selectSample,compareCorpus,parseArgs};
