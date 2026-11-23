'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * A reproducible nested-closure-free workload isolates the cost of deciding
 * that many unrelated host-returning functions are *not invoked*. One safe
 * private record field must still be renamed, rather than treating a global
 * factory declaration as an ambient effect by itself.
 * @param {number} factoryCount
 * @returns {ModuleFile[]}
 */
function graph(factoryCount) {
  const unused=Array.from({length:factoryCount},(_,i)=>
    'function unusedFactory'+i+'(){return globalThis.RUNTIME_FACTORY;}');
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:41};'},
    {path:'record.mjs',sourceType:'module',code:[
      "const schema={externalFormat:'audit-v1',auditCount:3};",
      'export function inspectRecord(key){return {',
      '  keys:Reflect.ownKeys(schema).sort(),',
      '  value:schema[key],',
      '  enumerable:Object.getOwnPropertyDescriptor(schema,"externalFormat")?.enumerable===true',
      '};}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      "import {state} from './state.mjs';",
      "import {inspectRecord} from './record.mjs';",
      ...unused,
      "const result=inspectRecord('externalFormat');",
      'console.log(JSON.stringify([state.secretField,result.value]));'
    ].join('\n')}
  ];
}

/** @param {number[]} numbers @returns {number} */
function median(numbers){
  const sorted=[...numbers].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

test('unused host-returning factories preserve safe rewrite and profile compiler scaling',()=>{
  /** @type {{factoryCount:number,sourceBytes:number,medianMs:number,trialsMs:number[]}[]} */
  const profiles=[];
  for(const count of [0,8,24,48,96,144]) {
    const files=graph(count);
    const options={
      mode:/** @type {'coo'} */('coo'),closedWorld:true,
      seed:'uninvoked-host-factory-scalability',
      identifiers:false,strings:false,properties:true
    };
    /** @type {number[]} */
    const times=[];
    for(let rep=0;rep<4;rep++) {
      const before=process.hrtime.bigint();
      const compiled=obfuscateFiles(files,options);
      const ms=Number(process.hrtime.bigint()-before)/1e6;
      assert.equal(compiled.crossFile.properties,1,
        'Unused factory declarations cannot by themselves forbid private-field rewriting');
      if(rep>0)times.push(Math.round(ms*1000)/1000);
    }
    profiles.push({
      factoryCount:count,
      sourceBytes:files.reduce((sum,file)=>sum+file.code.length,0),
      medianMs:Math.round(median(times)*1000)/1000,
      trialsMs:times
    });
  }
  // These timings are diagnostic data, not a release assertion or an
  // environment-independent compiler time bound.
  console.log('HOST_CALLBACK_PROOF_SCALING '+JSON.stringify({
    node:process.version,platform:process.platform,profiles
  }));
});
