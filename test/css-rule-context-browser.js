'use strict';

const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {createScoHandler}=require('../src');

/**
 * The source-aware CSS preflight must agree with a real browser that a
 * CSS custom-property value containing an at-keyword is a declaration
 * value. It must not become a network stylesheet import or an extra
 * CSSOM rule. The generated SCO output uses the original CSS bytes.
 * @returns {Promise<void>}
 */
async function main() {
  const css='.widget{--payload: @import url(data:text/css,canary);color:rgb(4,5,6)}';
  const files=[
    {path:'index.html',sourceType:'asset',
      code:'<!doctype html><link rel="stylesheet" href="./style.css"><div class="widget" id="target">ok</div><output id="out"></output><script type="module" src="./boot.mjs"></script>'},
    {path:'style.css',sourceType:'asset',code:css},
    {path:'boot.mjs',sourceType:'module',code:[
      'const target=document.getElementById("target");',
      'const sheet=document.styleSheets[0];',
      'const value=getComputedStyle(target).getPropertyValue("--payload").trim();',
      'const color=getComputedStyle(target).color;',
      'document.getElementById("out").textContent=(value.startsWith("@import")?"inert":"missing")+"|"+sheet.cssRules.length+"|"+color;'
    ].join('\n')}
  ];
  const server=createServer(createScoHandler(files,{publicPaths:files.map(f=>f.path)}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  try{
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const url='http://127.0.0.1:'+address.port+'/obfs/index.html';
    const browser=process.env.CHROMIUM_BIN??'chromium';
    const {stdout}=await promisify(execFile)(browser,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=7000','--dump-dom',url
    ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
    const observed=stdout.match(/<output id="out">([^<]+)<\/output>/u)?.[1];
    assert.equal(observed,'inert|1|rgb(4, 5, 6)',
      'Browser CSS custom-property rule-context parity: '+stdout.slice(0,1200));
    process.stdout.write('Chromium parsed inert CSS custom-property at-keyword: '+observed+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
