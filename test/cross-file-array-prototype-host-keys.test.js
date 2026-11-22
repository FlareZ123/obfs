'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {'dense-oob'|'dense-alias-oob'|'sparse-hole'|'dense-owned'|'array-length'|'array-reduce'|'object-missing'|'object-owned'} Kind */

/**
 * A preloaded host accessor may load an already evaluated exported ESM owner
 * while an otherwise ordinary nested property read is in progress.
 * @param {Kind} kind
 * @returns {ModuleFile[]}
 */
function graph(kind){
  const object=kind.startsWith('object-');
  const sparse=kind==='sparse-hole';
  const value=object?'{own:3}':sparse?'['+','.repeat(43)+']':'[3,4]';
  const owned=['dense-owned','array-length','object-owned'].includes(kind);
  const expr={
    'dense-oob':'state.payload[41]',
    'dense-alias-oob':'alias[41]',
    'sparse-hole':'state.payload[41]',
    'dense-owned':'state.payload[0]',
    'array-length':'state.payload.length',
    'array-reduce':'state.payload.reduce((a,b)=>a+b,0)',
    'object-missing':'state.payload.ghost',
    'object-owned':'state.payload.own'
  }[kind];
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={payload:'+value+',score:11};'},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      'globalThis.HOST_ACTIVE=true;',
      kind==='dense-alias-oob'?'const alias=state.payload;':'',
      'const observed='+expr+';',
      owned?'await Promise.resolve();':'await globalThis.HOST_COMPLETION;',
      'console.log(JSON.stringify([observed,state.score,globalThis.HOST_KEYS??null]));'
    ].join('\n')}
  ];
}

/**
 * Native and emitted sources receive the same ordinary preloaded host
 * prototype extensions. The preloader is withheld from the compiler.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<unknown[]>}
 */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-array-proto-host-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preloader=[
      "'use strict';",
      "const path=require('node:path');",
      "const {pathToFileURL}=require('node:url');",
      "const url=pathToFileURL(path.join(__dirname,'state.mjs')).href;",
      'let finish;',
      'globalThis.HOST_COMPLETION=new Promise(resolve=>{finish=resolve;});',
      'globalThis.HOST_KEYS=null;',
      'globalThis.HOST_ACTIVE=false;',
      'let fired=false;',
      'function observe(){',
      '  if(!globalThis.HOST_ACTIVE||fired)return;',
      '  fired=true;',
      '  import(url).then(module=>{',
      '    globalThis.HOST_KEYS=Object.keys(module.state);',
      '  }).finally(finish);',
      '}',
      "Object.defineProperty(Array.prototype,'41',{",
      '  configurable:true,',
      '  get(){observe();return globalThis.HOST_ACTIVE?29:undefined;}',
      '});',
      'const originalReduce=Array.prototype.reduce;',
      "Object.defineProperty(Array.prototype,'reduce',{",
      '  configurable:true,',
      '  get(){observe();return originalReduce;}',
      '});',
      "Object.defineProperty(Object.prototype,'ghost',{",
      '  configurable:true,',
      '  get(){observe();return globalThis.HOST_ACTIVE?29:undefined;}',
      '});'
    ].join('\n');
    const preloadPath=path.join(root,'preload.cjs');
    await atomicWrite(preloadPath,preloader);
    const child=spawnSync(process.execPath,
      ['--require',preloadPath,path.join(root,'entry.mjs')],
      {encoding:'utf8',timeout:12000,maxBuffer:1024*1024});
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return /** @type {unknown[]} */(JSON.parse(child.stdout.trim()));
  }finally{await fs.rm(root,{recursive:true,force:true});}
}

for(const [kind,nativeResult,admit] of /** @type {[Kind,unknown[],boolean][]} */([
  ['dense-oob',[29,11,['payload','score']],false],
  ['dense-alias-oob',[29,11,['payload','score']],false],
  ['sparse-hole',[29,11,['payload','score']],false],
  ['array-reduce',[7,11,['payload','score']],false],
  ['object-missing',[29,11,['payload','score']],false],
  ['dense-owned',[3,11,null],true],
  ['array-length',[2,11,null],true],
  ['object-owned',[3,11,null],true]
])){
  test('host inherited-field observation parity: '+kind,async()=>{
    const original=graph(kind);
    const reference=await execute(original);
    assert.deepEqual(reference,nativeResult,
      'Native reference must reach the intended host prototype or own field');
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'host-inherited-field/'+kind,
      properties:true,strings:false,identifiers:false
    });
    assert.deepEqual(await execute(compiled.files),reference,
      'The host accessor can dynamically enumerate an already exported owner');
    assert.equal(compiled.crossFile.properties,admit?2:0,
      'Only statically proven own nested members retain key rewrites');
  });
}
