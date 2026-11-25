'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const exec=promisify(execFile);
const source=[
  'const owner = { longPrivatePropertyName: 17, unrelatedField: 23 };',
  'function hidden() { const result = owner.longPrivatePropertyName; getExternal(); return result; }',
  'globalThis.__values.push(hidden() + 4);'
].join('\n');

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function dumpDom(url) {
  const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=8000','--dump-dom',url
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium failed to expose the observation payload: '+stdout.slice(0,1200));
  return Buffer.from(encoded,'base64').toString('utf8');
}

/**
 * @param {string} stack
 * @param {string} pathname
 * @returns {{line:number,column:number,frame:string}}
 */
function parseFrame(stack,pathname) {
  const frame=stack.split('\n').find(line=>line.includes('hidden')&&line.includes(pathname))??'';
  assert.ok(frame,'Missing hidden frame for '+pathname+': '+stack);
  const match=frame.match(/:(\d+):(\d+)\)?$/u);
  assert.ok(match,'Missing source coordinates in '+frame);
  return {line:Number(match[1]),column:Number(match[2]),frame};
}

/**
 * Run a real Chromium differential for a strict ESM function. The host
 * callback receives no function object; it only captures Error.stack.
 * @returns {Promise<void>}
 */
async function run() {
  const output=obfuscateFiles([{
    path:'generated.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',closedWorld:true,seed:'agent9-strict-stack-browser',
    identifiers:false,strings:false,properties:true
  }).files[0];
  assert.ok(output.metrics.properties>=1);
  assert.doesNotMatch(String(output.code),/longPrivatePropertyName/u);

  const html=[
    '<!doctype html><html><body><pre id="result"></pre><script>',
    'window.__values=[];window.__stacks=[];',
    'window.getExternal=function getExternal(){window.__stacks.push(new Error("frame probe").stack||"");};',
    '(async()=>{try{await import("/native.mjs");await import("/generated.mjs");',
    'const result={values:window.__values,stacks:window.__stacks};',
    'document.getElementById("result").textContent=btoa(JSON.stringify(result));',
    '}catch(error){document.getElementById("result").textContent=btoa(JSON.stringify({error:String(error),stack:error&&error.stack}));}})();',
    '</script></body></html>'
  ].join('\n');
  const pages=new Map([
    ['/','text/html; charset=utf-8',html],
    ['/native.mjs','text/javascript; charset=utf-8',source],
    ['/generated.mjs','text/javascript; charset=utf-8',String(output.code)]
  ]);
  const server=http.createServer((request,response)=>{
    const entry=pages.get((request.url??'/').split('?')[0])??pages.get('/');
    if(!entry){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':entry[0]});
    response.end(entry[1]);
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing Chromium fixture port');
    const payload=JSON.parse(await dumpDom('http://127.0.0.1:'+address.port+'/'));
    assert.deepEqual(payload.values,[21,21]);
    assert.equal(payload.stacks.length,2);
    const native=parseFrame(payload.stacks[0],'/native.mjs');
    const generated=parseFrame(payload.stacks[1],'/generated.mjs');
    assert.notEqual(native.column,generated.column,
      'A strict ESM frame should expose the private-key shortening in Error.stack');
    process.stdout.write('AGENT9_CHROMIUM_STRICT_STACK '+JSON.stringify({
      runtime:'Chromium',
      property:'longPrivatePropertyName',
      emittedProperty:String(output.code).match(/owner\.([A-Za-z_$][\w$]*)/)?.[1]??null,
      native,generated,
      values:payload.values
    })+'\n');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run};
