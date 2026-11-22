'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {transform}=require('esbuild');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} File */
/** @typedef {{path:string,code:string}} Output */

/**
 * Native ESM owner values are immutable, source-ordered primitive constants.
 * The reflective graph is an equally scoped negative owner-use control.
 * @param {'named'|'default'|'reflective'} kind
 * @returns {File[]}
 */
function graph(kind) {
  const defaulted=kind==='default';
  const state='const seedValue=17;'+
    (defaulted?'export default ':'export const state=')+
    '{secretField:seedValue,otherField:5};';
  const imported=defaulted?
    'import state from "./state.mjs";':
    'import {state} from "./state.mjs";';
  const entry=imported+(kind==='reflective'?
    'export function run(x){return [Object.keys(state),state.secretField+x];}':
    'export function run(x){return (state.secretField+x)^state.otherField;}');
  return [
    {path:'state.mjs',sourceType:'module',code:state},
    {path:'entry.mjs',sourceType:'module',code:entry}
  ];
}

/**
 * @param {File[]} files
 * @param {boolean} reflective
 * @returns {Output[]}
 */
function compile(files,reflective) {
  const result=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'browser-source-ordered-primitive-value',
    properties:true,identifiers:false,strings:false
  });
  assert.equal(result.crossFile.properties,reflective?0:2);
  assert.equal(result.crossFile.objects,reflective?0:1);
  const output=result.files.map(file=>({path:file.path,code:String(file.code)}));
  const owner=output.find(file=>file.path==='state.mjs');
  assert.ok(owner);
  if(reflective)assert.match(owner.code,/secretField|otherField/u);
  else assert.doesNotMatch(owner.code,/secretField|otherField/u);
  return output;
}

/** @param {File[]} files @returns {Promise<Output[]>} */
async function minify(files) {
  const result=await Promise.all(files.map(async file=>({
    path:file.path,
    code:(await transform(file.code,{
      loader:'js',format:'esm',target:'es2022',
      minify:true,legalComments:'none'
    })).code
  })));
  assert.ok(result.some(file=>file.code.includes('secretField')));
  return result;
}

/** @returns {Promise<void>} */
async function main() {
  /** @type {Map<string,{content:string,type:string}>} */
  const routes=new Map([['/index.html',{
    content:'<!doctype html><html lang="en"><meta charset="utf-8"><title>Primitive ESM owner proof</title></html>',
    type:'text/html; charset=utf-8'
  }]]);
  for(const kind of /** @type {const} */(['named','default','reflective'])) {
    const native=graph(kind);
    const variants=/** @type {[string,Output[]][]} */ ([
      ['native',native],['minified',await minify(native)],
      ['compiled',compile(native,kind==='reflective')]
    ]);
    for(const [variant,files] of variants)
      for(const file of files)
        routes.set('/'+kind+'/'+variant+'/'+file.path,{
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
  try {
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
    const observed=await page.evaluate(async()=>{
      /** @typedef {{run:(x:number)=>number}} MathModule */
      /** @typedef {{run:(x:number)=>[string[],number]}} ReflectModule */
      /** @param {string} kind @param {string} variant */
      const load=(kind,variant)=>import('/'+kind+'/'+variant+'/entry.mjs');
      const named=/** @type {MathModule[]} */(await Promise.all([
        load('named','native'),load('named','minified'),load('named','compiled')
      ]));
      const defaulted=/** @type {MathModule[]} */(await Promise.all([
        load('default','native'),load('default','minified'),load('default','compiled')
      ]));
      const reflected=/** @type {ReflectModule[]} */(await Promise.all([
        load('reflective','native'),load('reflective','minified'),load('reflective','compiled')
      ]));
      const keys='["secretField","otherField"]';
      let heldout=0;
      for(let i=0;i<100000;i++){
        const x=Math.imul(i^0x3dfad29,0x9e3779b1)|0;
        for(const modules of [named,defaulted]) {
          const original=modules[0].run(x);
          if(!Object.is(original,modules[1].run(x))||
              !Object.is(original,modules[2].run(x)))
            throw Error('Primitive-value ESM differential mismatch at '+i);
        }
        const r=reflected.map(module=>module.run(x));
        if(JSON.stringify(r[0])!==JSON.stringify(r[1])||
            JSON.stringify(r[0])!==JSON.stringify(r[2])||
            JSON.stringify(r[0][0])!==keys)
          throw Error('Reflective owner unexpectedly renamed at '+i);
        heldout++;
      }
      /** @param {MathModule} module @returns {{ms:number,sum:number}} */
      function timed(module) {
        let sum=0;
        const start=performance.now();
        for(let i=0;i<500000;i++)
          sum^=module.run(Math.imul(i,1664525)|0);
        return {ms:performance.now()-start,sum};
      }
      for(let warm=0;warm<3;warm++){
        timed(named[0]);timed(named[1]);timed(named[2]);
      }
      /** @type {number[]} */ const originalMs=[];
      /** @type {number[]} */ const minifiedMs=[];
      /** @type {number[]} */ const compiledMs=[];
      for(let round=0;round<9;round++){
        const order=round%2===0?[0,1,2]:[2,1,0];
        const sample=order.map(i=>({index:i,...timed(named[i])}));
        if(new Set(sample.map(item=>item.sum)).size!==1)
          throw Error('Browser performance samples do not compute the same result');
        for(const item of sample){
          if(item.index===0)originalMs.push(item.ms);
          if(item.index===1)minifiedMs.push(item.ms);
          if(item.index===2)compiledMs.push(item.ms);
        }
      }
      return {heldout,originalMs,minifiedMs,compiledMs,reflectedKeys:keys};
    });
    assert.equal(observed.heldout,100000);
    /** @param {number[]} values */
    const median=values=>{
      const sorted=[...values].sort((a,b)=>a-b);
      return sorted[Math.floor(sorted.length/2)];
    };
    const native=median(observed.originalMs);
    const minified=median(observed.minifiedMs);
    const compiled=median(observed.compiledMs);
    assert.ok(native>0&&minified>0&&compiled>0);
    const ratioNative=compiled/native;
    const ratioMinified=compiled/minified;
    assert.ok(ratioNative<=2.5&&ratioMinified<=2.5,
      'Strict runtime budget on repeated primitive-value owner work');
    process.stdout.write('CROSS_PRIMITIVE_VALUE_CHROME '+JSON.stringify({
      heldout:observed.heldout,reflectedKeys:observed.reflectedKeys,
      samples:observed.originalMs.length,
      nativeMs:native,minifiedMs:minified,compiledMs:compiled,
      ratioNative,ratioMinified
    })+'\n');
  }finally {
    await browser?.close();
    await new Promise(resolve=>server.close(()=>resolve()));
  }
}

if(require.main===module)
  main().catch(error=>{console.error(error);process.exitCode=1;});

module.exports={main,graph};
