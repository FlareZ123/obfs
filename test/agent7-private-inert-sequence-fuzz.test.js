'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src/core');

/** @typedef {'coo'|'sco'|'sno'} Mode */

let state=0x725164ab;
/** @returns {number} */
function random(){
  state^=state<<13;
  state^=state>>>17;
  state^=state<<5;
  return state>>>0;
}

/** @param {string} source @returns {string} */
function execute(source){
  const sandbox={module:{exports:/** @type {unknown} */(null)}};
  vm.runInNewContext(source,sandbox,{timeout:1000});
  return JSON.stringify(sandbox.module.exports);
}

/** @param {string} source @param {Mode} mode @param {number} id */
function compile(source,mode,id){
  return obfuscateFiles([{path:'sequence-fuzz.cjs',sourceType:'commonjs',code:source}],{
    mode,seed:'sequence-fuzz/'+id+'/'+mode,
    identifiers:false,strings:false,properties:true
  }).files[0];
}
const fields=['hiddenCount','privateTotal','secretDigit','internalValue',
  'ownedCache','opaqueState','privateWeight','secureIndex'];

/** @param {number} id @returns {string} */
function positive(id){
  const first=fields[id%fields.length];
  const second=fields[(id+3)%fields.length];
  const a=1+(random()%10000);
  const b=1+(random()%10000);
  const chosen=id%3===0?'(0,owner)':id%3===1?'(true,null,owner)':'("x",0n,owner)';
  const reads=id%2===0 ?
    'alias.'+first+'+next.'+second :
    'alias['+JSON.stringify(first)+']+next['+JSON.stringify(second)+']';
  return [
    'const owner={'+first+':'+a+','+second+':'+b+'};',
    'const alias='+chosen+';',
    // A second provenance-carrying comma expression stresses least-fixed
    // point alias propagation across the first alias.
    id%4===0?'const next=(0,alias);':'const next=alias;',
    'module.exports=['+reads+','+a+','+b+'];'
  ].join('');
}

/** @param {number} id @returns {string} */
function negative(id){
  const key=fields[id%fields.length];
  const value=1+(random()%10000);
  const root='const owner={'+key+':'+value+'};';
  switch(id%10){
    case 0: return root+
      'const alias=(globalThis.publicOwner=owner,owner);'+
      'module.exports=Object.keys(globalThis.publicOwner);';
    case 1: return root+
      'function witness(v){return Object.keys(v).join(",");}'+
      'const alias=(witness(owner),owner);module.exports=alias.'+key+';';
    case 2: return root+
      'const alias=(owner,0);module.exports=[alias,Object.keys(owner)];';
    case 3: return root+
      'const alias=(0,owner);module.exports=alias;';
    case 4: return root+
      'const alias=(0,owner);module.exports=Object.keys(alias);';
    case 5: return root+
      'const alias=(0,owner);try{alias.'+key+'()}'+
      'catch(error){module.exports=error.message;}';
    case 6: return root+
      'const alias=(0,owner);try{[...alias.'+key+']}'+
      'catch(error){module.exports=error.message;}';
    case 7: return root+
      'let alias=(0,owner);alias={'+key+':73};'+
      'module.exports=[alias.'+key+',owner.'+key+'];';
    case 8: return root+
      'const alias=(0,owner);module.exports=Reflect.ownKeys(alias);';
    default: return root+
      'const alias=(0,owner);const key=globalThis.secretInput||'+
      JSON.stringify(key)+';module.exports=alias[key];';
  }
}

test('288 seeded inert-sequence owner aliases retain exact output and two protected keys',()=>{
  for(let i=0;i<288;i++){
    const source=positive(i);
    const expected=execute(source);
    const mode=/** @type {Mode} */(['coo','sco','sno'][i%3]);
    const emitted=compile(source,mode,i);
    assert.equal(emitted.metrics.properties,2,
      'positive #'+i+'/'+mode+' missing owner field yield: '+String(emitted.code));
    assert.equal(execute(String(emitted.code)),expected,
      'positive #'+i+'/'+mode+' semantic mismatch');
    assert.doesNotMatch(String(emitted.code),new RegExp(
      fields[i%fields.length]+'|'+fields[(i+3)%fields.length],'u'));
  }
});

test('180 seeded escaping/reflective/throwing sequence owners refuse renaming',()=>{
  for(let i=0;i<180;i++){
    const source=negative(i);
    const expected=execute(source);
    const mode=/** @type {Mode} */(['coo','sco','sno'][i%3]);
    const emitted=compile(source,mode,1000+i);
    assert.equal(emitted.metrics.properties,0,
      'negative #'+i+'/'+mode+' unexpectedly rewrote observed keys: '+
      String(emitted.code));
    assert.equal(execute(String(emitted.code)),expected,
      'negative #'+i+'/'+mode+' semantic mismatch');
  }
});
