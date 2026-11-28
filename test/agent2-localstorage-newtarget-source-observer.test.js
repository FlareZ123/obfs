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

const sources=[{
  path:'app.mjs',
  sourceType:'module',
  code:[
    'const owner={secretField:7};',
    'export function outer(){',
    ' const internal=()=>{const x=owner.secretField;localStorage.setItem(\'k\',new.target);return x;};',
    ' return {result:internal()};',
    '}'
  ].join('\n')
}];

/**
 * Construct outer from outside the source graph. The host-provided Storage
 * shim models the Web Storage DOMString conversion of setItem's value.
 * @param {Source[]} files
 * @returns {Promise<{result:number,storedHasOriginal:boolean,storedSource:string}>}
 */
async function run(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-localstorage-newtarget-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const script=[
      "globalThis.localStorage={setItem(_key,value){globalThis.__stored=String(value);}};",
      'globalThis.sessionStorage=globalThis.localStorage;',
      'globalThis.window=globalThis;',
      'const {outer}=await import(process.argv[1]);',
      'const result=new outer();',
      'const storedSource=globalThis.__stored;',
      "process.stdout.write(JSON.stringify({result:result.result,storedHasOriginal:storedSource.includes('secretField'),storedSource}));"
    ].join('\n');
    const child=spawnSync(process.execPath,[
      '--input-type=module','-e',script,pathToFileURL(path.join(root,'app.mjs')).href
    ],{encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{result:number,storedHasOriginal:boolean,storedSource:string}} */(JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}


const windowAliasSources=[{
  path:'app.mjs',
  sourceType:'module',
  code:[
    'const owner={secretField:7};',
    'const storage=window.localStorage;',
    'export function outer(){',
    " const internal=()=>{const x=owner.secretField;storage.setItem('k',new.target);return x;};",
    ' return {result:internal()};',
    '}'
  ].join('\n')
}];

const sessionAliasSources=[{
  path:'app.mjs',
  sourceType:'module',
  code:[
    'const owner={secretField:7};',
    'const storage=globalThis.sessionStorage;',
    'export function outer(){',
    " const internal=()=>{const x=owner.secretField;storage.setItem('k',new.target);return x;};",
    ' return {result:internal()};',
    '}'
  ].join('\n')
}];

async function assertStorageSourcePreserved(files,seed){
  const native=await run(files);
  assert.equal(native.result,7);
  assert.equal(native.storedHasOriginal,true);
  assert.equal(typeof native.storedSource,'string');
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
  process.stdout.write('WEB_STORAGE_SOURCE_OBSERVER '+JSON.stringify({
    original:native,emitted:actual,propertyRenames:app.metrics.properties,source:app.code
  })+'\n');
  assert.equal(app.metrics.properties,0,
    JSON.stringify({native,actual,propertyRenames:app.metrics.properties,source:app.code}));
  assert.equal(actual.storedSource,native.storedSource,
    'observed Web Storage DOMString must retain the complete original function source');
  assert.deepEqual(actual,native);
}

test('window.localStorage alias is recognized as a Web Storage source observer',async()=>{
  await assertStorageSourcePreserved(windowAliasSources,'agent2-window-localstorage-alias');
});

test('globalThis.sessionStorage alias is recognized as a Web Storage source observer',async()=>{
  await assertStorageSourcePreserved(sessionAliasSources,'agent2-globalthis-sessionstorage-alias');
});


const boundMethodAliasSources=[{
  path:'app.mjs',
  sourceType:'module',
  code:[
    'const owner={secretField:7};',
    'const set=localStorage.setItem.bind(localStorage);',
    'export function outer(){',
    ' const internal=()=>{const x=owner.secretField;set(\'k\',new.target);return x;};',
    ' return {result:internal()};',
    '}'
  ].join('\n')
}];

const callMethodSources=[{
  path:'app.mjs',
  sourceType:'module',
  code:[
    'const owner={secretField:7};',
    'export function outer(){',
    ' const internal=()=>{const x=owner.secretField;localStorage.setItem.call(localStorage,\'k\',new.target);return x;};',
    ' return {result:internal()};',
    '}'
  ].join('\n')
}];

const applyMethodSources=[{
  path:'app.mjs',
  sourceType:'module',
  code:[
    'const owner={secretField:7};',
    'export function outer(){',
    " const internal=()=>{const x=owner.secretField;localStorage.setItem.apply(localStorage,['k',new.target]);return x;};",
    ' return {result:internal()};',
    '}'
  ].join('\n')
}];

const reflectApplyMethodSources=[{
  path:'app.mjs',
  sourceType:'module',
  code:[
    'const owner={secretField:7};',
    'export function outer(){',
    " const internal=()=>{const x=owner.secretField;Reflect.apply(localStorage.setItem,localStorage,['k',new.target]);return x;};",
    ' return {result:internal()};',
    '}'
  ].join('\n')
}];

test('bound Storage method aliases are recognized as source observers',async()=>{
  await assertStorageSourcePreserved(boundMethodAliasSources,'agent2-bound-storage-method-alias');
});

test('Storage method call invocation is recognized as a source observer',async()=>{
  await assertStorageSourcePreserved(callMethodSources,'agent2-storage-method-call');
});

test('Storage method apply invocation is recognized as a source observer',async()=>{
  await assertStorageSourcePreserved(applyMethodSources,'agent2-storage-method-apply');
});

test('Reflect.apply of a Storage method is recognized as a source observer',async()=>{
  await assertStorageSourcePreserved(reflectApplyMethodSources,'agent2-reflect-apply-storage-method');
});

test('unmodeled Web Storage string conversion of lexical new.target disables owner property renaming',async()=>{
  const native=await run(sources);
  assert.equal(native.result,7);
  assert.equal(native.storedHasOriginal,true);
  assert.equal(typeof native.storedSource,'string');
  const compiled=obfuscateFiles(sources,{
    mode:'coo',closedWorld:true,seed:'agent2-localstorage-newtarget-source-observer',
    properties:true,identifiers:false,strings:false
  });
  const app=compiled.files.find(file=>file.path==='app.mjs');
  assert.ok(app);
  const emitted=compiled.files.map(file=>({
    path:file.path,sourceType:'module',code:String(file.code)
  }));
  const actual=await run(emitted);
  process.stdout.write('LOCALSTORAGE_NEW_TARGET_SOURCE_OBSERVER '+JSON.stringify({
    original:native,emitted:actual,
    propertyRenames:app.metrics.properties,
    source:app.code
  })+'\n');
  assert.equal(app.metrics.properties,0,
    JSON.stringify({native,actual,propertyRenames:app.metrics.properties,source:app.code}));
  assert.equal(actual.storedSource,native.storedSource,
    'observed Web Storage DOMString must retain the complete original function source');
  assert.deepEqual(actual,native);
});

/**
 * The previous oracle checked only that the source contained 'secretField'.
 * A binding-only rewrite can preserve that Boolean and the numeric result
 * while changing the exact function source observed through DOMString.
 * Exercise the negative control on all seven Storage invocation shapes.
 */
test('Web Storage source oracle detects binding-only edits across all seven call forms',async()=>{
  const fixtures=[
    ['direct',sources],
    ['window-alias',windowAliasSources],
    ['session-alias',sessionAliasSources],
    ['bound-alias',boundMethodAliasSources],
    ['call',callMethodSources],
    ['apply',applyMethodSources],
    ['reflect-apply',reflectApplyMethodSources]
  ];
  for(const [name,files] of fixtures) {
    const native=await run(files);
    const mutated=files.map(file=>{
      const code=file.code
        .replace('const x=owner.secretField;', 'const renamed=owner.secretField;')
        .replace('return x;', 'return renamed;');
      assert.notEqual(code,file.code,'mutation must change '+name);
      assert.ok(code.includes('return renamed;'),'mutation must rename both occurrences: '+name);
      return {...file,code};
    });
    const changed=await run(mutated);
    assert.equal(native.result,7,name);
    assert.equal(changed.result,native.result,name);
    assert.equal(changed.storedHasOriginal,native.storedHasOriginal,
      'old Boolean-only oracle stays vacuously green: '+name);
    assert.notEqual(changed.storedSource,native.storedSource,
      'exact source oracle must reject the binding-only mutation: '+name);
  }
});
