'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');

/**
 * Source-paired repeated-use profile for a module-local literal Document.
 * The local receiver cannot invoke an inherited setter, even though a
 * standalone Function value is assigned on the hot path. Unlike the
 * browser's real Document setter, this write never string-coerces a Function.
 *
 * This script reports, but does not certify, the 2.5x full-session budget:
 * microbenchmarks have host/JIT variance and do not prove all applications.
 */
const source=[
  'const document={title:"ready",value:17,flag:true};',
  'const unrelated={privateScore:17};',
  'function privateHelper(value){return ((value^(value>>>3))+unrelated.privateScore)|0;}',
  'document.title=privateHelper;',
  'export function run(iterations){',
  '  let sum=0;',
  '  for(let index=0;index<iterations;index++){',
  '    document.title=privateHelper;',
  '    sum=(sum+privateHelper(index))|0;',
  '  }',
  '  return sum;',
  '}'
].join('\n');
const runner=[
  'import {run} from "./case.mjs";',
  'const count=Number(process.argv[2]);',
  'run(200000);',
  'const start=process.hrtime.bigint();',
  'const result=run(count);',
  'const milliseconds=Number(process.hrtime.bigint()-start)/1e6;',
  'process.stdout.write(JSON.stringify({result,milliseconds})+"\\n");'
].join('\n');
/** @param {number[]} values @returns {number} */
function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=sorted.length>>>1;
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
}
/**
 * @param {string} folder
 * @param {number} iterations
 * @returns {{result:number,hotMilliseconds:number,wallMilliseconds:number}}
 */
function run(folder,iterations){
  const started=performance.now();
  const result=spawnSync(process.execPath,[path.join(folder,'runner.mjs'),String(iterations)],{
    cwd:folder,encoding:'utf8',timeout:45000
  });
  const wallMilliseconds=performance.now()-started;
  assert.equal(result.status,0,result.stderr||result.error?.message);
  const row=JSON.parse(result.stdout);
  assert.ok(Number.isFinite(row.milliseconds)&&row.milliseconds>0);
  return {result:row.result,hotMilliseconds:row.milliseconds,wallMilliseconds};
}
/** @returns {void} */
function main(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent4-local-document-perf-'));
  try{
    const originalDir=path.join(dir,'native');
    fs.mkdirSync(originalDir);
    const count=Number(process.env.OBFS_AGENT4_PROFILE_ITERATIONS??'14000000');
    const rounds=Number(process.env.OBFS_AGENT4_PROFILE_ROUNDS??'6');
    if(!Number.isSafeInteger(count)||count<100000||count>100000000||
       !Number.isSafeInteger(rounds)||rounds<2||rounds>16)
      throw new TypeError('Invalid paired-profile size');
    const evidence=[];
    for(const mode of ['coo','sco','sno']) {
      const compiled=obfuscateFiles([{path:'case.mjs',code:source,sourceType:'module'}],{
        mode,seed:'agent4-v2-local-document-profile-'+mode,
        closedWorld:true,properties:true,identifiers:true,strings:false
      }).files[0];
      assert.ok(compiled.metrics.bindings>0,'Expected actual local identifier protection');
      const emittedDir=path.join(dir,mode);
      fs.mkdirSync(emittedDir);
      for(const folder of [originalDir,emittedDir])
        fs.writeFileSync(path.join(folder,'runner.mjs'),runner);
      fs.writeFileSync(path.join(originalDir,'case.mjs'),source);
      fs.writeFileSync(path.join(emittedDir,'case.mjs'),String(compiled.code));
      /** @type {number[]} */
      const nativeHot=[],emittedHot=[],nativeWall=[],emittedWall=[];
      /** @type {number|undefined} */
      let expectedResult=undefined;
      for(let step=0;step<rounds;step++){
        /** @type {Array<[string,number[],number[]]>} */
        const pairs=step%2===0?
          [[originalDir,nativeHot,nativeWall],[emittedDir,emittedHot,emittedWall]]:
          [[emittedDir,emittedHot,emittedWall],[originalDir,nativeHot,nativeWall]];
        for(const [folder,hot,wall] of pairs) {
          const result=run(folder,count);
          if(expectedResult===undefined)expectedResult=result.result;
          else assert.equal(result.result,expectedResult,'Native/emitted hot-loop answer drift');
          hot.push(result.hotMilliseconds);
          wall.push(result.wallMilliseconds);
        }
      }
      const nativeHotMs=median(nativeHot),emittedHotMs=median(emittedHot);
      const nativeWallMs=median(nativeWall),emittedWallMs=median(emittedWall);
      evidence.push({mode,iterations:count,rounds,
        protectedBindings:compiled.metrics.bindings,
        protectedProperties:compiled.metrics.properties,
        nativeHotMs,emittedHotMs,hotRatio:emittedHotMs/nativeHotMs,
        nativeWallMs,emittedWallMs,wallRatio:emittedWallMs/nativeWallMs
      });
    }
    console.log('AGENT4_LEXICAL_DOCUMENT_PROFILE '+JSON.stringify(evidence));
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
if(require.main===module)main();
module.exports={main};
