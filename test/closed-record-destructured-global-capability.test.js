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
 * The dynamically imported owner is not a declared dependency of the
 * source-visible ambient replacement. It is loaded by the same host callback
 * when native and compiler-generated ESM graphs run.
 * @param {string} sourceMutation
 * @returns {ModuleFile[]}
 */
function graph(sourceMutation){
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){',
      '  return {keys:Reflect.ownKeys(schema).sort(),value:schema[key]};',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      sourceMutation,
      "const result=inspectRecord('externalFormat');",
      'const observed=await globalThis.HOST_OBSERVATION;',
      'console.log(JSON.stringify([state.secretField,result.value,observed]));'
    ].join('\n')}
  ];
}

/**
 * Spawn a fresh Node ESM realm with the same deliberately opaque host
 * callback for original and transformed programs. This distinguishes
 * source-visible semantic errors from public-runtime attacker instrumentation.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<unknown[]>}
 */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-destructure-ambient-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preload=[
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
    const preloadPath=path.join(root,'preload.cjs');
    await atomicWrite(preloadPath,preload);
    const child=spawnSync(process.execPath,['--require',preloadPath,
      path.join(root,'entry.mjs')],{
      encoding:'utf8',timeout:15000,maxBuffer:1024*1024
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return /** @type {unknown[]} */(JSON.parse(child.stdout.trim()));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

const cases=[
  {
    label:'computed string-literal destructuring',
    mutation:"const {['Ref'+'lect']:capability}=globalThis;capability.ownKeys=globalThis.HOST_REFLECT;"
  },
  {
    label:'dynamically built destructuring selector',
    mutation:"const name=['Ref','lect'].join('');const {[name]:capability}=globalThis;capability.ownKeys=globalThis.HOST_REFLECT;"
  },
  {
    label:'alias forwarded after computed destructuring',
    mutation:"const {['Ref'+'lect']:capability}=globalThis;const forwarded=capability;forwarded.ownKeys=globalThis.HOST_REFLECT;"
  },
  {
    label:'native Object.assign mutator applied to extracted capability',
    mutation:"const {['Ref'+'lect']:capability}=globalThis;Object.assign(capability,{ownKeys:globalThis.HOST_REFLECT});"
  }
];

/** @type {ReadonlyArray<{label:string,mutation:string}>} */
const negativeCases=cases;
for(const item of negativeCases){
  test('computed global capability transport: '+item.label,async()=>{
    const original=graph(item.mutation);
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,
      seed:'capability-destructuring/'+item.label,
      strings:false,identifiers:false,properties:true
    });
    const reference=await execute(original);
    assert.deepEqual(reference,[41,'audit-v1',['secretField']]);
    assert.deepEqual(await execute(compiled.files),reference,
      'The generated graph must preserve the source-visible ambient mutation');
    assert.equal(compiled.crossFile.properties,0,
      'An extracted mutable ambient Reflect object invalidates native-method proof');
  });
}

test('unrelated destructured global field retains positive rename coverage',async()=>{
  const original=graph(
    "const {['UNRELATED_FIXTURE']:other}=globalThis;void other;");
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'capability-destructuring/positive',
    strings:false,identifiers:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'A harmless unrelated own-property read should preserve actual protected work');
  const reference=await execute(original);
  assert.deepEqual(reference,[41,'audit-v1',null]);
  assert.deepEqual(await execute(compiled.files),reference);
});
