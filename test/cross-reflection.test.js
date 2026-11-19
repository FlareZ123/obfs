'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleInput */

/**
 * Compare real Node ESM executions of an exported object and its importer.
 * @param {string} importerBody
 * @param {number} expectedRenames
 * @param {string} [stateCode]
 * @returns {Promise<void>}
 */
async function check(importerBody,expectedRenames,
    stateCode='export const state={secretField:42};') {
  /** @type {ModuleInput[]} */
  const sources=[
    {path:'state.mjs',sourceType:'module',code:stateCode},
    {path:'main.mjs',sourceType:'module',code:`import {state} from './state.mjs';\n${importerBody}`}
  ];
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cross-inherited-'));
  try {
    /** @param {ModuleInput[]|ReturnType<typeof obfuscateFiles>['files']} files */
    async function run(files) {
      for(const file of files) await atomicWrite(path.join(dir,file.path),file.code);
      return spawnSync(process.execPath,[path.join(dir,'main.mjs')],{encoding:'utf8'});
    }
    const original=await run(sources);
    assert.equal(original.status,0,original.stderr);
    const transformed=obfuscateFiles(sources,{
      mode:'coo',closedWorld:true,seed:'cross-inherited',
      identifiers:false,strings:false
    });
    const result=await run(transformed.files);
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,original.stdout);
    assert.equal(transformed.crossFile.properties,expectedRenames);
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('closed-world ESM rejects getter on inherited field that enumerates own keys',async()=>{
  await check(`Object.defineProperty(Object.prototype,'inspect',{
    get(){return Object.keys(this)[0];}
  });console.log(state.inspect,state.secretField);`,0);
});

test('closed-world ESM refuses own-property deletion that exposes prototype value',async()=>{
  await check(`Object.prototype.secretField=91;
    delete state.secretField;
    console.log(state.secretField);`,0);
});

test('closed-world ESM can rename an own key that shadows an inherited getter',async()=>{
  await check(`Object.defineProperty(Object.prototype,'secretField',{get(){return 99;}});
    console.log(state.secretField);`,1);
});

test('closed-world ESM rejects destructuring of an inherited reflective getter',async()=>{
  await check(`Object.defineProperty(Object.prototype,'inspect',{
    get(){return Object.keys(this)[0];}
  });const {inspect}=state;console.log(inspect,state.secretField);`,0);
});


test('closed-world ESM refuses direct own-key reflection of imported owner',async()=>{
  await check(`
    console.log(JSON.stringify([
      Object.hasOwn(state,'secretField'),
      Reflect.get(state,'secretField'),
      Object.getOwnPropertyDescriptor(state,'secretField').value,
      Object.keys(state)
    ]));`,0);
});


test('closed-world ESM can rename a direct literal-key Reflect.get read',async()=>{
  await check(`console.log(Reflect.get(state,'secretField'));`,1);
});

test('closed-world ESM can rename a direct literal-key Object.hasOwn check',async()=>{
  await check(`console.log(Object.hasOwn(state,'secretField'),state.secretField);`,1);
});


test('closed-world ESM refuses direct reflection in a source-spelled failed call operand',async()=>{
  await check(`try{Reflect.get(state,'secretField')();}catch(error){console.log(error.message);}`,0);
});

test('closed-world ESM refuses aliased Reflect when the intrinsic can be replaced',async()=>{
  await check(`const R=Reflect;const nativeGet=R.get;R.get=(owner,key)=>key+':'+nativeGet(owner,key);
    console.log(R.get(state,'secretField'));`,0);
});

test('closed-world ESM refuses computed Reflect method access',async()=>{
  await check(`console.log(Reflect['get'](state,'secretField'));`,0);
});

test('closed-world ESM refuses nonliteral reflective keys',async()=>{
  await check(`const key='secretField';console.log(Reflect.get(state,key));`,0);
});


test('closed-world ESM refuses constructor-recovered Object.hasOwn mutation',async()=>{
  await check(`const O=({}).constructor;const native=O.hasOwn;
    O.hasOwn=(owner,key)=>key==='secretField'&&native(owner,key);
    console.log(Object.hasOwn(state,'secretField'),state.secretField);`,0);
});



test('closed-world ESM combines direct Reflect.get and Object.hasOwn on one owner',async()=>{
  await check(`console.log(
    Reflect.get(state,'secretField'),
    Object.hasOwn(state,'secretField'),
    state.secretField
  );`,1);
});


test('closed-world ESM renames two-field Reflect.get plus direct read',async()=>{
  await check(`console.log(Reflect.get(state,'secretValue')+state.otherValue);`,2,
    'export const state={secretValue:29,otherValue:12};');
});

test('closed-world ESM renames two-field Object.hasOwn plus direct read',async()=>{
  await check(`console.log(Object.hasOwn(state,'otherValue'),state.secretValue);`,2,
    'export const state={secretValue:29,otherValue:12};');
});

test('closed-world ESM renames two-field combined direct reflection reads',async()=>{
  await check(`console.log(Reflect.get(state,'secretValue'),
    Object.hasOwn(state,'otherValue'),state.otherValue);`,2,
    'export const state={secretValue:29,otherValue:12};');
});

test('closed-world ESM can rename a direct literal-key Reflect.has check',async()=>{
  await check(`console.log(Reflect.has(state,'secretField'),state.secretField);`,1);
});

test('closed-world ESM can rename a direct Reflect.getOwnPropertyDescriptor read',async()=>{
  await check(`console.log(Reflect.getOwnPropertyDescriptor(state,'secretField').value,state.secretField);`,1);
});

test('closed-world ESM can rename a direct Object.getOwnPropertyDescriptor read',async()=>{
  await check(`console.log(Object.getOwnPropertyDescriptor(state,'secretField').value,state.secretField);`,1);
});

test('closed-world ESM refuses patched Reflect.has before direct owner reflection',async()=>{
  await check(`const native=Reflect.has;
    Reflect.has=(owner,key)=>key==='secretField'&&native(owner,key);
    console.log(Reflect.has(state,'secretField'),state.secretField);`,0);
});

test('closed-world ESM refuses patched Object.getOwnPropertyDescriptor before direct owner reflection',async()=>{
  await check(`const native=Object.getOwnPropertyDescriptor;
    Object.getOwnPropertyDescriptor=(owner,key)=>native(owner,key);
    console.log(Object.getOwnPropertyDescriptor(state,'secretField').value,state.secretField);`,0);
});

test('closed-world ESM refuses Proxy-wrapped owner in direct Reflect.has',async()=>{
  await check(`const proxy=new Proxy(state,{
    has(target,key){return key==='secretField'&&Reflect.has(target,key);}
  });console.log(Reflect.has(proxy,'secretField'),state.secretField);`,0);
});

test('closed-world ESM can rename a direct three-argument Reflect.set',async()=>{
  await check(`const ok=Reflect.set(state,'secretField',67);
    console.log(ok,state.secretField);`,1);
});

test('closed-world ESM refuses Reflect.set with an explicit receiver',async()=>{
  await check(`const receiver={};const ok=Reflect.set(state,'secretField',68,receiver);
    console.log(ok,state.secretField,receiver.secretField);`,0);
});

test('closed-world ESM refuses patched Reflect.set before direct owner mutation',async()=>{
  await check(`const native=Reflect.set;
    Reflect.set=(owner,key,value)=>native(owner,key,value);
    Reflect.set(state,'secretField',69);console.log(state.secretField);`,0);
});

test('closed-world ESM refuses owner self-assignment through Reflect.set',async()=>{
  await check(`Reflect.set(state,'secretField',state);
    console.log(state.secretField===state);`,0);
});

test('closed-world ESM refuses Reflect.set value spread that can supply a receiver',async()=>{
  await check(`const receiver={};const args=[70,receiver];
    const ok=Reflect.set(state,'secretField',...args);
    console.log(ok,state.secretField,receiver.secretField);`,0);
});

test('closed-world ESM keeps direct reflection aligned through a private owner alias',async()=>{
  await check(`const alias=state;
    console.log(Reflect.has(alias,'secretField'),alias.secretField);`,1);
});

test('closed-world ESM keeps direct reflection aligned through local identity forwarding',async()=>{
  await check(`const identity=value=>value;const alias=identity(state);
    console.log(Reflect.get(alias,'secretField'),alias.secretField);`,1);
});

test('closed-world ESM refuses accessor-defined owner fields for direct descriptor reflection',async()=>{
  await check(`const descriptor=Object.getOwnPropertyDescriptor(state,'secretField');
    console.log(descriptor.get?.call(state));`,0,
    `export const state={get secretField(){return Object.keys(this)[0];}};`);
});

