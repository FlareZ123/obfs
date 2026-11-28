'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** @type {{name:string,init:string,body:string,positive:boolean,observed:boolean}[]} */
const variants=[
  {name:'literal-title',init:'{title:""}',
    body:'document["title"]=inspect;',positive:true,observed:false},
  {name:'literal-cookie-nullproto',init:'{__proto__:null,flag:true}',
    body:"document['cookie']=inspect;",positive:true,observed:false},
  {name:'template-domain',init:'{domain:""}',
    body:'document[`domain`]=inspect;',positive:true,observed:false},
  {name:'pure-string-concat-title',init:'{title:""}',
    body:'document["ti"+"tle"]=inspect;',positive:true,observed:false},
  {name:'pure-template-cookie-nullproto',init:'{__proto__:null}',
    body:'document[`coo`+`kie`]=inspect;',positive:true,observed:false},
  {name:'unknown-key-coercion-observes-source',init:'{title:""}',
    body:'const key={toString(){globalThis.seen=String(inspect);return "title";}};document[key]=inspect;',
    positive:false,observed:true},
  {name:'dynamic-const-key-external-source-read',init:'{title:""}',
    body:'const key="title";document[key]=inspect;globalThis.seen=String(document[key]);',
    positive:false,observed:true},
  {name:'missing-own-cookie-inherited-setter',init:'{title:""}',
    body:'document["cookie"]=inspect;',positive:false,observed:true},
  {name:'real-host-computed-string-setter',init:'{title:""}',
    body:'document["title"]=inspect;globalThis.document["title"]=inspect;',
    positive:false,observed:true},
  {name:'dynamic-concat-through-call-conservative',init:'{title:""}',
    body:'document["ti"+String("tle")]=inspect;globalThis.seen=String(inspect);',
    positive:false,observed:true}
];
const runner=[
  'globalThis.seen="";globalThis.inherited=[];globalThis.host=[];',
  'for(const key of ["title","cookie","domain"]){',
  '  Object.defineProperty(Object.prototype,key,{configurable:true,',
  '    set(value){globalThis.inherited.push([key,String(value)]);}',
  '  });',
  '}',
  'globalThis.document={};',
  'for(const key of ["title","cookie","domain"]){',
  '  Object.defineProperty(globalThis.document,key,{configurable:true,',
  '    set(value){globalThis.host.push([key,String(value)]);}',
  '  });',
  '}',
  'const {sample}=await import("./case.mjs");',
  'process.stdout.write(JSON.stringify({result:sample(),seen:globalThis.seen,',
  '  inherited:globalThis.inherited,host:globalThis.host})+"\\n");'
].join('\n');
/**
 * @param {string} code
 * @returns {{result:number,seen:string,inherited:[string,string][],host:[string,string][]}}
 */
function execute(code){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent4-computed-doc-'));
  try{
    fs.writeFileSync(path.join(dir,'case.mjs'),code);
    fs.writeFileSync(path.join(dir,'runner.mjs'),runner);
    const r=spawnSync(process.execPath,[path.join(dir,'runner.mjs')],{
      cwd:dir,encoding:'utf8',timeout:15000
    });
    assert.equal(r.status,0,r.stderr||r.error?.message);
    return JSON.parse(r.stdout);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
for(const item of variants){
  test('pure/static computed Document property key: '+item.name,()=>{
    const source=[
      'const document='+item.init+';',
      'function inspect(){const localSecret=29;return localSecret;}',
      item.body,
      'export function sample(){return inspect();}'
    ].join('\n');
    const native=execute(source);
    assert.equal(native.result,29);
    const observed=native.seen.length>0||native.inherited.length>0||native.host.length>0;
    assert.equal(observed,item.observed,item.name+' native observation');
    for(const mode of ['coo','sco','sno']){
      for(const properties of [false,true]){
        const file=obfuscateFiles([{path:'case.mjs',sourceType:'module',code:source}],{
          mode,seed:'agent4-doc-computed-'+item.name+'-'+mode+'-'+properties,
          properties,identifiers:true,strings:false,closedWorld:true
        }).files[0];
        const emitted=execute(String(file.code));
        assert.deepEqual(emitted,native,item.name+' '+mode+' properties='+properties);
        if(item.positive)assert.ok(file.metrics.bindings>0,
          'Static primitive computed key is inert and local object is unobserved');
        else assert.equal(file.metrics.bindings,0,
          'Dynamic key coercion, inherited setter and real host source must refuse');
      }
    }
    if(observed)assert.match(native.seen+
      native.inherited.map(row=>row[1]).join('')+
      native.host.map(row=>row[1]).join(''),/localSecret/u,item.name);
  });
}
