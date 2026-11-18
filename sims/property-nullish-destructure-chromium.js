'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');
const {specimens}=require('./property-nullish-destructure-error-attack');

const exec=promisify(execFile);

/** @returns {Promise<void>} */
async function run() {
  /** @type {{name:string,native:string,generated:string}[]} */
  const cases=[];
  for(const specimen of specimens) {
    const result=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:specimen.source}],{
      mode:'coo',strings:false,identifiers:false,seed:'nullish-pattern-browser'
    }).files[0];
    assert.equal(result.metrics.properties,0,'Browser nullish error operand should be retained');
    cases.push({name:specimen.name,native:specimen.source,
      generated:/** @type {string} */ (result.code)});
  }
  const good='const root={secretAlpha:23};module.exports=root.secretAlpha;';
  const transformed=obfuscateFiles([{path:'entry.cjs',sourceType:'commonjs',code:good}],{
    mode:'coo',strings:false,identifiers:false,seed:'nullish-browser-positive'
  }).files[0];
  assert.equal(transformed.metrics.properties,1,
    'A separate safe own-field read must still be renamed in the browser control');
  cases.push({name:'safe-private-positive',native:good,
    generated:/** @type {string} */ (transformed.code)});
  const client=[
    'const cases='+JSON.stringify(cases)+';',
    'const exec=(code)=>{const module={exports:null};',
    'new Function("module",code)(module);return String(module.exports);};',
    'try{',
    'const outputs=cases.map(item=>({name:item.name,',
    'native:exec(item.native),generated:exec(item.generated)}));',
    'const pre=document.createElement("pre");pre.id="result";',
    'pre.textContent=btoa(JSON.stringify(outputs));document.body.append(pre);',
    '}catch(error){const pre=document.createElement("pre");',
    'pre.id="failure";pre.textContent=String(error.stack||error);document.body.append(pre);}'
  ].join('\n');
  const html='<!doctype html><html><body><script>'+client+'</script></body></html>';
  const server=http.createServer((req,res)=>{
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end(html);
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const addr=server.address();
    if(!addr || typeof addr==='string')throw new Error('Missing HTTP socket port');
    const url='http://127.0.0.1:'+addr.port+'/';
    const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=12000','--dump-dom',url
    ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
    const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
    assert.ok(encoded,'Chromium failed to execute nullish error differential: '+stdout.slice(0,1500));
    const results=/** @type {{name:string,native:string,generated:string}[]} */(
      JSON.parse(Buffer.from(encoded,'base64').toString('utf8')));
    assert.equal(results.length,cases.length);
    for(const item of results) {
      assert.equal(item.generated,item.native,'Real Chromium source-parity '+item.name);
      if(item.name!=='safe-private-positive')assert.match(item.native,/root\.secretAlpha/);
    }
    assert.equal(results[results.length-1].generated,'23');
    process.stdout.write('NULLISH_PATTERN_CHROMIUM '+JSON.stringify({
      cases:results.length,unsafePreserved:specimens.length,safeOwnKeyRenamed:1,
      allOutputsMatch:true,chromium:process.env.CHROMIUM_BIN??'google-chrome'
    })+'\n');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run};
