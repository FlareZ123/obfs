'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const runBrowser=promisify(execFile);

const storageSource=[
  'const descriptor=Object.getOwnPropertyDescriptor(Storage.prototype,"setItem");',
  'const captured=new WeakMap();',
  'function inspect(){const privateLocal=29;return privateLocal;}',
  'function independent(){const independentLocal=7;return independentLocal;}',
  'export function sample(){',
  '  Object.defineProperty(Storage.prototype,"setItem",{',
  '    ...descriptor,value:function(_key,value){captured.set(this,value);}',
  '  });',
  '  localStorage.setItem("source-observer",inspect);',
  '  return {value:inspect(),independent:independent()};',
  '}'
].join('\n');
const entrySource="import './mutate.mjs';export {sample} from './storage.mjs';";
const expectedSource='function inspect(){const privateLocal=29;return privateLocal;}';
const scenarios=[
  {name:'switch-matched-selector',nativeShared:true,
    setup:'const carrier={instance:{}};switch(0){case (carrier.instance=new WeakMap(),0):break;}'},
  {name:'switch-return-before-clear',nativeShared:true,
    setup:'const carrier={instance:{}};function fill(){switch(0){case 0:carrier.instance=new WeakMap();return;}carrier.instance={};}fill();'},
  {name:'try-catch-return-before-clear',nativeShared:true,
    setup:'const carrier={instance:{}};function fill(){try{carrier.instance=new WeakMap();return;}catch(e){}finally{}carrier.instance={};}fill();'},
  {name:'switch-normal-break-yield',nativeShared:false,
    setup:'class Ordinary{} const carrier={instance:new WeakMap()};switch(0){case 0:break;}carrier.instance=new Ordinary();'}
];

/**
 * @param {Map<string,string>} resources
 * @param {string} name
 * @returns {Promise<{result:{value:number,independent:number},capturedSource:string}>}
 */
async function readBrowser(resources,name) {
  const html='<!doctype html><html><head><meta charset="utf-8"><title></title></head>'+
    '<body><script type="module" src="./runner.mjs"></script></body></html>';
  const runner=[
    'const pre=document.createElement("pre");',
    'try {',
    '  const {sample}=await import("./entry.mjs");',
    '  const result=sample();',
    '  pre.id="result";',
    '  pre.textContent=btoa(JSON.stringify({result,capturedSource:document.title}));',
    '} catch(error){',
    '  pre.id="error";',
    '  pre.textContent=String(error.stack||error);',
    '}',
    'document.body.appendChild(pre);'
  ].join('\n');
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405).end();return;}
    const url=new URL(request.url??'/','http://127.0.0.1');
    const content=url.pathname.endsWith('/index.html')?html:
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
  try {
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {Record<string,{result:{value:number,independent:number},capturedSource:string}>} */
    const observations={};
    for(const variant of ['native','compiled']){
      const url=origin+'/'+variant+'/'+name+'/index.html';
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=7000','--dump-dom',url
      ],{encoding:'utf8',timeout:45000,maxBuffer:5*1024*1024});
      const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(encoded,variant+' real Chromium module failed: '+stdout.slice(0,2200));
      observations[variant]=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
    }
    assert.deepEqual(observations.compiled,observations.native,
      name+': emitted Chromium source differs');
    return observations.native;
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

test('native and compiled switch/try ESM source parity in real Chromium', {
  timeout:240000
},async(t)=>{
  if(process.platform!=='linux'&&!process.env.CHROMIUM_BIN) {
    t.skip('Chromium parity runner is configured on Linux/explicit CHROMIUM_BIN');
    return;
  }
  for(const scenario of scenarios){
    const positive=Function('"use strict";\n'+scenario.setup+
      '\nreturn Object.getPrototypeOf(carrier.instance)===WeakMap.prototype;')();
    assert.equal(positive,scenario.nativeShared,scenario.name);
    const mutateSource=scenario.setup+'\n'+
      'const prototype=Object.getPrototypeOf(carrier.instance);\n'+
      'const nativeSet=prototype.set;\n'+
      'prototype.set=function(key,value){document.title=value;'+
      'return Reflect.apply(nativeSet,this,[key,value]);};';
    const sourceFiles=[
      {path:'entry.mjs',sourceType:'module',code:entrySource},
      {path:'mutate.mjs',sourceType:'module',code:mutateSource},
      {path:'storage.mjs',sourceType:'module',code:storageSource}
    ];
    const output=obfuscateFiles(sourceFiles,{
      mode:'coo',closedWorld:true,properties:false,
      identifiers:true,strings:false,seed:'agent8-switch-browser-'+scenario.name
    });
    const storage=output.files.find(file=>file.path==='storage.mjs');
    assert.ok(storage);
    if(!scenario.nativeShared)
      assert.ok(storage.metrics.bindings>0,
        scenario.name+': native-negative control must still rewrite bindings');
    /** @type {Map<string,string>} */
    const resources=new Map();
    for(const file of sourceFiles)
      resources.set('/native/'+scenario.name+'/'+file.path,file.code);
    for(const file of output.files)
      resources.set('/compiled/'+scenario.name+'/'+file.path,String(file.code));
    const native=await readBrowser(resources,scenario.name);
    assert.deepEqual(native.result,{value:29,independent:7});
    assert.equal(native.capturedSource,
      scenario.nativeShared?expectedSource:'',
      scenario.name+': unexpected native Chromium source witness');
  }
});
