'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {recoverCompact}=require('../sims/polyvariant-compact-static-recover');

const names=Object.freeze(['round1','round2','round3']);
const original=fs.readFileSync(path.join(__dirname,
  '../examples/polyvariant-app/native/math.mjs'),'utf8');

/**
 * @param {string} source
 * @returns {{round1:(x:unknown)=>number,round2:(x:unknown)=>number,round3:(x:unknown)=>number,digest?:(seed:number,text:string)=>number}}
 */
function load(source){
  const evaluated=source.replace(/^export /gmu,'');
  return /** @type {ReturnType<typeof load>} */ (
    new Function(evaluated+'\nreturn {round1,round2,round3,'+
      '(typeof digest===\'function\'?digest:undefined)};')()
  );
}

/** @returns {string} */
function compile(){
  const result=obfuscateFiles([{
    path:'math.mjs',sourceType:'module',code:original
  }],{
    mode:'sno',seed:'compact-polyvariant-compatibility-20261118',
    identifiers:false,properties:false,strings:false,closedWorld:false,
    experimentalPolyvariantAffine:{'math.mjs':names.slice()},
    experimentalPolyvariantCount:2,experimentalPolyvariantCompact:true
  });
  assert.equal(result.files.length,1);
  assert.equal(result.files[0].metrics.polyvariantFunctions,3);
  assert.equal(result.files[0].metrics.polyvariantPaths,6);
  const code=/** @type {string} */ (result.files[0].code);
  assert.match(code,/_ac_[0-9a-f]{14}/u,'Compact path must actually be selected');
  return code;
}

test('compact variant preserves all tested native numeric and coercion observations',()=>{
  const native=load(original),candidate=load(compile());
  const cases=/** @type {unknown[]} */ ([
    undefined,null,NaN,Infinity,-Infinity,-0,0,1,-1,
    2147483647,-2147483648,4294967295,-4294967297,
    17.6,-82.5,'7',false,true,[],[8],{valueOf(){return 12.75;}}
  ]);
  let state=0x6b77a8c5;
  for(let i=0;i<8192;i++){
    state=(Math.imul(state,1664525)+1013904223)|0;
    cases.push(state);
  }
  for(const name of names){
    const a=native[name],b=candidate[name];
    for(const value of cases){
      assert.equal(b(value),a(value),name+' changed behavior for '+String(value));
    }
    assert.throws(()=>a(Symbol('no-number')),TypeError);
    assert.throws(()=>b(Symbol('no-number')),TypeError);
    assert.throws(()=>a(5n),TypeError);
    assert.throws(()=>b(5n),TypeError);
    let nativeCalls=0,compiledCalls=0;
    const x=a({valueOf(){nativeCalls++;return -1;}});
    const y=b({valueOf(){compiledCalls++;return -1;}});
    assert.equal(y,x);
    assert.equal(nativeCalls,1);
    assert.equal(compiledCalls,1);
  }
  for(let i=0;i<64;i++){
    const seed=i*0x123ab+23;
    const payload='unicode終β:'+i;
    assert.equal(candidate.digest?.(seed,payload),native.digest?.(seed,payload));
  }
});

test('independent source-only parser exactly reconstructs compact case arithmetic',()=>{
  const compiled=compile();
  const recovered=recoverCompact(compiled,names.slice());
  assert.deepEqual(recovered.map(entry=>entry.name),names);
  assert.deepEqual(recovered.map(entry=>entry.paths),[2,2,2]);
  const source=recovered.map(entry=>entry.source).join('\n');
  const rebuilt=load(source),native=load(original);
  let state=0x419cd365;
  for(let i=0;i<4096;i++){
    state=(Math.imul(state,1103515245)+12345)|0;
    for(const name of names){
      assert.equal(rebuilt[name](state),native[name](state));
    }
  }
  assert.notEqual(source,compiled,'Attacker reconstructs simpler source from the public distribution');
  assert.equal(recovered.length,3);
});
