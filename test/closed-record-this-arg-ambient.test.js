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
 * @param {string} invocation
 * @param {boolean} [includeTamper]
 * @returns {ModuleFile[]}
 */
function graph(invocation,includeTamper=true) {
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
      ...(includeTamper?[
        "const selector=['Ref','lect'].join('');",
        "function tamper(){this[selector].ownKeys=globalThis.HOST_REFLECT;}"
      ]:[]),
      invocation,
      "const result=inspectRecord('externalFormat');",
      'const observed=await globalThis.HOST_OBSERVATION;',
      'console.log(JSON.stringify([state.secretField,result.value,observed]));'
    ].join('\n')}
  ];
}

/**
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<string>}
 */
async function execute(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-this-receiver-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const preloader=[
      "'use strict';",
      "const path=require('node:path');",
      "const {pathToFileURL}=require('node:url');",
      "const native=Reflect.ownKeys;",
      "const dynamicImport=Function('uri','return import(uri)');",
      "globalThis.HOST_REFLECT=function(receiver){",
      "  if(receiver && receiver.externalFormat==='audit-v1'){",
      "    const target=pathToFileURL(path.join(__dirname,'state.mjs')).href;",
      "    globalThis.HOST_OBSERVATION=dynamicImport(target).then(ns=>Object.keys(ns.state));",
      "  }",
      "  return native(receiver);",
      "};"
    ].join('\n');
    const preloadPath=path.join(dir,'preload.cjs');
    await atomicWrite(preloadPath,preloader);
    const result=spawnSync(process.execPath,['--require',preloadPath,path.join(dir,'entry.mjs')],
      {encoding:'utf8',timeout:15000});
    if(result.error)throw result.error;
    assert.equal(result.status,0,result.stderr);
    return result.stdout.trim();
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}

for(const [name,invocation] of [
  ['Function.call','tamper.call(globalThis);'],
  ['Function.apply','tamper.apply(globalThis,[]);'],
  ['Function.bind','const bound=tamper.bind(globalThis);bound();'],
  ['Reflect.apply','Reflect.apply(tamper,globalThis,[]);'],
  ['transitive thisArg alias','const context=globalThis;tamper.call(context);']
]) {
  test('ambient thisArg via '+name+' preserves reflected exported keys',async()=>{
    const original=graph(invocation);
    const compiled=obfuscateFiles(original,{
      mode:'coo',closedWorld:true,seed:'ambient-thisArg-'+name,
      identifiers:false,strings:false,properties:true
    });
    const expected=await execute(original);
    assert.equal(expected,'[41,"audit-v1",["secretField"]]');
    assert.equal(await execute(compiled.files),expected,
      'An ambient this receiver can replace Reflect.ownKeys before record inspection');
    assert.equal(compiled.crossFile.properties,0,
      'Unproved receiver mutation must decline private-key rewriting');
  });
}

test('independent safe closed-record graph retains positive private-key rewrite',async()=>{
  const original=graph('const benign=7;',false);
  const compiled=obfuscateFiles(original,{
    mode:'coo',closedWorld:true,seed:'local-thisArg-positive',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1,
    'Receiver-independent property rewriting should remain nonvacuous');
  const expected=await execute(original);
  assert.equal(expected,'[41,"audit-v1",null]');
  assert.equal(await execute(compiled.files),expected);
});
