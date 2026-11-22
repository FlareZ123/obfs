'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const http=require('node:http');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const run=promisify(execFile);

/** @typedef {{path:string,sourceType:'script'|'asset',code:string|Buffer}} File */
/** @typedef {{name:string,scriptPath:string,urlPath:string,documentPath:string}} Scenario */

/**
 * Build a browser document that pins the source bytes of a local script, but
 * uses a URL spelling the host normalizes to the supplied file inventory.
 * @param {Scenario} scenario
 * @param {string} source
 * @returns {File[]}
 */
function sourceFiles(scenario,source){
  const integrity=createHash('sha256').update(source).digest('base64');
  const xml=scenario.documentPath.endsWith('.xhtml');
  const script=xml?
    '<h:script xmlns:h="http://www.w3.org/1999/xhtml" src="'+scenario.urlPath+
      '" integrity="sha256-'+integrity+'"></h:script>':
    '<script src="'+scenario.urlPath+'" integrity="sha256-'+integrity+'"></script>';
  const markup=xml?
    '<?xml version="1.0" encoding="UTF-8"?>'+
      '<html xmlns="http://www.w3.org/1999/xhtml"><head>'+script+
      '</head><body><p>portable SRI browser</p></body></html>':
    '<!doctype html><html><head>'+script+
      '</head><body><p>portable SRI browser</p></body></html>';
  return [
    {path:scenario.scriptPath,sourceType:'script',code:source},
    {path:scenario.documentPath,sourceType:'asset',code:Buffer.from(markup)}
  ];
}

/** @param {string} browser @param {string} href @returns {Promise<string>} */
async function dump(browser,href){
  const result=await run(browser,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=10000','--dump-dom',href
  ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
  return result.stdout;
}

/**
 * A host that canonicalizes case, Unicode and terminal Win32 dots/spaces
 * can serve the exact distributed client.js through a URL
 * spelled differently in SRI-bearing HTML. Prove native and corrected output
 * loads, while the deliberately obfuscated source is rejected by real Chrome.
 * @returns {Promise<void>}
 */
async function main(){
  /** @type {Scenario[]} */
  const scenarios=[
    {name:'case-html',scriptPath:'client.js',urlPath:'./CLIENT.JS',documentPath:'index.html'},
    {name:'unicode-xhtml',scriptPath:'caf\u00e9.js',urlPath:'./cafe\u0301.js',
      documentPath:'index.xhtml'},
    {name:'dot-html',scriptPath:'client.js',urlPath:'./client.js.',documentPath:'index.html'},
    {name:'space-xhtml',scriptPath:'client.js',urlPath:'./client.js%20',
      documentPath:'index.xhtml'},
    {name:'directory-html',scriptPath:'assets/client.js',urlPath:'./assets./client.js',
      documentPath:'index.html'}
  ];
  const source='document.documentElement.setAttribute("data-portable-sri","loaded");'+
    'globalThis.portableSRI="unchanged original source payload";';
  /** @type {Map<string,Map<string,string>>} */
  const variants=new Map();
  for(const scenario of scenarios){
    const original=sourceFiles(scenario,source);
    const compiled=obfuscateFiles(original,{
      mode:'coo',seed:'portable-sri-browser-'+scenario.name,
      strings:true,identifiers:false,properties:false,closedWorld:true
    });
    assert.equal(compiled.files[0].code,source,'Compiler must preserve SRI-pinned alias source');
    const counterfactual=obfuscateFiles([original[0]],{
      mode:'coo',seed:'portable-sri-browser-no-integrity-'+scenario.name,
      strings:true,identifiers:false,properties:false
    });
    assert.notEqual(counterfactual.files[0].code,source);
    const markup=Buffer.from(original[1].code).toString('utf8');
    for(const [variant,js] of [
      ['native',source],
      ['safe',/** @type {string} */(compiled.files[0].code)],
      ['unsafe',/** @type {string} */(counterfactual.files[0].code)]
    ]){
      variants.set(scenario.name+'-'+variant,new Map([
        [scenario.scriptPath,js],
        [scenario.documentPath,markup]
      ]));
    }
  }
  const server=http.createServer((request,response)=>{
    const parts=decodeURIComponent(new URL(request.url??'/','http://127.0.0.1').pathname)
      .split('/').filter(Boolean);
    const variant=parts.shift()??'';
    const normalized=parts.join('/').normalize('NFC').toLowerCase()
      .split('/').map(segment=>segment.replace(/[. ]+$/u,'')).join('/');
    const available=variants.get(variant);
    const name=available&&[...available.keys()].find(key=>
      key.normalize('NFC').toLowerCase()===normalized);
    const body=name!==undefined?available?.get(name):undefined;
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':name?.endsWith('.xhtml')?
      'application/xhtml+xml; charset=utf-8':name?.endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {Record<string,boolean>} */
    const outcomes={};
    for(const scenario of scenarios){
      for(const variant of ['native','safe','unsafe']){
        const key=scenario.name+'-'+variant;
        const dom=await dump(process.env.CHROMIUM_BIN??'google-chrome',
          origin+'/'+key+'/'+scenario.documentPath);
        assert.match(dom,/portable SRI browser/u);
        outcomes[key]=/data-portable-sri="loaded"/u.test(dom);
      }
    }
    assert.deepEqual(outcomes,{
      'case-html-native':true,
      'case-html-safe':true,
      'case-html-unsafe':false,
      'unicode-xhtml-native':true,
      'unicode-xhtml-safe':true,
      'unicode-xhtml-unsafe':false,
      'dot-html-native':true,'dot-html-safe':true,'dot-html-unsafe':false,
      'space-xhtml-native':true,'space-xhtml-safe':true,'space-xhtml-unsafe':false,
      'directory-html-native':true,'directory-html-safe':true,'directory-html-unsafe':false
    },'SRI must accept original and exact compiler output while rejecting changed bytes');
    process.stdout.write('PORTABLE_SRI_BROWSER '+JSON.stringify(outcomes)+'\n');
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
