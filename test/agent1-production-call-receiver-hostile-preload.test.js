'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Execute the ESM graph, optionally after a host preloader patches a local
 * function's own .call property. The preloader is deliberately not an input
 * to the obfuscator.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @param {string|null} [preload]
 * @returns {Promise<string>}
 */
async function execute(files,preload=null) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-call-receiver-proof-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const args=[];
    if(preload!==null) {
      const preloadPath=path.join(directory,'preload.cjs');
      await atomicWrite(preloadPath,preload);
      args.push('-r',preloadPath);
    }
    args.push(path.join(directory,'main.mjs'));
    const result=spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000});
    assert.equal(result.status,0,result.stderr);
    return result.stdout;
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

const hostilePreload=[
  'globalThis.mutate=function(fn){',
  'Object.defineProperty(fn,"call",{configurable:true,value:function(receiver){return receiver.secretField;}});',
  '};'
].join('\n');

test('production cross-file proof refuses a property reached only through call receiver and hostile preloader',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:59};'},
    {path:'main.mjs',sourceType:'module',code:[
      'import {state} from "./state.mjs";',
      'function read(){return this.secretField;}',
      'mutate(read);',
      'if(read.call(state)!==59)throw new Error("receiver property changed");'
    ].join('\n')}
  ];
  await execute(files,hostilePreload);
  const transformed=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'production-call-receiver-hostile-preload',
    strings:false,identifiers:false
  });
  assert.equal(transformed.crossFile.properties,0,transformed.files[0].code);
  await execute(transformed.files,hostilePreload);
});

test('production cross-file proof retains a direct property-read positive control',async()=>{
  /** @type {ModuleFile[]} */
  const files=[
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:59};'},
    {path:'main.mjs',sourceType:'module',code:
      'import {state} from "./state.mjs";console.log(state.secretField);'}
  ];
  const expected=await execute(files);
  assert.equal(expected,'59\n');
  const transformed=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'production-call-receiver-direct-control',
    strings:false,identifiers:false
  });
  assert.equal(transformed.crossFile.properties,1);
  assert.equal(await execute(transformed.files),expected);
});


const productionMutationCases=[
  {
    name:'destructured Object.defineProperty',
    setup:'const {defineProperty}=Object;defineProperty(Function.prototype,"call",{value:function(receiver){return receiver.secretField;}});',
    invoke:'if(read.call(state)!==59)throw new Error("receiver property changed");'
  },
  {
    name:'globalThis.Object mutator alias',
    setup:'const objectConstructor=globalThis.Object;const define=objectConstructor.defineProperty;define(Function.prototype,"call",{value:function(receiver){return receiver.secretField;}});',
    invoke:'if(read.call(state)!==59)throw new Error("receiver property changed");'
  },
  {
    name:'destructured Reflect.set replacing Reflect.apply',
    setup:'const {set}=Reflect;set(Reflect,"apply",function(fn,receiver,args){return receiver.secretField;});',
    invoke:'if(Reflect.apply(read,state,[])!==59)throw new Error("receiver property changed");'
  },
  {
    name:'globalThis.Reflect replacement',
    setup:'globalThis.Reflect={apply:function(fn,receiver,args){return receiver.secretField;}};',
    invoke:'if(Reflect.apply(read,state,[])!==59)throw new Error("receiver property changed");'
  },
  {
    name:'Function constructor mutation',
    setup:'Function("Function.prototype.call=function(receiver){return receiver.secretField;}")();',
    invoke:'if(read.call(state)!==59)throw new Error("receiver property changed");'
  },
  {
    name:'destructured Reflect.setPrototypeOf local call shadow',
    setup:'const {setPrototypeOf}=Reflect;setPrototypeOf(read,{call:function(receiver){return receiver.secretField;}});',
    invoke:'if(read.call(state)!==59)throw new Error("receiver property changed");'
  },
  {
    name:'legacy Object.prototype.__defineGetter__',
    setup:'Object.prototype.__defineGetter__.call(Function.prototype,"call",function(){return function(receiver){return receiver.secretField;};});',
    invoke:'if(read.call(state)!==59)throw new Error("receiver property changed");'
  },
  {
    name:'computed Function.prototype key',
    setup:'const key="call";Function.prototype[key]=function(receiver){return receiver.secretField;};',
    invoke:'if(read.call(state)!==59)throw new Error("receiver property changed");'
  },
  {
    name:'window.Object alias',
    setup:'globalThis.window=globalThis;window.Object.defineProperty(Function.prototype,"call",{value:function(receiver){return receiver.secretField;}});',
    invoke:'if(read.call(state)!==59)throw new Error("receiver property changed");'
  },
  {
    name:'host preloader mutates escaped function',
    setup:'mutate(read);',
    invoke:'if(read.call(state)!==59)throw new Error("receiver property changed");',
    preload:hostilePreload
  }
];

for(const fixture of productionMutationCases) {
  test('production cross-file proof refuses '+fixture.name,async()=>{
    /** @type {ModuleFile[]} */
    const files=[
      {path:'state.mjs',sourceType:'module',code:'export const state={secretField:59};'},
      {path:'main.mjs',sourceType:'module',code:[
        'import {state} from "./state.mjs";',
        'function read(){return this.secretField;}',
        fixture.setup,
        fixture.invoke
      ].join('\n')}
    ];
    await execute(files,fixture.preload??null);
    const transformed=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,seed:'production-call-receiver-'+fixture.name,
      strings:false,identifiers:false
    });
    assert.equal(transformed.crossFile.properties,0,transformed.files[0].code);
    await execute(transformed.files,fixture.preload??null);
  });
}
