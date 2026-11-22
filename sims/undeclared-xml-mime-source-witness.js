'use strict';

const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const http=require('node:http');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const execute=promisify(execFile);

/** @param {string} browser @param {string} url @returns {Promise<string>} */
async function documentSource(browser,url){
  const {stdout}=await execute(browser,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=10000','--dump-dom',url
  ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
  return stdout;
}

/**
 * Reproduce the observable limit of extension-only executable-asset discovery.
 * A host may advertise a nonstandard asset suffix with a browser-executable
 * XML media type, which is absent from the declared filename inventory.
 * This script is a negative security witness and is expected to pass while
 * documenting that the original inline source remains public and executes.
 * @returns {Promise<void>}
 */
async function main(){
  const sentry='PUBLIC_INLINE_XML_SOURCE_CANARY';
  const original='globalThis.mimeSidecar="private-script-transform-control";';
  // XML declarations are optional. This keeps the MIME-contract negative
  // control independent of the separate literal-prolog preflight guard.
  const asset='<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:head>'+
    '<h:script><![CDATA[document.documentElement.setAttribute('+
    '"data-mime-witness","'+sentry+'");]]></h:script>'+
    '</h:head><h:body><h:p>nonstandard extension XML MIME</h:p></h:body></h:html>';
  assert.ok(!asset.startsWith('<?xml'), 'No XML declaration: deployment MIME remains unknown');
  const jsSentry='PUBLIC_UNTRANSFORMED_JAVASCRIPT_SOURCE_CANARY';
  const jsAsset='document.documentElement.setAttribute("data-js-mime-witness","'+
    jsSentry+'");';
  const jsPage='<!doctype html><html><head>'+
    '<script src="./source.blob"></script></head><body>'+
    '<p>nonstandard extension JavaScript MIME</p></body></html>';
  const javascriptMime=new Map([
    ['javascript','text/javascript; charset=utf-8'],
    ['javascript-inert','application/octet-stream'],
    ['javascript-plain','text/plain; charset=utf-8']
  ]);
  const result=obfuscateFiles([
    {path:'client.js',sourceType:/** @type {const} */('script'),code:original},
    {path:'index.blob',sourceType:/** @type {const} */('asset'),code:Buffer.from(asset)},
    {path:'javascript/source.blob',sourceType:/** @type {const} */('asset'),
      code:Buffer.from(jsAsset)},
    {path:'javascript/index.html',sourceType:/** @type {const} */('asset'),
      code:Buffer.from(jsPage)},
    {path:'javascript-inert/source.blob',sourceType:/** @type {const} */('asset'),
      code:Buffer.from(jsAsset)},
    {path:'javascript-inert/index.html',sourceType:/** @type {const} */('asset'),
      code:Buffer.from(jsPage)},
    {path:'javascript-plain/source.blob',sourceType:/** @type {const} */('asset'),
      code:Buffer.from(jsAsset)},
    {path:'javascript-plain/index.html',sourceType:/** @type {const} */('asset'),
      code:Buffer.from(jsPage)}
  ],{mode:'coo',seed:'mime-extension-disclosure-witness',
    strings:true,identifiers:false,properties:false});
  assert.notEqual(result.files[0].code,original,
    'The independent regular JavaScript file should still transform');
  assert.deepEqual(result.files[1].code,Buffer.from(asset),
    'The extension-blind executable XML asset is distributed byte-exact');
  assert.ok(Buffer.from(result.files[1].code).includes(Buffer.from(sentry)),
    'The original inline source remains publicly recoverable');
  assert.deepEqual(result.files[2].code,Buffer.from(jsAsset),
    'An opaque JavaScript subresource under .blob must remain byte-exact');
  assert.deepEqual(result.files[3].code,Buffer.from(jsPage),
    'Its publishing HTML document remains byte-exact');
  assert.ok(Buffer.from(result.files[2].code).includes(Buffer.from(jsSentry)),
    'The opaque JavaScript MIME source remains public');
  for(const index of [4,6]) {
    assert.deepEqual(result.files[index].code,Buffer.from(jsAsset),
      'Every script variant publishes exactly the same opaque source bytes');
    assert.deepEqual(result.files[index+1].code,Buffer.from(jsPage),
      'Every script variant publishes the same inert HTML document bytes');
  }
  const variantMime=new Map([
    ['xhtml','application/xhtml+xml; charset=utf-8'],
    ['xml','application/xml; charset=utf-8']
  ]);
  const server=http.createServer((request,response)=>{
    const parts=(new URL(request.url??'/','http://127.0.0.1')).pathname
      .split('/').filter(Boolean);
    const scriptType=javascriptMime.get(parts[0]);
    if(parts.length===2&&scriptType&&parts[1]==='index.html'){
      const index=[...javascriptMime.keys()].indexOf(parts[0]);
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'x-content-type-options':'nosniff'});
      response.end(result.files[3+2*index].code);return;
    }
    if(parts.length===2&&scriptType&&parts[1]==='source.blob'){
      const index=[...javascriptMime.keys()].indexOf(parts[0]);
      response.writeHead(200,{'content-type':scriptType,
        'x-content-type-options':'nosniff'});
      response.end(result.files[2+2*index].code);return;
    }
    if(parts.length!==2||parts[1]!=='index.blob'||!variantMime.has(parts[0])){
      response.writeHead(404).end();return;
    }
    response.writeHead(200,{'content-type':variantMime.get(parts[0]),
      'x-content-type-options':'nosniff'});
    response.end(result.files[1].code);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {Record<string,boolean>} */
    const executed={};
    for(const mode of variantMime.keys()){
      const dom=await documentSource(process.env.CHROMIUM_BIN??'google-chrome',
        origin+'/'+mode+'/index.blob');
      assert.match(dom,/nonstandard extension XML MIME/u);
      executed[mode]=dom.includes('data-mime-witness="'+sentry+'"');
    }
    assert.deepEqual(executed,{xhtml:true,xml:true},
      'Both browser XML MIME types execute the admitted original inline script');
    /** @type {Record<string,boolean>} */
    const jsObserved={};
    for(const [group] of javascriptMime){
      const jsDom=await documentSource(process.env.CHROMIUM_BIN??'google-chrome',
        origin+'/'+group+'/index.html');
      assert.match(jsDom,/nonstandard extension JavaScript MIME/u);
      jsObserved[group]=jsDom.includes('data-js-mime-witness="'+jsSentry+'"');
    }
    assert.deepEqual(jsObserved,{
      javascript:true,'javascript-inert':false,'javascript-plain':false
    },'Correct JavaScript MIME executes with nosniff; inert MIME does not');
    process.stdout.write('UNDECLARED_MIME_SOURCE_WITNESS '+JSON.stringify({
      compilerAccepted:true,assetExtension:'blob',plainSourceVisible:true,
      adjacentScriptTransformed:true,browserExecuted:executed,
      opaqueJavaScriptSourceVisible:true,opaqueJavaScriptExecuted:jsObserved.javascript,
      nosniffControls:jsObserved
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
