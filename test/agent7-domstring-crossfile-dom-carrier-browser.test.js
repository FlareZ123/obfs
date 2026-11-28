'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {test}=require('node:test');
const {once}=require('node:events');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

const functionSource='function inspect(){const privateSourceMarker=17;return privateSourceMarker;}\n';
/** @type {{id:string,producer:string,consumerPrefix:string}[]} */
const cases=[
  {
    id:'exported-dom-element',
    producer:'export const target=document.getElementById("target");',
    consumerPrefix:'import {target} from "./target.mjs";\n'
  },
  {
    id:'exported-dom-factory',
    producer:'export function makeTarget(){return document.getElementById("target");}',
    consumerPrefix:'import {makeTarget} from "./target.mjs";\n'+
      'const target=makeTarget();\n'
  },
  {
    id:'exported-dom-element-aliased',
    producer:'const root=document.body;export const target=root;',
    consumerPrefix:'import {target as receiver} from "./target.mjs";\n'+
      'const target=receiver;\n'
  }
];

/** @param {typeof cases[number]} fixture @returns {string} */
const consumer=fixture=>fixture.consumerPrefix+functionSource+
  'target.setAttribute("data-probe",inspect);\n'+
  'globalThis._seen=target.getAttribute("data-probe");\n'+
  'globalThis._answer=inspect();\n';

test('cross-file DOM carriers must conservatively reach source-observer analysis',()=>{
  for(const fixture of cases){
    const code=consumer(fixture);
    assert.equal(observesFunctionSource(parse(code,'module')),true,
      fixture.id+' imported DOM carrier may be a native DOMString source observer');
  }
});

test('real HTTP Chrome observes byte-identical function source across imported DOM carriers',{
  skip:process.platform!=='linux',
  timeout:90000
},async()=>{
  /** @type {Map<string,{mime:string,content:string}>} */
  const routes=new Map();
  /** @type {{id:string,mode:string,bindings:number,base:string}[]} */
  const inventory=[];
  for(const fixture of cases){
    const input=[
      {path:'target.mjs',sourceType:/** @type {const} */('module'),code:fixture.producer},
      {path:'consumer.mjs',sourceType:/** @type {const} */('module'),code:consumer(fixture)}
    ];
    for(const mode of /** @type {const} */(['coo','sco','sno'])){
      const emitted=obfuscateFiles(input,{
        mode,closedWorld:true,seed:'agent7-dom-carrier-'+fixture.id,
        identifiers:true,properties:false,strings:false
      });
      const transformed=new Map(emitted.files.map(item=>[item.path,String(item.code)]));
      const id=fixture.id+'/'+mode;
      for(const variant of ['native','emitted']){
        const stem='/'+id+'/'+variant;
        routes.set(stem+'/target.mjs',{
          mime:'text/javascript',
          content:variant==='native'?fixture.producer:
            /** @type {string} */(transformed.get('target.mjs'))
        });
        routes.set(stem+'/consumer.mjs',{
          mime:'text/javascript',
          content:variant==='native'?consumer(fixture):
            /** @type {string} */(transformed.get('consumer.mjs'))
        });
        routes.set(stem+'/index.html',{
          mime:'text/html',
          content:'<!doctype html><html><body><main id="target"></main>'+
            '<script type="module" src="./consumer.mjs"></script></body></html>'
        });
      }
      inventory.push({id:fixture.id,mode,base:'/'+id,
        bindings:emitted.files.reduce((sum,item)=>sum+item.metrics.bindings,0)});
    }
  }
  const server=http.createServer((req,res)=>{
    const content=routes.get(req.url??'');
    if(!content){res.writeHead(404);res.end('missing');return;}
    res.writeHead(200,{
      'content-type':content.mime+'; charset=utf-8',
      'x-content-type-options':'nosniff',
      'content-security-policy':"default-src 'none';script-src 'self'",
      'cache-control':'no-store'
    });
    res.end(content.content);
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  /** @type {import('puppeteer-core').Browser|null} */
  let browser=null;
  try{
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN || '/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
    });
    /** @param {string} path */
    async function load(path){
      const page=await /** @type {import('puppeteer-core').Browser} */(browser).newPage();
      try{
        await page.goto('http://127.0.0.1:'+address.port+path,
          {waitUntil:'load'});
        await page.waitForFunction('globalThis._answer===17',{timeout:5000});
        return await page.evaluate(()=>({
          answer:globalThis._answer,
          seen:globalThis._seen
        }));
      }finally{await page.close();}
    }
    /** @type {string[]} */
    const misses=[];
    for(const fixture of inventory){
      const native=await load(fixture.base+'/native/index.html');
      const emitted=await load(fixture.base+'/emitted/index.html');
      const sourceParity=native.seen===emitted.seen;
      const answerParity=native.answer===emitted.answer;
      console.log(JSON.stringify({
        id:fixture.id,mode:fixture.mode,bindings:fixture.bindings,
        nativeLength:typeof native.seen==='string'?native.seen.length:null,
        emittedLength:typeof emitted.seen==='string'?emitted.seen.length:null,
        sourceParity,answerParity
      }));
      assert.equal(native.answer,17,fixture.id+' native control');
      assert.equal(emitted.answer,17,fixture.id+' emitted computation');
      assert.equal(typeof native.seen,'string',fixture.id+' actual DOMString');
      if(!sourceParity)misses.push(fixture.mode+' '+fixture.id+' bindings='+fixture.bindings);
    }
    assert.deepEqual(misses,[],'cross-file DOMString source bytes must be preserved');
  }finally{
    if(browser)await browser.close();
    server.close();
    await once(server,'close');
  }
});
