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
  vm.runInNewContext(source,{module,Request,Response,File,Event,CustomEvent,
    MessageEvent,BroadcastChannel,TextDecoder,TextDecoderStream,
    CompressionStream,DecompressionStream},{timeout:3000});
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
  ['Response redirect URL error','(()=>{try{return Response.redirect(inspect).url;}catch(error){return error.message;}})()'],
  ['Response redirect constructor alias','(()=>{const R=Response;try{return R.redirect(inspect).url;}catch(error){return error.message;}})()'],
  ['Response redirect method alias','(()=>{const redirect=Response.redirect;try{return redirect(inspect).url;}catch(error){return error.message;}})()'],
  ['Response redirect destructured method','(()=>{const {redirect}=Response;try{return redirect(inspect).url;}catch(error){return error.message;}})()'],
  ['Response redirect Function.call','(()=>{try{return Response.redirect.call(Response,inspect).url;}catch(error){return error.message;}})()'],
  ['Response redirect Function.apply','(()=>{try{return Response.redirect.apply(Response,[inspect]).url;}catch(error){return error.message;}})()'],
  ['Response redirect bound alias','(()=>{const redirect=Response.redirect.bind(Response);try{return redirect(inspect).url;}catch(error){return error.message;}})()'],
  ['Response redirect Reflect.apply','(()=>{try{return Reflect.apply(Response.redirect,Response,[inspect]).url;}catch(error){return error.message;}})()'],
  ['Request URL error','(()=>{try{return new Request(inspect).url;}catch(error){return error.message;}})()'],
  ['Request alias URL error','(()=>{const FetchRequest=Request;try{return new FetchRequest(inspect).url;}catch(error){return error.message;}})()'],
  ['Request init header','new Request("https://example.test/",{headers:{"x-observed":inspect}}).headers.get("x-observed")'],
  ['Request init method error','(()=>{try{return new Request("https://example.test/",{method:inspect}).method;}catch(error){return error.message;}})()'],
  ['File BlobPart','new File([inspect],"doc.txt").text()'],
  ['File name','new File(["fixed"],inspect).name'],
  ['File global destructuring alias','(()=>{const {File:NamedFile}=globalThis;return new NamedFile([inspect],"doc.txt").text();})()'],
  ['Event type','new Event(inspect).type'],
  ['CustomEvent type','new CustomEvent(inspect).type'],
  ['MessageEvent type','new MessageEvent(inspect).type'],
  ['BroadcastChannel name','(()=>{const channel=new BroadcastChannel(inspect);const name=channel.name;channel.close();return name;})()'],
  ['TextDecoder encoding error','(()=>{try{return new TextDecoder(inspect).encoding;}catch(error){return error.message;}})()'],
  ['TextDecoderStream encoding error','(()=>{try{return new TextDecoderStream(inspect).encoding;}catch(error){return error.message;}})()'],
  ['CompressionStream enum error','(()=>{try{return new CompressionStream(inspect).constructor.name;}catch(error){return error.message;}})()'],
  ['DecompressionStream enum error','(()=>{try{return new DecompressionStream(inspect).constructor.name;}catch(error){return error.message;}})()']
];

for(const [name,expression] of sourceObservers) {
  test('Fetch and File constructors preserve function source: '+name,async()=>{
    const source=functionSource+'const state={secretField:37};'+
      'module.exports=Promise.resolve('+expression+').then(observed=>({observed,value:state.secretField}));';
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
  ['Response redirect primitive URL','Response.redirect("https://example.test/").url'],
  ['Response redirect primitive alias','(()=>{const redirect=Response.redirect;return redirect("https://example.test/").url;})()'],
  ['Request primitive URL','new Request("https://example.test/").url'],
  ['Request primitive options','new Request("https://example.test/",{headers:{"x-observed":"fixed"}}).headers.get("x-observed")'],
  ['File primitive parts','new File(["fixed"],"doc.txt").text()'],
  ['File primitive filename','new File(["fixed"],"doc.txt",{type:"text/plain"}).name'],
  ['Event primitive type','new Event("ready",{bubbles:true}).type'],
  ['CustomEvent primitive type','new CustomEvent("ready",{detail:37}).type'],
  ['MessageEvent primitive type','new MessageEvent("ready",{data:37}).type'],
  ['BroadcastChannel primitive name','(()=>{const channel=new BroadcastChannel("fixed");const name=channel.name;channel.close();return name;})()'],
  ['TextDecoder primitive encoding','new TextDecoder("utf-8").encoding'],
  ['TextDecoderStream primitive encoding','new TextDecoderStream("utf-8").encoding'],
  ['CompressionStream primitive format','new CompressionStream("gzip").constructor.name'],
  ['DecompressionStream primitive format','new DecompressionStream("gzip").constructor.name']
];

for(const [name,expression] of inertCases) {
  test('Fetch and File primitive inputs preserve private-key transformation: '+name,async()=>{
    const source='const state={secretField:37};'+
      'module.exports=Promise.resolve('+expression+').then(observed=>({observed,value:state.secretField}));';
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
