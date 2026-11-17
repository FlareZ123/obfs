'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Execute native Web APIs inside a real Node VM and observe their resolved
 * function-source strings or object payloads.
 * @param {string} source
 * @returns {Promise<{result:string,value:number}>}
 */
async function run(source) {
  /** @type {{exports:Promise<{result:string,value:number}>|null}} */
  const module={exports:null};
  vm.runInNewContext(source,{module,Response,File,Request},{timeout:3000});
  assert.ok(module.exports);
  return await module.exports;
}

const inspect='function inspect(){const state={secretField:19};return state.secretField;}';

/** @type {Array<[string,string]>} */
const sourceCases=[
  ['record property direct','(()=>{const box={Constructor:Response};return new box.Constructor(inspect).text();})()'],
  ['record property alias','(()=>{const box={Constructor:Response};const other=box;return new other.Constructor(inspect).text();})()'],
  ['record property reassignment','(()=>{const box={};box.Constructor=Response;return new box.Constructor(inspect).text();})()'],
  ['record alias mutation','(()=>{const box={};const alias=box;alias.Constructor=Response;return new box.Constructor(inspect).text();})()'],
  ['global alias property write','(()=>{const root=globalThis;root.__webIdlCtor=Response;try{return new root.__webIdlCtor(inspect).text();}finally{delete root.__webIdlCtor;}})()'],
  ['record destructuring','(()=>{const box={Constructor:Response};const {Constructor:Reply}=box;return new Reply(inspect).text();})()'],
  ['record property detached','(()=>{const box={Constructor:Response};const Reply=box.Constructor;return new Reply(inspect).text();})()'],
  ['record computed constructor key','(()=>{const box={Constructor:Response};const key="Constructor";return new box[key](inspect).text();})()'],
  ['record indirect constructor','(()=>{const box={Constructor:Response};const wrapped={Another:box.Constructor};return new wrapped.Another(inspect).text();})()'],
  ['redirect method record','(()=>{const methods={go:Response.redirect};try{return methods.go(inspect).url;}catch(error){return error.message;}})()'],
  ['redirect method alias record','(()=>{const methods={go:Response.redirect};const alias=methods;try{return alias.go(inspect).url;}catch(error){return error.message;}})()'],
  ['redirect method destructured','(()=>{const methods={go:Response.redirect};const {go:method}=methods;try{return method(inspect).url;}catch(error){return error.message;}})()'],
  ['redirect method reassigned','(()=>{const methods={};methods.go=Response.redirect;try{return methods.go(inspect).url;}catch(error){return error.message;}})()'],
  ['redirect computed method key','(()=>{const methods={go:Response.redirect};const key="go";try{return methods[key](inspect).url;}catch(error){return error.message;}})()']
];

for(const [name,expression] of sourceCases) {
  test('Web constructor/method local record preserves source semantics: '+name,async()=>{
    const original=inspect+'const state={secretField:37};'+
      'module.exports=Promise.resolve('+expression+').then(result=>({result,value:state.secretField}));';
    const native=await run(original);
    assert.ok(native.result.includes('secretField'),name+' must expose original source');
    assert.equal(observesFunctionSource(parse(original,'commonjs')),true,
      name+' requires a recorded native-source observer');
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
        mode,seed:'web-idl-record/'+name+'/'+mode,strings:true
      }).files[0];
      assert.deepEqual(await run(/** @type {string} */(result.code)),native,name+'/'+mode);
      assert.equal(result.metrics.properties,0,name+'/'+mode);
      assert.equal(result.metrics.bindings,0,name+'/'+mode);
      assert.equal(result.metrics.literals,0,name+'/'+mode);
    }
  });
}

/** @type {Array<[string,string]>} */
const primitiveCases=[
  ['record constructor','(()=>{const box={Constructor:Response};return new box.Constructor("fixed").text();})()'],
  ['record property alias','(()=>{const box={Constructor:Response};const other=box;return new other.Constructor("fixed").text();})()'],
  ['record redirect','(()=>{const methods={go:Response.redirect};return methods.go("https://example.test/").url;})()'],
  ['record redirect alias','(()=>{const methods={go:Response.redirect};const alias=methods;return alias.go("https://example.test/").url;})()']
];

for(const [name,expression] of primitiveCases) {
  test('recorded Web API primitive inputs leave unrelated keys eligible: '+name,async()=>{
    const original='const state={secretField:37};'+
      'module.exports=Promise.resolve('+expression+').then(result=>({result,value:state.secretField}));';
    assert.equal(observesFunctionSource(parse(original,'commonjs')),false,name);
    const native=await run(original);
    const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:original}],{
      mode:'sno',seed:'web-idl-record-primitive/'+name,strings:false
    }).files[0];
    assert.deepEqual(await run(/** @type {string} */(result.code)),native);
    assert.ok(result.metrics.properties>=1,'Unrelated local private field should be renamed');
    assert.ok(!String(result.code).includes('secretField'));
  });
}
