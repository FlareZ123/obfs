'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {transformSync}=require('esbuild');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {'coo'|'sno'|'sco'} Mode */
/** @typedef {{answer:[number,number],hotCpuUs:number,sessionCpuUs:number,hotMs:number}} Observation */
/** @typedef {{nativeCpuUs:number,candidateCpuUs:number,ratio:number,nativeSessionCpuUs:number,candidateSessionCpuUs:number,sessionRatio:number}} Pair */

/**
 * This two-file graph runs one genuinely imported, private factory object.
 * No source text, external JSON object identity or filesystem state is relied
 * on by the protected function.
 * @param {number} [iterations]
 * @returns {import('../src/core').SourceFile[]}
 */
function fixture(iterations=11000000) {
  if(!Number.isSafeInteger(iterations)||iterations<1)
    throw new RangeError('Expected positive integer protected iteration count');
  const state='const make=()=>({privateScore:17,weight:13});export const owner=make();';
  const entry=[
    'import {owner} from "./state.mjs";',
    'let fallbackCalls=0;',
    'function fallback(){fallbackCalls++;return 999;}',
    'function work(count){',
    '  let acc=0;',
    '  for(let i=0;i<count;i++){',
    '    let score=0;',
    '    ({privateScore:score=fallback()}=owner);',
    '    acc=(Math.imul(acc^score^i,1664525)+owner.weight)|0;',
    '  }',
    '  return [acc,fallbackCalls];',
    '}',
    'for(let i=0;i<5;i++)work(100000);',
    'const begin=process.cpuUsage();',
    'const start=performance.now();',
    'const answer=work('+iterations+');',
    'const hotMs=performance.now()-start;',
    'const hot=process.cpuUsage(begin);',
    'const session=process.cpuUsage();',
    'console.log(JSON.stringify({answer,hotCpuUs:hot.user+hot.system,',
    '  sessionCpuUs:session.user+session.system,hotMs}));'
  ].join('\n');
  return [
    {path:'state.mjs',sourceType:'module',code:state},
    {path:'entry.mjs',sourceType:'module',code:entry}
  ];
}

/**
 * @param {string} directory
 * @param {import('../src/core').SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<void>}
 */
async function publish(directory,files) {
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
}

/**
 * Launch a fresh ESM graph without retaining V8's module cache.
 * @param {string} folder
 * @returns {Observation}
 */
function observe(folder) {
  const run=spawnSync(process.execPath,[path.join(folder,'entry.mjs')],{
    encoding:'utf8',timeout:45000,maxBuffer:1024*1024,windowsHide:true
  });
  assert.equal(run.status,0,run.stderr);
  /** @type {Observation} */
  const value=JSON.parse(run.stdout.trim());
  assert.ok(Array.isArray(value.answer)&&value.answer.length===2);
  assert.equal(value.answer[1],0,'Default expression must not execute');
  assert.ok(Number.isFinite(value.hotCpuUs)&&value.hotCpuUs>0);
  assert.ok(Number.isFinite(value.sessionCpuUs)&&value.sessionCpuUs>0);
  assert.ok(Number.isFinite(value.hotMs)&&value.hotMs>=0);
  return value;
}

