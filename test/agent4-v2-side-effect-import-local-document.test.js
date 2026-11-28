'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,code:string,sourceType:'module'}} Source */
const libraryBody=[
  'const document={title:"",value:17,flag:true};',
  'function protectedFn(secretArg){return secretArg+1;}',
  'document.title=protectedFn;',
  'globalThis.answer=protectedFn(41)+(globalThis.depBonus??0);'
].join('\n');
/** @type {{name:string,dependency:string,sidecar:string,shouldProtect:boolean,realObserver:boolean}[]} */
const cases=[
  {name:'acyclic-side-effect-only-import',
    dependency:'globalThis.depBonus=1;',
    sidecar:'import "./dependency.mjs";\n'+libraryBody,
    shouldProtect:true,realObserver:false},
  {name:'cyclic-side-effect-only-import',
    dependency:'import "./sidecar.mjs";globalThis.depBonus=1;',
    sidecar:'import "./dependency.mjs";\n'+libraryBody,
    shouldProtect:true,realObserver:false},
  {name:'cyclic-side-effect-with-real-host-observer',
    dependency:'import "./sidecar.mjs";globalThis.depBonus=1;'+
      'globalThis.document.title=function hostObserved(secret){return secret;};',
    sidecar:'import "./dependency.mjs";\n'+libraryBody,
    shouldProtect:false,realObserver:true},
  {name:'cyclic-exported-premature-read-tdz',
    dependency:'import {premature} from "./sidecar.mjs";globalThis.depBonus=1;'+
      'try{premature();}catch(error){globalThis.observed=String(error);}',
    sidecar:'import "./dependency.mjs";\n'+libraryBody+
      '\nexport function premature(){document.title=protectedFn;}',
    shouldProtect:false,realObserver:true}
];
const runner=[
  'globalThis.answer=0;globalThis.depBonus=0;globalThis.observed="";',
  'let title="";globalThis.document={};',
  'Object.defineProperty(globalThis.document,"title",{',
  '  get(){return title;},set(value){title=String(value);}',
  '});',
  'const {run}=await import("./main.mjs");',
  'process.stdout.write(JSON.stringify({result:run(),title,observed:globalThis.observed})+"\\n");'
].join('\n');
/**
 * @param {Source[]} files
 * @returns {{result:number,title:string,observed:string}}
 */
function execute(files){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent4-import-doc-'));
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
for(const item of cases){
  test('imported side-effect ESM local record: '+item.name,()=>{
    const files=[
      {path:'main.mjs',sourceType:'module',code:
        'import "./sidecar.mjs";export function run(){return globalThis.answer;}'},
      {path:'sidecar.mjs',sourceType:'module',code:item.sidecar},
      {path:'dependency.mjs',sourceType:'module',code:item.dependency}
    ];
    const native=execute(files);
    assert.equal(native.result,43);
    assert.equal(native.title.length>0||native.observed.length>0,item.realObserver);
    const rows=[];
    for(const mode of ['coo','sco','sno']){
      const compiled=obfuscateFiles(files,{
        mode,seed:'agent4-v2-side-effect-doc-'+item.name+'-'+mode,
        closedWorld:true,identifiers:true,properties:false,strings:false
      });
      const sidecar=compiled.files.find(file=>file.path==='sidecar.mjs');
      assert.ok(sidecar);
      const emitted=execute(compiled.files.map(file=>({
        path:file.path,sourceType:'module',code:String(file.code)
      })));
      assert.deepEqual(emitted,native,mode+' '+item.name+' native-emitted parity');
      if(item.shouldProtect)assert.ok(sidecar.metrics.bindings>0,
        'No exported capability: ESM imports cannot reach lexical document before initialization');
      else assert.equal(sidecar.metrics.bindings,0,
        'Real host source or exported cycle TDZ must veto identifier rewrite');
      rows.push({mode,bindings:sidecar.metrics.bindings,parity:true});
    }
    if(item.name.includes('tdz'))
      assert.match(native.observed,/document/u);
    console.log('LOCAL_DOCUMENT_IMPORT '+JSON.stringify({case:item.name,native,rows}));
  });
}
