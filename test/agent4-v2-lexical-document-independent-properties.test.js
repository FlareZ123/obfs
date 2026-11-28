'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @type {{name:string,source:string,hostObserved:boolean}[]} */
const variants=[
  {name:'private-document-private-data-owner',source:[
    'const document={title:"",other:"inert"};',
    'const payload={internalAnswer:7,internalAddend:9};',
    'function hidden(input){const localSecret=11;',
    '  return input+localSecret+payload.internalAnswer+payload.internalAddend;}',
    'document.title=hidden;',
    'export function sample(){return hidden(1);}'
  ].join('\n'),hostObserved:false},
  {name:'private-document-with-real-dom-string-sink',source:[
    'const document={title:"",other:"inert"};',
    'const payload={internalAnswer:7,internalAddend:9};',
    'function hidden(input){const localSecret=11;',
    '  return input+localSecret+payload.internalAnswer+payload.internalAddend;}',
    'document.title=hidden;',
    'globalThis.document.title=hidden;',
    'export function sample(){return hidden(1);}'
  ].join('\n'),hostObserved:true}
];
const runner=[
  'let title="";globalThis.document={};',
  'Object.defineProperty(globalThis.document,"title",{',
  '  get(){return title;},set(value){title=String(value);}',
  '});',
  'const {sample}=await import("./case.mjs");',
  'process.stdout.write(JSON.stringify({answer:sample(),title})+"\\n");'
].join('\n');
/** @param {string} code @returns {{answer:number,title:string}} */
function execute(code){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent4-doc-properties-'));
  try{
    fs.writeFileSync(path.join(dir,'case.mjs'),code);
    fs.writeFileSync(path.join(dir,'runner.mjs'),runner);
    const r=spawnSync(process.execPath,[path.join(dir,'runner.mjs')],{
      cwd:dir,encoding:'utf8',timeout:15000
    });
    assert.equal(r.status,0,r.stderr||r.error?.message);
    return JSON.parse(r.stdout);
  }finally{fs.rmSync(dir,{force:true,recursive:true});}
}
for(const item of variants){
  test('independent safe field rewrite with local Document: '+item.name,()=>{
    const baseline=execute(item.source);
    assert.equal(baseline.answer,28);
    assert.equal(baseline.title.length>0,item.hostObserved);
    const evidence=[];
    for(const mode of ['coo','sco','sno']){
      const out=obfuscateFiles([{path:'case.mjs',sourceType:'module',code:item.source}],{
        mode,seed:'agent4-private-document-owner-'+item.name+'-'+mode,
        closedWorld:true,identifiers:true,properties:true,strings:false
      }).files[0];
      const emitted=execute(String(out.code));
      assert.deepEqual(emitted,baseline,mode+' native/emitted');
      if(!item.hostObserved){
        assert.ok(out.metrics.bindings>0,'private lexical identifiers should be masked');
        assert.ok(out.metrics.properties>0,
          'independent proven-private object property must be renamed too');
      }else {
        assert.equal(out.metrics.bindings,0,
          'real DOM sink must preserve source visible to host');
        assert.equal(out.metrics.properties,0,
          'real DOM sink must preserve property spellings inside Function source');
      }
      evidence.push({mode,properties:out.metrics.properties,bindings:out.metrics.bindings});
    }
    if(item.hostObserved)assert.match(baseline.title,/internalAnswer/u);
    console.log('DOCUMENT_INDEPENDENT_PROPERTIES '+
      JSON.stringify({name:item.name,baseline,evidence}));
  });
}
