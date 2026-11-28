'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src');

const base='function inspect(x){return x^17;}';
const observed=base+
  'module.exports=new DOMParser().parseFromString(inspect,"text/html").body.textContent;';

/**
 * Model only the Web IDL argument conversion and resulting text access.
 * The actual browser DOM parser is tested separately under Chromium.
 * @param {string} code
 * @returns {unknown}
 */
function observe(code){
  const module={exports:null};
  class FakeDOMParser{
    /** @param {unknown} source @param {string} type */
    parseFromString(source,type){
      assert.equal(type,'text/html');
      return {body:{textContent:String(source)}};
    }
  }
  vm.runInNewContext(code,{module,WebAssembly,Uint8Array,
    DOMParser:FakeDOMParser},{timeout:4000});
  return module.exports;
}

test('actual Wasm lowering changes a function consumed by DOMParser',()=>{
  const result=lowerWasmI32Functions(base,'commonjs',{
    seed:'domparser-counterfactual',names:['inspect']
  });
  assert.equal(result.functions,1);
  assert.equal(observe(observed),'function inspect(x){return x^17;}');
  assert.notEqual(observe(result.code+
    'module.exports=new DOMParser().parseFromString(inspect,"text/html").body.textContent;'),
    observe(observed));
});

test('DOMParser.parseFromString function-source observer must refuse Wasm',()=>{
  const result=lowerWasmI32Functions(observed,'commonjs',{
    seed:'domparser-frozen',names:['inspect']
  });
  assert.equal(result.functions,0);
  assert.equal(result.declined,1);
  assert.equal(result.code,observed);
});

for(const mode of /** @type {const} */(['coo','sco','sno'])){
  test(mode+' must reject selected Wasm with native DOMParser source coercion',()=>{
    assert.throws(()=>obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:observed
    }],{
      mode,seed:'domparser-observer/'+mode,
      identifiers:false,strings:false,properties:false,
      experimentalWasmI32:{'entry.cjs':['inspect']}
    }),/Wasm|declined|source/i);
  });
  test(mode+' retains selected Wasm for primitive DOMParser arguments',()=>{
    const source=base+
      'module.exports=[inspect(7),new DOMParser().parseFromString("literal","text/html").body.textContent];';
    const output=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'domparser-primitive/'+mode,
      identifiers:false,strings:false,properties:false,
      experimentalWasmI32:{'entry.cjs':['inspect']}
    });
    assert.match(output.files[0].code,/WebAssembly/,
      'Primitive DOMParser input must not veto unrelated Wasm');
    assert.equal(JSON.stringify(observe(output.files[0].code)),
      JSON.stringify(observe(source)));
  });
}
