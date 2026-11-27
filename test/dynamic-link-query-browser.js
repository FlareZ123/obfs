'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/**
 * A modulepreload link may read a runtime-chosen `integrity` IDL property
 * while its digest arrives from preserved HTML metadata. This is the same
 * content-byte contract as a script's SRI but has no static integrity attr.
 * @returns {Promise<void>}
 */
async function main(){
  const source='export const marker="dynamic module preload has pinned source bytes";';
  const digest='sha256-'+createHash('sha256').update(source).digest('base64');
  const loader=[
    'const link=document.getElementById("preload");',
    'const key=globalThis.linkIntegrityField||"integrity";',
    'link[key]=document.getElementById("expected").content;',
    'link.onload=()=>document.documentElement.dataset.linkSri="loaded";',
    'link.onerror=()=>document.documentElement.dataset.linkSri="blocked";',
    'link.rel="modulepreload";link.href="./client.mjs";'
  ].join('');
  const html='<!doctype html><html><head>'+
    '<link id="preload"><meta id="expected" content="'+digest+'">'+
    '<script src="./loader.js"></script></head>'+
    '<body><p>Dynamic HTMLLinkElement modulepreload SRI</p></body></html>';
  const inputs=[
    {path:'client.mjs',sourceType:/** @type {const} */('module'),code:source},
    {path:'loader.js',sourceType:/** @type {const} */('script'),code:loader},
    {path:'index.html',sourceType:/** @type {const} */('asset'),
      code:Buffer.from(html)}
  ];
  const options={mode:/** @type {const} */('coo'),closedWorld:true,
    strings:true,identifiers:false,properties:false,seed:'dynamic-link-sri-browser'};
  const protectedGraph=obfuscateFiles(inputs,options);
  const unsafe=obfuscateFiles([inputs[0]],options);
  assert.notEqual(unsafe.files[0].code,source,
    'SRI-negative control must genuinely rewrite the JavaScript');
  /** @type {Map<string,Map<string,string>>} */
  const variants=new Map();
  for(const variant of ['native','protected','unsafe']){
    const client=variant==='protected'?protectedGraph.files[0].code:
      variant==='unsafe'?unsafe.files[0].code:source;
    variants.set(variant,new Map([
      ['client.mjs',/** @type {string} */(client)],
      ['loader.js',loader],['index.html',html]
    ]));
  }
  const server=http.createServer((request,response)=>{
    const parts=(new URL(request.url??'/','http://127.0.0.1')).pathname
      .split('/').filter(Boolean);
    const code=parts.length===2?variants.get(parts[0])?.get(parts[1]):undefined;
    if(code===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':parts[1].endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(code);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const addr=server.address();
    if(!addr||typeof addr==='string')throw new Error('Missing browser port');
    const origin='http://127.0.0.1:'+addr.port;
    /** @type {Map<string,string>} */
    const status=new Map();
    for(const variant of variants.keys()){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=12000','--dump-dom',
        origin+'/'+variant+'/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      assert.match(stdout,/Dynamic HTMLLinkElement modulepreload SRI/u);
      status.set(variant,stdout.match(/data-link-sri="(loaded|blocked)"/u)?.[1]??'unset');
    }
    const output={native:status.get('native'),protected:status.get('protected'),
      unsafe:status.get('unsafe'),
      transformed:protectedGraph.files[0].code!==source};
    process.stdout.write('DYNAMIC_LINK_QUERY_SRI_BROWSER '+JSON.stringify(output)+'\n');
    assert.equal(status.get('native'),'loaded',
      'Native modulepreload must load with a valid SRI digest');
    assert.equal(status.get('unsafe'),'blocked',
      'Forced source mutation must fail modulepreload SRI');
    assert.equal(status.get('protected'),'loaded',
      'Published output must retain dynamically SRI-pinned module bytes');
    assert.equal(protectedGraph.files[0].code,source,
      'Opaque link integrity must preserve source byte-for-byte');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={main};
