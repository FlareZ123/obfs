'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const exec=promisify(execFile);

const parentSource=[
  'const worker=new Worker(globalThis.workerUrl);',
  'worker.onerror=globalThis.hostWorkerError;'
].join('\n');
const workerSource='null.value;';

/**
 * @param {string} htmlUrl
 * @returns {Promise<string>}
 */
async function executeChromium(htmlUrl){
  const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=8000','--dump-dom',htmlUrl
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium failed to expose worker error coordinate: '+stdout.slice(0,1200));
  return Buffer.from(encoded,'base64').toString('utf8');
}

/** @returns {Promise<void>} */
async function run(){
  const emitted=obfuscateFiles([
    {path:'parent.js',sourceType:'script',code:parentSource},
    {path:'worker.js',sourceType:'script',code:workerSource}
  ],{
    mode:'coo',seed:'worker-error-coordinate',
    strings:false,properties:false,identifiers:false,
    allowedHosts:['127.0.0.1']
  }).files;
  const generatedParent=/** @type {string} */(
    emitted.find(file=>file.path==='parent.js')?.code
  );
  const generatedWorker=/** @type {string} */(
    emitted.find(file=>file.path==='worker.js')?.code
  );
  assert.match(generatedParent,/Unauthorized execution host/u);
  assert.match(generatedWorker,/Unauthorized execution host/u);

  const routes=new Map([
    ['/native-parent.js',parentSource],
    ['/native-worker.js',workerSource],
    ['/generated-parent.js',generatedParent],
    ['/generated-worker.js',generatedWorker]
  ]);
  const server=http.createServer((req,res)=>{
    const route=(req.url??'/').split('?')[0];
    if(route==='/native'||route==='/generated'){
      const generated=route==='/generated';
      const prefix=generated?'generated':'native';
      const html='<!doctype html><html><body>'+
        '<script>globalThis.workerUrl="/'+prefix+'-worker.js";'+
        'globalThis.hostWorkerError=event=>{globalThis.captured=event.lineno+":"+event.colno;'+
        'event.preventDefault();};</script>'+
        '<script src="/'+prefix+'-parent.js"></script>'+
        '<script>setTimeout(()=>{const pre=document.createElement("pre");pre.id="result";'+
        'pre.textContent=btoa(String(globalThis.captured));document.body.append(pre);},100);</script>'+
        '</body></html>';
      res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      res.end(html);
      return;
    }
    const code=routes.get(route);
    if(code===undefined){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    res.end(code);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing Worker fixture port');
    const base='http://127.0.0.1:'+address.port;
    const native=await executeChromium(base+'/native');
    const transformed=await executeChromium(base+'/generated');
    assert.match(native,/^\d+:\d+$/u);
    assert.match(transformed,/^\d+:\d+$/u);
    assert.notEqual(transformed,native,
      'Pre-guard worker host-lock wrapper must shift ErrorEvent coordinates');
    process.stdout.write('WORKER_ERROR_COORDINATE '+JSON.stringify({
      native,transformed,parity:native===transformed
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)run()
  .catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run,parentSource,workerSource};
