'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {recoverObfuscatedStrings}=require('./static-string-recovery');

/** @typedef {{elapsedMs:number,length:number,first:number,last:number,checksum:number}} BrowserResult */
/** @typedef {{units:number,work:number,source:{native:string,fixed:string},entry:string}} Scenario */

/** @param {number[]} values @returns {number} */
function median(values) {
  const sorted=[...values].sort((left,right)=>left-right);
  return sorted[Math.floor(sorted.length/2)];
}

/** @param {string} url @returns {Promise<BrowserResult>} */
async function load(url) {
  const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--incognito','--virtual-time-budget=5000','--dump-dom',url
  ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
  const match=stdout.match(/<pre id="out">(\{[^<]*\})<\/pre>/u);
  assert.ok(match,'Chromium module returned no timing JSON: '+stdout.slice(0,500));
  /** @type {BrowserResult} */
  const data=JSON.parse(match[1]);
  assert.ok(Number.isFinite(data.elapsedMs)&&data.elapsedMs>0);
  return data;
}

/** @param {number} units @param {number} work @returns {Scenario} */
function createScenario(units,work) {
  const motif='A😀Z'+String.fromCharCode(0xD800,0xDC00,0,0xFFFF);
  const literal=motif.repeat(Math.ceil(units/motif.length)).slice(0,units);
  const native='export const payload='+JSON.stringify(literal)+';';
  const output=obfuscateFiles([{path:'target.mjs',sourceType:'module',code:native}],{
    mode:'coo',seed:'fixed-arity-chrome-session/'+units+'/'+work,
    strings:true,identifiers:false,properties:false,experimentalFixedArityStrings:true
  });
  assert.equal(output.files[0].metrics.literals,1,
    'A silent protected-work refusal invalidates the runtime experiment');
  const fixed=String(output.files[0].code);
  const attacker=recoverObfuscatedStrings(fixed,'module');
  assert.equal(attacker.tables,1);
  assert.equal(attacker.literals,1);
  assert.ok(attacker.code.includes(JSON.stringify(literal)));
  const entry=[
    "import {payload} from './target.mjs';",
    'let checksum=0;',
    'for(let index=0;index<'+work+';index++)',
    'checksum=(Math.imul(checksum^payload.length^index,1664525)+1013904223)|0;',
    'const elapsedMs=performance.now()-globalThis.__initial;',
    "document.getElementById('out').textContent=JSON.stringify({",
    'elapsedMs,length:payload.length,first:payload.charCodeAt(0),',
    'last:payload.charCodeAt(payload.length-1),checksum});'
  ].join('');
  return {units,work,source:{native,fixed},entry};
}

/** @returns {Promise<void>} */
async function main() {
  const cases=[createScenario(2049,0),createScenario(52500,0),
    createScenario(52500,100000)];
  const server=http.createServer((request,response)=>{
    const [scenarioKey,variant,file]=(request.url??'').split('/').filter(Boolean);
    const selected=cases.find(item=>item.units+'-'+item.work===scenarioKey);
    if(!selected || (variant!=='native'&&variant!=='fixed')) {
      response.writeHead(404);response.end();return;
    }
    response.setHeader('cache-control','no-store');
    if(file==='page') {
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; script-src 'self'"});
      response.end('<!doctype html><meta charset="utf-8"><pre id="out">pending</pre>'+
        '<script src="start.js"></script>'+
        '<script type="module" src="entry.mjs"></script>');
      return;
    }
    const code=file==='start.js'?
      'globalThis.__initial=performance.now();':
      file==='entry.mjs'?selected.entry:
      file==='target.mjs'?selected.source[variant]:undefined;
    if(code===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(code);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('No TCP listener');
    /** @type {Array<{units:number,work:number,nativeMedianMs:number,fixedMedianMs:number,ratio:number,sourceBytes:{native:number,fixed:number},samples:number}>} */
    const findings=[];
    for(const scenario of cases) {
      /** @type {Record<'native'|'fixed',number[]>} */
      const times={native:[],fixed:[]};
      /** @type {Pick<BrowserResult,'length'|'first'|'last'|'checksum'>|null} */
      let expected=null;
      for(let round=0;round<9;round++) {
        const order=round%2===0?/** @type {const} */ (['native','fixed']):
          /** @type {const} */ (['fixed','native']);
        for(const variant of order) {
          const url='http://127.0.0.1:'+address.port+'/'+scenario.units+'-'+scenario.work+
            '/'+variant+'/page';
          const report=await load(url);
          const actual={length:report.length,first:report.first,
            last:report.last,checksum:report.checksum};
          if(expected===null)expected=actual;
          assert.deepEqual(actual,expected,variant+' changed native Chrome result');
          if(round>=3)times[variant].push(report.elapsedMs);
        }
      }
      const nativeMedianMs=median(times.native);
      const fixedMedianMs=median(times.fixed);
      findings.push({units:scenario.units,work:scenario.work,
        nativeMedianMs,fixedMedianMs,ratio:fixedMedianMs/nativeMedianMs,
        sourceBytes:{native:scenario.source.native.length,
          fixed:scenario.source.fixed.length},samples:times.native.length});
    }
    process.stdout.write(JSON.stringify({platform:'real Chromium under CSP',
      measurement:'Page timer starts in separate first classic script and ends in entry ESM after target evaluation; HTTP fetch/ESM parse/decoder included, Chromium process launch excluded',
      warning:'Nine interleaved page pairs per case, first three pairs discarded; does not imply 2.5x bound for arbitrary client hardware or sessions',
      findings},null,2)+'\n');
  }finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
