'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {transformSync}=require('esbuild');
const {obfuscateFiles}=require('../src');
const {neutralizeHashedNames}=require('../sims/offline-normalize');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

let state=0x56221122;
/** @returns {number} */
function nextRandom() {
  state^=state<<13;
  state^=state>>>17;
  state^=state<<5;
  return state>>>0;
}

/**
 * Preserve unbundled ESM imports and the same distributed three-file trust
 * boundary. esbuild receives all and only the public input files.
 * @param {ModuleFile[]} files
 * @returns {ModuleFile[]}
 */
function minifiedControl(files) {
  return files.map(file=>({
    ...file,
    code:transformSync(file.code,{
      loader:'js',format:'esm',target:'node22',minify:true,
      sourcefile:file.path
    }).code
  }));
}

/**
 * @param {string} directory
 * @param {ModuleFile[]} files
 * @returns {Promise<string>}
 */
async function execute(directory,files) {
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const run=spawnSync(process.execPath,[path.join(directory,'main.mjs')],{
    encoding:'utf8',timeout:5000
  });
  if(run.error)throw run.error;
  assert.equal(run.status,0,run.stderr);
  assert.equal(run.stderr,'');
  return run.stdout;
}

/**
 * @param {number} index
 * @returns {ModuleFile[]}
 */
function sourceGraph(index) {
  const key='secret_'+index.toString(16)+'_'+nextRandom().toString(16);
  const number=nextRandom()%100000;
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const key='+JSON.stringify(key)+';'+
      'export const bag={'+key+':'+number+',guard:7};'},
    {path:'identity.mjs',sourceType:'module',
      code:'export const identity=value=>value;'},
    {path:'main.mjs',sourceType:'module',
      code:'import {bag,key} from "./state.mjs";'+
        'import {identity} from "./identity.mjs";'+
        'const owner=identity(bag);'+
        'console.log(owner[key]+owner.guard,Reflect.get(bag,key));'}
  ];
}

/** @param {ModuleFile[]} files @returns {number} */
function bytes(files) {
  return files.reduce((total,file)=>total+Buffer.byteLength(file.code,'utf8'),0);
}

test('16 source-paired COO protected fields have independent seedless static semantic clones',
  async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-import-key-fourway-'));
    const rows=[];
    try {
      for(let index=0;index<16;index++){
        const original=sourceGraph(index);
        const output=obfuscateFiles(original,{
          mode:'coo',closedWorld:true,strings:false,identifiers:false,
          seed:'import-key-fourway-20261122/'+index
        });
        assert.ok(output.crossFile.properties>=1,
          'positive protected field lost on case '+index);
        const protectedFiles=/** @type {ModuleFile[]} */ (output.files);
        const recovered=neutralizeHashedNames(protectedFiles);
        assert.ok(recovered.properties>=1,
          'seedless structural attacker had no hashed names on case '+index);
        const normalized=/** @type {ModuleFile[]} */ (recovered.files);
        const minified=minifiedControl(original);
        const native=await execute(path.join(root,'case'+index,'native'),original);
        const protectedOutput=await execute(path.join(root,'case'+index,'protected'),protectedFiles);
        const recoveredOutput=await execute(path.join(root,'case'+index,'normalized'),normalized);
        const minifiedOutput=await execute(path.join(root,'case'+index,'minified'),minified);
        assert.equal(protectedOutput,native,'protected case '+index);
        assert.equal(recoveredOutput,native,'static attacker case '+index);
        assert.equal(minifiedOutput,native,'equal-trust minifier case '+index);
        rows.push({
          fields:output.crossFile.properties,recoveredNames:recovered.properties,
          nativeBytes:bytes(original),protectedBytes:bytes(protectedFiles),
          recoveredBytes:bytes(normalized),minifiedBytes:bytes(minified)
        });
      }
      const aggregate={
        cases:rows.length,sourceSeed:'0x56221122',
        totalFields:rows.reduce((n,x)=>n+x.fields,0),
        totalRecoverableHashedNames:rows.reduce((n,x)=>n+x.recoveredNames,0),
        originalBytes:rows.reduce((n,x)=>n+x.nativeBytes,0),
        protectedBytes:rows.reduce((n,x)=>n+x.protectedBytes,0),
        neutralizedBytes:rows.reduce((n,x)=>n+x.recoveredBytes,0),
        equalTrustMinifiedBytes:rows.reduce((n,x)=>n+x.minifiedBytes,0),
        staticOracleQueries:0,allFourVariantsEquivalent:true
      };
      assert.equal(aggregate.cases,16);
      console.log('IMPORTED_KEY_FOUR_WAY '+JSON.stringify(aggregate));
    }finally{
      await fs.rm(root,{recursive:true,force:true});
    }
  });
