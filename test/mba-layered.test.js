'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {layerXorFunctions}=require('../workplace/layered-mba');
const {normalizeMba}=require('../sims/mba-static-normalize');

/** @param {string} source @returns {(a:number,b:number)=>number} */
function compile(source){
  /** @type {{module:{exports:unknown}}} */
  const context={module:{exports:null}};
  vm.runInNewContext(source,context,{timeout:2000});
  return /** @type {(a:number,b:number)=>number} */ (context.module.exports);
}

/** @param {number} input @returns {number} */
function scramble(input){return Math.imul(input^(input>>>13),20011)|0;}

test('composed XOR masks preserve full Int32 differential behavior',()=>{
  const sources=[
    'function f(x,y){return (x^y)|0;}module.exports=f;',
    'function f(x,y){return ((x^y)+17)|0;}module.exports=f;',
    'function f(x,y){return (((x^7)-(y^13))|0);}module.exports=f;',
    'function f(x,y){return (((x^y)&31)>>>3);}module.exports=f;'
  ];
  const edge=[-2147483648,-65536,-1,0,1,7,31,255,65535,2147483647];
  for(const [index,source] of sources.entries()){
    const native=compile(source);
    for(let seed=0;seed<25;seed++){
      const out=layerXorFunctions(source,{sourceType:'commonjs',seed:'layer/'+index+'/'+seed,names:['f']});
      assert.equal(out.rewrites,1);
      const compiled=compile(out.code);
      for(const x of edge)for(const y of edge)assert.ok(Object.is(compiled(x,y),native(x,y)));
      for(let trial=0;trial<1800;trial++){
        const x=scramble(seed*313+trial*17),y=scramble(index*231+trial*67);
        assert.ok(Object.is(compiled(x,y),native(x,y));
      }
    }
  }
});

test('CRLF checkout keeps generated layered circuit variant stable',()=>{
  const source='function f(x,y){\n return (((x^y)+17)&255);\n}\nmodule.exports=f;\n';
  const options={sourceType:'commonjs',seed:'layer/crlf',names:['f']};
  const a=layerXorFunctions(source,/** @type {any} */(options));
  const b=layerXorFunctions(source.replace(/\n/g,'\r\n'),/** @type {any} */(options));
  assert.equal(a.code,b.code.replace(/\r\n/g,'\n'));
});

test('first-stage static normalizer cannot fully peel unequal-source mask forms',()=>{
  const source='function f(x,y){return (x^y)|0;}module.exports=f;';
  let opaque=0;
  for(let seed=0;seed<20;seed++){
    const output=layerXorFunctions(source,{sourceType:'commonjs',seed:'static/'+seed,names:['f']});
    const normalized=normalizeMba(output.code);
    assert.ok(normalized.code.includes('^'));
    // First-stage attacker can simplify De Morgan, but it cannot cancel two
    // structurally equivalent masks until the resulting terms are reconciled.
    if(normalized.code!==source)opaque++;
    for(const x of [0,7,-2147483648])for(const y of [-1,0,31])
      assert.equal(compile(normalized.code)(x,y),compile(source)(x,y));
  }
  assert.equal(opaque,20);
});

test('layering refuses unsafe constructs and known source observers',()=>{
  for(const source of [
    'function f(x,y){return x.value^y;}module.exports=f;',
    'function f(x,y){return x()^y;}module.exports=f;',
    'function f(x,y){return x+y;}module.exports=f;',
    'function f(x,y){eval("x=1");return x^y;}module.exports=f;',
    'function f(x,y){return x^y;}module.exports=f.toString();'
  ]){
    const out=layerXorFunctions(source,{sourceType:'commonjs',seed:'refuse',names:['f']});
    assert.equal(out.code,source);
    assert.equal(out.rewrites,0);
  }
});

test('actual checked-in layered output is exactly reproducible',()=>{
  const source=readFileSync(path.join(__dirname,'../samples/mba-layered-before.cjs'),'utf8');
  const expected=readFileSync(path.join(__dirname,'../samples/mba-layered-after.cjs'),'utf8');
  const result=layerXorFunctions(source,{sourceType:'commonjs',seed:'agent17-layered-sample-v1',names:['digest']});
  assert.equal(result.code,expected);
  assert.equal(result.rewrites,1);
  const original=compile(source),transformed=compile(expected);
  for(let i=0;i<2000;i++)assert.equal(original(scramble(i),scramble(i+17)),transformed(scramble(i),scramble(i+17)));
});
