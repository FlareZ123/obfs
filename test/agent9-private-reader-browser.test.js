'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {spawnSync,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const http=require('node:http');
const {obfuscateFiles}=require('../src');

const execChrome=promisify(execFile);
const ownerSource=[
  'const privateRecord={secretAlpha:23,secretBeta:7};',
  'function readAlpha(ownerAlpha){return ownerAlpha.secretAlpha;}',
  'function readBeta(ownerBeta){return ownerBeta.secretBeta;}',
  'export function calculate(k){return k*readAlpha(privateRecord)+readBeta(privateRecord);}'
].join('\n');
const apiSource=[
  'import {calculate} from "./owner.mjs";',
  'export function execute(k){return calculate(k)+calculate(k+1);}'
].join('\n');
const runner=[
  'import {calculate} from "./owner.mjs";',
  'import {execute} from "./api.mjs";',
  'const result={values:[execute(0),execute(1),execute(13)],',
  'source:Function.prototype.toString.call(calculate)};',
  'const output=document.createElement("pre");',
  'output.id="result";output.textContent=btoa(JSON.stringify(result));',
  'document.body.appendChild(output);'
].join('\n');

/** @type {Array<{path:string,sourceType:'module',code:string}>} */
const inputs=[
  {path:'owner.mjs',sourceType:'module',code:ownerSource},
  {path:'api.mjs',sourceType:'module',code:apiSource}
];

test('three-file ESM exported wrapper retains exact callable source and values in Chromium CSP',async t=>{
  const browser=process.env.CHROMIUM_BIN??'google-chrome';
  const probe=spawnSync(browser,['--version'],{encoding:'utf8',timeout:10000});
  if(probe.status!==0){
    t.skip('Chromium CLI not installed on this runner');
    return;
  }
  const compiled=obfuscateFiles(inputs,{
    mode:'coo',closedWorld:true,seed:'agent9-private-reader-chromium',
    properties:true,identifiers:false,strings:false
  });
  const owner=compiled.files.find(f=>f.path==='owner.mjs');
  assert.ok(owner);
  assert.equal(owner.metrics.properties,2);
  assert.doesNotMatch(String(owner.code),/secretAlpha|secretBeta/u);
  const api=compiled.files.find(f=>f.path==='api.mjs');
  assert.ok(api);

  const html='<!doctype html><html><head><meta charset="utf-8"></head>'+
    '<body><script type="module" src="./runner.mjs"></script></body></html>';
  /** @type {Map<string,string>} */
  const files=new Map([
    ['/native/owner.mjs',ownerSource],['/native/api.mjs',apiSource],['/native/runner.mjs',runner],
    ['/native/index.html',html],
    ['/emitted/owner.mjs',String(owner.code)],
    ['/emitted/api.mjs',String(api.code)],
    ['/emitted/runner.mjs',runner],['/emitted/index.html',html]
  ]);
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url??'/', 'http://localhost').pathname;
    const body=files.get(pathname);
    if(req.method!=='GET'||body===undefined){
      res.writeHead(body===undefined?404:405).end();
      return;
    }
    res.writeHead(200,{
      'content-type':pathname.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'content-security-policy':"default-src 'none'; script-src 'self'"
    });
    res.end(body);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('No local port');
    /** @type {Array<{values:number[],source:string}>} */
    const outputs=[];
    for(const lane of ['native','emitted']){
      const target='http://127.0.0.1:'+address.port+'/'+lane+'/index.html';
      const {stdout}=await execChrome(browser,[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--disable-background-networking','--virtual-time-budget=12000',
        '--dump-dom',target
      ],{encoding:'utf8',maxBuffer:3*1024*1024,timeout:40000});
      const match=stdout.match(new RegExp('<pre id="result">([A-Za-z0-9+/=]+)</pre>','u'))?.[1];
      assert.ok(match,lane+' ESM/CSP result was absent: '+stdout.slice(0,1000));
      const parsed=/** @type {{values:number[],source:string}} */(
        JSON.parse(Buffer.from(match,'base64').toString('utf8')));
      outputs.push(parsed);
    }
    assert.deepEqual(outputs[0].values,[37,83,635]);
    assert.deepEqual(outputs[1],outputs[0],
      'Native Chromium values and intrinsic public function source must be identical');
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
});
