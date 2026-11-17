'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {lowerWasmI32Functions}=require('../src/wasm-i32');
const {obfuscateFiles}=require('../src');

const original='function f(a){return a^17;}';
const reduced=lowerWasmI32Functions(original,'commonjs',{
  seed:'web-idl-source-counterfactual',names:['f']
});
assert.equal(reduced.functions,1,'Counterfactual requires actual Wasm lowering');
assert.equal(reduced.declined,0);

/**
 * Run native Web API observation against actual emitted or original code.
 * @param {string} code
 * @param {string} expression
 * @returns {Promise<string>}
 */
async function observe(code,expression) {
  /** @type {{exports:Promise<unknown>|null}} */
  const module={exports:null};
  vm.runInNewContext(code+'module.exports=Promise.resolve('+expression+');',{
    module,Response,Request,File,Headers,URL,URLSearchParams,Event,CustomEvent,MessageEvent,
    BroadcastChannel,TextDecoder,TextDecoderStream,
    CompressionStream,DecompressionStream
  },{timeout:3000});
  assert.ok(module.exports);
  return String(await module.exports);
}

/** @type {Array<[string,string]>} */
const cases=[
  ['Response body','new Response(f).text()'],
  ['File BlobPart','new File([f],"doc.txt").text()'],
  ['Request parse error','(()=>{try{return new Request(f).url;}catch(error){return error.message;}})()'],
  ['Response redirect parse error','(()=>{try{return Response.redirect(f).url;}catch(error){return error.message;}})()'],
  ['Request.headers append','(()=>{const request=new Request("https://example.test/");request.headers.append("x-observed",f);return request.headers.get("x-observed");})()'],
  ['Response.headers append','(()=>{const response=new Response("fixed");response.headers.append("x-observed",f);return response.headers.get("x-observed");})()'],
  ['URL.searchParams append','(()=>{const url=new URL("https://example.test/");url.searchParams.append("q",f);return url.searchParams.get("q");})()'],
  ['Headers append','(()=>{const h=new Headers();h.append("x-observed",f);return h.get("x-observed");})()'],
  ['URLSearchParams append','(()=>{const p=new URLSearchParams();p.append("q",f);return p.get("q");})()'],
  ['Event type','new Event(f).type'],
  ['CustomEvent type','new CustomEvent(f).type'],
  ['MessageEvent type','new MessageEvent(f).type'],
  ['BroadcastChannel name','(()=>{const b=new BroadcastChannel(f);const name=b.name;b.close();return name;})()'],
  ['TextDecoder encoding error','(()=>{try{return new TextDecoder(f).encoding;}catch(error){return error.message;}})()'],
  ['TextDecoderStream encoding error','(()=>{try{return new TextDecoderStream(f).encoding;}catch(error){return error.message;}})()'],
  ['CompressionStream format error','(()=>{try{return new CompressionStream(f).constructor.name;}catch(error){return error.message;}})()'],
  ['DecompressionStream format error','(()=>{try{return new DecompressionStream(f).constructor.name;}catch(error){return error.message;}})()']
];

for(const [name,expression] of cases) {
  test('actually emitted Wasm source changes native Web IDL observation: '+name,async()=>{
    const native=await observe(original,expression);
    const altered=await observe(reduced.code,expression);
    assert.ok(native.includes('a^17'),name+' native witness must expose original source');
    assert.notEqual(altered,native,
      name+' counterfactual requires an actual observable behavior change');
  });
}

test('top-level guarded transformation prevents selected Wasm output in the same source',()=>{
  const source=original+
    'module.exports=new Response(f).text();';
  assert.throws(()=>obfuscateFiles([{
    path:'entry.cjs',sourceType:'commonjs',code:source
  }],{
    mode:'sno',seed:'guarded-web-idl-wasm',strings:false,
    experimentalWasmI32:{'entry.cjs':['f']}
  }),/Wasm i32 requires|declined/i);
});
