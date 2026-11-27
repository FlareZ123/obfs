'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const execFileAsync=promisify(execFile);

/** @typedef {{path:string,code:string|Buffer,sourceType:'script'|'asset'}} Source */

/** @param {'argument'|'call'|'opaque'|'native-call'|'reflect-apply'|'alias-call'|'bound-call'} split @returns {Source[]} */
function fixture(split){
  const client='document.documentElement.dataset.documentWriteSri="loaded";'+
    'globalThis.documentWriteSri="parser-written script bytes carry exact hash";';
  const hash=createHash('sha256').update(client).digest('base64');
  const html='<html><head><script src="./bootstrap.js"></script></head>'+
    '<body><p>Document.write source-byte integrity</p></body></html>';
  const first='<script src="./client.js" integ';
  const second='rity="sha256-'+hash+'"></script>';
  const loader=split==='argument' ?
    'document.write('+JSON.stringify(first)+','+JSON.stringify(second)+');' :
    split==='call' ?
      'document.write('+JSON.stringify(first)+');'+
        'document.write('+JSON.stringify(second)+');' :
    split==='opaque' ?
      'const method=globalThis.optionalWriteMethod||"write";'+
        'document[method]('+JSON.stringify(first+second)+');' :
    split==='native-call' ?
      'document.write.call(document,'+JSON.stringify(first+second)+');' :
    split==='reflect-apply' ?
      'Reflect.apply(document.write,document,['+
        JSON.stringify(first+second)+']);' :
    split==='bound-call' ?
      'const writer=document.write.bind(document);writer('+
        JSON.stringify(first+second)+');' :
      'const writer=document.write;writer.call(document,'+
        JSON.stringify(first+second)+');';
  return [
    {path:'client.js',code:client,sourceType:'script'},
    {path:'bootstrap.js',code:loader,sourceType:'script'},
    {path:'index.html',code:Buffer.from(html),sourceType:'asset'}
  ];
}

/**
 * Real browser navigation verifies the SRI integrity check of parser-inserted
 * scripts and the necessity of conserving pinned source bytes.
 * @param {'argument'|'call'|'opaque'|'native-call'|'reflect-apply'|'alias-call'|'bound-call'} split
 * @returns {Promise<{nativeLoaded:true,protectedLoaded:true,unsafeBlocked:true}>}
 */
async function runFixture(split){
  const inputs=fixture(split);
  const options={mode:/** @type {const} */('coo'),seed:'document-write-browser',
    strings:true,identifiers:false,properties:false};
  const guarded=obfuscateFiles(inputs,options);
  assert.equal(guarded.files[0].code,inputs[0].code);
  const mutated=obfuscateFiles([inputs[0]],options);
  assert.notEqual(mutated.files[0].code,inputs[0].code);
  /** @type {Map<string,Map<string,string>>} */
  const variants=new Map([
    ['native',new Map([
      ['client.js',/** @type {string} */(inputs[0].code)],
      ['bootstrap.js',/** @type {string} */(inputs[1].code)],
      ['index.html',Buffer.from(inputs[2].code).toString()]
    ])],
    ['protected',new Map([
      ['client.js',/** @type {string} */(guarded.files[0].code)],
      ['bootstrap.js',/** @type {string} */(guarded.files[1].code)],
      ['index.html',Buffer.from(inputs[2].code).toString()]
    ])],
    ['unsafe',new Map([
      ['client.js',/** @type {string} */(mutated.files[0].code)],
      ['bootstrap.js',/** @type {string} */(inputs[1].code)],
      ['index.html',Buffer.from(inputs[2].code).toString()]
    ])]
  ]);
  const server=http.createServer((request,response)=>{
    const path=(new URL(request.url??'/', 'http://127.0.0.1')).pathname
      .split('/').filter(Boolean);
    const code=path.length===2?variants.get(path[0])?.get(path[1]):undefined;
    if(code===undefined){
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200,{'content-type':path[1].endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(code);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address || typeof address==='string')throw new Error('Missing test port');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {Map<string,boolean>} */
    const observations=new Map();
    for(const name of variants.keys()){
      const {stdout}=await execFileAsync(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+name+'/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      assert.match(stdout,/Document.write source-byte integrity/u);
      observations.set(name,/data-document-write-sri="loaded"/u.test(stdout));
    }
    assert.equal(observations.get('native'),true,
      'Original parser-inserted SRI script must execute');
    assert.equal(observations.get('protected'),true,
      'Source-observed output must execute with original bytes');
    assert.equal(observations.get('unsafe'),false,
      'Counterfactual altered source must fail browser SRI validation');
    const result={nativeLoaded:/** @type {const} */(true),
      protectedLoaded:/** @type {const} */(true),
      unsafeBlocked:/** @type {const} */(true)};
    process.stdout.write('DOCUMENT_WRITE_SRI_BROWSER '+JSON.stringify(result)+'\n');
    return result;
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

/** @returns {Promise<void>} */
async function main(){
  await runFixture('argument');
  await runFixture('call');
  await runFixture('opaque');
  await runFixture('native-call');
  await runFixture('reflect-apply');
  await runFixture('alias-call');
  await runFixture('bound-call');
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
