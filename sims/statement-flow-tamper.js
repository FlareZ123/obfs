'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const before=fs.readFileSync(path.join(__dirname,
  '../examples/statement-flow/before/router.cjs'),'utf8');
const after=fs.readFileSync(path.join(__dirname,
  '../examples/statement-flow/after/router.cjs'),'utf8');

/**
 * A source-only attacker can alter a statement directly in the distributed
 * dispatcher while preserving every state transition. This is not an attack
 * on SNO's startup-digest launcher, which a filesystem owner could also edit.
 * @param {string} source
 * @returns {(value:number,flag:boolean,hook:(tag:string)=>void)=>number}
 */
function load(source){
  // A source-only attacker needs only the public function declaration.
  // Re-evaluating its CommonJS wrapper is unnecessary for this mutation test.
  return /** @type {(value:number,flag:boolean,hook:(tag:string)=>void)=>number} */ (vm.runInNewContext(source+'\n;route;',{module:{exports:{}}}));
}
assert.equal(after.split('score += 31;').length,2);
const modified=after.replace('score += 31;','score += 32;');
assert.notEqual(modified,after);
const native=load(before);
const encoded=load(after);
const attacker=load(modified);
let parity=0,changed=0,unchanged=0;
for(let value=-64;value<=64;value++){
  for(const flag of [false,true]){
    const a=[],b=[],c=[];
    const expected=native(value,flag,tag=>a.push(tag));
    const genuine=encoded(value,flag,tag=>b.push(tag));
    const tampered=attacker(value,flag,tag=>c.push(tag));
    assert.equal(genuine,expected);
    assert.deepEqual(b,a);
    assert.deepEqual(c,a,'Attack should change only the intended computation');
    parity++;
    if(tampered===expected)unchanged++;
    else changed++;
  }
}
assert.ok(changed>0&&unchanged>0);
process.stdout.write(JSON.stringify({
  attack:'public source-only CFG statement mutation',
  noCompilerSeed:true,originalParity:parity,changed,unchanged,
  acceptedByNativeJavaScript:true,
  noIntegrityClaim:true
},null,2)+'\n');
