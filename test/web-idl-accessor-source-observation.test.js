'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Execute the same native Web collection behavior with fresh global constructors.
 * The return value is normalized into the host realm.
 * @param {string} source
 * @returns {{observed:string,value:number}}
 */
function execute(source){
  const module={exports:null};
  vm.runInNewContext(source,{module,Request,Response,URL},{timeout:3000});
  assert.ok(module.exports);
  /** @type {{observed:string,value:number}} */
  const result=module.exports;
  return {observed:result.observed,value:result.value};
}

const functionSource='function inspect(){const state={secretField:19};return state.secretField;}';

/** @type {Array<[string,string]>} */
const sourceCases=[
  ['Request.headers direct','(()=>{const request=new Request("https://example.test/");request.headers.append("x-observed",inspect);return request.headers.get("x-observed");})()'],
  ['Response.headers direct','(()=>{const response=new Response("plain");response.headers.set("x-observed",inspect);return response.headers.get("x-observed");})()'],
  ['URL.searchParams direct','(()=>{const url=new URL("https://example.test/");url.searchParams.append("x",inspect);return url.searchParams.get("x");})()'],
  ['Request.headers constructor inline','(()=>{const headers=new Request("https://example.test/").headers;headers.append("x-observed",inspect);return headers.get("x-observed");})()'],
  ['Response.headers constructor inline','(()=>{const headers=new Response("plain").headers;headers.append("x-observed",inspect);return headers.get("x-observed");})()'],
  ['URL.searchParams constructor inline','(()=>{const params=new URL("https://example.test/").searchParams;params.set("x",inspect);return params.get("x");})()'],
  ['Request.headers instance alias','(()=>{const request=new Request("https://example.test/");const alias=request;alias.headers.append("x-observed",inspect);return request.headers.get("x-observed");})()'],
  ['Response.headers instance alias','(()=>{const response=new Response("plain");const alias=response;alias.headers.append("x-observed",inspect);return response.headers.get("x-observed");})()'],
  ['URL.searchParams instance alias','(()=>{const url=new URL("https://example.test/");const alias=url;alias.searchParams.append("x",inspect);return url.searchParams.get("x");})()'],
  ['Request.headers collected alias','(()=>{const request=new Request("https://example.test/");const headers=request.headers;headers.append("x-observed",inspect);return headers.get("x-observed");})()'],
  ['Response.headers collected alias','(()=>{const response=new Response("plain");const headers=response.headers;headers.append("x-observed",inspect);return headers.get("x-observed");})()'],
  ['URL.searchParams collected alias','(()=>{const url=new URL("https://example.test/");const params=url.searchParams;params.set("x",inspect);return params.get("x");})()'],
  ['Request.headers destructuring','(()=>{const request=new Request("https://example.test/");const {headers}=request;headers.append("x-observed",inspect);return headers.get("x-observed");})()'],
  ['Response.headers destructuring','(()=>{const response=new Response("plain");const {headers}=response;headers.set("x-observed",inspect);return headers.get("x-observed");})()'],
  ['URL.searchParams destructuring','(()=>{const url=new URL("https://example.test/");const {searchParams}=url;searchParams.append("x",inspect);return searchParams.get("x");})()'],
  ['Request.headers assignment destructuring','(()=>{const request=new Request("https://example.test/");let headers;({headers}=request);headers.append("x-observed",inspect);return headers.get("x-observed");})()'],
  ['URL.searchParams assignment destructuring','(()=>{const url=new URL("https://example.test/");let params;({searchParams:params}=url);params.append("x",inspect);return params.get("x");})()'],
  ['Request.headers global ctor alias','(()=>{const {Request:R}=globalThis;const request=new R("https://example.test/");request.headers.append("x-observed",inspect);return request.headers.get("x-observed");})()'],
  ['URL.searchParams global ctor alias','(()=>{const U=globalThis.URL;const url=new U("https://example.test/");url.searchParams.append("x",inspect);return url.searchParams.get("x");})()'],
  ['Request.headers computed property','(()=>{const request=new Request("https://example.test/");const key="headers";request[key].append("x-observed",inspect);return request.headers.get("x-observed");})()'],
  ['URL.searchParams computed property','(()=>{const url=new URL("https://example.test/");const key="searchParams";url[key].append("x",inspect);return url.searchParams.get("x");})()']
];

for(const [name,expression] of sourceCases) {
  test('native collection accessor function-source observation: '+name,()=>{
    const source=functionSource+'const state={secretField:37};'+
      'module.exports={observed:'+expression+',value:state.secretField};';
    const native=execute(source);
    assert.ok(native.observed.includes('secretField'),'Native witness '+name);
    assert.equal(observesFunctionSource(parse(source,'commonjs')),true,
      name+' requires explicit Web collection proof');
    for(const mode of /** @type {const} */ (['sno','coo','sco'])) {
      const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],{
        mode,seed:'accessor-source/'+name+'/'+mode,strings:true
      }).files[0];
      assert.deepEqual(execute(/** @type {string} */(result.code)),native,
        mode+'/'+name);
      assert.equal(result.metrics.properties,0,mode+'/'+name);
      assert.equal(result.metrics.bindings,0,mode+'/'+name);
      assert.equal(result.metrics.literals,0,mode+'/'+name);
    }
  });
}

/** @type {Array<[string,string]>} */
const primitiveCases=[
  ['Request.headers literal','(()=>{const request=new Request("https://example.test/");request.headers.append("x-observed","fixed");return request.headers.get("x-observed");})()'],
  ['Response.headers literal','(()=>{const response=new Response("plain");response.headers.set("x-observed","fixed");return response.headers.get("x-observed");})()'],
  ['URL.searchParams literal','(()=>{const url=new URL("https://example.test/");url.searchParams.append("x","fixed");return url.searchParams.get("x");})()'],
  ['Request.headers alias literal','(()=>{const request=new Request("https://example.test/");const headers=request.headers;headers.append("x-observed","fixed");return headers.get("x-observed");})()'],
  ['URL.searchParams alias literal','(()=>{const url=new URL("https://example.test/");const params=url.searchParams;params.append("x","fixed");return params.get("x");})()']
];

for(const [name,expression] of primitiveCases) {
  test('native collection accessor primitive input preserves key coverage: '+name,()=>{
    const source='const state={secretField:37};'+
      'module.exports={observed:'+expression+',value:state.secretField};';
    assert.equal(observesFunctionSource(parse(source,'commonjs')),false,name);
    const native=execute(source);
    const result=obfuscateFiles([{path:'case.cjs',sourceType:'commonjs',code:source}],{
      mode:'sno',seed:'accessor-primitive/'+name,strings:false
    }).files[0];
    assert.deepEqual(execute(/** @type {string} */(result.code)),native,name);
    assert.ok(result.metrics.properties>=1,'Unrelated private field remains eligible: '+name);
    assert.ok(!String(result.code).includes('secretField'),name);
  });
}
