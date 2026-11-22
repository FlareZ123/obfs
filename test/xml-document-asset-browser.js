'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const run=promisify(execFile);
const xhtmlNamespace='http://www.w3.org/1999/xhtml';

/**
 * @param {string} executable
 * @param {string} url
 * @returns {Promise<string>}
 */
async function dumpDom(executable,url) {
  const {stdout}=await run(executable,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
  ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
  return stdout;
}

/**
 * Serve a generic .xml file as application/xml, not application/xhtml+xml.
 * The HTML-namespace script must execute in the real browser document.
 * @returns {Promise<void>}
 */
async function main() {
  const browser=process.env.CHROMIUM_BIN??'google-chrome';
  const source='window.parent.postMessage("xml-script-executed","*");';
  const integrity=createHash('sha256').update(source).digest('base64');
  const xml=Buffer.from('<?xml version="1.0" encoding="UTF-8"?>'+
    '<html xmlns="'+xhtmlNamespace+'"><head>'+
    '<script type="text/javascript" src="./client.js" integrity="sha256-'+
    integrity+'"></script></head><body><p>XML</p></body></html>');
  const original=[{path:'client.js',sourceType:/** @type {const} */('script'),code:source}];
  const safe=obfuscateFiles([
    ...original,{path:'index.xml',sourceType:/** @type {const} */('asset'),code:xml}
  ],{mode:'coo',seed:'xml-browser-sri-safe',strings:true,identifiers:false,properties:false});
  const unsafe=obfuscateFiles(original,{
    mode:'coo',seed:'xml-browser-sri-unsafe',strings:true,identifiers:false,properties:false
  });
  assert.equal(safe.files[0].code,source,'safe compiler output must preserve the SRI-pinned source bytes');
  assert.notEqual(unsafe.files[0].code,source,'negative control must change the pinned script bytes');
  const variants=new Map([
    ['native',new Map([['client.js',source],['index.xml',xml]])],
    ['safe',new Map([
      ['client.js',/** @type {string} */(safe.files[0].code)],['index.xml',xml]
    ])],
    ['unsafe',new Map([
      ['client.js',/** @type {string} */(unsafe.files[0].code)],['index.xml',xml]
    ])]
  ]);
  const server=http.createServer((request,response)=>{
    const parts=(new URL(request.url??'/','http://127.0.0.1')).pathname
      .split('/').filter(Boolean);
    const [variant,filename]=parts;
    if(!variant||!filename){response.writeHead(404).end();return;}
    if(filename==='page.html') {
      const body='<!doctype html><html><body><span id="answer">pending</span>'+
        '<script>window.addEventListener("message",event=>{'+
        'if(event.data==="xml-script-executed")'+
        'document.getElementById("answer").textContent="executed";});</script>'+
        '<iframe src="/'+variant+'/index.xml"></iframe></body></html>';
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(body);
      return;
    }
    const body=variants.get(variant)?.get(filename);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':filename==='index.xml'?
        'application/xml; charset=utf-8':'text/javascript; charset=utf-8'
    });
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
    for(const variant of ['native','safe','unsafe']) {
      const page=await dumpDom(browser,origin+'/'+variant+'/page.html');
      assert.match(page,/id="answer">(?:pending|executed)/u,
        variant+': parent page did not finish rendering');
      outcomes[variant]=/id="answer">executed<\\/span>/u.test(page);
    }
    assert.deepEqual(outcomes,{native:true,safe:true,unsafe:false},
      'application/xml executes the XHTML namespace script, and SRI blocks changed bytes');
    process.stdout.write('XML_DOCUMENT_SRI_BROWSER '+JSON.stringify(outcomes)+'\n');
  } finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
