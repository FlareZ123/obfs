'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');

/** @param {string} code @returns {unknown} */
function load(code){
  const module={exports:/** @type {unknown} */(null)};
  new Function('module',code)(module);
  return module.exports;
}

/** @type {Array<{name:string,source:string,changes:Array<[string,string]>,argument:number}>} */
const publicCallables=[
  {name:'primitive Blob owner with public callback',source:
    'const owner={hiddenCount:41,secretDelta:2};'+
    'const make=Blob.bind(null);new make([],{type:"text/plain"});'+
    'module.exports=()=>owner.hiddenCount+owner.secretDelta;',
    changes:[['hiddenCount','renamedCount'],['secretDelta','renamedDelta']],
    argument:0},
  {name:'private tuple owner in exported score function',source:
    'const owner={hiddenCount:11,privateDelta:5};'+
    'const tuple=[false,"metadata",owner,null];const alias=tuple[2];'+
    'module.exports=function score(n){let sum=0;for(let i=0;i<n;i++)'+
    'sum=(sum+((alias.hiddenCount+i)&255)+owner.privateDelta)|0;return sum;};',
    changes:[['hiddenCount','renamedCount'],['privateDelta','renamedDelta']],
    argument:23},
  {name:'Symbol experimental owner in public callback',source:
    'const bag={pulse:7,mask:3};'+
    'function calc(x){bag.pulse+=x;return (bag.pulse^bag.mask)|0;}'+
    'module.exports=calc;',
    changes:[['pulse','renamedPulse'],['mask','renamedMask']],
    argument:3},
  {name:'factory owner in exported read function',source:
    'function make(){return {secretField:17,otherField:5};}'+
    'const owner=make();module.exports=function read(){'+
    'return owner.secretField+owner.otherField;};',
    changes:[['secretField','renamedSecret'],['otherField','renamedOther']],
    argument:0}
];

for(const fixture of publicCallables){
  test('public exact-function-source counterexample: '+fixture.name,()=>{
    let renamed=fixture.source;
    for(const [before,after] of fixture.changes)
      renamed=renamed.replaceAll(before,after);
    const actual=load(fixture.source);
    const alternative=load(renamed);
    assert.equal(typeof actual,'function');
    assert.equal(typeof alternative,'function');
    const fn=/** @type {(value:number)=>unknown} */(actual);
    const renamedFn=/** @type {(value:number)=>unknown} */(alternative);
    assert.equal(fn(fixture.argument),renamedFn(fixture.argument),
      'Controlled local key rewrite preserves the returned value');
    const firstSource=Function.prototype.toString.call(fn);
    const afterSource=Function.prototype.toString.call(renamedFn);
    assert.notEqual(firstSource,afterSource,
      'Native Function#toString can distinguish direct rewrite of public body');
    for(const [before,after] of fixture.changes){
      assert.ok(firstSource.includes(before));
      assert.ok(afterSource.includes(after));
    }
  });
}

test('publicly exported owner record reveals keys under own-key reflection',()=>{
  const original='const state={secretValue:3,otherKey:5};module.exports=state;';
  const modified=original.replaceAll('secretValue','renamedSecret')
    .replaceAll('otherKey','renamedOther');
  const before=/** @type {Record<string,number>} */ (load(original));
  const after=/** @type {Record<string,number>} */ (load(modified));
  assert.deepEqual(Object.values(before),Object.values(after));
  assert.notDeepEqual(Object.keys(before),Object.keys(after));
  assert.notEqual(JSON.stringify(before),JSON.stringify(after));
});
