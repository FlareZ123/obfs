'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/**
 * Unexported class and instance. The browser imports only the primitive
 * result, leaving the one-field owner proof eligible for name rewriting.
 */
const source=[
  'const owner={privateField:7};',
  'class Reader{read(){return owner.privateField;}}',
  'const reader=new Reader();export const value=reader.read();'
].join('');
const inspector=[
  '<!doctype html><meta charset="utf-8"><script type="module">',
  'try {',
  'const {value}=await import("./entry.mjs");',
  'const pre=document.createElement("pre");pre.id="result";',
  'pre.textContent=btoa(JSON.stringify({value}));document.body.appendChild(pre);',
  '}catch(error){',
  'const pre=document.createElement("pre");pre.id="failure";',
  'pre.textContent=String(error.stack||error);document.body.appendChild(pre);',
  '}',
  '</script>'
].join('\n');

/**
 * Exercise the exact multi-file-capable ESM emitter in real browser module
 * loading, comparing a source-native run against generated JavaScript.
 * @returns {Promise<{value:number,privatePropertyRenames:number}>}
 */
async function main() {
  const output=obfuscateFiles([{
    path:'entry.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',closedWorld:true,properties:true,identifiers:false,
    strings:false,seed:'private-direct-class-browser-positive'
  }).files[0];
  const emitted=/** @type {string} */ (output.code);
  assert.ok(output.metrics.properties>0,
    'Private ESM class source proof must retain own-field mangling');
  assert.notEqual(emitted,source);
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/', 'http://localhost').pathname;
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    if(pathname==='/original/index.html'||pathname==='/emitted/index.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(inspector);return;
    }
    if(pathname==='/original/entry.mjs'||pathname==='/emitted/entry.mjs'){
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(pathname.startsWith('/original/')?source:emitted);return;
    }
    response.writeHead(404).end();
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing local port');
    const origin='http://127.0.0.1:'+address.port;
    /**
     * @param {'original'|'emitted'} variant
     * @returns {Promise<number>}
     */
    async function observe(variant){
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=10000','--dump-dom',
        origin+'/'+variant+'/index.html'
      ],{encoding:'utf8',timeout:40000,maxBuffer:4*1024*1024});
      const value=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(value,variant+' browser failure: '+stdout.slice(0,1200));
      const decoded=/** @type {{value:number}} */ (
        JSON.parse(Buffer.from(value,'base64').toString('utf8')));
      return decoded.value;
    }
    const native=await observe('original');
    const actual=await observe('emitted');
    assert.equal(native,7);
    assert.equal(actual,native);
    const result={value:actual,privatePropertyRenames:output.metrics.properties};
    process.stdout.write('PRIVATE_CLASS_ESM_CHROME_POSITIVE '+JSON.stringify(result)+'\n');
    return result;
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
