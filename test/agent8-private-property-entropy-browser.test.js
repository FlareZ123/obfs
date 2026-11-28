'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');
const {neutralizePublishedProperties}=require('../sims/public-property-neutralizer');

/** @typedef {{path:string,sourceType:'module',code:string}} File */

/**
 * Public ESM owner whose fields are directly read by a static importer.
 * A browser-installed console sink observes the serialized results entirely
 * outside compiler inputs; it never receives the private owner object.
 *
 * @type {File[]}
 */
const source=[
  {path:'state.mjs',sourceType:'module',
    code:'export const state={secretField:41,otherField:13,sessionMark:7};'},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {state} from "./state.mjs";',
    'console.log(JSON.stringify([0,(0*state.secretField+state.otherField-state.sessionMark)|0]));',
    'console.log(JSON.stringify([1,(1*state.secretField+state.otherField-state.sessionMark)|0]));',
    'console.log(JSON.stringify([-1,(-1*state.secretField+state.otherField-state.sessionMark)|0]));',
    'console.log(JSON.stringify([123,(123*state.secretField+state.otherField-state.sessionMark)|0]));',
    'console.log(JSON.stringify([10000,(10000*state.secretField+state.otherField-state.sessionMark)|0]));'
  ].join('\n')}
];

test('private property entropy remains seedlessly cloneable in strict-CSP real Chromium',{
  skip:process.platform!=='linux',timeout:70000
},async()=>{
  const emitted=obfuscateFiles(source,{
    mode:'coo',closedWorld:true,
    seed:'PUBLIC_BUILD_SEED_20261128',
    properties:true,strings:false,identifiers:false,
    experimentalEntropyPropertyNames:true
  });
  assert.equal(emitted.crossFile.objects,1,
    'The browser attack requires an actually rewritten owner');
  assert.equal(emitted.crossFile.properties,3);
  /** @type {File[]} */
  const published=emitted.files.map(f=>({
    path:f.path,sourceType:'module',code:/** @type {string} */(f.code)
  }));
  const attacked=neutralizePublishedProperties(published);
  assert.equal(attacked.replacedTokens,3);
  assert.ok(attacked.renamedOccurrences>=6);
  const assets=new Map([['/index.html','<!doctype html><title>source-only field clone</title>']]);
  for(const [prefix,files] of [
    ['native',source],['published',published],['attacked',attacked.files]
  ]){
    for(const file of files)assets.set('/'+prefix+'/'+file.path,file.code);
  }
  // A CSP check from Puppeteer's evaluation context can be privileged and
  // pass despite ordinary scripts being blocked. Fetch this regular ESM.
  assets.set('/csp-probe.mjs',
    'export let blocked=false;try{(0,eval)("1+1");}catch(error){blocked=true;}');
  const strictCsp="default-src 'none'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'";
  let scriptGets=0;
  const server=http.createServer((req,res)=>{
    const location=req.url??'';
    const body=assets.get(location);
    if(req.method!=='GET'||body===undefined){
      res.writeHead(404).end();return;
    }
    if(location.endsWith('.mjs'))scriptGets++;
    res.writeHead(200,{
      'Content-Type':location.endsWith('.mjs')?
        'text/javascript; charset=utf-8':'text/html; charset=utf-8',
      'Content-Security-Policy':strictCsp,
      'X-Content-Type-Options':'nosniff',
      'Cache-Control':'no-store'
    });
    res.end(body);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  let listening=false;
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(true));
    });
    listening=true;
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,
      args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    const page=await browser.newPage();
    await page.goto('http://127.0.0.1:'+address.port+'/index.html',{
      waitUntil:'domcontentloaded',timeout:60000
    });
    const report=await page.evaluate(async()=>{
      const root=/** @type {any} */(globalThis);
      const probe='/csp-probe.mjs';
      const blocked=(await import(probe)).blocked;
      /** @type {{label:string,trace:string[]}[]} */
      const rows=[];
      for(const label of ['native','published','attacked']){
        root.__logTrace=[];
        const savedConsole=console.log;
        try{
          console.log=(...values)=>root.__logTrace.push(values.map(String).join(' '));
          const modulePath='/'+label+'/entry.mjs';
          await import(modulePath);
        }finally{
          console.log=savedConsole;
        }
        rows.push({label,trace:root.__logTrace});
      }
      return {blocked,rows};
    });
    assert.equal(report.blocked,true,
      'Actual fetched ESM must be blocked from evaluating generated strings');
    const expected=[0,1,-1,123,10000].map(n=>
      JSON.stringify([n,(41*n+13-7)|0]));
    assert.deepEqual(report.rows.map(item=>item.label),
      ['native','published','attacked']);
    for(const row of report.rows){
      assert.deepEqual(row.trace,expected,
        row.label+': Browser callback trace diverged from the original');
    }
    assert.equal(scriptGets,7,
      'All three original/published/reconstructed 2-module graphs and CSP probe must load');
    process.stdout.write('PRIVATE_PROPERTY_ENTROPY_BROWSER_SEEDLESS_CLONE '+
      JSON.stringify({
        browser:await browser.version(),servedEsmRequests:scriptGets,
        strictCsp,evalBlocked:true,
        originalPropertiesProtected:emitted.crossFile.properties,
        seedlessNeutralized:attacked.replacedTokens,
        callbackObservationsPerGraph:expected.length,
        actualOriginalPublishedCloneEqual:true,
        attackerInput:'public source only, no compiler seed or original code',
        limitation:'finite static field graph and external console sink'
      })+'\n');
  }finally{
    try{if(browser)await browser.close();}
    finally{
      if(listening)await new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve(true)));
      else server.close();
    }
  }
});
