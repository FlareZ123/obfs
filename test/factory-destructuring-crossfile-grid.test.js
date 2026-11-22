'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {normalizeDistributedFiles}=require('../sims/attacker-token-normalize');

/**
 * Execute an ESM graph in a fresh Node process, never the compiler process.
 * @param {import('../src/core').SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-factory-pattern-grid-'));
  try {
    for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
    const run=spawnSync(process.execPath,[path.join(folder,'entry.mjs')],{
      encoding:'utf8',timeout:7000
    });
    assert.equal(run.status,0,run.stderr);
    return run.stdout.trim();
  }finally {
    await fs.rm(folder,{recursive:true,force:true});
  }
}

/**
 * Construct a closed ESM graph where the exported object comes from a
 * single-use private factory and is consumed by a discarded assignment
 * destructuring pattern in another file. Existing isolated proofs cover
 * these operations separately; this matrix protects their composition.
 * @param {number} index
 * @param {'positive'|'escape'|'reflection'|'repeated-factory'} kind
 * @returns {import('../src/core').SourceFile[]}
 */
function graph(index,kind) {
  const secret='privateValue'+index;
  const extra='auxiliaryValue'+index;
  const first=index%4===0 ? 0 : index*13+5;
  const second=index*3+7;
  const key=JSON.stringify(secret);
  const other=JSON.stringify(extra);
  const make='const make=()=>({'+key+':'+first+','+other+':'+second+'});';
  const state=make+(kind==='repeated-factory'?'const unused=make();':'')+
    'export const shared=make();';
  const begin='import {shared} from "./state.mjs";let captured=0,fallbacks=0;'+
    'function fallback(){fallbacks++;return 777;}';
  const assignment='({['+key+']:captured=fallback()}=shared);';
  const entry=kind==='escape' ?
    begin+'const leaked='+assignment.slice(0,-1)+';'+
      'console.log(captured,Object.keys(leaked).join(","));' :
    kind==='reflection' ?
      begin+assignment+'console.log(captured,Object.keys(shared).join(","));' :
      begin+assignment+'console.log(captured,shared['+other+'],fallbacks);';
  return [
    {path:'state.mjs',sourceType:'module',code:state},
    {path:'entry.mjs',sourceType:'module',code:entry}
  ];
}

/**
 * @param {import('../src/core').SourceFile[]} files
 * @param {number} index
 * @param {'coo'|'sno'|'sco'} mode
 * @returns {ReturnType<typeof obfuscateFiles>}
 */
function compile(files,index,mode) {
  return obfuscateFiles(files,{
    mode,closedWorld:true,strings:false,identifiers:false,
    seed:'factory-pattern-composition-'+index
  });
}

test('36 cross-mode factory-to-imported-destructuring graphs rewrite both own keys',async()=>{
  let rewritten=0;
  for(let index=0;index<12;index++)for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const source=graph(index,'positive');
    const output=compile(source,index,mode);
    assert.equal(output.crossFile.objects,1,'seed '+index);
    assert.equal(output.crossFile.properties,2,'seed '+index);
    const native=await execute(source);
    assert.equal(await execute(output.files),native,'seed '+index);
    rewritten+=output.crossFile.properties;
    if(index===0 && mode==='coo') {
      const normalized=normalizeDistributedFiles(output.files.map(file=>({
        path:file.path,code:String(file.code),sourceType:'module'
      })));
      assert.equal(normalized.properties,2);
      assert.equal(await execute(normalized.files),native);
    }
  }
  assert.equal(rewritten,72);
});

test('108 cross-mode factory graphs with escaping/reflection/repeated calls decline',async()=>{
  let declines=0;
  for(let index=0;index<12;index++)for(const kind of
      /** @type {const} */ (['escape','reflection','repeated-factory']))
      for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
    const source=graph(index,kind);
    const output=compile(source,index,mode);
    assert.equal(output.crossFile.objects,0,'seed '+index+' '+kind);
    assert.equal(output.crossFile.properties,0,'seed '+index+' '+kind);
    assert.equal(await execute(output.files),await execute(source),
      'seed '+index+' '+kind);
    declines++;
  }
  assert.equal(declines,108);
});
