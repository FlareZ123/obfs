'use strict';

const assert=require('node:assert/strict');
const vm=require('node:vm');
const {flattenStatementFlow}=require('../src/statement-flow');
const {recoverStatementFlow}=require('./statement-flow-recover');

let state=0x37a90b1d;
/** @returns {number} */
function random(){
  state^=state<<13;
  state^=state>>>17;
  state^=state<<5;
  return state>>>0;
}
/** @param {number} max @returns {number} */
function draw(max){return random()%max;}

/**
 * Generate a fresh multi-statement native JavaScript branch program with
 * caller-provided event hook. Every operation is a signed i32-compatible JS
 * primitive operation, but all side effects stay observable.
 * @param {number} iteration
 * @returns {string}
 */
function program(iteration){
  const a=draw(61)-30;
  const b=draw(19)+1;
  const c=draw(23)-11;
  const d=draw(31);
  const e=draw(11)+1;
  const f=draw(11)+1;
  const g=draw(7)+1;
  const expression=draw(2)?'(x|0)*'+(draw(7)+1):'(x|0)^'+draw(255);
  const code=[
    'function f(x,flag,hook){',
    'var a='+expression+';',
    'if(flag){hook("allowed");a+=('+a+');if(a>'+b+'){a^='+d+';}else{a-=('+c+');}}',
    'else if(a>'+c+'){hook("fallback");a^='+e+';a+=('+f+');}',
    'else{hook("minimum");a-=('+g+');}',
    'return (a^'+(draw(511)+1)+')|0;',
    '}'
  ].join('');
  if(!iteration)assert.match(code,/function f/u);
  return code;
}

/** @param {Function} fn @param {number} input @param {boolean} flag */
function execute(fn,input,flag){
  const events=[];
  const value=fn(input,flag,/** @param {string} event */ event=>events.push(event));
  return {value,events};
}

const count=160;
let preserved=0;
let recovered=0;
for(let index=0;index<count;index++){
  const original=program(index);
  const compiled=flattenStatementFlow(original,'commonjs',{
    seed:'statement-flow-heldout-'+index,names:['f']
  });
  assert.equal(compiled.functions,1,'Declined generated program '+index);
  assert.ok(compiled.blocks>=5);
  const attack=recoverStatementFlow(compiled.code,'f');
  const a=/** @type {Function} */ (vm.runInNewContext(original+';f;'));
  const b=/** @type {Function} */ (vm.runInNewContext(compiled.code+';f;'));
  const c=/** @type {Function} */ (vm.runInNewContext(attack.code+';f;'));
  for(let value=-128;value<=127;value++){
    for(const flag of [false,true]){
      const expected=execute(a,value,flag);
      assert.deepEqual(execute(b,value,flag),expected,
        'Native mismatch at graph '+index+' value '+value+' flag '+flag);
      assert.deepEqual(execute(c,value,flag),expected,
        'Reconstruction mismatch at graph '+index+' value '+value+' flag '+flag);
      preserved++;
      recovered++;
    }
  }
}
process.stdout.write(JSON.stringify({
  seed:'0x37a90b1d',graphs:count,observations:preserved,
  nativeMatches:preserved,attackerMatches:recovered,
  attackerSuccessFraction:count+'/'+count
},null,2)+'\n');
