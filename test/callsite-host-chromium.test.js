'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {{value:number,source:string}} Observation */

/**
 * A separate classic script supplies the host observer. The obfuscator only
 * receives the application script, so it cannot see the host's stack hook.
 * @param {'native'|'emitted'} mode
 * @returns {string}
 */
function page(mode) {
  const prelude=[
    'const observed={source:""};',
    'function hostCallback(){',
      'const previous=Error.prepareStackTrace;',
      'try {',
        'Error.prepareStackTrace=(_error,frames)=>{',
          'const caller=frames.find(frame=>frame.getFunctionName()==="readPrivate");',
          'observed.source=caller?String(caller.getFunction()):"";',
          'return "";',
        '};',
        'void new Error("browser-source-probe").stack;',
      '} finally {',
        'if(previous===undefined)delete Error.prepareStackTrace;',
        'else Error.prepareStackTrace=previous;',
      '}',
    '}'
  ].join('');
  return '<!doctype html><meta charset="utf-8">'+
    '<pre id="result">pending</pre><script>'+prelude+'</script>'+
    '<script src="/'+mode+'.js"></script>'+
    '<script>document.getElementById("result").textContent='+
      'JSON.stringify({value:globalThis.probeValue,source:observed.source});'+
    '</script>';
}

/**
 * Exercise the real Chromium classic script host stack visibility boundary.
 * Browsers on Windows CI are not pinned by this experimental workflow;
 * the Linux Chromium runner is the intended independent browser witness.
 */
test('real Chromium classic script host callback preserves source-visible owner', {
  skip:process.platform==='win32'?'Chromium binary not pinned on Windows runner':false
},async()=>{
  const source='const owner={privateSecret:31};'+
    'function readPrivate(){hostCallback();return owner.privateSecret;}'+
    'globalThis.probeValue=readPrivate();';
  const output=obfuscateFiles([{
    path:'case.js',sourceType:'script',code:source
  }],{
    mode:'coo',seed:'chromium-callsite-host-source',properties:true,
    identifiers:false,strings:false
  }).files[0];
  const compiled=/** @type {string} */(output.code);
  const server=http.createServer((request,response)=>{
    const route=request.url??'';
    if(route==='/native'||route==='/emitted'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(page(route==='/native'?'native':'emitted'));
    } else if(route==='/native.js'||route==='/emitted.js'){
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(route==='/native.js'?source:compiled);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing local Chrome test port');
    /**
     * @param {'native'|'emitted'} mode
     * @returns {Promise<Observation>}
     */
    async function observe(mode){
      const {stdout,stderr}=await promisify(execFile)(
        process.env.CHROMIUM_BIN??'google-chrome',[
          '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
          '--no-first-run','--virtual-time-budget=3000','--dump-dom',
          'http://127.0.0.1:'+address.port+'/'+mode
        ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
      const match=/<pre id="result">([^<]*)<\/pre>/u.exec(stdout);
      assert.ok(match,stderr+'\n'+stdout.slice(0,3000));
      return /** @type {Observation} */(JSON.parse(match[1]));
    }
    const native=await observe('native');
    const emitted=await observe('emitted');
    process.stdout.write('CALLSITE_CHROMIUM_CLASSIC '+JSON.stringify({
      properties:output.metrics.properties,native,emitted
    })+'\n');
    assert.equal(native.value,31);
    assert.equal(emitted.value,native.value);
    assert.match(native.source,/owner\.privateSecret/);
    assert.equal(emitted.source,native.source);
    assert.equal(output.metrics.properties,0,
      'Browser classic caller observed by a host stack hook must remain unmodified');
  }finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
});
