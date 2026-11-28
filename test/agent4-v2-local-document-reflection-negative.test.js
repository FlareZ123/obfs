'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * Each case defeats at least one necessary conjunct of the inert lexical
 * Document certificate. An actual source-string observation (or an
 * out-of-graph escape that could enable one) must preserve original spelling.
 */
/** @type {{name:string,init:string,body:string,observed:boolean}[]} */
const cases=[
  {name:'direct-read',init:'{title:""}',
    body:'document.title=inspect;globalThis.seen=String(document.title);',
    observed:true},
  {name:'private-alias-and-read',init:'{title:""}',
    body:'document.title=inspect;const alias=document;globalThis.seen=String(alias.title);',
    observed:true},
  {name:'reflect-get',init:'{title:""}',
    body:'document.title=inspect;globalThis.seen=String(Reflect.get(document,"title"));',
    observed:true},
  {name:'computed-key-read',init:'{title:""}',
    body:'document.title=inspect;globalThis.seen=String(document["title"]);',
    observed:true},
  {name:'destructured-read',init:'{title:""}',
    body:'document.title=inspect;const {title}=document;globalThis.seen=String(title);',
    observed:true},
  {name:'getter-descriptor-read',init:'{title:""}',
    body:'document.title=inspect;globalThis.seen=String(Object.getOwnPropertyDescriptor(document,"title").value);',
    observed:true},
  {name:'exported-record-escape',init:'{title:""}',
    body:'document.title=inspect;export const leak=document;',
    observed:true},
  {name:'exported-null-prototype-escape',init:'{__proto__:null}',
    body:'document.title=inspect;export {document as leak};',
    observed:true},
  {name:'delete-own-key-reaches-inherited-setter',init:'{title:""}',
    body:'delete document.title;document.title=inspect;',
    observed:true},
  {name:'userland-proxy-source-interception',init:'{title:""}',
    body:'const proxy=new Proxy(document,{set(target,key,value){globalThis.seen=String(value);return Reflect.set(target,key,value);}});proxy.title=inspect;',
    observed:true},
  {name:'native-host-alias-under-local-document',init:'{title:""}',
    body:'const host=globalThis.document;document.title=inspect;host.title=inspect;',
    observed:true},
  {name:'compound-write-source-operand',init:'{title:""}',
    body:'document.title=inspect;globalThis.seen=String(document.title+=inspect);',
    observed:true},
  {name:'other-property-no-observer-conservative',init:'{title:""}',
    body:'document.title=inspect;document.other=17;',
    observed:false}
];
const runner=[
  'globalThis.seen="";let title="";',
  'Object.defineProperty(Object.prototype,"title",{configurable:true,',
  '  set(value){globalThis.seen=String(value);}',
  '});',
  'globalThis.document={};',
  'Object.defineProperty(globalThis.document,"title",{',
  '  get(){return title;},set(value){title=String(value);}',
  '});',
  'const module=await import("./case.mjs");',
  'if(module.leak)globalThis.seen=String(module.leak.title);',
  'process.stdout.write(JSON.stringify({answer:module.sample(),title,seen:globalThis.seen})+"\\n");'
].join('\n');
/** @param {string} code @returns {{answer:number,title:string,seen:string}} */
function execute(code){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent4-document-reflect-'));
  try{
    fs.writeFileSync(path.join(dir,'case.mjs'),code);
    fs.writeFileSync(path.join(dir,'runner.mjs'),runner);
    const result=spawnSync(process.execPath,[path.join(dir,'runner.mjs')],{
      cwd:dir,encoding:'utf8',timeout:15000
    });
    assert.equal(result.status,0,result.stderr||result.error?.message);
    return JSON.parse(result.stdout);
  } finally{fs.rmSync(dir,{recursive:true,force:true});}
}
for(const item of cases){
  test('local Document counterexample: '+item.name,()=>{
    const source=[
      'const document='+item.init+';',
      'function inspect(){const privateSecret=19;return privateSecret;}',
      item.body,
      'export function sample(){return inspect();}'
    ].join('\n');
    const native=execute(source);
    assert.equal(native.answer,19);
    assert.equal(native.title.length>0||native.seen.length>0,item.observed);
    for(const mode of ['coo','sco','sno']){
      const file=obfuscateFiles([{path:'case.mjs',sourceType:'module',code:source}],{
        mode,seed:'agent4-document-reflect-'+item.name+'-'+mode,
        properties:true,identifiers:true,strings:false,closedWorld:true
      }).files[0];
      const actual=execute(String(file.code));
      assert.deepEqual(actual,native,item.name+' '+mode+' source/behavior parity');
      assert.equal(file.metrics.bindings,0,
        'Uncertified Document alias, reflection or escape must keep identifier source stable');
      if(item.observed)
        assert.match(native.title+native.seen,/privateSecret/u);
    }
  });
}
