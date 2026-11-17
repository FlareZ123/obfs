'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {flattenStatementFlow}=require('../src/statement-flow');
const {recoverStatementFlow}=require('./statement-flow-recover');

/** @param {number} branches @returns {string} */
function makeProgram(branches){
  const lines=['function f(x){var y=x|0;'];
  for(let i=0;i<branches;i++){
    const mask=1<<(i%7);
    lines.push('if((y&'+mask+')!==0){y=(y+'+(i+1)+')|0;}'+
      'else{y=(y-'+(i+3)+')|0;}');
  }
  lines.push('return y|0;}');
  return lines.join('\n');
}

/** @param {string} source @returns {(x:number)=>number} */
function load(source){
  return /** @type {(x:number)=>number} */(vm.runInNewContext(source+'\n;f;'));
}

/**
 * Entirely source-only decompilation of independently chosen, seeded native
 * CFG layouts. Static extraction time is measured separately from executing
 * the recovered program. A successful attack does not prove source identity.
 * @returns {{node:string,rows:object[]}}
 */
function run(){
  /** @type {object[]} */
  const rows=[];
  for(const compact of [false,true]){
    for(const branches of [3,6,9,12,20,40,80]){
      const original=makeProgram(branches);
      const encoded=flattenStatementFlow(original,'commonjs',{
        names:['f'],seed:'diamond-scaling-'+branches+'-'+compact,
        compactCases:compact
      });
      assert.equal(encoded.functions,1,'Source not transformed');
      const start=performance.now();
      const recovered=recoverStatementFlow(encoded.code,'f');
      const attackMs=performance.now()-start;
      const native=load(original),emitted=load(encoded.code),clone=load(recovered.code);
      let checks=0;
      for(let x=-100;x<=100;x+=5){
        assert.equal(emitted(x),native(x),'Emitted semantic mismatch');
        assert.equal(clone(x),native(x),'Recovered semantic mismatch');
        checks++;
      }
      rows.push({compact,branches,compilerBlocks:encoded.blocks,
        sourceBytes:Buffer.byteLength(original),
        emittedBytes:Buffer.byteLength(encoded.code),
        recoveredBytes:Buffer.byteLength(recovered.code),
        recoveredToSource:recovered.code.length/original.length,
        staticAttackMs:attackMs,checks});
    }
  }
  return {node:process.version,rows};
}

if(require.main===module)process.stdout.write(
  'CFG_SHARED_JOIN_RECOVERY '+JSON.stringify(run())+'\n');
module.exports={run,makeProgram};
