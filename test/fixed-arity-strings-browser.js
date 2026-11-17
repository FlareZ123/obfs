'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {recoverObfuscatedStrings}=require('../sims/static-string-recovery');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * @param {string} url
 * @returns {Promise<{length:number,first:number,last:number,checksum:number}|null>}
 */
async function browserOutput(url) {
  const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
  ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024,windowsHide:true});
  const match=stdout.match(/<pre id="out">(\{[^<]*\})<\/pre>/u);
  return match?JSON.parse(match[1]):null;
}

/** @returns {Promise<void>} */
async function main() {
  const literal='A😀Z'+String.fromCharCode(0xD800,0xDC00,0,0xFFFF)+
    'Ω'.repeat(8192)+'END';
  const target='export const payload='+JSON.stringify(literal)+';';
  const mutator="Object.defineProperty(Array.prototype,'0',"+
    "{configurable:true,get(){return 0;},set(v){}});";
  const entry=[
    "import './mutator.mjs';",
    "import {payload} from './target.mjs';",
    "let checksum=0;for(let i=0;i<payload.length;i++)",
    "checksum=(Math.imul(checksum,33)^payload.charCodeAt(i))|0;",
    "document.getElementById('out').textContent=JSON.stringify({",
    "length:payload.length,first:payload.charCodeAt(0),",
    "last:payload.charCodeAt(payload.length-1),checksum});"
  ].join('');
  /** @param {boolean} fixedArity @returns {string} */
  function emit(fixedArity) {
    const out=obfuscateFiles([{path:'target.mjs',sourceType:'module',code:target}],{
      mode:'coo',seed:'fixed-arity-chromium-'+fixedArity,strings:true,
      properties:false,identifiers:false,experimentalFixedArityStrings:fixedArity
    });
    assert.equal(out.files[0].metrics.literals,1);
    return String(out.files[0].code);
  }
  const legacy=emit(false),fixed=emit(true);
  const cloned=recoverObfuscatedStrings(fixed,'module');
  assert.equal(cloned.tables,1);
  assert.equal(cloned.literals,1);
  assert.ok(cloned.code.includes(JSON.stringify(literal)));
  const expectedClean=obfuscateFiles([
    {path:'entry.mjs',sourceType:'module',code:entry},
    {path:'mutator.mjs',sourceType:'module',code:'export const safe=1;'},
    {path:'target.mjs',sourceType:'module',code:target}
  ],{mode:'coo',strings:true,properties:false,identifiers:false,
    experimentalFixedArityStrings:true,seed:'fixed-chromium-clean'});
  assert.equal(expectedClean.files[2].metrics.literals,1);
  const refused=obfuscateFiles([
    {path:'entry.mjs',sourceType:'module',code:entry},
    {path:'mutator.mjs',sourceType:'module',code:mutator},
    {path:'target.mjs',sourceType:'module',code:target}
  ],{mode:'coo',strings:true,properties:false,identifiers:false,
    experimentalFixedArityStrings:true,seed:'fixed-chromium-declared-mutator'});
  assert.equal(refused.files[2].metrics.literals,0,
    'The whole-source-graph guard remains conservative under native prototype mutation');

  const files=new Map([
    ['entry.mjs',entry],
    ['target-original.mjs',target],
    ['target-fixed.mjs',fixed],
    ['target-legacy.mjs',legacy],
    ['target-recovered.mjs',cloned.code]
  ]);
  const server=http.createServer((request,response)=>{
    const parts=(request.url??'').split('/').filter(Boolean);
    const environment=parts[0],variant=parts[1],file=parts[2];
    if(!['clean','poisoned'].includes(environment)||
       !['original','fixed','recovered','legacy'].includes(variant)){
      response.writeHead(404);response.end();return;
    }
    if(file==='page') {
      response.writeHead(200,{'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; script-src 'self'",
        'cache-control':'no-store'});
      response.end('<!doctype html><meta charset="utf-8"><pre id="out">pending</pre>'+
        '<script type="module" src="entry.mjs"></script>');
      return;
    }
    const body=file==='mutator.mjs'?
      environment==='poisoned'?mutator:'export const safe=1;':
      file==='entry.mjs'?entry:
      file==='target.mjs'?files.get('target-'+variant+'.mjs'):undefined;
    if(body===undefined){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing HTTP port');
    const base='http://127.0.0.1:'+address.port;
    /** @type {Record<string,Record<string,Awaited<ReturnType<typeof browserOutput>>>>} */
    const observations={};
    for(const environment of ['clean','poisoned']) {
      observations[environment]={};
      for(const variant of ['original','fixed','recovered','legacy']) {
        observations[environment][variant]=await browserOutput(
          base+'/'+environment+'/'+variant+'/page');
      }
      assert.ok(observations[environment].original,
        environment+' native ESM did not render');
      assert.deepEqual(observations[environment].fixed,
        observations[environment].original,
        environment+' actual delivered fixed-arity ESM changed native behavior');
      assert.deepEqual(observations[environment].recovered,
        observations[environment].original,
        environment+' static reconstruction diverged in real Chromium');
    }
    assert.deepEqual(observations.clean.legacy,observations.clean.original);
    assert.notDeepEqual(observations.poisoned.legacy,observations.poisoned.original,
      'Unpatched spread decoder should still corrupt a poisoned Array index');
    process.stdout.write(JSON.stringify({chromium:'real',literalUnits:literal.length,
      wholeGraphGuardDeclines:refused.files[2].metrics.literals===0,
      fixedEncodedUses:1,staticallyRecoveredUses:cloned.literals,
      observations})+'\n');
  }finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
