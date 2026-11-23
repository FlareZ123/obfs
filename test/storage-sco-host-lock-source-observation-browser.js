'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const execFileAsync=promisify(execFile);

const source=[
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(prefix){',
  '  const key=prefix+"-source";',
  '  localStorage.setItem(key,inspect);',
  '  return {key,value:inspect(),independent:independent()}',
  '}'
].join('\n');

async function main() {
  const result=obfuscateFiles([{
    path:'compiled.mjs',
    sourceType:'module',
    code:source
  }],{
    mode:'sco',
    allowedHosts:['127.0.0.1'],
    seed:'storage-sco-host-lock-source-observation',
    properties:false,
    identifiers:true,
    strings:false
  });
  const compiled=String(result.files[0].code);
  assert.ok(result.files[0].metrics.bindings>=2);
  assert.ok(compiled.includes('127.0.0.1'));
  assert.ok(!compiled.includes('privateLocal'));
  assert.ok(!compiled.includes('independentLocal'));

  const html=[
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<pre id="result">pending</pre>',
    '<script type="module">',
    'import {sample as nativeSample} from "./native.mjs";',
    'import {sample as compiledSample} from "./compiled.mjs";',
    'try {',
    '  localStorage.clear();',
    '  const native=nativeSample("native-storage-sco");',
    '  const emitted=compiledSample("compiled-storage-sco");',
    '  const result={',
    '    hostname:location.hostname,',
    '    nativeSource:localStorage.getItem(native.key),',
    '    compiledSource:localStorage.getItem(emitted.key),',
    '    sourceMismatch:localStorage.getItem(native.key)!==localStorage.getItem(emitted.key),',
    '    nativeValue:native.value,',
    '    compiledValue:emitted.value,',
    '    nativeIndependent:native.independent,',
    '    compiledIndependent:emitted.independent',
    '  };',
    '  document.getElementById("result").textContent="PASS "+JSON.stringify(result);',
    '} catch(error) {',
    '  document.getElementById("result").textContent="FAIL "+String(error&&error.stack||error);',
    '}',
    '</script>'
  ].join('\n');
  const files=new Map([
    ['/index.html',html],
    ['/native.mjs',source],
    ['/compiled.mjs',compiled]
  ]);
  const server=http.createServer((request,response)=>{
    const body=files.get(request.url??'');
    if(body===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':request.url?.endsWith('.mjs')?
      'text/javascript; charset=utf-8':'text/html; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Expected local TCP server');
    const chrome=process.env.CHROMIUM_BIN??'chromium';
    const {stdout,stderr}=await execFileAsync(chrome,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=5000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/index.html'
    ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
    assert.match(stdout,/<pre id="result">PASS /,String(stderr));
    const match=stdout.match(/<pre id="result">PASS ([\s\S]*?)<\/pre>/);
    assert.ok(match,'Expected rendered SCO host-lock result');
    const browser=JSON.parse(match[1]);
    assert.equal(browser.hostname,'127.0.0.1',JSON.stringify(browser));
    assert.equal(browser.sourceMismatch,true,JSON.stringify(browser));
    assert.ok(browser.nativeSource.includes('privateLocal'),JSON.stringify(browser));
    assert.ok(!browser.compiledSource.includes('privateLocal'),JSON.stringify(browser));
    assert.equal(browser.nativeValue,29,JSON.stringify(browser));
    assert.equal(browser.compiledValue,29,JSON.stringify(browser));
    assert.equal(browser.nativeIndependent,7,JSON.stringify(browser));
    assert.equal(browser.compiledIndependent,7,JSON.stringify(browser));
    console.log(JSON.stringify({
      mode:'sco',
      allowedHosts:['127.0.0.1'],
      bindings:result.files[0].metrics.bindings,
      browser
    }));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
