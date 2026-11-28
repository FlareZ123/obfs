'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

const variants=[
  {name:'own-title-data',document:'{title:"",privateCount:2}',nativeSeen:false},
  {name:'null-prototype',document:'{__proto__:null,privateCount:2}',nativeSeen:false},
  {name:'plain-object-unsafe',document:'{privateCount:2}',nativeSeen:true}
];
const runner=[
  'globalThis.sourceSeen="";',
  'Object.defineProperty(Object.prototype,"title",{configurable:true,',
  '  set(value){globalThis.sourceSeen=String(value);}', 
  '});',
  'const {sample}=await import("./case.mjs");',
  'process.stdout.write(JSON.stringify({result:sample(),sourceSeen:globalThis.sourceSeen})+"\\n");'
].join('\n');
/** @param {string} code @returns {{result:number,sourceSeen:string}} */
function execute(code){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent4-title-properties-'));
  try{
    fs.writeFileSync(path.join(dir,'case.mjs'),code);
    fs.writeFileSync(path.join(dir,'runner.mjs'),runner);
    const p=spawnSync(process.execPath,[path.join(dir,'runner.mjs')],{
      cwd:dir,encoding:'utf8',timeout:15000
    });
    assert.equal(p.status,0,p.stderr||p.error?.message);
    return JSON.parse(p.stdout);
  }finally {fs.rmSync(dir,{recursive:true,force:true});}
}
for(const item of variants) {
  test('local lexical DOMString proof and private property pass: '+item.name,()=>{
    const source=[
      'const document='+item.document+';',
      'function protectedFn(value){const protectedSecret=7;return value+protectedSecret;}',
      'document.title=protectedFn;',
      'export function sample(){return protectedFn(documentCount());}',
      'function documentCount(){return 3;}'
    ].join('\n');
    const native=execute(source);
    assert.equal(native.result,10);
    assert.equal(native.sourceSeen.length>0,item.nativeSeen);
    const metrics=[];
    for(const mode of ['coo','sco','sno']){
      for(const properties of [false,true]) {
        const result=obfuscateFiles([{path:'case.mjs',sourceType:'module',code:source}],{
          mode,seed:'agent4-local-record-property-'+mode+'-'+item.name+'-'+properties,
          closedWorld:true,identifiers:true,properties,strings:false
        }).files[0];
        const observed=execute(String(result.code));
        assert.deepEqual(observed,native,
          mode+' properties='+properties+' must preserve inherited setter and original Function spelling');
        if(!item.nativeSeen)assert.ok(result.metrics.bindings>0);
        else assert.equal(result.metrics.bindings,0);
        metrics.push({mode,properties,bindings:result.metrics.bindings,
          renamedProperties:result.metrics.properties,parity:true});
      }
    }
    if(item.nativeSeen)assert.match(native.sourceSeen,/protectedSecret/u);
    console.log('LEXICAL_DOCUMENT_PROPERTY_PASS '+
      JSON.stringify({case:item.name,native,metrics}));
  });
}
