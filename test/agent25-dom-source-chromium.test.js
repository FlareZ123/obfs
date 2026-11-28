'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/** @typedef {{name:string,setup:string,source:string}} BrowserShape */
/** @typedef {{source:string,value:number,independent:number}} Observation */
/** @type {BrowserShape[]} */
const shapes=[
  {name:'direct',setup:'const node=document.createElement("div");node.id=inspect;',
    source:'node.id'},
  {name:'document-alias',setup:
    'const doc=document;const node=doc.createElement("div");node.id=inspect;',
    source:'node.id'},
  {name:'local-document-factory',setup:
    'function make(doc){return doc.createElement("div");}'+
    'const node=make(document);node.id=inspect;',
    source:'node.id'},
  {name:'callable-alias',setup:
    'const node=document.createElement("div");const fn=inspect;node.id=fn;',
    source:'node.id'},
  {name:'set-attribute',setup:
    'const node=document.createElement("div");node.setAttribute("id",inspect);',
    source:'node.id'},
  {name:'text-node',setup:'const node=document.createTextNode(inspect);',
    source:'node.textContent'}
];

/** @param {BrowserShape} shape */
function fixture(shape) {
  return [
    {path:'logic.mjs',sourceType:/** @type {const} */('module'),
      code:'const owner={secretField:57};export function inspect(){return owner.secretField;}'},
    {path:'pure.mjs',sourceType:/** @type {const} */('module'),
      code:'const owner={independentPrivate:73};export const independent=owner.independentPrivate;'},
    {path:'entry.mjs',sourceType:/** @type {const} */('module'),
      code:[
        'import {inspect} from "./logic.mjs";',
        'import {independent} from "./pure.mjs";',
        shape.setup,
        'export const observed={source:'+shape.source+
          ',value:inspect(),independent};'
      ].join('\n')}
  ];
}

const page=[
  '<!doctype html><html><head><meta charset="utf-8"></head><body>',
  '<script type="module">',
  'try {const mod=await import("./entry.mjs");',
  'const pre=document.createElement("pre");pre.id="result";',
  'pre.textContent=btoa(JSON.stringify(mod.observed));document.body.appendChild(pre);',
  '}catch(error){const pre=document.createElement("pre");pre.id="failure";',
  'pre.textContent=String(error.stack||error);document.body.appendChild(pre);}',
  '</script></body></html>'
].join('\n');

/**
 * Launches real network-served browser ESM, uses the browser's own native
 * DOMString setters/methods (no substituted Node DOM host).
 * @param {string} origin
 * @param {string} name
 * @param {'original'|'emitted'} variant
 * @returns {Promise<Observation>}
 */
async function browserObservation(origin,name,variant) {
  const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=10000','--dump-dom',
    origin+'/'+name+'/'+variant+'/index.html'
  ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
  const text=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(text,name+'/'+variant+' native browser failure: '+stdout.slice(0,1400));
  return JSON.parse(Buffer.from(text,'base64').toString('utf8'));
}

test('real Chromium ESM cross-file callable-source DOMString parity grid',
  {skip:process.platform!=='linux'?'Ubuntu Chromium runner only':false},
  async t=>{
    /** @type {Map<string,string>} */
    const routes=new Map();
    for(const shape of shapes){
      const originals=fixture(shape);
      const compiled=obfuscateFiles(originals,{
        mode:'coo',closedWorld:true,identifiers:false,strings:false,
        properties:true,seed:'agent25-real-browser-source-'+shape.name
      });
      const pure=compiled.files.find(file=>file.path==='pure.mjs');
      assert.ok(pure&&pure.metrics.properties>0,
        shape.name+' must rewrite a separate independent private key');
      assert.ok(!String(pure.code).includes('independentPrivate'));
      for(const [variant,files] of /** @type {const} */ ([
        ['original',originals],['emitted',compiled.files]
      ])){
        for(const file of files)routes.set(
          '/'+shape.name+'/'+variant+'/'+file.path,String(file.code));
      }
    }
    const server=http.createServer((request,response)=>{
      if(request.method!=='GET'){response.writeHead(405).end();return;}
      const url=new URL(request.url??'/','http://localhost');
      if(url.pathname.endsWith('/index.html')){
        response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
        response.end(page);return;
      }
      const code=routes.get(url.pathname);
      if(code===undefined){response.writeHead(404).end();return;}
      response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
      response.end(code);
    });
    try {
      await new Promise((resolve,reject)=>{
        server.once('error',reject);
        server.listen(0,'127.0.0.1',()=>resolve(undefined));
      });
      const addr=server.address();
      if(!addr||typeof addr==='string')throw Error('No localhost socket');
      const origin='http://127.0.0.1:'+addr.port;
      for(const shape of shapes){
        await t.test(shape.name,async()=>{
          const native=await browserObservation(origin,shape.name,'original');
          const emitted=await browserObservation(origin,shape.name,'emitted');
          assert.equal(native.value,57);
          assert.equal(native.independent,73);
          assert.ok(native.source.includes('secretField'),
            'Actual native browser DOMString path must expose function source');
          assert.deepEqual(emitted,native,
            'Native browser visible DOMString and function source must be preserved');
        });
      }
    } finally {
      await new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve(undefined)));
    }
  });
