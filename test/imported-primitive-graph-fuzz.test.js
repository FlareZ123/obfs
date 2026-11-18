'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');
const {collectVerifiedImportedPrimitives}=require('../src/cross-properties');

/** @typedef {{path:string,code:string,sourceType:'module'}} ModuleFile */

/**
 * A fixed-seed generator of grammar-supported primitive expressions.
 * Every leaf is a JS primitive. No function, ambient read or property access
 * is admitted, so the test measures positive yield without weakening the
 * source-observer negatives.
 * @returns {string[]}
 */
function expressions() {
  const atoms=['0','1','2','3','-1','-0','37','true','false','null',
    '""','"12"','"x"'];
  let seed=0x5fe7c031;
  /** @param {number} bound */
  function next(bound) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed%bound;
  }
  /** @param {number} depth @returns {string} */
  function make(depth) {
    if(depth===0)return atoms[next(atoms.length)];
    const left=make(depth-1);
    const right=make(depth-1);
    const op=['+','-','*','/','%','|','^','===','!==','&&','||','??'][next(12)];
    const binary='('+left+op+right+')';
    switch(next(7)) {
      case 0: return '!('+binary+')';
      case 1: return '~('+binary+')';
      case 2: return 'void ('+binary+')';
      case 3: return 'typeof ('+binary+')';
      case 4: return '('+left+'?'+right+':null)';
      case 5: return '('+left+','+binary+')';
      default: return binary;
    }
  }
  return Array.from({length:128},()=>make(2));
}

/** @param {string[]} group @returns {ModuleFile[]} */
function graph(group) {
  const producer=[
    'const owner={privateField:23};',
    'const secret=owner.privateField;',
    'export function peek(){return secret;}',
    ...group.map((expression,index)=>'export const v'+index+'='+expression+';')
  ].join('\n');
  const names=group.map((_,index)=>'v'+index);
  const consumer='import {'+names.join(',')+',peek} from "./producer.mjs";\n'+
    'export const values=['+names.map(name=>'String('+name+')').join(',')+
    ',String(peek())];';
  return [
    {path:'producer.mjs',sourceType:'module',code:producer},
    {path:'consumer.mjs',sourceType:'module',code:consumer}
  ];
}

/**
 * Execute the real Node ESM loader rather than a source-text evaluator.
 * Every run uses a fresh directory, preserving native import cache semantics.
 * @param {ModuleFile[]} files
 * @returns {Promise<string[]>}
 */
async function execute(files) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-import-primitive-grid-'));
  try {
    for(const file of files)await atomicWrite(path.join(dir,file.path),file.code);
    const mod=await import(pathToFileURL(path.join(dir,'consumer.mjs')).href);
    return /** @type {string[]} */ (mod.values);
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

/** @type {readonly ('coo'|'sno'|'sco')[]} */
const modes=['coo','sno','sco'];
const cases=expressions();

for(let groupIndex=0;groupIndex<4;groupIndex++) {
  const inputs=graph(cases.slice(groupIndex*32,(groupIndex+1)*32));
  for(const mode of modes) {
    test('seeded ESM primitive graph '+groupIndex+' in '+mode+
      ' preserves 33 outputs with a positive private-key rewrite',async()=>{
      const proven=collectVerifiedImportedPrimitives(inputs);
      assert.equal(proven.get('consumer.mjs')?.size,32);
      const original=await execute(inputs);
      const emitted=obfuscateFiles(inputs,{
        mode,closedWorld:true,seed:'primitive-graph-fuzz/'+groupIndex+'/'+mode,
        strings:false,identifiers:false,properties:true
      });
      assert.equal(emitted.files[0].metrics.properties,1);
      assert.ok(!emitted.files[0].code.includes('privateField'));
      const output=await execute(/** @type {ModuleFile[]} */ (emitted.files));
      assert.deepEqual(output,original);
      assert.equal(output.length,33);
    });
  }
}

for(const mode of modes) {
  test('function-valued ESM source observer still forbids private-key changes in '+mode,
    async()=>{
      const inputs=graph(['(()=>owner.privateField)']);
      const proven=collectVerifiedImportedPrimitives(inputs);
      assert.equal(proven.get('consumer.mjs')?.size,0);
      const emitted=obfuscateFiles(inputs,{
        mode,closedWorld:true,seed:'primitive-fuzz-negative/'+mode,
        strings:false,identifiers:false,properties:true
      });
      assert.equal(emitted.files[0].metrics.properties,0);
      assert.deepEqual(
        await execute(/** @type {ModuleFile[]} */ (emitted.files)),
        await execute(inputs)
      );
    });
}
