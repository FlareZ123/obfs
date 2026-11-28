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

/** @type {Array<{name:string,methods:string,consumerImport:string,callee:string,relay?:string}>} */
const provenanceCases=[
  {name:'named-bound',methods:'const p=new DOMParser();export const parse=p.parseFromString.bind(p);',
    consumerImport:'import {parse as parseHtml} from "./methods.mjs";',
    callee:'parseHtml'},
  {name:'constructor-alias',
    methods:'const C=DOMParser;const p=new C();const f=p.parseFromString.bind(p);export {f as parse};',
    consumerImport:'import {parse as parseHtml} from "./methods.mjs";',
    callee:'parseHtml'},
  {name:'global-constructor',
    methods:'const C=globalThis.DOMParser;const p=new C();export const parse=p.parseFromString.bind(p);',
    consumerImport:'import {parse as parseHtml} from "./methods.mjs";',
    callee:'parseHtml'},
  {name:'prototype-bind',
    methods:'const p=new DOMParser();export const parse=DOMParser.prototype.parseFromString.bind(p);',
    consumerImport:'import {parse as parseHtml} from "./methods.mjs";',
    callee:'parseHtml'},
  {name:'detached-method-bind',
    methods:'const p=new DOMParser();const read=p.parseFromString;export const parse=read.bind(p);',
    consumerImport:'import {parse as parseHtml} from "./methods.mjs";',
    callee:'parseHtml'},
  {name:'default-export',
    methods:'const p=new DOMParser();export default p.parseFromString.bind(p);',
    consumerImport:'import parseHtml from "./methods.mjs";',
    callee:'parseHtml'},
  {name:'namespace-member',
    methods:'const p=new DOMParser();export const parse=p.parseFromString.bind(p);',
    consumerImport:'import * as htmlTools from "./methods.mjs";',
    callee:'htmlTools.parse'},
  {name:'namespace-local-method-alias',
    methods:'const p=new DOMParser();export const parse=p.parseFromString.bind(p);',
    consumerImport:'import * as htmlTools from "./methods.mjs";const parseHtml=htmlTools.parse;',
    callee:'parseHtml'},
  {name:'namespace-destructuring',
    methods:'const p=new DOMParser();export const parse=p.parseFromString.bind(p);',
    consumerImport:'import * as htmlTools from "./methods.mjs";const {parse:parseHtml}=htmlTools;',
    callee:'parseHtml'},
  {name:'namespace-computed',
    methods:'const p=new DOMParser();export const parse=p.parseFromString.bind(p);',
    consumerImport:'import * as htmlTools from "./methods.mjs";const k="parse";',
    callee:'htmlTools[k]'},
  {name:'renamed-reexport',
    methods:'const p=new DOMParser();export const parse=p.parseFromString.bind(p);',
    relay:'export {parse as htmlRead} from "./methods.mjs";',
    consumerImport:'import {htmlRead as parseHtml} from "./relay.mjs";',
    callee:'parseHtml'},
  {name:'export-star',
    methods:'const p=new DOMParser();export const parse=p.parseFromString.bind(p);',
    relay:'export * from "./methods.mjs";',
    consumerImport:'import {parse as parseHtml} from "./relay.mjs";',
    callee:'parseHtml'},
  {name:'namespace-reexport',
    methods:'const p=new DOMParser();export const parse=p.parseFromString.bind(p);',
    relay:'export {parse as htmlRead} from "./methods.mjs";',
    consumerImport:'import * as htmlTools from "./relay.mjs";',
    callee:'htmlTools.htmlRead'}
];

for(const variant of provenanceCases) {
  for(const mode of /** @type {const} */(['coo','sco','sno'])) {
    for(const observes of [true,false]){
      test(mode+' imported DOMParser provenance '+variant.name+
        (observes?' source':' primitive'),async()=>{
        const user=variant.consumerImport+
          'export function sample(x){return x^17;}'+
          'export const text='+variant.callee+
          (observes?'(sample,"text/html").body.textContent;':
            '("ordinary","text/html").body.textContent;');
        /** @type {File[]} */
        const files=[{path:'methods.mjs',sourceType:'module',code:variant.methods}];
        if(variant.relay!==undefined)
          files.push({path:'relay.mjs',sourceType:'module',code:variant.relay});
        files.push({path:'user.mjs',sourceType:'module',code:user});
        const native=await evaluate(files);
        if(observes)assert.match(native.text,/x\^17/);
        /** @type {ReturnType<typeof obfuscateFiles>|null} */
        let emitted=null;
        try {
          emitted=obfuscateFiles(files,{
            mode,seed:'domparser-provenance/'+variant.name+'/'+mode+'/'+observes,
            identifiers:false,strings:false,properties:false,
            experimentalWasmI32:{'user.mjs':['sample']}
          });
        }catch(error) {
          if(!observes)throw error;
          assert.match(String(error),/Wasm|source|declined/i);
          return;
        }
        assert.ok(emitted);
        if(!observes){
          const selected=emitted.files.find(file=>file.path==='user.mjs');
          assert.ok(selected);
          assert.match(String(selected.code),/WebAssembly/);
        }
        assert.deepEqual(await evaluate(/** @type {File[]} */(emitted.files)),native);
      });
    }
  }
}
