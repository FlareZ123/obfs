'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src');

const base='function f(x){return x^17;}';
const observed=base+'module.exports=CSS.escape(f);';

/**
 * CSS.escape accepts a DOMString, so a function input is converted through
 * Function#toString. Node has no global CSS object; the isolated host mock
 * deliberately models only the DOMString conversion (not CSS escaping).
 * Its exact native-vs-emitted source discrepancy is the relevant property.
 * @param {string} source
 * @returns {unknown}
 */
function observe(source){
  const module={exports:null};
  const context={module,WebAssembly,Uint8Array,Buffer,
    CSS:{/** @param {unknown} value */ escape(value){return String(value);}}};
  vm.runInNewContext(source,context,{timeout:4000});
  return module.exports;
}

test('CSS.escape DOMString argument captures an exact native function source',()=>{
  assert.equal(observe(observed),'function f(x){return x^17;}');
  const lowered=lowerWasmI32Functions(base,'commonjs',{
    seed:'css-escape-source-positive',names:['f']
  });
  assert.equal(lowered.functions,1,'positive must really alter the function');
  assert.notEqual(observe(lowered.code+'module.exports=CSS.escape(f);'),observe(observed));
});

test('CSS.escape selected Wasm function must be rejected before source rewrite',()=>{
  const lowered=lowerWasmI32Functions(observed,'commonjs',{
    seed:'css-escape-source-negative',names:['f']
  });
  assert.equal(lowered.functions,0,'CSS.escape(f) observes Function#toString');
  assert.equal(lowered.declined,1);
  assert.equal(lowered.code,observed);
});

test('three-mode compiler must not silently emit source-changing selected Wasm',()=>{
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    assert.throws(()=>obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:observed
    }],{
      mode,seed:'css-escape-mode-'+mode,strings:false,identifiers:false,properties:false,
      experimentalWasmI32:{'entry.cjs':['f']}
    }),/Wasm|declined|source/i,'mode '+mode+' must not obfuscate an observable function');
  }
});

/** @type {Array<[string,string]>} */
const aliases=[
  ['direct','module.exports=CSS.escape(f);'],
  ['computed','module.exports=CSS["escape"](f);'],
  ['global','module.exports=globalThis.CSS.escape(f);'],
  ['namespace-alias','const styles=CSS;module.exports=styles.escape(f);'],
  ['global-namespace-alias','const {CSS:styles}=globalThis;module.exports=styles.escape(f);'],
  ['method-alias','const esc=CSS.escape;module.exports=esc(f);'],
  ['destructured','const {escape:esc}=CSS;module.exports=esc(f);'],
  ['nested-destructured','const {escape:esc}=globalThis.CSS;module.exports=esc(f);'],
  ['bound','const esc=CSS.escape.bind(CSS);module.exports=esc(f);'],
  ['inline-bound','module.exports=CSS.escape.bind(CSS)(f);'],
  ['reflect-inline-bound','module.exports=Reflect.apply(CSS.escape.bind(CSS),CSS,[f]);'],
  ['call','module.exports=CSS.escape.call(CSS,f);'],
  ['apply','module.exports=CSS.escape.apply(CSS,[f]);'],
  ['reflect-apply','module.exports=Reflect.apply(CSS.escape,CSS,[f]);']
];

for(const [name,consumer] of aliases){
  test('CSS.escape source coercion guard: '+name,()=>{
    const source=base+consumer;
    assert.equal(observe(source),observe(observed),
      'The source observer must receive the same native function');
    const lowered=lowerWasmI32Functions(source,'commonjs',{
      seed:'css-escape-alias/'+name,names:['f']
    });
    assert.equal(lowered.functions,0,
      'A source-observing '+name+' invocation must refuse Wasm');
    assert.equal(lowered.declined,1);
    assert.equal(lowered.code,source);
  });
}

for(const mode of /** @type {const} */(['coo','sco','sno'])){
  test(mode+' retains nonvacuous Wasm lowering when CSS.escape sees a primitive',()=>{
    const source=base+'module.exports=[f(7),CSS.escape("ordinary-value")];';
    const emitted=obfuscateFiles([{
      path:'entry.cjs',sourceType:'commonjs',code:source
    }],{
      mode,seed:'css-escape-primitive-control/'+mode,
      strings:false,identifiers:false,properties:false,
      experimentalWasmI32:{'entry.cjs':['f']}
    });
    assert.match(emitted.files[0].code,/WebAssembly/,
      'CSS.escape(primitive) must not force a vacuous unchanged selection');
    assert.equal(JSON.stringify(observe(emitted.files[0].code)),
      JSON.stringify(observe(source)));
  });
}
