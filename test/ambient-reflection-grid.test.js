'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'commonjs',code:string}} CommonJsFile */

const families=[
  {name:'String constructor',ctor:'String',receiver:'Native',
    property:'"fromCharCode"',implementation:'()=>"?";',literal:'protected-literal-value'},
  {name:'String prototype',ctor:'String',receiver:'Native.prototype',
    property:'"charCodeAt"',implementation:'()=>0;',literal:'protected-literal-value'},
  {name:'Array iterator',ctor:'Array',receiver:'Native.prototype',
    property:'Symbol.iterator',implementation:'function*(){yield 0;};',literal:'v'.repeat(2048)}
];
const exposures=[
  {name:'transitive globals',source:'const Root=globalThis;const Root2=Root;const Native=Root2.CTOR;'},
  {name:'aliased Reflect.get',source:'const Root=globalThis;const R=Reflect;const R2=R;const Native=R2.get(Root,"CTOR");'},
  {name:'captured descriptor',source:'const Root=globalThis;const O=Object;const D=O.getOwnPropertyDescriptor(Root,"CTOR");const Native=D.value;'}
];
const writes=[
  {name:'direct assignment',
    apply:(receiver,property,value)=>receiver+'['+property+']='+value},
  {name:'Reflect.set',
    apply:(receiver,property,value)=>'Reflect.set('+receiver+','+property+','+value.slice(0,-1)+');'},
  {name:'captured Reflect.set',
    apply:(receiver,property,value)=>'const Update=Reflect.set;Update('+receiver+','+property+','+value.slice(0,-1)+');'},
  {name:'Object.defineProperty',
    apply:(receiver,property,value)=>'Object.defineProperty('+receiver+','+property+',{value:'+value.slice(0,-1)+'});'}
];

/**
 * @param {CommonJsFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @param {string} directory
 * @returns {Promise<{status:number|null,stdout:string,stderr:string}>}
 */
async function execute(files,directory){
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const proc=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
    encoding:'utf8',timeout:10000
  });
  if(proc.error)throw proc.error;
  return {status:proc.status,stdout:proc.stdout,stderr:proc.stderr};
}

/**
 * @param {string} source
 * @param {string} literal
 * @returns {CommonJsFile[]}
 */
function graph(source,literal){
  return [
    {path:'entry.cjs',sourceType:'commonjs',
      code:"require('./side.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'side.cjs',sourceType:'commonjs',code:source},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify(literal)+';'}
  ];
}

test('36-cell reflective constructor aliases retain native CJS semantics in COO and SNO',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reflective-grid-'));
  let checked=0;
  try{
    for(const family of families){
      for(const exposure of exposures){
        for(const write of writes){
          const name=family.name+' / '+exposure.name+' / '+write.name;
          const source=exposure.source.replaceAll('CTOR',family.ctor)+
            'const Alias=Native;'+
            write.apply(family.receiver.replace('Native','Alias'),
              family.property,family.implementation);
          const files=graph(source,family.literal);
          const native=await execute(files,directory);
          assert.equal(native.status,0,name+': '+native.stderr);
          assert.equal(native.stdout,family.literal,name);
          for(const mode of /** @type {const} */ (['sno','coo'])){
            const transformed=obfuscateFiles(files,{
              mode,strings:true,properties:false,identifiers:false,
              seed:'reflective-grid/'+name
            });
            const target=transformed.files.find(file=>file.path==='target.cjs');
            assert.equal(target?.metrics.literals,0,name+' '+mode+': unsafe decoder emitted');
            assert.deepEqual(await execute(transformed.files,directory),native,
              name+' '+mode+': changed runtime behavior');
          }
          checked++;
        }
      }
    }
  }finally{
    await fs.rm(directory,{force:true,recursive:true});
  }
  assert.equal(checked,36);
});
