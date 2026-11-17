'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @returns {Promise<void>} */
async function main() {
  const observedSource=[
    'export async function sample(){',
    'function inspect(){const state={secretField:29};return state.secretField;}',
    'const response=await new Response(inspect).text();',
    'const file=await new File([inspect],"doc.txt").text();',
    'const event=new Event(inspect).type;',
    'let redirect;try{redirect=Response.redirect(inspect).url;}',
    'catch(error){redirect=String(error.message);}',
    'return {response,file,event,redirect,value:inspect()};',
    '}'
  ].join('\n');
  const primitiveSource=[
    'export async function sample(){',
    'const state={secretField:37};',
    'const response=await new Response("ready").text();',
    'const event=new Event("fixed").type;',
    'return {response,event,value:state.secretField};',
    '}'
  ].join('\n');
  const transform=(/** @type {string} */ code,/** @type {string} */ seed)=>
    obfuscateFiles([{path:'case.mjs',sourceType:'module',code}],{
      mode:'coo',seed,properties:true,identifiers:true,strings:true
    }).files[0];
  const guarded=transform(observedSource,'web-idl-browser-guarded');
  const positive=transform(primitiveSource,'web-idl-browser-positive');
  assert.equal(guarded.metrics.properties,0);
  assert.equal(guarded.metrics.bindings,0);
  assert.equal(guarded.metrics.literals,0);
  assert.equal(positive.metrics.properties,1,'Browser positive control must rename a real key');
  assert.ok(!String(positive.code).includes('secretField'));
  const html=[
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<pre id="result">pending</pre><script type="module">',
    'try {',
    'const [native,guarded,ordinary,positive]=await Promise.all([',
    'import("/observed-native.mjs"),import("/observed-compiled.mjs"),',
    'import("/primitive-native.mjs"),import("/primitive-compiled.mjs")]);',
    'const [a,b,c,d]=await Promise.all([',
    'native.sample(),guarded.sample(),ordinary.sample(),positive.sample()]);',
    'if(JSON.stringify(a)!==JSON.stringify(b)||JSON.stringify(c)!==JSON.stringify(d))',
    'throw Error("Web IDL emitted/native mismatch "+JSON.stringify({a,b,c,d}));',
    'if(!a.response.includes("secretField")||!a.file.includes("secretField")||',
    '!a.event.includes("secretField"))throw Error("Native source witness absent");',
    'document.getElementById("result").textContent="PASS Web IDL native/emitted";',
    '} catch(error) {',
    'document.getElementById("result").textContent="FAIL "+String(error.stack||error);',
    '}',
    '</script></body></html>'
  ].join('\n');
  const bodies=new Map([
    ['/',html],
    ['/observed-native.mjs',observedSource],
    ['/observed-compiled.mjs',String(guarded.code)],
    ['/primitive-native.mjs',primitiveSource],
    ['/primitive-compiled.mjs',String(positive.code)]
  ]);
  const server=http.createServer((request,response)=>{
    const body=bodies.get(request.url??'');
    if(body===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':request.url==='/'?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected local TCP server');
    const url='http://127.0.0.1:'+address.port+'/';
    const chrome=process.env.CHROMIUM_BIN??'chromium';
    const args=['--headless','--no-sandbox','--disable-gpu',
      '--disable-dev-shm-usage','--no-first-run',
      '--virtual-time-budget=4000','--dump-dom',url];
    const {stdout,stderr}=await promisify(execFile)(chrome,args,{
      timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'
    });
    assert.match(stdout,/PASS Web IDL native\/emitted/,String(stderr));
    assert.doesNotMatch(stdout,/FAIL /);
    console.log(JSON.stringify({browser:'Chromium',
      sourceObservedCases:4,primitiveRenamedKeys:positive.metrics.properties,
      nativeEmittedDifferential:'PASS'}));
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
