'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const http=require('node:http');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);
const original='document.documentElement.dataset.sriMetadata="loaded";'+
  'globalThis.sriMetadataValue="the original bytes must remain byte identical under browser SRI";';

/** @typedef {'uppercase'|'documentBase'} Scenario */
/** @typedef {'native'|'safe'|'unsafe'} Variant */

/**
 * @param {Scenario} scenario
 * @param {Variant} variant
 * @returns {string}
 */
function documentMarkup(scenario,variant){
  const digest=createHash(scenario==='uppercase'?'sha256':'sha384')
    .update(original).digest('base64');
  const metadata=(scenario==='uppercase'?'SHA256-':'sha384-')+digest;
  const prefix='/'+scenario+'/'+variant+'/app/v3/';
  const base=scenario==='documentBase'?'<base href="'+prefix+'">':'';
  const src=scenario==='documentBase'?
    './renamed-browser-entry.js':prefix+'renamed-browser-entry.js';
  return '<!doctype html><html><head>'+base+
    '<script src="'+src+'" integrity="'+metadata+'"></script>'+
    '</head><body><p>Metadata and document base SRI</p></body></html>';
}

/** @returns {Promise<void>} */
async function main(){
  /** @type {Map<Scenario,{native:string,safe:string,unsafe:string}>} */
  const responses=new Map();
  for(const scenario of /** @type {const} */(['uppercase','documentBase'])){
    const protectedInput=[
      {path:'client.js',sourceType:/** @type {const} */('script'),code:original},
      {path:'index.html',sourceType:/** @type {const} */('asset'),
        code:Buffer.from(documentMarkup(scenario,'safe'))}
    ];
    const options={mode:/** @type {const} */('coo'),
      seed:'browser-sri-metadata-base-'+scenario,
      strings:true,identifiers:false,properties:false};
    const safe=obfuscateFiles(protectedInput,options);
    const unsafe=obfuscateFiles([protectedInput[0]],options);
    responses.set(scenario,{
      native:original,safe:/** @type {string} */(safe.files[0].code),
      unsafe:/** @type {string} */(unsafe.files[0].code)
    });
  }
  const server=http.createServer((request,response)=>{
    const parts=new URL(request.url??'/', 'http://127.0.0.1')
      .pathname.split('/').filter(Boolean);
    const scenario=/** @type {Scenario} */(parts[0]);
    const variant=/** @type {Variant} */(parts[1]);
    const scripts=responses.get(scenario);
    if(!scripts||!['native','safe','unsafe'].includes(variant)){
      response.writeHead(404).end();return;
    }
    if(parts.length===3&&parts[2]==='index.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(documentMarkup(scenario,variant));
      return;
    }
    if(parts.join('/')===scenario+'/'+variant+'/app/v3/renamed-browser-entry.js'){
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(scripts[variant]);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing local server port');
    /** @type {Record<string,{native:boolean,safe:boolean,unsafe:boolean,safeBytes:number,originalBytes:number}>} */
    const outcomes={};
    for(const scenario of /** @type {const} */(['uppercase','documentBase'])){
      /** @type {{native:boolean,safe:boolean,unsafe:boolean,safeBytes:number,originalBytes:number}} */
      const outcome={native:false,safe:false,unsafe:false,
        safeBytes:Buffer.byteLength(/** @type {string} */(responses.get(scenario)?.safe)),
        originalBytes:Buffer.byteLength(original)};
      for(const variant of /** @type {const} */(['native','safe','unsafe'])){
        const url='http://127.0.0.1:'+address.port+'/'+scenario+'/'+variant+'/index.html';
        const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
          '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
          '--no-first-run','--virtual-time-budget=10000','--dump-dom',url
        ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
        assert.match(stdout,/Metadata and document base SRI/u);
        outcome[variant]=/data-sri-metadata="loaded"/u.test(stdout);
      }
      outcomes[scenario]=outcome;
    }
    process.stdout.write('SRI_METADATA_BASE_BROWSER '+JSON.stringify(outcomes)+'\n');
    for(const scenario of /** @type {const} */(['uppercase','documentBase'])){
      const outcome=outcomes[scenario];
      // This Chrome version does not enforce an uppercase SHA256 label even
      // though the current SRI specification accepts it. Preserve bytes in
      // the compiler for conformant or future browsers; do not misreport
      // Chrome's observed uppercase metadata behavior as a byte rejection.
      const expected=scenario==='uppercase'?[true,true,true]:[true,true,false];
      assert.deepEqual([outcome.native,outcome.safe,outcome.unsafe],
        expected,scenario+': observed Chrome enforcement and byte parity');
      assert.equal(outcome.safeBytes,outcome.originalBytes,
        scenario+': SRI requires exact original source length');
    }
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
