'use strict';

const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

/**
 * Serve a real CSS import to an unmodified browser independently of the
 * compiler, and compare ordinary data: resolution to an escaped leading
 * U+0001 CSS string. A matching computed style validates URL normalization.
 * @returns {Promise<void>}
 */
async function main(){
  const data='data:text/css;base64,'+
    Buffer.from('body{color:rgb(7,8,9)}').toString('base64');
  const plain='@import "'+data+'";';
  const hidden=String.raw`@import "\1 `+data+String.raw`";`;
  const html=kind=>'<!doctype html><link rel="stylesheet" href="/'+kind+'.css">'+
    '<body><pre id="out">pending</pre><script src="/boot.js"></script></body>';
  const boot='document.getElementById("out").textContent='+
    'getComputedStyle(document.body).color+"|"+document.styleSheets[0].cssRules[0].type;';
  const server=createServer((req,res)=>{
    const url=req.url??'/';
    if(url==='/boot.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(boot);return;}
    if(url==='/plain.css'||url==='/hidden.css'){
      res.writeHead(200,{'content-type':'text/css'});
      res.end(url==='/plain.css'?plain:hidden);return;
    }
    res.writeHead(200,{'content-type':'text/html'});
    res.end(html(url==='/hidden.html'?'hidden':'plain'));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  try{
    const address=server.address();
    assert.ok(address && typeof address==='object');
    const browser=process.env.CHROMIUM_BIN??'chromium';
    /** @type {string[]} */
    const observations=[];
    for(const kind of ['plain','hidden']) {
      const {stdout}=await promisify(execFile)(browser,[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=7000','--dump-dom',
        'http://127.0.0.1:'+address.port+'/'+kind+'.html'
      ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
      const observed=stdout.match(/<pre id="out">([^<]+)<\/pre>/u)?.[1];
      assert.equal(observed,'rgb(7, 8, 9)|3',kind+': '+stdout.slice(0,1200));
      observations.push(kind+':'+observed);
    }
    process.stdout.write('Chromium data stylesheet URL normalization: '+observations.join(' / ')+'\n');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
