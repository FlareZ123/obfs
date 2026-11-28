'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {transform}=require('esbuild');
const {obfuscateFiles}=require('../src');

/** @typedef {{path:string,sourceType:'module',code:string}} SourceFile */
/** @typedef {{path:string,code:string}} RenderFile */

/**
 * Three aliases point at one closed owner through repeated private tuple indices.
 * The ESM second file separately imports the owner through a named export.
 * No browser-visible host API or unknown dynamic key is renamed.
 *
 * @returns {SourceFile[]}
 */
function graph(){
  return [
    {path:'owner.mjs',sourceType:'module',code:[
      'export const vault={hiddenCount:41,privateDelta:3,checksum:7};',
      'const tuple=[vault,8,vault,13n,vault];',
      'const left=tuple[0];',
      'const middle=tuple[2];',
      'const right=tuple[4];',
      'function privateRead(n){return left.hiddenCount*n+middle.privateDelta+right.checksum;}',
      'export function read(n){return privateRead(n);}'
    ].join('\n')},
    {path:'entry.mjs',sourceType:'module',code:[
      'import {vault,read} from "./owner.mjs";',
      'function calculateNative(n){return (read(n)+vault.hiddenCount)|0;}',
      'export function calculate(n){return calculateNative(n);}'
    ].join('\n')}
  ];
}

/**
 * @param {SourceFile[]} files
 * @returns {RenderFile[]}
 */
function compile(files){
  const outcome=obfuscateFiles(files,{
    mode:'coo',closedWorld:true,seed:'agent6-multituple-real-chrome',
    properties:true,strings:false,identifiers:false
  });
  assert.equal(outcome.crossFile.properties,3,
    'Three private owner data fields must actually be renamed through repeated tuple slots in the closed ESM graph');
  const emitted=outcome.files.map(file=>({path:file.path,code:String(file.code)}));
  assert.doesNotMatch(emitted.map(f=>f.code).join('\n'),/hiddenCount|privateDelta|checksum/u);
  return emitted;
}

/** @param {SourceFile[]} files @returns {Promise<RenderFile[]>} */
async function minify(files){
  return Promise.all(files.map(async file=>({
    path:file.path,
    code:(await transform(file.code,{
      loader:'js',format:'esm',target:'es2022',minify:true,
      legalComments:'none'
    })).code
  })));
}

/** @returns {Promise<void>} */
async function main(){
  const native=graph();
  const variants=/** @type {[string,RenderFile[]][]} */([
    ['native',native],['minified',await minify(native)],
    ['obfuscated',compile(native)]
  ]);
  /** @type {Map<string,{content:string,type:string}>} */
  const routes=new Map([['/index.html',{
    content:'<!doctype html><html><meta charset="utf-8"><title>Multi slot tuple browser proof</title></html>',
    type:'text/html; charset=utf-8'
  }]]);
  for(const [variant,files] of variants)
    for(const file of files)
      routes.set('/'+variant+'/'+file.path,{
        content:file.code,type:'text/javascript; charset=utf-8'
      });
  const server=http.createServer((request,response)=>{
    const file=routes.get(request.url??'');
    if(request.method!=='GET'||!file){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'Content-Type':file.type,
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'"
    });
    response.end(file.content);
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
    const samples=await page.evaluate(async()=>{
      /** @typedef {{calculate:(n:number)=>number}} MathModule */
      const modules=/** @type {MathModule[]} */(await Promise.all([
        import('/native/entry.mjs'),
        import('/minified/entry.mjs'),
        import('/obfuscated/entry.mjs')
      ]));
      let checked=0;
      for(let i=0;i<30000;i++){
        const n=Math.imul(i^0x18e53d1,0x9e3779b1)|0;
        const expected=modules[0].calculate(n);
        if(expected!==modules[1].calculate(n)||expected!==modules[2].calculate(n))
          throw Error('real Chromium multi-slot owner graph mismatch at '+i);
        checked++;
      }
      /** @param {MathModule} module */
      function timed(module){
        let checksum=0;
        const start=performance.now();
        for(let i=0;i<5000000;i++)
          checksum^=module.calculate(Math.imul(i,1664525)|0);
        return {ms:performance.now()-start,checksum};
      }
      for(let warm=0;warm<2;warm++)for(const module of modules)timed(module);
      /** @type {number[][]} */
      const times=[[],[],[]];
      for(let round=0;round<9;round++){
        const order=round%2===0?[0,1,2]:[2,1,0];
        const results=order.map(index=>({index,...timed(modules[index])}));
        if(new Set(results.map(row=>row.checksum)).size!==1)
          throw Error('real Chromium perf benchmark calculated distinct results');
        for(const row of results)times[row.index].push(row.ms);
      }
      return {checked,times};
    });
    assert.equal(samples.checked,30000);
    /** @param {number[]} values */
    const median=values=>{
      const sorted=[...values].sort((a,b)=>a-b);
      return sorted[Math.floor(sorted.length/2)];
    };
    const [nativeMs,minifiedMs,compiledMs]=samples.times.map(median);
    const nativeRatio=compiledMs/nativeMs;
    const minifiedRatio=compiledMs/minifiedMs;
    process.stdout.write('AGENT6_MULTITUPLE_CHROME '+JSON.stringify({
      checked:samples.checked,samplesPerArm:samples.times[0].length,
      nativeMs,minifiedMs,compiledMs,nativeRatio,minifiedRatio,
      note:'Selected closed-graph pure numeric workload, not universal 2.5x proof'
    })+'\n');
    assert.ok(nativeMs>0&&minifiedMs>0&&compiledMs>0,
      'Performance samples must have measurable duration');
    assert.ok(nativeRatio<=2.5&&minifiedRatio<=2.5,
      'Protected work on this exact browser graph must stay within 2.5x');
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(()=>resolve()));
  }
}
if(require.main===module)
  main().catch(error=>{console.error(error);process.exitCode=1;});

module.exports={graph,main};
