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

/** @type {Array<{name:string,methods:string,consumerImport:string,callee:string,relay?:string}>} */
const provenanceCases=[
  {name:'direct-named',methods:'export const escape=CSS.escape;',
    consumerImport:'import {escape as cssEscape} from "./methods.mjs";',
    callee:'cssEscape'},
  {name:'namespace-method',methods:'export const escape=CSS.escape;',
    consumerImport:'import * as cssTools from "./methods.mjs";',
    callee:'cssTools.escape'},
  {name:'default-method',methods:'export default CSS.escape;',
    consumerImport:'import cssEscape from "./methods.mjs";',
    callee:'cssEscape'},
  {name:'namespace-destructuring',methods:'export const escape=CSS.escape;',
    consumerImport:'import * as cssTools from "./methods.mjs";const {escape:cssEscape}=cssTools;',
    callee:'cssEscape'},
  {name:'namespace-local-alias',methods:'export const escape=CSS.escape;',
    consumerImport:'import * as cssTools from "./methods.mjs";const cssEscape=cssTools.escape;',
    callee:'cssEscape'},
  {name:'namespace-computed-method',methods:'export const escape=CSS.escape;',
    consumerImport:'import * as cssTools from "./methods.mjs";const key="escape";',
    callee:'cssTools[key]'},
  {name:'bound-export',methods:'export const native=CSS.escape.bind(CSS);',
    consumerImport:'import {native as cssEscape} from "./methods.mjs";',
    callee:'cssEscape'},
  {name:'default-reexport',methods:'export default CSS.escape;',
    relay:'export {default as safe} from "./methods.mjs";',
    consumerImport:'import {safe as cssEscape} from "./relay.mjs";',
    callee:'cssEscape'},
  {name:'export-rename',methods:'const local=CSS.escape;export {local as safeEsc};',
    consumerImport:'import {safeEsc as cssEscape} from "./methods.mjs";',
    callee:'cssEscape'},
  {name:'ambient-namespace-alias',
    methods:'const origin=CSS;export const htmlSafe=origin.escape;',
    consumerImport:'import {htmlSafe as cssEscape} from "./methods.mjs";',
    callee:'cssEscape'},
  {name:'explicit-reexport',methods:'export const escape=CSS.escape;',
    relay:'export {escape as cssSafe} from "./methods.mjs";',
    consumerImport:'import {cssSafe as cssEscape} from "./relay.mjs";',
    callee:'cssEscape'},
  {name:'export-star',methods:'export const escape=CSS.escape;',
    relay:'export * from "./methods.mjs";',
    consumerImport:'import {escape as cssEscape} from "./relay.mjs";',
    callee:'cssEscape'},
  {name:'reexport-alias-namespace',methods:'export const escape=CSS.escape;',
    relay:'export {escape as cssSafe} from "./methods.mjs";',
    consumerImport:'import * as cssTools from "./relay.mjs";',
    callee:'cssTools.cssSafe'}
];

for(const variant of provenanceCases){
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    for(const observes of [true,false]){
      test(mode+' imported CSS provenance '+variant.name+
        (observes?' source':' primitive'),async()=>{
        const user=variant.consumerImport+
          'export function sample(x){return x^17;}'+
          'export const text='+variant.callee+
          (observes?'(sample);':'("ordinary");');
        /** @type {File[]} */
        const files=[{path:'methods.mjs',sourceType:'module',
          code:variant.methods}];
        if(variant.relay!==undefined)
          files.push({path:'relay.mjs',sourceType:'module',code:variant.relay});
        files.push({path:'user.mjs',sourceType:'module',code:user});
        const native=await evaluate(files);
        if(observes)assert.match(native.text,/x\^17/);
        /** @type {ReturnType<typeof obfuscateFiles>|null} */
        let compiled=null;
        try{
          compiled=obfuscateFiles(files,{
            mode,seed:'css-import-matrix/'+variant.name+'/'+mode+'/'+observes,
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
          const emitted=compiled.files.find(file=>file.path==='user.mjs');
          assert.ok(emitted);
          assert.match(String(emitted.code),/WebAssembly/,
            'A CSS primitive argument must leave private Wasm selection eligible');
        }
        assert.deepEqual(await evaluate(/** @type {File[]} */ (compiled.files)),native);
      });
    }
  }
}

for(const mode of /** @type {const} */(['coo','sco','sno'])) {
  test(mode+' source-safe imported ordinary callback retains Wasm yield',async()=>{
    /** @type {File[]} */
    const files=[
      {path:'methods.mjs',sourceType:'module',
        code:'export const stable=(value)=>"fixed";'},
      {path:'user.mjs',sourceType:'module',
        code:'import {stable as cssEscape} from "./methods.mjs";'+
          'export function sample(x){return x^17;}'+
          'export const text=cssEscape(sample);'}
    ];
    const native=await evaluate(files);
    assert.equal(native.text,'fixed');
    const output=obfuscateFiles(files,{
      mode,seed:'css-import-ordinary-callback/'+mode,
      identifiers:false,strings:false,properties:false,
      experimentalWasmI32:{'user.mjs':['sample']}
    });
    assert.match(String(output.files[1].code),/WebAssembly/);
    assert.deepEqual(await evaluate(/** @type {File[]} */ (output.files)),native);
  });
}
