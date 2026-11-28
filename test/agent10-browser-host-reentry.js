'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} Input */
/** @type {Array<{name:string,inputs:Input[]}>} */
const scenarios=[
  {name:'local-binary',inputs:[
    {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {owner} from "./owner.mjs";',
      'const n=3+4;',
      'export const value={field:owner.secretField,observed:await n.toLocaleString("en-US")};'
    ].join('\n')}
  ]},
  {name:'imported-number',inputs:[
    {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
    {path:'number.mjs',sourceType:'module',code:'export const n=7;'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {owner} from "./owner.mjs";',
      'import {n} from "./number.mjs";',
      'export const value={field:owner.secretField,observed:await n.toLocaleString("en-US")};'
    ].join('\n')}
  ]},
  {name:'typeof-narrowed-string',inputs:[
    {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {owner} from "./owner.mjs";',
      'const dynamic=globalThis.injectedValue;',
      'const narrowed=typeof dynamic==="string"?dynamic:null;',
      'export const value={field:owner.secretField,observed:',
      'await narrowed.toLocaleString("en-US")};'
    ].join('\\n')}
  ]},
  {name:'native-prototype-call',inputs:[
    {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {owner} from "./owner.mjs";',
      'export const value={field:owner.secretField,observed:',
      'await Number.prototype.toLocaleString.call(7,"en-US")};'
    ].join('\n')}
  ]}
];
const bootstrap=[
  'globalThis.injectedValue="7";',
  'Object.defineProperty(String.prototype,"toLocaleString",{configurable:true,',
  'value:function(){return import("./owner.mjs").then(m=>Object.keys(m.owner));}});',
  'Object.defineProperty(Number.prototype,"toLocaleString",{configurable:true,',
  'value:function(){return import("./owner.mjs").then(m=>Object.keys(m.owner));}});',
  'try{',
  '  const module=await import("./entry.mjs");',
  '  document.getElementById("result").textContent=btoa(JSON.stringify(module.value));',
  '}catch(error){',
  '  const failure=document.getElementById("result");',
  '  failure.setAttribute("data-failure","true");',
  '  failure.textContent=btoa(String(error.stack||error));',
  '}'
].join('\n');

/** @param {string} origin @param {string} route @returns {Promise<{field:number,observed:string[]}>} */
async function observe(origin,route) {
  const binary=process.env.CHROMIUM_BIN??'google-chrome';
  const args=['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=6000','--dump-dom',origin+route];
  const {stdout}=await promisify(execFile)(binary,args,{
    timeout:45000,maxBuffer:6*1024*1024,encoding:'utf8'
  });
  const token=stdout.match(/<pre id="result"[^>]*>([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(token,'Chromium returned no base64 output for '+route+': '+stdout.slice(0,1200));
  assert.ok(!stdout.includes('data-failure="true"'),
    'Module load failed: '+Buffer.from(token,'base64').toString('utf8'));
  return /** @type {{field:number,observed:string[]}} */(
    JSON.parse(Buffer.from(token,'base64').toString('utf8'))
  );
}

/** @returns {Promise<void>} */
async function main() {
  /** @type {Map<string,string>} */
  const routes=new Map();
  const html='<!doctype html><html><body><pre id="result">pending</pre>'+
    '<script type="module" src="./bootstrap.mjs"></script></body></html>';
  const admitted=[];
  for(const scenario of scenarios) {
    const built=obfuscateFiles(scenario.inputs,{mode:'coo',closedWorld:true,
      properties:true,identifiers:false,strings:false,
      seed:'agent10-browser-reentrant/'+scenario.name});
    admitted.push({name:scenario.name,renamed:built.crossFile.properties});
    /** @type {Array<[string,ReadonlyArray<{path:string,code:string|Buffer}>]>} */
    const variants=[
      ['native',scenario.inputs],
      ['emitted',built.files]
    ];
    for(const [variant,files] of variants) {
      const root='/'+scenario.name+'/'+variant+'/';
      routes.set(root+'index.html',html);
      routes.set(root+'bootstrap.mjs',bootstrap);
      for(const file of files)routes.set(root+file.path,String(file.code));
    }
  }
  const server=http.createServer((req,res)=>{
    const route=new URL(req.url??'/','http://127.0.0.1').pathname;
    const body=routes.get(route);
    if(body===undefined){res.writeHead(404).end();return;}
    res.writeHead(200,{
      'content-type':route.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store',
      'content-security-policy':"default-src 'none'; script-src 'self'; connect-src 'self'"
    });
    res.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const addr=server.address();
    if(!addr||typeof addr==='string')throw Error('No browser listener port');
    const origin='http://127.0.0.1:'+addr.port;
    for(const item of admitted) {
      const native=await observe(origin,'/'+item.name+'/native/index.html');
      const emitted=await observe(origin,'/'+item.name+'/emitted/index.html');
      assert.deepEqual(native,{field:7,observed:['secretField']},
        'Original source must be host-reentrant in real browser');
      assert.deepEqual(emitted,native,
        'Browser must preserve host-observable keys on '+item.name);
      assert.equal(item.renamed,0,'Host-observable owner must not be renamed');
    }
    console.log('AGENT10_REAL_CHROMIUM_HOST_REENTRY '+JSON.stringify({
      scenarios:admitted,parity:true,csp:"script-src 'self'"
    }));
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}
if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
