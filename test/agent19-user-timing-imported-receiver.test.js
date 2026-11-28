'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} ESMFile */

/**
 * Evaluate actual Node 22 ESM across three source files, with independent
 * temporary directories to prevent native/emitted module cache conflation.
 * @param {ESMFile[]} files
 * @returns {Promise<{source:string,value:number}>}
 */
async function execute(files) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'agent19-timing-import-'));
  try {
    for(const file of files)await fs.writeFile(path.join(root,file.path),file.code,'utf8');
    const mod=await import(pathToFileURL(path.join(root,'consumer.mjs')).href);
    return mod.view;
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

/**
 * @param {'receiver'|'record'|'factory'|'detail'} shape
 * @param {boolean} primitive
 * @returns {ESMFile[]}
 */
function fixtures(shape,primitive) {
  const hosts={
    receiver:'export const timing=performance;',
    record:'export const hooks={native:performance.mark};',
    factory:'export function makeTiming(){return performance;}',
    detail:'export const timing=performance;'
  };
  const invocations={
    receiver:'timing.mark(inspect).name',
    record:'hooks.native.call(performance,inspect).name',
    factory:'makeTiming().mark(inspect).name',
    detail:'(()=>{let source="";try{timing.mark("fixed",{detail:{fn:inspect}});}catch(error){source=error.message;}return source;})()'
  };
  const imports={
    receiver:'import {timing} from "./host.mjs";',
    record:'import {hooks} from "./host.mjs";',
    factory:'import {makeTiming} from "./host.mjs";',
    detail:'import {timing} from "./host.mjs";'
  };
  const producer='export function inspect(){const owner={secretField:61};return owner.secretField;}';
  const consumer=primitive?
    imports[shape]+
      'const owner={secretField:61};'+
      'export const view={source:"primitive",value:owner.secretField};'+
      '(void performance.mark("constant literal",{detail:{n:17}}));':
    imports[shape]+'import {inspect} from "./producer.mjs";'+
      'export const view={source:'+invocations[shape]+',value:inspect()};';
  return [
    {path:'host.mjs',sourceType:'module',code:hosts[shape]},
    {path:'producer.mjs',sourceType:'module',code:producer},
    {path:'consumer.mjs',sourceType:'module',code:consumer}
  ];
}

/** @param {ESMFile[]} files @param {string} seed @param {'coo'|'sno'|'sco'} mode */
function compile(files,seed,mode) {
  return obfuscateFiles(files,{
    mode,seed,closedWorld:true,strings:true,identifiers:true,properties:true
  });
}

for(const mode of /** @type {const} */(['coo','sno','sco'])) {
  for(const shape of /** @type {const} */(['receiver','record','factory','detail'])) {
    test(mode+' imported ESM User Timing source observer via '+shape,async()=>{
      const original=fixtures(shape,false);
      const native=await execute(original);
      assert.match(native.source,/secretField/u,'Actual native imported source witness');
      assert.equal(native.value,61);
      const mutated=fixtures(shape,false);
      mutated[1].code=mutated[1].code.replaceAll('secretField','otherField');
      assert.notEqual((await execute(mutated)).source,native.source,
        'Mutating producer function source must change native observable result');
      const transformed=compile(original,'agent19-native-import/'+mode+'/'+shape,mode);
      const emitted=transformed.files.map(file=>({
        path:file.path,sourceType:/** @type {const} */('module'),code:String(file.code)
      }));
      assert.deepEqual(await execute(emitted),native,
        'Cross-file imported native receiver must not permit source-changing producer rewrite');
    });
  }
  test(mode+' imported User Timing receiver with primitive arguments keeps rewrite yield',async()=>{
    const source=fixtures('receiver',true);
    const native=await execute(source);
    const transformed=compile(source,'agent19-native-import-primitive/'+mode,mode);
    const emitted=transformed.files.map(file=>({
      path:file.path,sourceType:/** @type {const} */('module'),code:String(file.code)
    }));
    assert.deepEqual(await execute(emitted),native);
    assert.ok(!emitted[2].code.includes('secretField'),
      'A primitive native call must not prevent unrelated private property rewriting');
  });
}
