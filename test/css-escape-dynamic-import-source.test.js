'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} File */

/**
 * A literal dynamic import is a real dependency even when syntactically
 * absent from the static ESM import declarations. Runtime CSS is injected
 * outside the code group to match the native browser host boundary.
 * @param {File[]} files
 * @returns {Promise<{text:string,value:number}>}
 */
async function evaluate(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-css-dynamic-'));
  try{
    for(const file of files)await fs.writeFile(path.join(dir,file.path),file.code);
    const source='globalThis.CSS={escape(x){return String(x)}};'+
      'const data=await import("./user.mjs");'+
      'console.log(JSON.stringify({text:data.text,value:data.sample(7)}));';
    const proc=spawnSync(process.execPath,['--input-type=module','--eval',source],{
      cwd:dir,encoding:'utf8',timeout:10000
    });
    assert.equal(proc.status,0,proc.stderr);
    return /** @type {{text:string,value:number}} */(JSON.parse(proc.stdout));
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @type {Array<[string,string,string]>} */
const variants=[
  ['top-level-await-destructured',
    'const {escape:cssEscape}=await import("./methods.mjs");','cssEscape'],
  ['top-level-await-namespace',
    'const cssTools=await import("./methods.mjs");','cssTools.escape'],
  ['top-level-await-namespace-dynamic-key',
    'const cssTools=await import("./methods.mjs");const key="escape";','cssTools[key]']
];

for(const [name,preamble,callee] of variants){
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    for(const observes of [true,false]){
      test(mode+' dynamic import '+name+(observes?' source':' primitive'),async()=>{
        /** @type {File[]} */
        const files=[
          {path:'methods.mjs',sourceType:'module',
            code:'export const escape=CSS.escape;'},
          {path:'user.mjs',sourceType:'module',
            code:preamble+
              'export function sample(x){return x^17;}'+
              'export const text='+callee+(observes?'(sample);':'("ordinary");')}
        ];
        const native=await evaluate(files);
        if(observes)assert.match(native.text,/x\^17/);
        /** @type {ReturnType<typeof obfuscateFiles>|null} */
        let compiled=null;
        try{
          compiled=obfuscateFiles(files,{
            mode,seed:'css-dynamic/'+name+'/'+mode+'/'+observes,
            identifiers:false,strings:false,properties:false,
            experimentalWasmI32:{'user.mjs':['sample']}
          });
        }catch(error){
          if(!observes)throw error;
          assert.match(String(error),/Wasm|source|declined/i);
          return;
        }
        assert.ok(compiled);
        if(!observes) {
          const output=compiled.files.find(file=>file.path==='user.mjs');
          assert.ok(output);
          assert.match(String(output.code),/WebAssembly/);
        }
        assert.deepEqual(await evaluate(/** @type {File[]} */(compiled.files)),native);
      });
    }
  }
}
