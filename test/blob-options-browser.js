'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

/** @returns {Promise<void>} */
async function main() {
  const observedSource=[
    'export function sample(){',
    'function protectedLabel(x){return ((x^173)&255);}',
    'const type=new Blob([],{type:protectedLabel}).type;',
    'let endings;',
    'try{new Blob([],{endings:protectedLabel});endings="unexpected";}',
    'catch(error){endings=error.message;}',
    'return {type,endings,value:protectedLabel(7)};',
    '}'
  ].join('\n');
  const primitiveSource=[
    'const owner={secretField:37};',
    'const value=owner.secretField;',
    'export function sample(){',
    'return {type:new Blob([],{type:"text/plain",endings:"transparent"}).type,value};',
    '}'
  ].join('\n');
  /** @param {string} code @param {string} seed */
  const compile=(code,seed)=>obfuscateFiles([{
    path:'blob-case.mjs',sourceType:'module',code
  }],{mode:'coo',seed,identifiers:true,properties:true,strings:true}).files[0];
  const guarded=compile(observedSource,'blob-options-browser-guarded');
  const positive=compile(primitiveSource,'blob-options-browser-positive');
  assert.equal(guarded.metrics.properties,0,
    'Function-source observer must veto private-key changes');
  assert.equal(guarded.metrics.bindings,0,
    'Function-source observer must preserve function binding spelling');
  assert.equal(positive.metrics.properties,1,
    'Primitive Blob options must still permit a real property rename');
  assert.doesNotMatch(String(positive.code),/secretField/u);
  const html=[
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<pre id="result">pending</pre><script type="module">',
    'try {',
    'const [native,guarded,primitive,positive]=await Promise.all([',
    'import("/blob-native.mjs"),import("/blob-compiled.mjs"),',
    'import("/primitive-native.mjs"),import("/primitive-compiled.mjs")]);',
    'const [a,b,c,d]=[native.sample(),guarded.sample(),primitive.sample(),positive.sample()];',
    'if(JSON.stringify(a)!==JSON.stringify(b)||JSON.stringify(c)!==JSON.stringify(d))',
    'throw Error("Blob native/emitted mismatch "+JSON.stringify({a,b,c,d}));',
    'if(!a.type.includes("protectedlabel")||a.endings==="unexpected")',
    'throw Error("Blob native-source witness missing "+JSON.stringify(a));',
    'document.getElementById("result").textContent="PASS Blob options native/emitted";',
    '} catch(error) {',
    'document.getElementById("result").textContent="FAIL "+String(error.stack||error);',
    '}',
    '</script></body></html>'
  ].join('\n');
  const bodies=new Map([
    ['/',html],
    ['/blob-native.mjs',observedSource],
    ['/blob-compiled.mjs',String(guarded.code)],
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
    assert.match(stdout,/<pre id="result">PASS Blob options native\/emitted<\/pre>/u,
      String(stderr));
    console.log(JSON.stringify({browser:'Chromium',observerPaths:2,
      nativeEmittedDifferential:'PASS',primitiveRenamedKeys:positive.metrics.properties}));
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
