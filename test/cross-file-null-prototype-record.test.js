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
 * A record's syntactic null prototype should make inherited and absent
 * string keys harmless even if an unchanged Node host injects a Function
 * onto Object.prototype. Call sites remain entirely static and closed.
 *
 * @param {string} recordLiteral
 * @param {string} callExpression
 * @param {string} [recordMutation]
 * @returns {ModuleFile[]}
 */
function graph(recordLiteral,callExpression,recordMutation=''){
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      'const schema='+recordLiteral+';',
      recordMutation,
      'export function inspectRecord(key){',
      '  return {',
      '    keys:Reflect.ownKeys(schema).sort(),',
      '    value:schema[key],',
      '    enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true',
      '  };',
      '}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      callExpression,
      'console.log(JSON.stringify([state.secretField,result]));'
    ].join('\n')}
  ];
}

/**
 * Execute original/compiled ESM against the same host prototype pollution.
 * Each execution uses a fresh process and a distinct real ESM directory.
 * @param {ReadonlyArray<{path:string,code:string|Buffer}>} files
 * @returns {Promise<unknown[]>}
 */
async function execute(files){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-null-record-'));
  try{
    for(const file of files)await atomicWrite(path.join(root,file.path),file.code);
    const preloader=path.join(root,'preload.cjs');
    await atomicWrite(preloader,
      "'use strict';Object.prototype.noSuchField=Function;");
    const run=spawnSync(process.execPath,[
      '--require',preloader,path.join(root,'entry.mjs')
    ],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
    if(run.error)throw run.error;
    assert.equal(run.status,0,run.stderr);
    return /** @type {unknown[]} */(JSON.parse(run.stdout.trim()));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

const cases=[
  {
    name:'null-prototype record admits inherited and missing string keys',
    record:"{__proto__:null,externalFormat:'audit-v1',auditCount:3}",
    caller:"const result=[typeof inspectRecord('noSuchField').value,typeof inspectRecord('constructor').value,typeof inspectRecord('__proto__').value,typeof inspectRecord('toString').value];",
    expected:1,
    value:['undefined','undefined','undefined','undefined']
  },
  {
    name:'null-prototype record retains own keys and admits a missing key',
    record:"{'__proto__':null,externalFormat:'audit-v1',auditCount:3}",
    caller:"const result=[inspectRecord('externalFormat').value,typeof inspectRecord('missing').value,inspectRecord('auditCount').value];",
    expected:1,
    value:['audit-v1','undefined',3]
  },
  {
    name:'ordinary record must decline inherited host Function',
    record:"{externalFormat:'audit-v1',auditCount:3}",
    caller:"const result=[typeof inspectRecord('noSuchField').value,typeof inspectRecord('constructor').value];",
    expected:0,
    value:['function','function']
  },
  {
    name:'computed __proto__ data member does not set null prototype',
    record:"{['__proto__']:null,externalFormat:'audit-v1',auditCount:3}",
    caller:"const result=[typeof inspectRecord('noSuchField').value,inspectRecord('__proto__').value];",
    expected:0,
    value:['function',null]
  },
  {
    name:'non-null prototype setter retains inherited-key refusal',
    record:"{__proto__:{},externalFormat:'audit-v1',auditCount:3}",
    caller:"const result=[typeof inspectRecord('toString').value];",
    expected:0,
    value:['function']
  },
  {
    name:'null-prototype record with dynamic caller key remains unproved',
    record:"{__proto__:null,externalFormat:'audit-v1',auditCount:3}",
    caller:"const unknown=['noSuch','Field'].join('');const result=[typeof inspectRecord(unknown).value];",
    expected:0,
    value:['undefined']
  },
  {
    name:'null-prototype record with mutated prototype declines',
    record:"{__proto__:null,externalFormat:'audit-v1',auditCount:3}",
    caller:"const result=[typeof inspectRecord('noSuchField').value];",
    mutation:'Object.setPrototypeOf(schema,Object.prototype);',
    expected:0,
    value:['function']
  },
  {
    name:'null-prototype record with leaked receiver declines',
    record:"{__proto__:null,externalFormat:'audit-v1',auditCount:3}",
    caller:"const result=[typeof inspectRecord('noSuchField').value];",
    mutation:'globalThis.LEAKED_SCHEMA=schema;',
    expected:0,
    value:['undefined']
  },
  {
    name:'ordinary record with only known own keys stays eligible',
    record:"{externalFormat:'audit-v1',auditCount:3}",
    caller:"const result=[inspectRecord('auditCount').value,inspectRecord('externalFormat').value];",
    expected:1,
    value:[3,'audit-v1']
  }
];

/** @type {ReadonlyArray<{name:string,record:string,caller:string,expected:number,value:unknown[],mutation?:string}>} */
const scenarios=cases;
for(const scenario of scenarios){
  test('closed null-prototype record: '+scenario.name,async()=>{
    const files=graph(scenario.record,scenario.caller,scenario.mutation??'');
    const reference=await execute(files);
    assert.deepEqual(reference,[41,scenario.value],
      'Unexpected native ESM behavior: '+scenario.name);
    const output=obfuscateFiles(files,{
      mode:'coo',closedWorld:true,
      seed:'null-prototype-owner/'+scenario.name,
      strings:false,identifiers:false,properties:true
    });
    assert.equal(output.crossFile.properties,scenario.expected,
      'Incorrect protected-key rename coverage: '+scenario.name);
    assert.deepEqual(await execute(output.files),reference,
      'Generated output must match exact native behavior: '+scenario.name);
  });
}
