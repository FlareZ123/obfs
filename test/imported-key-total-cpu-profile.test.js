'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {transformSync}=require('esbuild');
const {obfuscateFiles}=require('../src');
const {familywiseBudgetBounds}=require('../sims/familywise-budget-bound');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{answer:number,cpuMicroseconds:number}} Sample */

/** @returns {ModuleFile[]} */
function sourceGraph(){
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const key="secretField";export const bag={secretField:657,guard:11};'},
    {path:'identity.mjs',sourceType:'module',
      code:'export function identity(value){return value;}'},
    {path:'main.mjs',sourceType:'module',
      code:'import {bag,key} from "./state.mjs";'+
        'import {identity} from "./identity.mjs";'+
        'const length=Number(process.argv[2]);let checksum=0;'+
        'for(let i=0;i<length;i++){'+
        'const owner=identity(bag);checksum=(checksum+(owner[key]^i))|0;}'+
        'const usage=process.cpuUsage();'+
        'console.log(JSON.stringify({answer:checksum,'+
        'cpuMicroseconds:usage.userCPUTime+usage.systemCPUTime}));'}
  ];
}

/**
 * @param {ModuleFile[]} files
 * @param {string} directory
 * @returns {Promise<void>}
 */
async function materialize(files,directory){
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
}

/**
 * Includes process startup and ESM module loading, unlike a hot-loop-only
 * performance.now measurement. Every variant runs in a fresh Node process.
 * @param {string} folder
 * @param {number} iterations
 * @returns {Sample}
 */
function execute(folder,iterations){
  const child=spawnSync(process.execPath,[path.join(folder,'main.mjs'),String(iterations)],{
    encoding:'utf8',timeout:10000
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  assert.equal(child.stderr,'');
  const result=/** @type {Sample} */ (JSON.parse(child.stdout));
  assert.ok(Number.isSafeInteger(result.answer));
  assert.ok(Number.isFinite(result.cpuMicroseconds)&&result.cpuMicroseconds>0);
  return result;
}

/** @param {number[]} samples @returns {number} */
function median(samples){
  const sorted=[...samples].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

test('paired total-process CPU and behavioral parity for one proved imported-key COO owner',
  async()=>{
    const source=sourceGraph();
    const output=obfuscateFiles(source,{
      mode:'coo',closedWorld:true,strings:false,identifiers:false,
      seed:'imported-key-total-process-cpu-20261122'
    });
    assert.ok(output.crossFile.properties>0,'hot work must use genuinely renamed owner fields');
    const generated=/** @type {ModuleFile[]} */ (output.files);
    const minified=source.map(file=>({
      ...file,code:transformSync(file.code,{
        loader:'js',format:'esm',target:'node22',minify:true,sourcefile:file.path
      }).code
    }));
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-import-key-cpu-'));
    /** @type {Array<{iterations:number,pairs:number,native:number[],
     *   coo:number[],esbuild:number[],cooNativeRatioOfMedians:number,
     *   cooEsbuildRatioOfMedians:number,strictObservedOverBudgetPairs:number,
     *   maximumPairedRatio:number}>} */
    const rows=[];
    try{
      for(const [kind,files] of /** @type {Array<[string,ModuleFile[]]>} */ ([
        ['native',source],['coo',generated],['esbuild',minified]
      ]))await materialize(files,path.join(root,kind));
      for(const iterations of [1,10000,2000000]){
        const samples={native:[],coo:[],esbuild:[]};
        let violations=0,maxRatio=0;
        for(let index=0;index<9;index++){
          const order=index%2===0 ? ['native','coo','esbuild'] :
            ['esbuild','coo','native'];
          /** @type {Record<string,Sample>} */
          const result={};
          for(const kind of order)
            result[kind]=execute(path.join(root,kind),iterations);
          assert.equal(result.coo.answer,result.native.answer);
          assert.equal(result.esbuild.answer,result.native.answer);
          samples.native.push(result.native.cpuMicroseconds);
          samples.coo.push(result.coo.cpuMicroseconds);
          samples.esbuild.push(result.esbuild.cpuMicroseconds);
          const ratio=result.coo.cpuMicroseconds/result.native.cpuMicroseconds;
          if(ratio>2.5)violations++;
          maxRatio=Math.max(maxRatio,ratio);
        }
        rows.push({
          iterations,pairs:9,
          native:samples.native,coo:samples.coo,esbuild:samples.esbuild,
          cooNativeRatioOfMedians:median(samples.coo)/median(samples.native),
          cooEsbuildRatioOfMedians:median(samples.coo)/median(samples.esbuild),
          strictObservedOverBudgetPairs:violations,
          maximumPairedRatio:maxRatio
        });
      }
      const familywise=familywiseBudgetBounds(rows.map(row=>({
        native:row.native,candidate:row.coo
      })));
      console.log('IMPORTED_KEY_TOTAL_CPU '+JSON.stringify({
        source:'one three-module ESM graph',
        privateFields:output.crossFile.properties,
        measuredBoundary:'fresh child process startup + ESM imports + selected work',
        familywise,rows
      }));
    }finally{
      await fs.rm(root,{force:true,recursive:true});
    }
  });
