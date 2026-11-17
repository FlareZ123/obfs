'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Evaluate the same CommonJS source under Node's real Fetch/Blob constructors.
 * Returned promises are awaited after evaluation to capture body text.
 * @param {string} source
 * @returns {Promise<{observed:string,value:number}>}
 */
async function execute(source) {
  /** @type {{exports:Promise<{observed:string,value:number}>|null}} */
  const module={exports:null};
  vm.runInNewContext(source,{module,Request,Response,File},{timeout:3000});
  assert.ok(module.exports);
  const result=await module.exports;
  return {observed:result.observed,value:result.value};
}

const functionSource='function inspect(){const state={secretField:17};return state.secretField;}';

/** @type {Array<[string,string]>} */
const sourceObservers=[
  ['Response body','new Response(inspect).text()'],
  ['Response statusText','new Response("fixed",{statusText:inspect}).statusText'],
  ['Response header','new Response("fixed",{headers:{"x-observed":inspect}}).headers.get("x-observed")'],
  ['Request URL error','(()=>{try{return new Request(inspect).url;}catch(error){return error.message;}})()'],
  ['Request alias URL error','(()=>{const FetchRequest=Request;try{return new FetchRequest(inspect).url;}catch(error){return error.message;}})()'],
  ['Request init header','new Request("https://example.test/",{headers:{"x-observed":inspect}}).headers.get("x-observed")'],
  ['Request init method error','(()=>{try{return new Request("https://example.test/",{method:inspect}).method;}catch(error){return error.message;}})()'],
  ['File BlobPart','new File([inspect],"doc.txt").text()'],
  ['File name','new File(["fixed"],inspect).name'],
  ['File global destructuring alias','(()=>{const {File:NamedFile}=globalThis;return new NamedFile([inspect],"doc.txt").text();})()']
];

for(const [name,expression] of sourceObservers) {
  test('Fetch and File constructors preserve function source: '+name,async()=>{
    const source=functionSource+'const state={secretField:37};'+
      'module.exports=Promise.resolve('+expression+').then(observed=>({observed:String(observed),value:state.secretField}));';
    const native=await execute(source);
    assert.equal(native.value,37);
    assert.ok(native.observed.includes('secretField'),
      name+' must genuinely expose original function source');
    assert.equal(observesFunctionSource(parse(source,'commonjs')),true,
      name+' must be recognized as a native source observer');
    for(const mode of /** @type {const} */ (['coo','sno','sco'])) {
      const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
        mode,seed:'fetch-file-source/'+name+'/'+mode,strings:true
      }).files[0];
      assert.deepEqual(await execute(/** @type {string} */ (output.code)),native,
        mode+'/'+name+' must preserve original source bytes');
      assert.equal(output.metrics.properties,0,mode+'/'+name+' private property must not be renamed');
      assert.equal(output.metrics.bindings,0,mode+'/'+name+' identifiers must not be renamed');
      assert.equal(output.metrics.literals,0,mode+'/'+name+' source literals must not be rewritten');
    }
  });
}

/** @type {Array<[string,string]>} */
const inertCases=[
  ['Response primitive body','new Response("fixed").text()'],
  ['Response primitive options','new Response("fixed",{statusText:"OK",headers:{"x-observed":"fixed"}}).headers.get("x-observed")'],
  ['Request primitive URL','new Request("https://example.test/").url'],
  ['Request primitive options','new Request("https://example.test/",{headers:{"x-observed":"fixed"}}).headers.get("x-observed")'],
  ['File primitive parts','new File(["fixed"],"doc.txt").text()'],
  ['File primitive filename','new File(["fixed"],"doc.txt",{type:"text/plain"}).name']
];

for(const [name,expression] of inertCases) {
  test('Fetch and File primitive inputs preserve private-key transformation: '+name,async()=>{
    const source='const state={secretField:37};'+
      'module.exports=Promise.resolve('+expression+').then(observed=>({observed:String(observed),value:state.secretField}));';
    const native=await execute(source);
    assert.equal(observesFunctionSource(parse(source,'commonjs')),false,
      name+' is a fully proven inert input');
    const output=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
      mode:'sno',seed:'fetch-file-primitive/'+name,strings:false
    }).files[0];
    assert.deepEqual(await execute(/** @type {string} */ (output.code)),native);
    assert.equal(output.metrics.properties,1,name+' should still rename the private key');
  });
}
