'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,code:string,sourceType:'module'}} File */
const methods=
  'const parser=new DOMParser();'+
  'export const parse=parser.parseFromString.bind(parser);';
const observed=
  'import {parse as parseHtml} from "./methods.mjs";'+
  'export function sample(x){return x^17;}'+
  'export const text=parseHtml(sample,"text/html").body.textContent;';
const primitive=
  'import {parse as parseHtml} from "./methods.mjs";'+
  'export function sample(x){return x^17;}'+
  'export const text=parseHtml("ordinary","text/html").body.textContent;';

/**
 * A parser methods module is the only place where DOMParser is named.
 * The consumer observes source through an *imported bound native method*.
 * @param {File[]} files
 * @returns {Promise<{text:string,value:number}>}
 */
async function evaluate(files){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dom-imported-'));
  try{
    for(const file of files)await fs.writeFile(path.join(dir,file.path),file.code);
    const prelude='globalThis.DOMParser=class {parseFromString(text,type){'+
      'if(type!=="text/html")throw Error("mime");'+
      'return {body:{textContent:String(text)}}}};'+
      'const m=await import("./user.mjs");'+
      'console.log(JSON.stringify({text:m.text,value:m.sample(7)}));';
    const proc=spawnSync(process.execPath,
      ['--input-type=module','--eval',prelude],{
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
  test(mode+' imported bound DOMParser method preserves native function source',async()=>{
    const files=graph(observed);
    const native=await evaluate(files);
    assert.match(native.text,/x\^17/);
    /** @type {ReturnType<typeof obfuscateFiles>|null} */
    let compiled=null;
    try{
      compiled=obfuscateFiles(files,{
        mode,seed:'dom-parser-imported/'+mode,
        identifiers:false,strings:false,properties:false,
        experimentalWasmI32:{'user.mjs':['sample']}
      });
    }catch(error){
      assert.match(String(error),/Wasm|source|declined/i);
      return;
    }
    assert.deepEqual(await evaluate(/** @type {File[]} */(compiled.files)),native,
      'Imported native parser coerces a function but source was modified');
  });

  test(mode+' imported bound DOMParser primitive retains nonvacuous Wasm',async()=>{
    const files=graph(primitive);
    const native=await evaluate(files);
    const compiled=obfuscateFiles(files,{
      mode,seed:'dom-parser-imported-primitive/'+mode,
      identifiers:false,strings:false,properties:false,
      experimentalWasmI32:{'user.mjs':['sample']}
    });
    assert.match(String(compiled.files[1].code),/WebAssembly/);
    assert.deepEqual(await evaluate(/** @type {File[]} */(compiled.files)),native);
  });
}
