'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/**
 * Covers the three Web IDL host Document DOMString setter names. An own data
 * field prevents an inherited accessor for *that key only*. Null prototype
 * prevents every inherited setter; an own title does not establish cookie.
 */
/** @type {{name:string,init:string,writes:string,sourceVisible:boolean,positive:boolean}[]} */
const cases=[
  {name:'own-all-domstring-keys',
    init:'{title:"",cookie:"",domain:"",privateSalt:31}',
    writes:'document.title=inspect;document.cookie=inspect;document.domain=inspect;',
    sourceVisible:false,positive:true},
  {name:'null-proto-all-domstring-keys',
    init:'{__proto__:null,privateSalt:31}',
    writes:'document.title=inspect;document.cookie=inspect;document.domain=inspect;',
    sourceVisible:false,positive:true},
  {name:'own-cookie-only',
    init:'{cookie:"",privateSalt:31}',writes:'document.cookie=inspect;',
    sourceVisible:false,positive:true},
  {name:'own-domain-only',
    init:'{domain:"",privateSalt:31}',writes:'document.domain=inspect;',
    sourceVisible:false,positive:true},
  {name:'own-title-with-missing-cookie',
    init:'{title:"",privateSalt:31}',
    writes:'document.title=inspect;document.cookie=inspect;',
    sourceVisible:true,positive:false},
  {name:'own-cookie-with-missing-domain',
    init:'{cookie:"",privateSalt:31}',
    writes:'document.cookie=inspect;document.domain=inspect;',
    sourceVisible:true,positive:false},
  {name:'plain-record-with-cookie',
    init:'{privateSalt:31}',writes:'document.cookie=inspect;',
    sourceVisible:true,positive:false},
  {name:'real-document-cookie-also-visible',
    init:'{title:"",cookie:"",domain:""}',
    writes:'document.cookie=inspect;globalThis.document.cookie=inspect;',
    sourceVisible:true,positive:false}
];
const runner=[
  'globalThis.inherited=[];globalThis.host=[];',
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
  'process.stdout.write(JSON.stringify({result:sample(),',
  '  inherited:globalThis.inherited,host:globalThis.host})+"\\n");'
].join('\n');
/**
 * @param {string} code
 * @returns {{result:number,inherited:[string,string][],host:[string,string][]}}
 */
function execute(code){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent4-document-keyset-'));
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
for(const item of cases) {
  test('inert local Document DOMString keyset: '+item.name,()=>{
    const source=[
      'const document='+item.init+';',
      'function inspect(input){const privateSecret=19;return input+privateSecret;}',
      item.writes,
      'export function sample(){return inspect(11);}'
    ].join('\n');
    const native=execute(source);
    assert.equal(native.result,30);
    assert.equal(native.inherited.length+native.host.length>0,item.sourceVisible);
    const rows=[];
    for(const mode of ['coo','sco','sno']){
      for(const properties of [false,true]){
        const output=obfuscateFiles([{
          path:'case.mjs',sourceType:'module',code:source
        }],{
          mode,seed:'agent4-document-keyset-'+item.name+'-'+mode+'-'+properties,
          closedWorld:true,properties,identifiers:true,strings:false
        }).files[0];
        const result=execute(String(output.code));
        assert.deepEqual(result,native,
          mode+'/'+properties+' native/emitted setter source parity');
        if(item.positive)assert.ok(output.metrics.bindings>0,
          'Every Document-like property should be safely owned');
        else assert.equal(output.metrics.bindings,0,
          'Missing field or global host sink must refuse source change');
        rows.push({mode,properties,bindings:output.metrics.bindings,
          renamedProperties:output.metrics.properties,parity:true});
      }
    }
    if(item.sourceVisible)for(const [key,value] of [...native.inherited,...native.host])
      assert.match(value,/privateSecret/u,key);
    console.log('DOCUMENT_KEYSET '+JSON.stringify({name:item.name,rows,native}));
  });
}
