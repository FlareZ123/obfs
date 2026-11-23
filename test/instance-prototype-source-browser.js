'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/** @typedef {{path:string,sourceType:'module',code:string}} Input */
/** @typedef {{value:number,privateValue:number,source:string}} Observation */

/** @type {Input[]} */
const declared=[
  {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
  {path:'state.mjs',sourceType:'module',code:[
    "import {owner} from './owner.mjs';",
    'class Reader {read(){return owner.secretField;}}',
    'export const instance=new Reader();'
  ].join('\n')},
  {path:'private.mjs',sourceType:'module',code:
    'const hidden={privateField:13};export const privateValue=hidden.privateField;'},
  {path:'entry.mjs',sourceType:'module',code:[
    "import {instance} from './state.mjs';",
    "import {privateValue} from './private.mjs';",
    'export const observation={',
    '  value:instance.read(),',
    '  source:Object.getPrototypeOf(instance).read.toString(),',
    '  privateValue',
    '};'
  ].join('\n')}
];

/**
 * Execute a served browser module graph through Chromium's real ESM runtime.
 * @param {Map<string,string>} resources
 * @returns {Promise<Record<string,Observation>>}
 */
async function compareBrowser(resources) {
  const page='<!doctype html><html><head><meta charset="utf-8">'+
    '</head><body><script type="module" src="./runner.mjs"></script></body></html>';
  const runner=[
    'try {',
    'const m=await import("./entry.mjs");',
    'const pre=document.createElement("pre");',
    'pre.id="result";pre.textContent=btoa(JSON.stringify(m.observation));',
    'document.body.appendChild(pre);',
    '} catch(error) {',
    'const pre=document.createElement("pre");',
    'pre.id="failure";pre.textContent=String(error.stack||error);',
    'document.body.appendChild(pre);',
    '}'
  ].join('\n');
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const url=new URL(request.url??'/','http://localhost');
    const content=url.pathname.endsWith('/index.html')?page:
      url.pathname.endsWith('/runner.mjs')?runner:resources.get(url.pathname);
    if(content===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':url.pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'content-security-policy':"default-src 'none'; script-src 'self'; connect-src 'self'",
      'cache-control':'no-store'
    });
    response.end(content);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {Record<string,Observation>} */
    const results={};
    for(const variant of ['native','compiled']) {
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=8000','--dump-dom',
        origin+'/'+variant+'/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,variant+' Chromium ESM failed: '+stdout.slice(0,1500));
      results[variant]=/** @type {Observation} */(
        JSON.parse(Buffer.from(encoded,'base64').toString('utf8')));
    }
    return results;
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

/** @returns {Promise<void>} */
async function main() {
  const output=obfuscateFiles(declared,{
    mode:'coo',closedWorld:true,properties:true,identifiers:false,
    strings:false,seed:'instance-prototype-chromium-declared'
  });
  const rewritten=output.crossFile.properties+
    output.files.reduce((sum,file)=>sum+file.metrics.properties,0);
  assert.equal(rewritten,0,'Declared method source observer must refuse edits in this graph');
  /** @type {Map<string,string>} */
  const resources=new Map();
  for(const file of declared)resources.set('/native/'+file.path,file.code);
  for(const file of output.files){
    assert.equal(typeof file.code,'string');
    resources.set('/compiled/'+file.path,/** @type {string} */(file.code));
  }
  const results=await compareBrowser(resources);
  assert.deepEqual(results.native,{
    value:7,privateValue:13,source:'read(){return owner.secretField;}'
  });
  assert.deepEqual(results.compiled,results.native);
  const privateOnly=obfuscateFiles([declared[2]],{
    mode:'coo',properties:true,identifiers:false,strings:false,
    seed:'instance-prototype-chromium-isolated-private'
  });
  assert.ok(privateOnly.files[0].metrics.properties>0,
    'Independent primitive record must preserve a nonzero safe rewrite');
  process.stdout.write('INSTANCE_PROTOTYPE_CHROMIUM '+JSON.stringify({
    sourceParity:true,nativeValues:true,declaredGraphRewrites:rewritten,
    isolatedPrivateRewrites:privateOnly.files[0].metrics.properties
  })+'\n');
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});
module.exports={main};
