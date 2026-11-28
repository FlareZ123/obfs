'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */

const observedState=
  'const state={secretField:71};export function inspect(){return state.secretField;}';
const mainSource=
  'import {inspect} from "./state.mjs";'+
  'console.log(JSON.stringify({source:CSS.escape(inspect),value:inspect()}));';
const primitiveMain=
  'import {inspect} from "./state.mjs";'+
  'console.log(JSON.stringify({escaped:CSS.escape("ordinary"),value:inspect()}));';

/**
 * Execute the true ESM module graph in a separate process. The CSS host
 * capability lives OUTSIDE the distributed source: no inline String() in
 * a compiled module can accidentally prove the source-observation guard.
 * @param {ModuleFile[]} files
 * @returns {Promise<string>}
 */
async function execute(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-css-source-'));
  try{
    for(const file of files)await fs.writeFile(path.join(dir,file.path),file.code);
    const setup='globalThis.CSS={escape(value){return String(value)}};'+
      'await import("./main.mjs");';
    const result=spawnSync(process.execPath,
      ['--input-type=module','--eval',setup],{
        cwd:dir,encoding:'utf8',timeout:10000
      });
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @param {string} main @returns {ModuleFile[]} */
function graph(main){
  return [{path:'state.mjs',sourceType:'module',code:observedState},
    {path:'main.mjs',sourceType:'module',code:main}];
}

for(const mode of /** @type {const} */(['coo','sco','sno'])){
  test(mode+' preserves imported function source exposed by external CSS.escape',async()=>{
    const files=graph(mainSource);
    const expected=await execute(files);
    assert.match(expected,/secretField/,'The external host must capture source');
    const output=obfuscateFiles(files,{
      mode,closedWorld:true,seed:'css-cross-mode-observer/'+mode,
      identifiers:false,strings:false,properties:true
    });
    assert.equal(output.files[0].code,observedState,
      'Original callable source may not change across the CSS host boundary');
    assert.equal(await execute(/** @type {ModuleFile[]} */ (output.files)),
      expected);
  });

  test(mode+' keeps local property rewrite yield for primitive CSS.escape',async()=>{
    const files=graph(primitiveMain);
    const expected=await execute(files);
    const output=obfuscateFiles(files,{
      mode,closedWorld:true,seed:'css-cross-mode-primitive/'+mode,
      identifiers:false,strings:false,properties:true
    });
    assert.ok(output.files[0].metrics.objects>=1 ||
      output.crossFile.properties>=1,
      'A primitive CSS.escape must not erase all private property renaming');
    assert.ok(!output.files[0].code.includes('secretField'),
      'A proven private property must actually be rewritten');
    assert.equal(await execute(/** @type {ModuleFile[]} */ (output.files)),
      expected);
  });
}
