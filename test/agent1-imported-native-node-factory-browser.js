'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {obfuscateFiles}=require('../src');
const puppeteer=require('puppeteer-core');

const client='globalThis._importedNativeValue="a browser-visible client value preserved after native DOM script insertion";';
const named='export function build(){return document.createElement("script");}';
const immutable='export const build=()=>document.createElement("script");';
const imported='import {build as makeNode} from "./factory.mjs";';
const normalBootstrap=imported+
  'const script=makeNode();script.src="./client.js";document.head.append(script);'+
  'globalThis._seen=document.head.lastChild.textContent;globalThis._ready=true;';
const functionDonor='export let build=()=>document.createElement("script");'+
  'build=()=>function inspected(){const secret="browser observable callable source";return secret;};';
const functionBootstrap=imported+
  'const node=makeNode();document.head.append(node);'+
  'globalThis._seen=document.head.lastChild.textContent;globalThis._ready=true;';
const mutableConsumer=imported+
  'let node=makeNode();node=function inspected(){const secret="mutable Node alias source";return secret;};'+
  'document.head.append(node);globalThis._seen=document.head.lastChild.textContent;globalThis._ready=true;';
const prototypeMutator='globalThis.Document.prototype.createElement='+ 
  'function replaced(){return function inspected(){const secret="prototype factory source";return secret;};};';

/** @type {readonly {name:string,factory:string,bootstrap:string,mutation?:string,externalHost?:string,positive:boolean}[]} */
const cases=[
  {name:'function-export',factory:named,bootstrap:normalBootstrap,positive:true},
  {name:'const-export',factory:immutable,bootstrap:normalBootstrap,positive:true},
  {name:'mutable-donor',factory:functionDonor,bootstrap:functionBootstrap,positive:false},
  {name:'mutable-consumer',factory:immutable,bootstrap:mutableConsumer,positive:false},
  {name:'prototype-mutator',factory:named,bootstrap:normalBootstrap,
    mutation:prototypeMutator,positive:false},
  // This host file is deliberately NOT passed to obfuscateFiles. Its opaque
  // callback can mutate document.createElement before the imported factory
  // call and invalidate the native-Node assumption.
  {name:'opaque-host-poison',factory:immutable,positive:false,
    bootstrap:imported+'globalThis.poisonDocument();const node=makeNode();'+
      'document.head.append(node);globalThis._seen=document.head.lastChild.textContent;'+
      'globalThis._ready=true;',
    externalHost:'globalThis.poisonDocument=function(){'+
      'document.createElement=function(){return function inspected(){'+
      'const secret="opaque host callback source";return secret;};};};'}
];

/** @param {typeof cases[number]} fixture @param {'coo'|'sco'|'sno'} mode */
function source(fixture,mode){
  const input=[
    {path:'client.js',sourceType:/** @type {const} */('script'),code:client},
    {path:'factory.mjs',sourceType:/** @type {const} */('module'),code:fixture.factory},
    {path:'bootstrap.mjs',sourceType:/** @type {const} */('module'),code:fixture.bootstrap}
  ];
  if(fixture.mutation)input.push({path:'mutation.js',sourceType:'script',code:fixture.mutation});
  const transformed=obfuscateFiles(input,{mode,
    seed:'agent1-imported-node-chrome/'+fixture.name+'/'+mode,
    closedWorld:true,strings:true,identifiers:false,properties:false});
  if(fixture.positive){
    assert.notEqual(String(transformed.files[0].code),client,
      'Proven native ESM factory must actually encode a client payload');
    assert.ok(transformed.files[0].metrics.literals>0);
  }else assert.equal(String(transformed.files[0].code),client,
    'Potential callable source must suppress sibling string encoding');
  return {input,transformed};
}

async function main(){
  /** @type {Map<string,{type:string,body:string}>} */
  const routes=new Map();
  /** @type {{name:string,mode:string,root:string,positive:boolean}[]} */
  const inventory=[];
  for(const fixture of cases)for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const {input,transformed}=source(fixture,mode);
    const root='/'+fixture.name+'/'+mode;
    for(const variant of /** @type {const} */(['native','emitted'])){
      const stem=root+'/'+variant;
      const files=variant==='native'?input:
        transformed.files.map(file=>({...file,code:String(file.code)}));
      for(const file of files)routes.set(stem+'/'+file.path,
        {type:'text/javascript',body:String(file.code)});
      if(fixture.externalHost)routes.set(stem+'/host.js',
        {type:'text/javascript',body:fixture.externalHost});
      routes.set(stem+'/index.html',{type:'text/html',body:[
        '<!doctype html><html><head>',
        '<script src="./client.js"></script>',
        fixture.mutation?'<script src="./mutation.js"></script>':'',
        fixture.externalHost?'<script src="./host.js"></script>':'',
        '<script type="module" src="./bootstrap.mjs"></script>',
        '</head><body></body></html>'
      ].join('')});
    }
    inventory.push({name:fixture.name,mode,root,positive:fixture.positive});
  }
  const server=http.createServer((req,res)=>{
    const entry=routes.get(req.url??'');
    if(!entry){res.writeHead(404);res.end('missing');return;}
    res.writeHead(200,{'content-type':entry.type+'; charset=utf-8',
      'cache-control':'no-store','x-content-type-options':'nosniff',
      'content-security-policy':"default-src 'none';script-src 'self'"});
    res.end(entry.body);
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  /** @type {import('puppeteer-core').Browser|null} */
  let browser=null;
  try {
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN||'/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
    });
    /** @param {string} route */
    async function load(route){
      const page=await /** @type {import('puppeteer-core').Browser} */(browser).newPage();
      try {
        await page.goto('http://127.0.0.1:'+address.port+route,{waitUntil:'load'});
        await page.waitForFunction('globalThis._ready===true',{timeout:6500});
        return await page.evaluate(()=>{
          const state=/** @type {typeof globalThis & {
            _importedNativeValue?:string,_seen?:string
          }} */(globalThis);
          return {
            value:state._importedNativeValue,
            seen:state._seen,
            scripts:[...document.head.querySelectorAll('script')].map(x=>x.getAttribute('src'))
          };
        });
      }finally{await page.close();}
    }
    for(const item of inventory){
      const native=await load(item.root+'/native/index.html');
      const emitted=await load(item.root+'/emitted/index.html');
      assert.equal(native.value,'a browser-visible client value preserved after native DOM script insertion');
      if(item.positive)assert.equal(native.seen,'');
      else assert.ok(native.seen?.includes('function inspected()')||
        item.name==='prototype-mutator'&&native.seen?.includes('function inspected()'));
      process.stdout.write('IMPORTED_NATIVE_NODE_BROWSER '+JSON.stringify({
        name:item.name,mode:item.mode,positive:item.positive,
        nativeSourceLength:native.seen?.length,emittedSourceLength:emitted.seen?.length,
        parity:JSON.stringify(native)===JSON.stringify(emitted)
      })+'\n');
      assert.deepEqual(emitted,native,
        'Real Chromium imported factory changed observable source '+item.name+'/'+item.mode);
    }
  }finally{
    if(browser)await browser.close();
    server.close();
    await once(server,'close');
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
