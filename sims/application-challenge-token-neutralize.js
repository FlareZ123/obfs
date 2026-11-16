'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {ROOT,NAMES,SEED}=require('../examples/application-challenge/build.cjs');
const {ablate,withOwnKeyCalls,withNullPrototypeRecord}=
  require('./application-challenge-observer-ablation');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */
/** @typedef {{variant:string,seed:number,renamed:number,normalizedProperties:number,normalizedLocals:number,differentialCases:number,heldoutCases:number,originalBytes:number,distributedBytes:number,neutralizedBytes:number,staticScanMs:number,publicOnlyAttackerMatched:boolean}} Row */

/**
 * @param {ModuleFile[]} files
 * @param {string} destination
 * @returns {Promise<void>}
 */
async function materialize(files,destination){
  await fs.mkdir(destination,{recursive:true});
  for(const file of files)await atomicWrite(path.join(destination,file.path),file.code);
}

/**
 * @param {string} directory
 * @param {number[][]} cases
 * @returns {unknown[]}
 */
function evaluate(directory,cases){
  const child=spawnSync(process.execPath,[
    path.join(directory,'entry.mjs'),JSON.stringify(cases)
  ],{encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return /** @type {unknown[]} */(JSON.parse(child.stdout));
}

/** @param {ModuleFile[]} files @returns {number} */
function byteCount(files){
  return files.reduce((total,file)=>total+Buffer.byteLength(file.code),0);
}

/**
 * An execution harness for an independent token-only attacker. The attacker is launched as a separate Node process with only a public
 * directory and an output directory. It imports neither compiler,
 * pre-obfuscation source nor seed, and does not recover private field names.
 *
 * Source deliberately has two different contracts: own-only removes an
 * original missing-field call; null-proto keeps that call but changes the
 * original object's prototype. Neither is the unchanged frozen application.
 *
 * @param {number} [seeds]
 * @returns {Promise<Row[]>}
 */
async function run(seeds=4){
  if(!Number.isSafeInteger(seeds)||seeds<1||seeds>20)
    throw new RangeError('seeds must be an integer between 1 and 20');
  /** @type {ModuleFile[]} */
  const original=await Promise.all(NAMES.map(async name=>({
    path:name,sourceType:'module',
    code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  const withoutObservers=ablate(original,'both');
  const cases=[[0,0],[0,1],[1,1],[4294967295,3],
    ...Array.from({length:80},(_,i)=>[
      Math.imul(i+37,2654435761)>>>0,(i*317)%5000
    ])];
  const heldout=Array.from({length:160},(_,i)=>[
    (Math.imul(i+0x1234,0x9e3779b1)^(i<<7))>>>0,
    (i*317)%5000
  ]);
  const variants=[
    {name:'own-only',files:withOwnKeyCalls(withoutObservers)},
    {name:'null-proto',files:withNullPrototypeRecord(withoutObservers)}
  ];
  const working=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-public-token-attack-'));
  /** @type {Row[]} */
  const rows=[];
  try{
    for(const variant of variants){
      const nativePath=path.join(working,variant.name,'native');
      await materialize(variant.files,nativePath);
      const native=evaluate(nativePath,cases);
      const heldoutNative=evaluate(nativePath,heldout);
      for(let i=0;i<seeds;i++){
        const built=obfuscateFiles(variant.files,{
          mode:'coo',closedWorld:true,seed:SEED+'/static-attack/'+i,
          identifiers:true,properties:true,strings:false
        });
        assert.equal(built.crossFile.properties,2,'Positive owner rewrites required');
        const publicFiles=/** @type {ModuleFile[]} */(built.files);
        const publicPath=path.join(working,variant.name,'public-'+i);
        const attackerPath=path.join(working,variant.name,'attacker-'+i);
        await materialize(publicFiles,publicPath);
        // Attacker process imports no compiler modules or original files;
        // its argv contains only the public directory and output directory.
        const attack=spawnSync(process.execPath,[
          path.join(__dirname,'application-challenge-token-neutralize-attacker.js'),
          publicPath,attackerPath
        ],{encoding:'utf8',timeout:15000});
        if(attack.error)throw attack.error;
        assert.equal(attack.status,0,attack.stderr);
        const scan=/** @type {{files:number,properties:number,variables:number,scanMs:number,bytes:number}} */(
          JSON.parse(attack.stdout));
        assert.equal(scan.files,NAMES.length);
        assert.ok(scan.properties>=2,'Two published field labels found');
        assert.deepEqual(evaluate(publicPath,cases),native);
        assert.deepEqual(evaluate(attackerPath,cases),native,
          'Seedless public token normalization must preserve complete behavior');
        assert.deepEqual(evaluate(attackerPath,heldout),heldoutNative,
          'Neutralized program must pass unseen application cases');
        rows.push({
          variant:variant.name,seed:i,renamed:built.crossFile.properties,
          normalizedProperties:scan.properties,
          normalizedLocals:scan.variables,
          differentialCases:cases.length,heldoutCases:heldout.length,
          originalBytes:byteCount(variant.files),
          distributedBytes:byteCount(publicFiles),
          neutralizedBytes:scan.bytes,
          staticScanMs:scan.scanMs,publicOnlyAttackerMatched:true
        });
      }
    }
    process.stdout.write('APPLICATION_PUBLIC_TOKEN_ATTACK '+JSON.stringify({
      method:'Acorn token-only static identifier normalization over emitted bytes; no originals in attacker call',
      node:process.version,platform:process.platform,rows
    })+'\n');
    return rows;
  }finally{
    await fs.rm(working,{recursive:true,force:true});
  }
}

if(require.main===module){
  run().catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={run};
