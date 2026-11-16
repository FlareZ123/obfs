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
 * Complete static ESM graph. A deliberately unprovided host callback performs
 * the same runtime import in native and transformed executions.
 * @param {string} mutation
 * @returns {ModuleFile[]}
 */
function graph(mutation){
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){',
      '  return {keys:Reflect.ownKeys(schema).sort(),value:schema[key]};',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      mutation,
      "const result=inspectRecord('externalFormat');",
      'const observed=await globalThis.HOST_OBSERVATION;',
      'console.log(JSON.stringify([state.secretField,result.value,observed]));'
    ].join('\n')}
  ];
}

/**
 * Run the original and emitted files under identical fixed host conditions.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<unknown[]>}
 */
async function execute(files){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-host-formal-'));
  try{
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const preloader=[
      "'use strict';",
      "const path=require('node:path');",
      "const {pathToFileURL}=require('node:url');",
      'const original=Reflect.ownKeys;',
      "const importModule=Function('url','return import(url)');",
      'globalThis.HOST_REFLECT=function(subject){',
      "  if(subject?.externalFormat==='audit-v1'){",
      "    const url=pathToFileURL(path.join(__dirname,'state.mjs')).href;",
      '    globalThis.HOST_OBSERVATION=importModule(url).then(m=>Object.keys(m.state));',
      '  }',
      '  return original(subject);',
      '};'
    ].join('\n');
    const preloadPath=path.join(directory,'preload.cjs');
    await atomicWrite(preloadPath,preloader);
    const child=spawnSync(process.execPath,
      ['--require',preloadPath,path.join(directory,'entry.mjs')],
      {encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return /** @type {unknown[]} */(JSON.parse(child.stdout.trim()));
  }finally{await fs.rm(directory,{recursive:true,force:true});}
}

const bad=[
  {
    name:'destructured function formal receives global root',
    code:"function rewire({['Ref'+'lect']:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}rewire(globalThis);"
  },
  {
    name:'destructured arrow formal receives global root',
    code:"const rewire=({['Ref'+'lect']:cap})=>{cap.ownKeys=globalThis.HOST_REFLECT;};rewire(globalThis);"
  },
  {
    name:'plain function formal forwards global root to local destructuring',
    code:"function rewire(root){const {['Ref'+'lect']:cap}=root;cap.ownKeys=globalThis.HOST_REFLECT;}rewire(globalThis);"
  },
  {
    name:'plain function formal forwards global root to assignment destructuring',
    code:"function rewire(root){let cap;({['Ref'+'lect']:cap}=root);cap.ownKeys=globalThis.HOST_REFLECT;}rewire(globalThis);"
  },
  {
    name:'forwarded host argument through two local functions',
    code:"function rewire(root){const {['Ref'+'lect']:cap}=root;cap.ownKeys=globalThis.HOST_REFLECT;}function relay(value){rewire(value);}relay(globalThis);"
  }
];

for(const item of bad){
  test('interprocedural host capability: '+item.name,async()=>{
    const original=graph(item.code);
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'host-formal/'+item.name,
      identifiers:false,strings:false,properties:true
    });
    const reference=await execute(original);
    assert.deepEqual(reference,[41,'audit-v1',['secretField']]);
    assert.deepEqual(await execute(compiled.files),reference,
      'Generated output must preserve dynamically imported state owner spelling');
    assert.equal(compiled.crossFile.properties,0,
      'Source-visible intrinsic overwrite invalidates closed-record read proof');
  });
}

test('unrelated formal destructuring keeps actual owner-field transformation',async()=>{
  const original=graph(
    "function probe({['UNRELATED_FIXTURE']:x}){void x;}probe(globalThis);");
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'host-formal/unrelated',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'A proven unrelated host field read should retain one protected rewrite');
  const reference=await execute(original);
  assert.deepEqual(reference,[41,'audit-v1',null]);
  assert.deepEqual(await execute(compiled.files),reference);
});

test('local non-host formal destructuring keeps actual owner-field transformation',async()=>{
  const original=graph(
    "function probe({['Ref'+'lect']:cap}){cap.ownKeys=()=>[];}probe({['Ref'+'lect']:{ownKeys:null}});");
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'host-formal/local-only',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'Local non-host arguments do not change ambient Reflect');
  const reference=await execute(original);
  assert.deepEqual(reference,[41,'audit-v1',null]);
  assert.deepEqual(await execute(compiled.files),reference);
});


/**
 * Callable aliases are a second edge in the interprocedural graph: a direct
 * argument-to-formal proof must follow the target function value after a
 * uniquely bound local alias. These variants are separate from simple root
 * forwarding through a named function's formal identifier.
 */
for(const [name,code] of [
  ['aliased function declaration',
    "function rewire({['Ref'+'lect']:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}const alias=rewire;alias(globalThis);"],
  ['transitively aliased function declaration',
    "function rewire({['Ref'+'lect']:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}const one=rewire;const two=one;two(globalThis);"],
  ['aliased arrow function',
    "const rewire=({['Ref'+'lect']:cap})=>{cap.ownKeys=globalThis.HOST_REFLECT;};const alias=rewire;alias(globalThis);"]
]){
  test('callable alias ambient capability: '+name,async()=>{
    const original=graph(code);
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'host-formal-alias/'+name,
      identifiers:false,strings:false,properties:true
    });
    const expected=await execute(original);
    assert.deepEqual(expected,[41,'audit-v1',['secretField']]);
    assert.deepEqual(await execute(compiled.files),expected,
      'Alias invocation must preserve the original exported field spelling');
    assert.equal(compiled.crossFile.properties,0,
      'An aliased local callable can still mutate ambient Reflect methods');
  });
}

test('aliased function reading an unrelated host field preserves nonvacuous rename',async()=>{
  const original=graph(
    "const read=({['UNRELATED_FIXTURE']:x})=>x;const alias=read;void alias(globalThis);");
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'host-formal-alias/benign',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'A benign aliased function must not force full-graph refusal');
  const expected=await execute(original);
  assert.deepEqual(expected,[41,'audit-v1',null]);
  assert.deepEqual(await execute(compiled.files),expected);
});
