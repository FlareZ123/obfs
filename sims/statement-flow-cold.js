'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {flattenStatementFlow}=require('../src/statement-flow');

/** @param {number[]} data @returns {number} */
function median(data){
  const sorted=[...data].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

/**
 * Alternate cold V8 parse and source compilation for identical original and
 * transformed JavaScript, with unique comments and filename per instance.
 * This is a startup-cost proxy; it excludes network, I/O and module linking.
 * @param {string} original
 * @param {string} compiled
 * @returns {Record<string,unknown>}
 */
function compare(original,compiled){
  /** @type {number[]} */
  const native=[];
  /** @type {number[]} */
  const transformed=[];
  let index=0;
  for(let trial=0;trial<9;trial++){
    for(const kind of trial%2?['transformed','native']:['native','transformed']){
      const source=kind==='native'?original:compiled;
      for(let i=0;i<50;i++){
        assert.ok(new vm.Script(source+'\n//warm-'+i,{filename:'warm-'+i+'.cjs'}));
      }
      const start=performance.now();
      for(let i=0;i<400;i++){
        const id=index++;
        assert.ok(new vm.Script(source+'\n//unique-'+id,{
          filename:'fresh-'+id+'.cjs'
        }));
      }
      (kind==='native'?native:transformed).push(performance.now()-start);
    }
  }
  const baseline=median(native),candidate=median(transformed);
  return {platform:process.platform,node:process.version,passes2_5x:candidate<=baseline*2.5,
    nativeBytes:Buffer.byteLength(original,'utf8'),transformedBytes:Buffer.byteLength(compiled,'utf8'),
    nativeMedianMs:baseline,transformedMedianMs:candidate,coldCompileRatio:candidate/baseline,
    samples:{native,transformed}};
}

/** @returns {void} */
function main(){
  const base=path.join(__dirname,'../examples/statement-flow');
  const original=fs.readFileSync(path.join(base,'before/router.cjs'),'utf8');
  const committed=fs.readFileSync(path.join(base,'after/router.cjs'),'utf8');
  const generated=flattenStatementFlow(original,'commonjs',{
    seed:'statement-flow-example-20261116',names:['route']
  });
  assert.equal(generated.functions,1);
  assert.equal(generated.code,committed,'Pinned before/after sample was not regenerated correctly');
  process.stdout.write(JSON.stringify(compare(original,committed),null,2)+'\n');
}
main();
