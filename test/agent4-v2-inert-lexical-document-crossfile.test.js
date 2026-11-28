'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */
const library=[
  'const document={__proto__:null,title:"",flag:true,value:17};',
  'function protectedFn(secretArg){const privateSecret=31;return secretArg+privateSecret;}',
  'document.title=protectedFn;',
  'export function sample(){return protectedFn(11);}',
  'export function getFunction(){return protectedFn;}'
].join('\n');
const entryBodies={
  independent:'import {sample} from "./library.mjs";export function run(){return sample();}',
  importedFunctionString:'import {sample} from "./library.mjs";'+
    'globalThis.document.title=sample;export function run(){return sample();}',
  importedReturnedFunction:'import {getFunction,sample} from "./library.mjs";'+
    'globalThis.document.title=getFunction();export function run(){return sample();}',
  independentAdditionalModule:'import {sample} from "./library.mjs";'+
    'import "./unrelated.mjs";export function run(){return sample();}'
};
const unrelated='const document={title:""};function additional(privateArg){return privateArg+1;}document.title=additional;';
const runner=[
  'let title="";globalThis.document={};',
  'Object.defineProperty(globalThis.document,"title",{',
  '  get(){return title;},set(value){title=String(value);}',
  '});',
  'const {run}=await import("./entry.mjs");',
  'process.stdout.write(JSON.stringify({result:run(),title})+"\\n");'
].join('\n');
/**
 * @param {Source[]} files
 * @returns {{result:number,title:string}}
 */
function execute(files){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent4-document-graph-'));
  try {
    for(const file of files)fs.writeFileSync(path.join(dir,file.path),file.code);
    fs.writeFileSync(path.join(dir,'runner.mjs'),runner);
    const r=spawnSync(process.execPath,[path.join(dir,'runner.mjs')],{
      cwd:dir,encoding:'utf8',timeout:15000
    });
    assert.equal(r.status,0,r.stderr||r.error?.message);
    return JSON.parse(r.stdout);
  }finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

for(const [name,entry] of Object.entries(entryBodies)){
  test('multi-file lexical Document provenance: '+name,()=>{
    const sourceFiles=[
      {path:'entry.mjs',sourceType:'module',code:entry},
      {path:'library.mjs',sourceType:'module',code:library},
      ...(name==='independentAdditionalModule'?
        [{path:'unrelated.mjs',sourceType:'module',code:unrelated}]:[])
    ];
    const original=execute(sourceFiles);
    const observed=name==='importedFunctionString'||name==='importedReturnedFunction';
    assert.equal(original.result,42);
    assert.equal(original.title.length>0,observed);
    const evidence=[];
    for(const mode of ['coo','sco','sno']){
      for(const properties of [false,true]){
        const compiled=obfuscateFiles(sourceFiles,{
          mode,seed:'agent4-lexical-document-graph-'+name+'-'+mode+'-'+properties,
          closedWorld:true,identifiers:true,properties,strings:false
        });
        const libraryOutput=compiled.files.find(file=>file.path==='library.mjs');
        assert.ok(libraryOutput);
        const emitted=execute(compiled.files.map(file=>({
          path:file.path,sourceType:'module',code:String(file.code)
        })));
        assert.deepEqual(emitted,original,
          mode+' properties='+properties+' '+name+' crossfile native/emitted parity');
        if(observed)assert.equal(libraryOutput.metrics.bindings,0,
          'Imported function handed to the real Document must keep its original source');
        else assert.ok(libraryOutput.metrics.bindings>0,
          'Independent private ESM leaf should retain safe identifier protection');
        evidence.push({mode,properties,bindings:libraryOutput.metrics.bindings,
          renamedProperties:libraryOutput.metrics.properties,parity:true});
      }
    }
    console.log('LEXICAL_DOCUMENT_CROSSFILE '+
      JSON.stringify({name,observed,original,evidence}));
  });
}
