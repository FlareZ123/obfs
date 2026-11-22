'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);
const publicText='public-browser-source-marker-0123456789-abcdefghijklmnopqrstuvwxyz';
const privateText='private-browser-literal-0123456789-abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** @type {import('../src/core').SourceFile[]} */
const INPUT=[
  {path:'entry.mjs',sourceType:'module',
    code:'const publicOwner={secretField:3};'+
      'export function publicRead(publicParam){const marker='+
      JSON.stringify(publicText)+';return publicOwner.secretField;}'},
  {path:'private.mjs',sourceType:'module',
    code:'const privateOwner={privateField:4};const value=privateOwner.privateField;'+
      'function privateHelper(privateParam){return '+JSON.stringify(privateText)+';}'+
      'export const privateResult=privateHelper(5);export const standaloneValue=value;'}
];

/** @returns {string} */
function page() {
  return [
    '<!doctype html><html><body><pre id="result"></pre>',
    '<script type="module">',
    'try{',
    'const [pub,priv]=await Promise.all([import("./entry.mjs"),import("./private.mjs")]);',
    'const result=[pub.publicRead.toString(),pub.publicRead(9),priv.privateResult,priv.standaloneValue];',
    'document.getElementById("result").textContent=btoa(JSON.stringify(result));',
    '}catch(error){document.getElementById("result").textContent="ERROR:"+String(error.stack||error);}',
    '</script></body></html>'
  ].join('\n');
}

/**
 * Compare network-served native and emitted ESM module graphs in real Chrome.
 * Public Function#toString must remain byte-identical while an independent
 * private module retains own-property, identifier and string yield.
 * @returns {Promise<void>}
 */
async function main() {
  const emitted=obfuscateFiles(INPUT,{
    mode:'coo',closedWorld:true,seed:'chromium-source-private-positive',
    strings:true,identifiers:true,properties:true,preservePublicCallableSource:true
  });
  const privateFile=emitted.files.find(file=>file.path==='private.mjs');
  const publicFile=emitted.files.find(file=>file.path==='entry.mjs');
  assert.ok(privateFile&&publicFile);
  assert.ok(privateFile.metrics.properties>0,String(privateFile.code));
  assert.ok(privateFile.metrics.literals>0,String(privateFile.code));
  assert.ok(privateFile.metrics.bindings>0,String(privateFile.code));
  assert.ok(!String(privateFile.code).includes('privateField'),String(privateFile.code));
  assert.ok(!String(privateFile.code).includes(privateText),String(privateFile.code));
  assert.ok(String(publicFile.code).includes('publicParam'),String(publicFile.code));
  assert.ok(String(publicFile.code).includes(publicText),String(publicFile.code));
  /** @type {Map<string,{type:string,body:string}>} */
  const routes=new Map();
  for(const group of [
    {prefix:'native',files:INPUT},
    {prefix:'emitted',files:emitted.files}
  ]) {
    routes.set('/'+group.prefix+'/index.html',{type:'text/html; charset=utf-8',body:page()});
    for(const file of group.files) {
      routes.set('/'+group.prefix+'/'+file.path,{
        type:'text/javascript; charset=utf-8',body:String(file.code)
      });
    }
  }
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url??'/','http://127.0.0.1').pathname;
    const result=routes.get(pathname);
    if(!result){res.writeHead(404).end('missing');return;}
    res.writeHead(200,{'Content-Type':result.type,'Cache-Control':'no-store'});
    res.end(result.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    /** @param {'native'|'emitted'} variant @returns {Promise<[string,number,string,number]>} */
    async function run(variant) {
      const url=origin+'/'+variant+'/index.html';
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=3000','--dump-dom',url
      ],{encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024});
      const match=/<pre id="result">([^<]*)<\/pre>/u.exec(String(stdout));
      assert.ok(match&&match[1]&&!match[1].startsWith('ERROR:'),String(stdout).slice(-4000));
      return /** @type {[string,number,string,number]} */(
        JSON.parse(Buffer.from(match[1],'base64').toString('utf8')));
    }
    const original=await run('native');
    const protectedOutput=await run('emitted');
    assert.deepEqual(protectedOutput,original);
    assert.match(original[0],/publicRead\(publicParam\)/u);
    assert.equal(original[1],3);
    assert.equal(original[2],privateText);
    assert.equal(original[3],4);
    process.stdout.write('CHROMIUM_PUBLIC_SOURCE_PARITY '+
      JSON.stringify({matched:true,publicSourceBytes:original[0].length,
        privateFields:privateFile.metrics.properties,
        privateBindings:privateFile.metrics.bindings,
        encodedLiterals:privateFile.metrics.literals})+'\n');
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
