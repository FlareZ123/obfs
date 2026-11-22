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
 * Execute native or generated ESM in a fresh Node process.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @param {boolean} [withHost]
 * @returns {Promise<string>}
 */
async function execute(files,withHost=false) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sequence-root-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const preloader=path.join(directory,'host.cjs');
    if(withHost)await atomicWrite(preloader,'globalThis.RUNTIME_FACTORY=Function;');
    const args=withHost?['--require',preloader,path.join(directory,'entry.mjs')]:
      [path.join(directory,'entry.mjs')];
    const child=spawnSync(process.execPath,args,{encoding:'utf8',timeout:15000});
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * @param {string} caller
 * @returns {ModuleFile[]}
 */
function graph(caller) {
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){',
      '  return {',
      '    keys:Reflect.ownKeys(schema).sort(),',
      '    value:schema[key],',
      '    enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true',
      '  };',
      '}'
    ].join('\\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      caller,
      'console.log(JSON.stringify([state.secretField,result]));'
    ].join('\\n')}
  ];
}

test('direct globalThis root passed to an ObjectPattern formal remains guarded',async()=>{
  const files=graph([
    'const root=globalThis;',
    'function rewire({Reflect}){Reflect.ownKeys=()=>[root.RUNTIME_FACTORY];}',
    'rewire(root);',
    "const ctor=inspectRecord('auditCount').keys[0];",
    "const remote=await ctor(\"return import('./state.mjs')\")();",
    "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
  ].join('\\n'));
  const native=await execute(files,true);
  assert.equal(native,'[41,[3,["secretField"],41]]\\n');
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'direct-root-formal-20261122',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,0);
  assert.equal(await execute(compiled.files,true),native);
});

test('sequence-expression globalThis root passed as Identifier actual cannot expose renamed ESM owner',async()=>{
  const files=graph([
    'const root=(0,globalThis);',
    'function rewire({Reflect}){Reflect.ownKeys=()=>[root.RUNTIME_FACTORY];}',
    'rewire(root);',
    "const ctor=inspectRecord('auditCount').keys[0];",
    "const remote=await ctor(\"return import('./state.mjs')\")();",
    "const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];"
  ].join('\\n'));
  const native=await execute(files,true);
  assert.equal(native,'[41,[3,["secretField"],41]]\\n');
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'sequence-root-formal-20261122',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,0,
    'A sequence-expression alias of globalThis must propagate through an Identifier actual');
  assert.equal(await execute(compiled.files,true),native);
});

test('safe own-record transformation remains non-vacuous beside host-root witness',async()=>{
  const files=graph("const result=[inspectRecord('externalFormat'),inspectRecord('auditCount')];");
  const native=await execute(files);
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'sequence-root-positive-control',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,1);
  assert.equal(await execute(compiled.files),native);
});
