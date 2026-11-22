'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {transform}=require('esbuild');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} File */
/** @typedef {{path:string,code:string}} Output */

/**
 * One genuine hashed-own-key owner and one reflective negative control.
 * The literal BigInt unary is deliberately evaluated only at module init.
 * @param {boolean} reflective
 * @returns {File[]}
 */
function graph(reflective) {
  const entry=reflective?
    'export function run(x){return [Object.keys(state),state.secretField===-17n,x];}':
    'export function run(x){return state.secretField===-17n?'+
      '(Math.imul(x,31)^state.otherField):0;}';
  return [
    {path:'state.mjs',sourceType:'module',
      code:'export const state={secretField:-17n,otherField:5};'},
    {path:'entry.mjs',sourceType:'module',
      code:'import {state} from "./state.mjs";'+entry}
  ];
}

/**
 * @param {File[]} files
 * @param {boolean} reflective
 * @returns {Output[]}
 */
function compile(files,reflective) {
  const result=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'unary-bigint-browser',
    properties:true,strings:false,identifiers:false
  });
  assert.equal(result.crossFile.properties,reflective?0:2);
  assert.equal(result.crossFile.objects,reflective?0:1);
  const output=result.files.map(file=>({path:file.path,code:String(file.code)}));
  const state=output.find(file=>file.path==='state.mjs');
  assert.ok(state);
  if(reflective)assert.match(state.code,/secretField|otherField/u);
  else assert.doesNotMatch(state.code,/secretField|otherField/u);
  return output;
}

/** @param {File[]} files @returns {Promise<Output[]>} */
async function minify(files) {
  return Promise.all(files.map(async file=>({
    path:file.path,
    code:(await transform(file.code,{
      loader:'js',format:'esm',target:'es2022',
      minify:true,legalComments:'none'
    })).code
  })));
}

/** @returns {Promise<void>} */
async function main() {
  /** @type {Map<string,{content:string,type:string}>} */
  const routes=new Map([['/index.html',{
    content:'<!doctype html><html><meta charset="utf-8"><title>BigInt ESM proof</title></html>',
    type:'text/html; charset=utf-8'
  }]]);
  for(const [label,reflective] of /** @type {[string,boolean][]} */([
    ['plain',false],['reflective',true]
  ])){
    const native=graph(reflective);
    const variants=/** @type {[string,Output[]][]} */([
      ['native',native],['minified',await minify(native)],
      ['compiled',compile(native,reflective)]
    ]);
    for(const [variant,files] of variants)
      for(const file of files)
        routes.set('/'+label+'/'+variant+'/'+file.path,{
          content:file.code,type:'text/javascript; charset=utf-8'
        });
  }
  const server=http.createServer((request,response)=>{
    const route=routes.get(request.url??'');
    if(request.method!=='GET'||!route){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'Content-Type':route.type,
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'"
    });
    response.end(route.content);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve());
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+address.port+'/index.html',{
      waitUntil:'domcontentloaded',timeout:45000
    });
    const result=await page.evaluate(async()=>{
      /** @typedef {{run:(x:number)=>number}} MathModule */
      /** @typedef {{run:(x:number)=>[string[],boolean,number]}} ReflectModule */
      /** @param {string} section @param {string} variant */
      const load=(section,variant)=>import('/'+section+'/'+variant+'/entry.mjs');
      const plain=/** @type {MathModule[]} */(await Promise.all([
        load('plain','native'),load('plain','minified'),load('plain','compiled')
      ]));
      const reflective=/** @type {ReflectModule[]} */(await Promise.all([
        load('reflective','native'),load('reflective','minified'),
        load('reflective','compiled')
      ]));
      const referenceKeys='["secretField","otherField"]';
      let heldout=0;
      for(let i=0;i<100000;i++){
        const x=Math.imul(i^0x3dfad29,0x9e3779b1)|0;
        const values=plain.map(module=>module.run(x));
        if(new Set(values).size!==1)
          throw Error('Unary BigInt private-owner mismatch at '+i);
        const keys=reflective.map(module=>module.run(x));
        if(keys.some(entry=>JSON.stringify(entry[0])!==referenceKeys ||
            entry[1]!==true || entry[2]!==x))
          throw Error('Reflective BigInt owner was unexpectedly rewritten');
        heldout++;
      }
      /** @param {MathModule} module @returns {{ms:number,sum:number}} */
      function timed(module){
        let sum=0;
        const start=performance.now();
        for(let i=0;i<1000000;i++)
          sum^=module.run(Math.imul(i,1664525)|0);
        return {ms:performance.now()-start,sum};
      }
      for(let i=0;i<3;i++)for(const module of plain)timed(module);
      /** @type {number[][]} */
      const samples=[[],[],[]];
      for(let round=0;round<9;round++){
        const order=round%2?[2,1,0]:[0,1,2];
        const values=order.map(index=>({index,...timed(plain[index])}));
        if(new Set(values.map(item=>item.sum)).size!==1)
          throw Error('Timed functions disagree');
        for(const item of values)samples[item.index].push(item.ms);
      }
      return {heldout,referenceKeys,samples};
    });
    assert.equal(result.heldout,100000);
    /** @param {number[]} samples */
    const median=samples=>{
      const sorted=[...samples].sort((a,b)=>a-b);
      return sorted[Math.floor(sorted.length/2)];
    };
    const nativeMs=median(result.samples[0]);
    const minifiedMs=median(result.samples[1]);
    const emittedMs=median(result.samples[2]);
    assert.ok(nativeMs>0&&minifiedMs>0&&emittedMs>0);
    const ratioNative=emittedMs/nativeMs;
    const ratioMinified=emittedMs/minifiedMs;
    assert.ok(ratioNative<=2.5&&ratioMinified<=2.5,
      'Repeated hot browser work must meet both 2.5x sample budgets');
    console.log('UNARY_BIGINT_CHROME '+JSON.stringify({
      heldout:result.heldout,reflectiveKeys:result.referenceKeys,
      samples:result.samples[0].length,nativeMs,minifiedMs,emittedMs,
      ratioNative,ratioMinified
    }));
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(()=>resolve()));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});

module.exports={main,graph};
