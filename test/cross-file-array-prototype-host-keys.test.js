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

/**
 * A preloaded host accessor may load an already evaluated exported ESM owner
 * while an otherwise innocuous array index read is in progress.
 * @param {'dense-oob'|'sparse-hole'|'dense-owned'} kind
 * @returns {ModuleFile[]}
 */
function graph(kind) {
  const sparse=kind==='sparse-hole';
  const index=kind==='dense-owned'?0:41;
  const elements=sparse?'['+','.repeat(43)+']':'[3]';
  const wait=kind!=='dense-owned';
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={payload:'+elements+',score:11};'},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      'globalThis.HOST_ACTIVE=true;',
      'const value=state.payload['+index+'];',
      wait?'await globalThis.HOST_COMPLETION;':'await Promise.resolve();',
      'console.log(JSON.stringify([value,state.score,globalThis.HOST_KEYS??null]));'
    ].join('\n')}
  ];
}

/**
 * Native and emitted source get the same ambient Array prototype getter.
 * This preloader is withheld from the compile-time ESM graph deliberately.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<unknown[]>}
 */
async function execute(files) {
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
      "Object.defineProperty(Array.prototype,'41',{",
      '  configurable:true,',
      '  get(){',
      '    if(globalThis.HOST_ACTIVE&&!fired){',
      '      fired=true;',
      '      import(url).then(module=>{',
      '        globalThis.HOST_KEYS=Object.keys(module.state);',
      '      }).finally(finish);',
      '    }',
      '    return 29;',
      '  }',
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

for(const kind of /** @type {const} */(['dense-oob','sparse-hole','dense-owned'])){
  test('host Array.prototype inherited-index parity: '+kind,async()=>{
    const original=graph(kind);
    const reference=await execute(original);
    const expected=kind==='dense-owned'?
      [3,11,null]:[29,11,['payload','score']];
    assert.deepEqual(reference,expected,'Native reference must reach the intended host getter');
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'host-inherited-array/'+kind,
      properties:true,strings:false,identifiers:false
    });
    assert.deepEqual(await execute(compiled.files),reference,
      'An inherited host getter may dynamically observe the exported owner');
    assert.equal(compiled.crossFile.properties,kind==='dense-owned'?2:0,
      'Only the own, non-host index read can retain the key-rewrite proof');
  });
}
