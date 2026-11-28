'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */
const producer=[
  'const document={title:"",ready:1};',
  'function hidden(){const originalSecret=29;return originalSecret;}',
  'document.title=hidden;',
  'globalThis.sharedSource=hidden;'
].join('\n');
const consumers=[
  {name:'no-consumer',consumer:'globalThis.message="inert";',source:false},
  {name:'direct-native-document-consumer',consumer:
    'globalThis.document.title=globalThis.sharedSource;',source:true},
  {name:'native-document-alias-consumer',consumer:
    'const real=globalThis.document;real.title=globalThis.sharedSource;',source:true},
  {name:'native-document-global-alias-consumer',consumer:
    'const real=globalThis["document"];real.title=globalThis.sharedSource;',source:true}
];
const runner=[
  'let title="";globalThis.document={};',
  'Object.defineProperty(globalThis.document,"title",{',
  '  get(){return title;},set(value){title=String(value);}',
  '});',
  'const {run}=await import("./entry.mjs");',
  'process.stdout.write(JSON.stringify({result:run(),title})+"\\n");'
].join('\n');
/** @param {Source[]} files @returns {{result:number,title:string}} */
function execute(files){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent4-document-escape-'));
  try{
    for(const file of files)fs.writeFileSync(path.join(dir,file.path),file.code);
    fs.writeFileSync(path.join(dir,'runner.mjs'),runner);
    const r=spawnSync(process.execPath,[path.join(dir,'runner.mjs')],{
      cwd:dir,encoding:'utf8',timeout:15000
    });
    assert.equal(r.status,0,r.stderr||r.error?.message);
    return JSON.parse(r.stdout);
  }finally{fs.rmSync(dir,{force:true,recursive:true});}
}
for(const item of consumers){
  test('lexical private Document with escaped function: '+item.name,()=>{
    /** @type {Source[]} */
    const files=[
      {path:'entry.mjs',sourceType:'module',
        code:'import "./producer.mjs";import "./consumer.mjs";'+
          'export function run(){return globalThis.sharedSource();}'},
      {path:'producer.mjs',sourceType:'module',code:producer},
      {path:'consumer.mjs',sourceType:'module',code:item.consumer}
    ];
    const original=execute(files);
    assert.equal(original.result,29);
    assert.equal(original.title.length>0,item.source);
    const evidence=[];
    for(const mode of ['coo','sco','sno']){
      const transformed=obfuscateFiles(files,{
        mode,seed:'agent4-local-doc-function-escape-'+item.name+'-'+mode,
        closedWorld:true,identifiers:true,properties:false,strings:false
      });
      const producerOut=transformed.files.find(file=>file.path==='producer.mjs');
      assert.ok(producerOut);
      const emitted=execute(transformed.files.map(file=>({
        path:file.path,sourceType:'module',code:String(file.code)
      })));
      assert.deepEqual(emitted,original,item.name+' '+mode+' source-byte parity');
      if(item.source)assert.equal(producerOut.metrics.bindings,0,
        'Explicit interfile real DOM observer must veto local source transforms');
      else assert.ok(producerOut.metrics.bindings>0,
        'Without observer, local record and function should retain identifier protection');
      evidence.push({mode,bindings:producerOut.metrics.bindings,parity:true});
    }
    if(item.source)assert.match(original.title,/originalSecret/u);
    console.log('LEXICAL_DOCUMENT_ESCAPE '+JSON.stringify({name:item.name,native:original,evidence}));
  });
}
