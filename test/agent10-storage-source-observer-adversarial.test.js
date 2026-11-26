'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} Source */

/**
 * Run one ESM source graph with a host-provided Storage implementation.
 * The method bodies live on Storage.prototype so that destructuring and
 * descriptor/Reflect extraction exercise the same callable.
 * @param {Source[]} files
 * @returns {Promise<{result:number,storedHasOriginal:boolean}>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-storage-observer-adversarial-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const script=[
      'class Storage {',
      ' setItem(key,value){globalThis.__storedKey=String(key);globalThis.__stored=String(value);}',
      ' getItem(key){return globalThis.__storedKey===String(key)?globalThis.__stored:null;}',
      ' removeItem(key){if(globalThis.__storedKey===String(key)){globalThis.__storedKey=undefined;globalThis.__stored=undefined;}}',
      '}',
      'globalThis.Storage=Storage;',
      'globalThis.localStorage=new Storage();',
      'globalThis.sessionStorage=new Storage();',
      'globalThis.window=globalThis;',
      'const {outer}=await import(process.argv[1]);',
      'const result=new outer();',
      "process.stdout.write(JSON.stringify({result:result.result,storedHasOriginal:String(globalThis.__stored).includes('secretField')}));"
    ].join('\n');
    const child=spawnSync(process.execPath,[
      '--input-type=module','-e',script,pathToFileURL(path.join(root,'app.mjs')).href
    ],{encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{result:number,storedHasOriginal:boolean}} */(JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/**
 * Assert that a Storage conversion of lexical new.target keeps the original
 * constructor source visible, so the property proof must decline renaming.
 * @param {string} setup
 * @param {string} invocation
 * @param {string} seed
 * @returns {Promise<void>}
 */
async function assertStorageObserver(setup,invocation,seed){
  const files=[{
    path:'app.mjs',
    sourceType:'module',
    code:[
      'const owner={secretField:7};',
      setup,
      'export function outer(){',
      ' const internal=()=>{const x=owner.secretField;' + invocation + ';return x;};',
      ' return {result:internal()};',
      '}'
    ].join('\n')
  }];
  const native=await run(files);
  assert.deepEqual(native,{result:7,storedHasOriginal:true});
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed,
    properties:true,identifiers:false,strings:false
  });
  const app=compiled.files.find(file=>file.path==='app.mjs');
  assert.ok(app);
  const emitted=compiled.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  }));
  const actual=await run(emitted);
  process.stdout.write('STORAGE_OBSERVER_ADVERSARIAL '+JSON.stringify({
    seed,native,emitted:actual,propertyRenames:app.metrics.properties,source:app.code
  })+'\n');
  assert.equal(app.metrics.properties,0,
    JSON.stringify({seed,native,actual,propertyRenames:app.metrics.properties,source:app.code}));
  assert.deepEqual(actual,native);
}

test('destructured localStorage.setItem alias is a source observer',async()=>{
  await assertStorageObserver(
    'const {setItem}=localStorage;',
    "setItem.call(localStorage,'k',new.target)",
    'agent10-storage-destructure-localstorage'
  );
});

test('destructured Storage.prototype.setItem alias is a source observer',async()=>{
  await assertStorageObserver(
    'const {setItem}=Storage.prototype;',
    "setItem.call(localStorage,'k',new.target)",
    'agent10-storage-destructure-prototype'
  );
});

test('Object.getOwnPropertyDescriptor-extracted Storage method is a source observer',async()=>{
  await assertStorageObserver(
    "const setItem=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem').value;",
    "setItem.call(localStorage,'k',new.target)",
    'agent10-storage-descriptor-extraction'
  );
});

test('Reflect.get-extracted Storage method is a source observer',async()=>{
  await assertStorageObserver(
    "const setItem=Reflect.get(Storage.prototype,'setItem');",
    "setItem.call(localStorage,'k',new.target)",
    'agent10-storage-reflect-get-extraction'
  );
});

test('assignment-pattern Storage method destructuring is a source observer',async()=>{
  await assertStorageObserver(
    'let setItem; ({setItem}=localStorage);',
    "setItem.call(localStorage,'k',new.target)",
    'agent10-storage-assignment-destructure'
  );
});

test('Storage descriptor aliases retain source-observer provenance',async()=>{
  await assertStorageObserver(
    "const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem'); const setItem=descriptor.value;",
    "setItem.call(localStorage,'k',new.target)",
    'agent10-storage-descriptor-alias-chain'
  );
});

test('aliased Reflect.get extraction retains Storage source-observer provenance',async()=>{
  await assertStorageObserver(
    "const get=Reflect.get; const setItem=get(Storage.prototype,'setItem');",
    "setItem.call(localStorage,'k',new.target)",
    'agent10-storage-reflect-get-alias'
  );
});

test('aliased Object.getOwnPropertyDescriptor extraction retains Storage source-observer provenance',async()=>{
  await assertStorageObserver(
    "const descriptorReader=Object.getOwnPropertyDescriptor; const setItem=descriptorReader(Storage.prototype,'setItem').value;",
    "setItem.call(localStorage,'k',new.target)",
    'agent10-storage-descriptor-reader-alias'
  );
});

test('descriptor value destructuring retains Storage source-observer provenance',async()=>{
  await assertStorageObserver(
    "const {value:setItem}=Object.getOwnPropertyDescriptor(Storage.prototype,'setItem');",
    "setItem.call(localStorage,'k',new.target)",
    'agent10-storage-descriptor-value-destructure'
  );
});

test('Storage method extraction with primitive-only values retains positive property yield',async()=>{
  const files=[{
    path:'app.mjs',
    sourceType:'module',
    code:[
      'const owner={secretField:7};',
      'const {setItem}=localStorage;',
      'export function outer(){',
      " const internal=()=>{const x=owner.secretField;setItem.call(localStorage,'k',42);return x;};",
      ' return {result:internal()};',
      '}'
    ].join('\n')
  }];
  const native=await run(files);
  assert.deepEqual(native,{result:7,storedHasOriginal:false});
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'agent10-storage-extraction-primitive-positive',
    properties:true,identifiers:false,strings:false
  });
  const app=compiled.files.find(file=>file.path==='app.mjs');
  assert.ok(app);
  const emitted=compiled.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  }));
  const actual=await run(emitted);
  process.stdout.write('STORAGE_OBSERVER_PRIMITIVE_POSITIVE '+JSON.stringify({
    native,emitted:actual,propertyRenames:app.metrics.properties,source:app.code
  })+'\n');
  assert.equal(app.metrics.properties,1,
    JSON.stringify({native,actual,propertyRenames:app.metrics.properties,source:app.code}));
  assert.deepEqual(actual,native);
});
