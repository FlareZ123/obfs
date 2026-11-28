'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

/** XorShift32 is deterministic across Node/browser integer arithmetic. */
let randomState=0x4ac6e0d;
/** @returns {number} */
function nextUint32(){
  randomState^=randomState<<13;
  randomState^=randomState>>>17;
  randomState^=randomState<<5;
  return randomState>>>0;
}
/** @param {number} n @returns {number} */
function choice(n){return nextUint32()%n;}
const hostKeys=['title','cookie','domain'];
/** @type {Array<{label:string,protoNull:boolean,fields:string[],keys:string[],hostKey:string|null}>} */
const cases=[];
const baseOwners=[
  {protoNull:true,fields:[]},
  {protoNull:true,fields:['title','flag']},
  {protoNull:false,fields:['title']},
  {protoNull:false,fields:['cookie']},
  {protoNull:false,fields:['domain']},
  {protoNull:false,fields:['title','cookie','domain']}
];
for(let i=0;i<48;i++){
  const base=baseOwners[i%baseOwners.length];
  const count=1+choice(3);
  const keys=[];
  for(let k=0;k<count;k++){
    const name=hostKeys[choice(hostKeys.length)];
    if(!keys.includes(name))keys.push(name);
  }
  const hostKey=i%7===0?hostKeys[choice(hostKeys.length)]:null;
  cases.push({label:'seeded-'+String(i).padStart(2,'0'),protoNull:base.protoNull,
    fields:[...base.fields],keys,hostKey});
}
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
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obfs-agent4-keyset-fuzz-'));
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
test('48 seeded all-mode native/emitted DOMString literal record differential',()=>{
  const summary={cases:0,positive:0,negative:0,
    nativeSourceObserved:0,compiledRuns:0,identifierYield:0};
  for(const item of cases){
    const owned=new Set(item.fields);
    const safeOwner=item.protoNull||item.keys.every(key=>owned.has(key));
    const positive=safeOwner&&!item.hostKey;
    const objectFields=[
      ...(item.protoNull?['__proto__:null']:[]),
      ...item.fields.map(name=>name+':'+
        (name==='flag'?'true':'""')),
      'extra:17'
    ];
    const source=[
      'const document={'+objectFields.join(',')+'};',
      'function inspect(input){const privateSecret=29;return input+privateSecret;}',
      ...item.keys.map(key=>'document.'+key+'=inspect;'),
      ...(item.hostKey?['globalThis.document.'+item.hostKey+'=inspect;']:[]),
      'export function sample(){return inspect(1);}'
    ].join('\n');
    const native=execute(source);
    assert.equal(native.result,30,item.label);
    assert.equal(native.inherited.length+native.host.length>0,!positive,
      item.label+' native source observation must match own descriptor/prototype proof');
    for(const [,value] of [...native.inherited,...native.host])
      assert.match(value,/privateSecret/u,item.label);
    for(const mode of ['coo','sco','sno']) {
      const properties=choice(2)===0;
      const emitted=obfuscateFiles([{path:'case.mjs',sourceType:'module',code:source}],{
        mode,seed:'agent4-dom-keyset-fuzz-'+item.label+'-'+mode+'-'+properties,
        closedWorld:true,identifiers:true,properties,strings:false
      }).files[0];
      const actual=execute(String(emitted.code));
      assert.deepEqual(actual,native,item.label+' '+mode+' properties='+properties);
      if(positive){
        assert.ok(emitted.metrics.bindings>0,
          item.label+' should retain source-safe protection');
        summary.identifierYield+=emitted.metrics.bindings;
      } else assert.equal(emitted.metrics.bindings,0,
        item.label+' real inherited/native String() sink must refuse source changes');
      summary.compiledRuns++;
    }
    summary.cases++;
    if(positive)summary.positive++;
    else{summary.negative++;summary.nativeSourceObserved++;}
  }
  assert.equal(summary.cases,48);
  assert.ok(summary.positive>0&&summary.negative>0);
  console.log('DOM_KEYSET_SEEDED_48 '+JSON.stringify({
    seed:'0x04ac6e0d',...summary,modes:['coo','sco','sno']
  }));
});
