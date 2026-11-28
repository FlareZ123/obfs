'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,code:string,sourceType:'module'}} File */
const methods='export const escape=CSS.escape;';
const observed=
  'import {escape as cssEscape} from "./methods.mjs";'+
  'export function sample(x){return x^17;}'+
  'export const text=cssEscape(sample);';
const primitive=
  'import {escape as cssEscape} from "./methods.mjs";'+
  'export function sample(x){return x^17;}'+
  'export const text=cssEscape("ordinary");';

/**
 * Simulate a browser CSS namespace injected outside ESM files. Using an
 * actual imported method alias tests a cross-file import/export fact that
 * a single-module Function#toString scan cannot infer from syntax alone.
 * @param {File[]} files
 * @returns {Promise<{text:string,value:number}>}
 */
async function evaluate(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-css-imported-'));
  try{
    for(const file of files)await fs.writeFile(path.join(dir,file.path),file.code);
    const prelude='globalThis.CSS={escape(value){return String(value)}};'+
      'const m=await import("./user.mjs");'+
      'console.log(JSON.stringify({text:m.text,value:m.sample(7)}));';
    const proc=spawnSync(process.execPath,['--input-type=module','--eval',prelude],{
      cwd:dir,encoding:'utf8',timeout:12000
    });
    assert.equal(proc.status,0,proc.stderr);
    return /** @type {{text:string,value:number}} */(JSON.parse(proc.stdout));
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @param {string} user @returns {File[]} */
function graph(user){return [
  {path:'methods.mjs',sourceType:'module',code:methods},
  {path:'user.mjs',sourceType:'module',code:user}
];}

for(const mode of /** @type {const} */(['coo','sco','sno'])){
  test(mode+' imported native CSS.escape alias must preserve selected function source',async()=>{
    const files=graph(observed);
    const native=await evaluate(files);
    assert.match(native.text,/x\^17/);
    /** @type {ReturnType<typeof obfuscateFiles>|null} */
    let emitted=null;
    try{
      emitted=obfuscateFiles(files,{
        mode,seed:'css-import-source/'+mode,
        identifiers:false,strings:false,properties:false,
        experimentalWasmI32:{'user.mjs':['sample']}
      });
    }catch(error){
      // An explicit safe refusal is acceptable for a source-observing API.
      assert.match(String(error),/Wasm|source|declined/i);
      return;
    }
    const actual=await evaluate(/** @type {File[]} */(emitted.files));
    assert.deepEqual(actual,native,
      'Imported CSS.escape is a native source observer; a selected Wasm rewrite must decline');
  });

  test(mode+' imported native CSS.escape remains a valid primitive Wasm positive',async()=>{
    const files=graph(primitive);
    const native=await evaluate(files);
    const emitted=obfuscateFiles(files,{
      mode,seed:'css-import-primitive/'+mode,
      identifiers:false,strings:false,properties:false,
      experimentalWasmI32:{'user.mjs':['sample']}
    });
    assert.match(String(emitted.files[1].code),/WebAssembly/);
    assert.deepEqual(await evaluate(/** @type {File[]} */(emitted.files)),native);
  });
}
