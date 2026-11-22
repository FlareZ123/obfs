'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const run=promisify(execFile);
const source=[
  'const owner={secretField:17};',
  'const independent={otherField:3};',
  'const extra=independent.otherField;',
  'function privateWorker(){',
  '  const value=owner.secretField;',
  '  const yes=Array.isArray([1,2]);',
  '  return value+extra+(yes?1:0);',
  '}',
  'module.exports=privateWorker();'
].join('\n');

const prelude=[
  'window.module={exports:null};',
  'const original=Array.isArray;',
  'Array.isArray=function observedArray(value){',
  '  const caller=arguments.callee.caller;',
  '  if(caller&&caller.name==="privateWorker")',
  '    window.observedSource=Function.prototype.toString.call(caller);',
  '  return original(value);',
  '};'
].join('\n');

/** @param {'native'|'emitted'} graph @returns {string} */
function documentFor(graph) {
  return [
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<script>',prelude,'</script>',
    '<script src="/'+graph+'/entry.cjs"></script>',
    '<script>',
    'const r=document.createElement("pre");r.id="result";',
    'r.textContent=btoa(JSON.stringify({value:module.exports,',
    'source:window.observedSource??""}));',
    'document.body.append(r);',
    '</script></body></html>'
  ].join('\n');
}

/** @param {string} binary @param {string} url @returns {Promise<{value:number,source:string}>} */
async function observe(binary,url) {
  const {stdout}=await run(binary,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=6000','--dump-dom',url
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium missing result: '+stdout.slice(0,2000));
  return /** @type {{value:number,source:string}} */ (
    JSON.parse(Buffer.from(encoded,'base64').toString('utf8'))
  );
}

test('preloaded real Chromium classic script can observe sloppy caller source',async t=>{
  if(process.platform==='win32') {
    t.skip('Focused CI Windows has no pinned Chromium binary; Node V8 proof runs separately');
    return;
  }
  const compiled=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:source}],{
    mode:'coo',seed:'chromium-ambient-caller-source',
    closedWorld:true,strings:false,identifiers:false,properties:true
  }).files[0];
  assert.ok(compiled.metrics.properties>0,
    'An unchanged file would not test source parity under obfuscation');
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url??'/', 'http://localhost').pathname;
    const graph=pathname.startsWith('/emitted/')?'emitted':'native';
    if(pathname.endsWith('/entry.cjs')) {
      res.writeHead(200,{'content-type':'application/javascript; charset=utf-8'});
      res.end(graph==='native'?source:String(compiled.code));return;
    }
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end(documentFor(graph));
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('No HTTP port');
    const base='http://127.0.0.1:'+address.port;
    const binary=process.env.CHROMIUM_BIN??'google-chrome';
    const native=await observe(binary,base+'/native/index.html');
    const transformed=await observe(binary,base+'/emitted/index.html');
    assert.equal(native.value,21);
    assert.equal(transformed.value,21);
    assert.match(native.source,/secretField/u);
    console.log('CHROMIUM_SLOPPY_CALLER_SOURCE '+JSON.stringify({
      propertyYield:compiled.metrics.properties,native,transformed
    }));
    assert.equal(transformed.source,native.source,
      'Host preloaded browser wrapper must see exact sloppy caller source');
  } finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
});