/** @param {number[]} numbers @returns {number} */
function median(numbers) {
  const sorted=[...numbers].sort((a,b)=>a-b);
  assert.ok(sorted.length>0);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2?
    sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

/** @param {number} n @returns {number} */
function rounded(n) {
  return Number(n.toFixed(5));
}

/**
 * Every pair is a new process in alternating order. Include a native/native
 * placebo, as CPU clocks and OS scheduling may create apparent violations
 * without a substantive source change.
 * @param {string} control
 * @param {string} candidate
 * @param {number} repetitions
 * @returns {{pairs:Pair[],hotMedianRatio:number,hotWorstRatio:number,hotStrictBreaches:number,sessionMedianRatio:number,sessionWorstRatio:number,sessionStrictBreaches:number}}
 */
function compare(control,candidate,repetitions) {
  /** @type {Pair[]} */
  const pairs=[];
  for(let i=0;i<repetitions;i++) {
    const nativeFirst=i%2===0;
    const first=observe(nativeFirst?control:candidate);
    const second=observe(nativeFirst?candidate:control);
    const native=nativeFirst?first:second;
    const transformed=nativeFirst?second:first;
    assert.deepEqual(transformed.answer,native.answer,'Native and candidate results diverged');
    pairs.push({
      nativeCpuUs:native.hotCpuUs,
      candidateCpuUs:transformed.hotCpuUs,
      ratio:rounded(transformed.hotCpuUs/native.hotCpuUs),
      nativeSessionCpuUs:native.sessionCpuUs,
      candidateSessionCpuUs:transformed.sessionCpuUs,
      sessionRatio:rounded(transformed.sessionCpuUs/native.sessionCpuUs)
    });
  }
  return {
    pairs,
    hotMedianRatio:rounded(median(pairs.map(pair=>pair.ratio))),
    hotWorstRatio:rounded(Math.max(...pairs.map(pair=>pair.ratio))),
    hotStrictBreaches:pairs.filter(pair=>pair.ratio>2.5).length,
    sessionMedianRatio:rounded(median(pairs.map(pair=>pair.sessionRatio))),
    sessionWorstRatio:rounded(Math.max(...pairs.map(pair=>pair.sessionRatio))),
    sessionStrictBreaches:pairs.filter(pair=>pair.sessionRatio>2.5).length
  };
}

/**
 * Evaluate all modes against original source, ordinary equal-trust esbuild
 * minification, and an unmodified native/native placebo. Preserve raw
 * samples and strict per-pair violations, including negative observations.
 * @returns {Promise<{node:string,platform:string,sourceFiles:number,iterations:number,rows:{
 *  mode:Mode,protectedKeys:number,nativeBytes:number,obfuscatedBytes:number,minifiedBytes:number,
 *  emitted:ReturnType<typeof compare>,minified:ReturnType<typeof compare>,
 *  placebo:ReturnType<typeof compare>}[]}>}
 */
async function run() {
  const iterations=Number(process.env.OBFS_FACTORY_WORK_COUNT??11000000);
  const original=fixture(iterations);
  const minified=original.map(file=>({
    path:file.path,sourceType:/** @type {'module'} */ ('module'),
    code:transformSync(/** @type {string} */ (file.code),{
      format:'esm',minify:true,target:'es2022',legalComments:'none'
    }).code
  }));
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-factory-paired-'));
  try {
    const nativePath=path.join(root,'native');
    const minifiedPath=path.join(root,'minified');
    await publish(nativePath,original);
    await publish(minifiedPath,minified);
    const nativeAnswer=observe(nativePath).answer;
    assert.deepEqual(observe(minifiedPath).answer,nativeAnswer);

    /** @type {Awaited<ReturnType<typeof run>>['rows']} */
    const rows=[];
    for(const mode of /** @type {Mode[]} */ (['coo','sno','sco'])) {
      const compiled=obfuscateFiles(original,{
        mode,closedWorld:true,seed:'factory-destructuring-paired/'+mode,
        identifiers:false,strings:false
      });
      assert.equal(compiled.crossFile.objects,1,mode);
      assert.equal(compiled.crossFile.properties,2,mode);
      const emittedPath=path.join(root,'emitted-'+mode);
      await publish(emittedPath,compiled.files);
      assert.deepEqual(observe(emittedPath).answer,nativeAnswer);
      rows.push({
        mode,protectedKeys:compiled.crossFile.properties,
        nativeBytes:original.reduce((sum,file)=>sum+Buffer.byteLength(/** @type {string} */ (file.code)),0),
        obfuscatedBytes:compiled.files.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0),
        minifiedBytes:minified.reduce((sum,file)=>sum+Buffer.byteLength(file.code),0),
        emitted:compare(nativePath,emittedPath,8),
        minified:compare(nativePath,minifiedPath,8),
        placebo:compare(nativePath,nativePath,8)
      });
    }
    return {node:process.version,platform:process.platform,sourceFiles:original.length,iterations,rows};
  }finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module)run().then(result=>
  process.stdout.write('FACTORY_DESTRUCTURING_PAIRED '+JSON.stringify(result)+'\n')
).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={run,fixture,compare,observe};
