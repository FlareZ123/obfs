'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const exec=promisify(execFile);
const source=[
  'try { null.value; }',
  'catch (error) { globalThis.result=error.stack; }'
].join('\n');

/**
 * @param {string} code
 * @param {number} port
 * @param {string} path
 * @returns {Promise<string>}
 */
async function executeChromium(code,port,path){
  const url='http://127.0.0.1:'+port+path;
  const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=8000','--dump-dom',url
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium failed to expose stack result: '+stdout.slice(0,1000));
  return Buffer.from(encoded,'base64').toString('utf8');
}

/**
 * @param {string} stack
 * @returns {string}
 */
function firstPageFrame(stack){
  return stack.split('\n').find(line=>line.includes('127.0.0.1'))??'';
}

/**
 * @param {boolean} guarded
 * @returns {Promise<void>}
 */
async function run(guarded){
  const options={
    mode:'coo',seed:'host-lock-stack-chromium',
    strings:false,properties:false,identifiers:false,
    allowedHosts:['127.0.0.1']
  };
  if(guarded){
    assert.throws(
      ()=>obfuscateFiles([{path:'entry.js',sourceType:'script',code:source}],options),
      /Host locking cannot preserve observable source/u
    );
  }
  /** @type {string|null} */
  let generated=null;
  if(!guarded){
    generated=/** @type {string} */(obfuscateFiles([
      {path:'entry.js',sourceType:'script',code:source}
    ],options).files[0].code);
  }
  const safe='globalThis.result="safe-host-lock";';
  const safeGenerated=/** @type {string} */(obfuscateFiles([
    {path:'safe.js',sourceType:'script',code:safe}
  ],{...options,seed:'safe-host-lock-chromium'}).files[0].code);
  const pages=new Map([
    ['/native',source],
    ['/safe',safeGenerated]
  ]);
  if(generated!==null)pages.set('/generated',generated);
  const server=http.createServer((req,res)=>{
    const code=pages.get((req.url??'/').split('?')[0])??safe;
    const observer='const pre=document.createElement("pre");pre.id="result";'+
      'pre.textContent=btoa(String(globalThis.result));document.body.append(pre);';
    const html='<!doctype html><html><body><script>\n'+code+'\n'+observer+
      '</script></body></html>';
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end(html);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing Chromium fixture port');
    const safeResult=await executeChromium(safeGenerated,address.port,'/safe');
    assert.equal(safeResult,'safe-host-lock');
    if(generated!==null){
      const native=await executeChromium(source,address.port,'/native');
      const transformed=await executeChromium(generated,address.port,'/generated');
      const nativeFrame=firstPageFrame(native);
      const transformedFrame=firstPageFrame(transformed);
      assert.match(nativeFrame,/127\.0\.0\.1:\d+\/native:\d+:\d+/u);
      assert.match(transformedFrame,/127\.0\.0\.1:\d+\/generated:\d+:\d+/u);
      const nativeCoordinate=nativeFrame.match(/:(\d+):(\d+)\)?$/u)?.slice(1).join(':');
      const transformedCoordinate=transformedFrame.match(/:(\d+):(\d+)\)?$/u)?.slice(1).join(':');
      assert.notEqual(transformedCoordinate,nativeCoordinate,
        'Pre-guard Chromium host wrapper must shift captured source coordinates');
      process.stdout.write('HOST_LOCK_STACK_CHROMIUM '+JSON.stringify({
        nativeFrame,transformedFrame,nativeCoordinate,transformedCoordinate,
        parity:nativeCoordinate===transformedCoordinate
      })+'\n');
    }
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)run(process.argv.includes('--expect-guarded'))
  .catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run};
