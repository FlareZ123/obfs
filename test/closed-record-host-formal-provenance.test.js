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


/**
 * Native Function.prototype.call/apply/bind and Reflect.apply can invoke a
 * source-visible local callback with an ambient root hidden behind a method
 * call. These cases require exact original-vs-emitted Node ESM comparisons,
 * independently of the direct/aliased Identifier callsite proof.
 */
for(const [name,code] of [
  ['Function.prototype.call direct',
    "function rewire({['Ref'+'lect']:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}rewire.call(null,globalThis);"],
  ['Function.prototype.call aliased',
    "function rewire({['Ref'+'lect']:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}const alias=rewire;alias.call(null,globalThis);"],
  ['Function.prototype.apply array',
    "function rewire({['Ref'+'lect']:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}rewire.apply(null,[globalThis]);"],
  ['Function.prototype.bind captured argument',
    "function rewire({['Ref'+'lect']:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}const bound=rewire.bind(null,globalThis);bound();"],
  ['Function.prototype.bind aliased arrow',
    "const rewire=({['Ref'+'lect']:cap})=>{cap.ownKeys=globalThis.HOST_REFLECT;};const alias=rewire;const bound=alias.bind(null,globalThis);bound();"],
  ['Reflect.apply local function',
    "function rewire({['Ref'+'lect']:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}Reflect.apply(rewire,null,[globalThis]);"]
]){
  test('first-class host provenance invocation: '+name,async()=>{
    const original=graph(code);
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'host-native-callsite/'+name,
      identifiers:false,strings:false,properties:true
    });
    const expected=await execute(original);
    assert.deepEqual(expected,[41,'audit-v1',['secretField']]);
    assert.deepEqual(await execute(compiled.files),expected,
      'A local function reached through a native invoke adapter still mutates ambient Reflect');
    assert.equal(compiled.crossFile.properties,0,
      'Native call/apply/bind invocation must not permit unsafe exported owner renaming');
  });
}

test('unrelated local bound function retains one genuine exported owner rename',async()=>{
  const original=graph(
    "const unrelated=({['UNRELATED_FIXTURE']:k})=>k;const bound=unrelated.bind(null,globalThis);void bound();");
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'host-native-callsite/unrelated',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'A benign native-bind callsite should keep proven unrelated private work');
  const expected=await execute(original);
  assert.deepEqual(expected,[41,'audit-v1',null]);
  assert.deepEqual(await execute(compiled.files),expected);
});


/**
 * bind() without a captured argument returns a locally callable adapter
 * whose later arguments still flow into the original function's formals.
 * Existing direct-call provenance must not lose these remaining parameters.
 */
for(const [name,code] of [
  ['uncaptured bound function',
    "function rewire({['Ref'+'lect']:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}const bound=rewire.bind(null);bound(globalThis);"],
  ['uncaptured bound function forwarded alias',
    "function rewire({['Ref'+'lect']:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}const bound=rewire.bind(null);const alias=bound;alias(globalThis);"],
  ['partially bound two-parameter function',
    "function rewire(unrelated,{['Ref'+'lect']:cap}){void unrelated;cap.ownKeys=globalThis.HOST_REFLECT;}const bound=rewire.bind(null,7);bound(globalThis);"],
  ['uncaptured bound function invoked by Reflect.apply',
    "function rewire({['Ref'+'lect']:cap}){cap.ownKeys=globalThis.HOST_REFLECT;}const bound=rewire.bind(null);Reflect.apply(bound,null,[globalThis]);"]
]){
  test('partially bound local host provenance: '+name,async()=>{
    const original=graph(code);
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'host-partial-bind/'+name,
      identifiers:false,strings:false,properties:true
    });
    const expected=await execute(original);
    assert.deepEqual(expected,[41,'audit-v1',['secretField']]);
    assert.deepEqual(await execute(compiled.files),expected,
      'Bound local callable must retain the original remaining formal parameters');
    assert.equal(compiled.crossFile.properties,0);
  });
}

test('partially bound local non-host callable keeps real owner-key rename',async()=>{
  const original=graph(
    "function read(unrelated,{['UNRELATED_FIXTURE']:k}){void unrelated;return k;}const bound=read.bind(null,7);void bound(globalThis);");
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'host-partial-bind/benign',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'A safe partial bind must retain nonvacuous cross-file private work');
  const expected=await execute(original);
  assert.deepEqual(expected,[41,'audit-v1',null]);
  assert.deepEqual(await execute(compiled.files),expected);
});


/**
 * Research-only adversarial probes for argument-array and rest-parameter
 * transport. A direct local function's source-visible rest array can contain
 * globalThis even when no normal Identifier or ObjectPattern formal exists.
 */
for(const [name,code] of [
  ['rest parameter first argument',
    "function rewire(...roots){const {['Ref'+'lect']:cap}=roots[0];cap.ownKeys=globalThis.HOST_REFLECT;}rewire(globalThis);"],
  ['implicit arguments first argument',
    "function rewire(){const {['Ref'+'lect']:cap}=arguments[0];cap.ownKeys=globalThis.HOST_REFLECT;}rewire(globalThis);"],
  ['rest parameter via Function.prototype.call',
    "const rewire=(...roots)=>{const {['Ref'+'lect']:cap}=roots[0];cap.ownKeys=globalThis.HOST_REFLECT;};rewire.call(null,globalThis);"],
  ['rest parameter second argument',
    "function rewire(first,...roots){void first;const {['Ref'+'lect']:cap}=roots[0];cap.ownKeys=globalThis.HOST_REFLECT;}rewire(7,globalThis);"]
]) {
  test('unresolved rest/arguments ambient effects: '+name,async()=>{
    const original=graph(code);
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'host-rest-arguments/'+name,
      identifiers:false,strings:false,properties:true
    });
    const expected=await execute(original);
    assert.deepEqual(expected,[41,'audit-v1',['secretField']]);
    assert.deepEqual(await execute(compiled.files),expected,
      'Argument-array transport may mutate the shared ambient Reflect method');
    assert.equal(compiled.crossFile.properties,0);
  });
}

test('unrelated rest-parameter call retains genuinely safe owner-key rename',async()=>{
  const original=graph(
    "function size(...items){return items.length;}void size(7);");
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'host-rest-arguments/benign',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'A benign rest-array helper should retain a real owner rewrite');
  const expected=await execute(original);
  assert.deepEqual(expected,[41,'audit-v1',null]);
  assert.deepEqual(await execute(compiled.files),expected);
});
