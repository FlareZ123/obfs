'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const http=require('node:http');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const run=promisify(execFile);

/** @typedef {{path:string,sourceType:'script'|'asset',code:string|Buffer}} File */

/** @returns {File[]} */
function originalFiles(){
  const source='document.documentElement.setAttribute("data-xml-sri","loaded");'+
    'globalThis.XMLProof="a byte-pinned XML script response";';
  const integrity=createHash('sha256').update(source).digest('base64');
  const markup='<?xml version="1.0" encoding="UTF-8"?>'+
    '<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:head>'+
    '<h:script src="./client.js" integrity="sha256-'+integrity+'"></h:script>'+
    '</h:head><h:body><h:p>XML MIME SRI browser</h:p></h:body></h:html>';
  return [
    {path:'client.js',sourceType:'script',code:source},
    {path:'document.xml',sourceType:'asset',code:Buffer.from(markup)}
  ];
}

/** @param {string} browser @param {string} href @returns {Promise<string>} */
async function dumpDom(browser,href){
  const {stdout}=await run(browser,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=10000','--dump-dom',href
  ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
  return stdout;
}

/**
 * In Chromium, generic application/xml and text/xml documents can execute
 * embedded HTML-namespace scripts. Test the actual published input URI and
 * an SRI-bad modified source against the same browser and HTTP server.
 * @returns {Promise<void>}
 */
async function main(){
  const files=originalFiles();
  const safe=obfuscateFiles(files,{
    mode:'coo',seed:'xml-browser-safe',strings:true,identifiers:false,properties:false
  });
  assert.equal(safe.files[0].code,files[0].code);
  const unsafe=obfuscateFiles([files[0]],{
    mode:'coo',seed:'xml-browser-unsafe',strings:true,identifiers:false,properties:false
  });
  assert.notEqual(unsafe.files[0].code,files[0].code);
  const source=/** @type {string} */(files[0].code);
  const xml=Buffer.from(files[1].code).toString('utf8');
  const inline='<?xml version="1.0" encoding="UTF-8"?>'+
    '<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:head>'+
    '<h:script><![CDATA[document.documentElement.setAttribute("data-xml-inline","executed");]]></h:script>'+
    '</h:head><h:body><h:p>XML MIME inline browser</h:p></h:body></h:html>';
  /** @type {Map<string,Map<string,string>>} */
  const bodies=new Map([
    ['application-native',new Map([['client.js',source],['document.xml',xml]])],
    ['application-safe',new Map([['client.js',/** @type {string} */(safe.files[0].code)],['document.xml',xml]])],
    ['application-unsafe',new Map([['client.js',/** @type {string} */(unsafe.files[0].code)],['document.xml',xml]])],
    ['text-native',new Map([['client.js',source],['document.xml',xml]])],
    ['text-safe',new Map([['client.js',/** @type {string} */(safe.files[0].code)],['document.xml',xml]])],
    ['text-unsafe',new Map([['client.js',/** @type {string} */(unsafe.files[0].code)],['document.xml',xml]])],
    ['inline-application',new Map([['document.xml',inline]])],
    ['inline-text',new Map([['document.xml',inline]])]
  ]);
  const server=http.createServer((request,response)=>{
    const segments=(new URL(request.url??'/','http://127.0.0.1')).pathname
      .split('/').filter(Boolean);
    const body=segments.length===2?bodies.get(segments[0])?.get(segments[1]):undefined;
    if(body===undefined){response.writeHead(404).end();return;}
    const mime=segments[1].endsWith('.xml')?
      segments[0].startsWith('text-')||segments[0]==='inline-text'?
        'text/xml; charset=utf-8':'application/xml; charset=utf-8':
      'text/javascript; charset=utf-8';
    response.writeHead(200,{'content-type':mime});
    response.end(body);
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
    const observed={};
    for(const label of bodies.keys()){
      const dom=await dumpDom(process.env.CHROMIUM_BIN??'google-chrome',
        origin+'/'+label+'/document.xml');
      assert.match(dom,/XML MIME (?:SRI|inline) browser/u,label+' document unexpectedly absent');
      observed[label]=label.startsWith('inline-')?
        /data-xml-inline="executed"/u.test(dom):/data-xml-sri="loaded"/u.test(dom);
    }
    assert.deepEqual(observed,{
      'application-native':true,'application-safe':true,'application-unsafe':false,
      'text-native':true,'text-safe':true,'text-unsafe':false,
      'inline-application':true,'inline-text':true
    },'XML MIME documents must preserve SRI and execute HTML-namespace scripts');
    process.stdout.write('XML_MIME_BROWSER '+JSON.stringify(observed)+'\n');
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
