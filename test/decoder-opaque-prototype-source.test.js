'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * @param {string} directory
 * @param {SourceFile[]|ReturnType<typeof obfuscateFiles>['files']} files
 * @returns {Promise<{status:number|null, stdout:string, stderr:string}>}
 */
async function run(directory,files) {
  await fs.mkdir(directory,{recursive:true});
  for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
  const child=spawnSync(process.execPath,[path.join(directory,'entry.cjs')],{
    encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024
  });
  if(child.error)throw child.error;
  return {status:child.status,stdout:child.stdout,stderr:child.stderr};
}

/**
 * @param {string} mutator
 * @returns {SourceFile[]}
 */
function files(mutator) {
  return [
    {path:'entry.cjs',sourceType:'commonjs',code:
      "require('./mutator.cjs');process.stdout.write(require('./target.cjs'));"},
    {path:'mutator.cjs',sourceType:'commonjs',code:mutator},
    {path:'target.cjs',sourceType:'commonjs',
      code:'module.exports='+JSON.stringify('x'.repeat(2048)+'z')+';'}
  ];
}

const unsafe=[
  ['opaque String wrapper return',
    "function owner(){return new String('u')}const P=Object.getPrototypeOf(owner());P.charCodeAt=()=>0;"],
  ['String() primitive result',
    "const P=Object.getPrototypeOf(String('u'));P.charCodeAt=()=>0;"],
  ['object literal with String prototype',
    "const P=Object.getPrototypeOf({__proto__:String.prototype});P.charCodeAt=()=>0;"],
  ['opaque Array return and iterator',
    "function owner(){return []}const P=Object.getPrototypeOf(owner());P[Symbol.iterator]=function*(){yield 0;};"],
  ['opaque String prototype through Reflect.defineProperty',
    "function owner(){return new String('u')}const P=Reflect.getPrototypeOf(owner());Reflect.defineProperty(P,'charCodeAt',{value:()=>0,configurable:true});"],
  ['transitive opaque prototype alias',
    "function owner(){return 'u'}const P=Object.getPrototypeOf(owner());const Q=P;Q.charCodeAt=()=>0;"],
  ['opaque prototype through Object.assign',
    "function owner(){return 'u'}const P=Object.getPrototypeOf(owner());Object.assign(P,{charCodeAt:()=>0});"],
  ['opaque String constructor alias',
    "function owner(){return 'u'}const P=Object.getPrototypeOf(owner());const C=P.constructor;C.fromCharCode=()=>'?';"],
  ['opaque String prototype legacy setter',
    "function owner(){return 'u'}const P=Object.getPrototypeOf(owner());P.__defineGetter__('charCodeAt',()=>()=>0);"],
  ['opaque Array iterator through Reflect.set',
    "function owner(){return []}const P=Object.getPrototypeOf(owner());Reflect.set(P,Symbol.iterator,function*(){yield 0;});"],
  ['overwritten Object.getPrototypeOf bypasses numeric proof',
    "const old=Object.getPrototypeOf;Object.getPrototypeOf=(x)=>x===7?String.prototype:old(x);const P=Object.getPrototypeOf(7);P.charCodeAt=()=>0;"],
  ['overwritten Reflect.getPrototypeOf bypasses numeric proof',
    "const old=Reflect.getPrototypeOf;Reflect.getPrototypeOf=(x)=>x===7?String.prototype:old(x);const P=Reflect.getPrototypeOf(7);P.charCodeAt=()=>0;"],
  ['aliased Object.getPrototypeOf overwrite',
    "const O=Object;const old=O.getPrototypeOf;O.getPrototypeOf=(x)=>x===7?String.prototype:old(x);const P=O.getPrototypeOf(7);P.charCodeAt=()=>0;"],
  ['Object.defineProperty changes getPrototypeOf',
    "Object.defineProperty(Object,'getPrototypeOf',{value:(x)=>x===7?String.prototype:Reflect.getPrototypeOf(x),configurable:true});const P=Object.getPrototypeOf(7);P.charCodeAt=()=>0;"],
  ['Reflect.set changes getPrototypeOf',
    "Reflect.set(Reflect,'getPrototypeOf',(x)=>x===7?String.prototype:Object.getPrototypeOf(x));const P=Reflect.getPrototypeOf(7);P.charCodeAt=()=>0;"],
  ['Object.assign changes getPrototypeOf',
    "Object.assign(Object,{getPrototypeOf:(x)=>x===7?String.prototype:Reflect.getPrototypeOf(x)});const P=Object.getPrototypeOf(7);P.charCodeAt=()=>0;"],
  ['Object.defineProperties changes getPrototypeOf',
    "Object.defineProperties(Object,{getPrototypeOf:{value:(x)=>x===7?String.prototype:Reflect.getPrototypeOf(x),configurable:true}});const P=Object.getPrototypeOf(7);P.charCodeAt=()=>0;"]
];

for(const [name,mutator] of unsafe) {
  for(const mode of /** @type {const} */ (['sno','coo'])) {
    test('opaque prototype mutation must preserve original literal: '+name+'/'+mode,async()=>{
      const input=files(mutator);
      const output=obfuscateFiles(input,{
        mode,strings:true,properties:false,identifiers:false,
        seed:'opaque-prototype-safety/'+name+'/'+mode
      });
      const target=output.files.find(file=>file.path==='target.cjs');
      assert.ok(target);
      const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-opaque-prototype-'));
      try{
        const native=await run(path.join(root,'original'),input);
        const transformed=await run(path.join(root,'generated'),output.files);
        assert.equal(native.status,0,native.stderr);
        assert.equal(native.stdout,'x'.repeat(2048)+'z');
        assert.equal(transformed.status,native.status,transformed.stderr);
        assert.equal(transformed.stdout,native.stdout,
          'Eager decoder used a source-visible mutated inherited intrinsic');
        assert.equal(target.metrics.literals,0,
          'Opaque prototype mutation must refuse eager decoder');
      }finally{await fs.rm(root,{recursive:true,force:true});}
    });
  }
}

for(const mode of /** @type {const} */ (['sno','coo'])) {
  for(const [name,side] of [
    ['unrelated Object helper field',
      "Object.defineProperty(Object,'unrelatedAppField',{value:7,configurable:true});"],
    ['unrelated Reflect helper field',
      "Reflect.set(Reflect,'unrelatedAppField',7);"]
  ]) {
    test('non-decoder intrinsic helper mutation retains transformed literal: '+name+'/'+mode,()=>{
      const output=obfuscateFiles(files(side),{
        mode,strings:true,properties:false,identifiers:false,
        seed:'opaque-prototype-safety/unrelated-helper/'+name+'/'+mode
      });
      assert.equal(output.files.find(file=>file.path==='target.cjs')?.metrics.literals,1);
    });
  }

  test('obviously unrelated Number prototype keeps encoded work: '+mode,async()=>{
    const input=files("const P=Object.getPrototypeOf(7);P.toString=()=> 'unrelated';");
    const output=obfuscateFiles(input,{
      mode,strings:true,properties:false,identifiers:false,
      seed:'opaque-prototype-safety/unrelated-number/'+mode
    });
    const target=output.files.find(file=>file.path==='target.cjs');
    assert.ok(target);
    assert.equal(target.metrics.literals,1,
      'An independent Number prototype should preserve decoder yield');
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-known-number-'));
    try{
      assert.deepEqual(await run(path.join(root,'original'),input),
        await run(path.join(root,'generated'),output.files));
    }finally{await fs.rm(root,{recursive:true,force:true});}
  });
}
