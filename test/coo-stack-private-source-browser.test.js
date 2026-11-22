'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {transformSync}=require('esbuild');

const runBrowser=promisify(execFile);

/** @type {import('../src/core').SourceFile[]} */
const FILES=[{
  path:'client.js',
  sourceType:'script',
  code:'let observedResult;{const privateHelper=(secretLocal)=>secretLocal+Math.random();'+
    'observedResult=privateHelper(17);}'
}];

/** @param {string} sourcePath @returns {string} */
function page(sourcePath) {
  return [
    '<!doctype html><html><body><pre id="result"></pre>',
    '<script>',
    'Error.prepareStackTrace=(error,frames)=>{',
    'const frame=frames.find(item=>{',
    'const fn=item.getFunction();',
    'return typeof fn==="function"&&String(fn).includes("Math.random");',
    '});',
    'return frame&&typeof frame.getFunction()==="function"?',
    'String(frame.getFunction()):"unavailable";',
    '};',
    'Math.random=()=>{window.capturedHelper=new Error().stack;',
    'return Number(window.capturedHelper.includes("secretLocal"));};',
    '</script>',
    '<script src="'+sourcePath+'"></script>',
    '<script>',
    'try{',
    'const result={value:observedResult,helperSource:window.capturedHelper};',
    'document.getElementById("result").textContent=btoa(JSON.stringify(result));',
    '}catch(error){document.getElementById("result").textContent="ERROR:"+String(error.stack||error);}',
    '</script></body></html>'
  ].join('\n');
}

/**
 * Demonstrate host-owned V8 stack instrumentation reading a live unexported
 * classic-script function. This is an intentional source-sensitive host
 * control, not an ordinary unmodified browser compatibility workload.
 * @returns {Promise<void>}
 */
async function main() {
  const output=obfuscateFiles(FILES,{
    mode:'coo',seed:'coo-stack-host-source-observer-20261122',
    identifiers:true,strings:false,properties:false
  });
  const original=String(FILES[0].code);
  const changed=String(output.files[0].code);
  const minified=transformSync(original,{
    loader:'js',target:'es2022',minifyIdentifiers:true,
    minifyWhitespace:true,minifySyntax:false
  }).code;
  assert.doesNotMatch(minified,/\bsecretLocal\b/u);
  const strictOriginal='"use strict";'+original;
  const strictOutput=obfuscateFiles([{
    path:'client.js',sourceType:'script',code:strictOriginal
  }],{
    mode:'coo',seed:'coo-stack-host-strict-control-20261122',
    identifiers:true,strings:false,properties:false
  });
  const strictChanged=String(strictOutput.files[0].code);
  assert.ok(output.files[0].metrics.bindings>0,'The helper parameter must be transformed');
  assert.doesNotMatch(changed,/\bsecretLocal\b/u);
  const server=http.createServer((request,response)=>{
    const route=request.url??'/';
    const sourceRoutes=new Map([
      ['/native/source.js',original],['/emitted/source.js',changed],
      ['/minified/source.js',minified],
      ['/strict-native/source.js',strictOriginal],
      ['/strict-emitted/source.js',strictChanged]
    ]);
    const source=sourceRoutes.get(route);
    if(source!==undefined) {
      response.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});
      response.end(source);
      return;
    }
    if(['native','emitted','minified','strict-native','strict-emitted'].some(
      prefix=>route==='/'+prefix+'/index.html')) {
      response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      response.end(page(route.replace('/index.html','/source.js')));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const addr=server.address();
    assert.ok(addr&&typeof addr!=='string');
    const origin='http://127.0.0.1:'+addr.port;
    /** @param {'native'|'emitted'|'minified'|'strict-native'|'strict-emitted'} variant */
    async function run(variant) {
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=3000','--dump-dom',
        origin+'/'+variant+'/index.html'
      ],{encoding:'utf8',timeout:45000,maxBuffer:6*1024*1024});
      const textResult=/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u.exec(stdout)?.[1];
      assert.ok(textResult,'Chromium returned no result for '+variant+': '+stdout.slice(-1200));
      return /** @type {{value:number,helperSource:string}} */ (
        JSON.parse(Buffer.from(textResult,'base64').toString('utf8')));
    }
    const native=await run('native');
    const emitted=await run('emitted');
    const minifierControl=await run('minified');
    assert.equal(native.value,18);
    assert.equal(emitted.value,17);
    assert.equal(minifierControl.value,17);
    assert.doesNotMatch(minifierControl.helperSource,/\bsecretLocal\b/u);
    assert.match(native.helperSource,/\bsecretLocal\b/u);
    assert.doesNotMatch(emitted.helperSource,/\bsecretLocal\b/u);
    const strictNative=await run('strict-native');
    const strictEmitted=await run('strict-emitted');
    assert.equal(strictNative.value,17);
    assert.equal(strictEmitted.value,17);
    assert.equal(strictNative.helperSource,'unavailable');
    assert.equal(strictEmitted.helperSource,'unavailable');
    process.stdout.write('CHROMIUM_STACK_HOST_SOURCE_BOUNDARY '+
      JSON.stringify({nativeValue:native.value,emittedValue:emitted.value,
        nativeSourceCaptured:true,emittedSourceCaptured:true,
        renamedBindings:output.files[0].metrics.bindings,
        strictNativeValue:strictNative.value,strictEmittedValue:strictEmitted.value,
        strictSourceUnavailable:true,
        minifierValue:minifierControl.value,
        minifierSourceCaptured:minifierControl.helperSource!=='unavailable'})+'\n');
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}

test('Chromium host stack formatter can observe source of an unexported COO helper',{
  skip:process.platform==='win32'?'Chromium runner is configured on Ubuntu':false
},main);
