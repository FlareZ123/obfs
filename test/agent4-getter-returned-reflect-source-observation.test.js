'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @param {ReadonlyArray<{path:string,code:string|Buffer}>} files @returns {Promise<string>} */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-getter-reflect-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const child=spawnSync(process.execPath,[path.join(directory,'entry.mjs')],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr);
    return child.stdout;
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/** @param {string} caller */
function graph(caller) {
  return [
    {path:'state.mjs',sourceType:'module',code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){',
      '  return {keys:Reflect.ownKeys(schema).sort(),value:schema[key],enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true};',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      caller,
      'console.log(JSON.stringify([state.secretField,result]));'
    ].join('\n')}
  ];
}

test('a getter-returned Reflect alias cannot expose renamed cross-file owner keys',async()=>{
  const caller=[
    'const ambient={get reflect(){return globalThis.Reflect;}};',
    'const reflector=ambient.reflect;',
    'const originalOwnKeys=reflector.ownKeys;',
    'let observed=[];',
    'reflector.ownKeys=function(value){',
    '  const keys=originalOwnKeys.call(this,value);',
    '  observed=originalOwnKeys.call(this,state).sort();',
    '  return keys;',
    '};',
    "const result=[inspectRecord('externalFormat'),observed];"
  ].join('\n');
  const files=graph(caller);
  const native=await execute(files);
  assert.equal(native,'[41,[[["auditCount","externalFormat"],"audit-v1",true],["secretField"]]]\n');
  const compiled=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'getter-returned-reflect-observer',
    identifiers:false,strings:false,properties:true
  });
  assert.equal(compiled.crossFile.properties,0,
    'A getter-returned host Reflect alias can observe owner property names');
  assert.equal(await execute(compiled.files),native,
    'A getter-returned Reflect alias must not observe renamed cross-file owner keys');
});
