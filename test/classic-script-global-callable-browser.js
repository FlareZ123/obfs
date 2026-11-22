'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);
const publicText='classic-public-source-marker-0123456789-abcdefghijklmnopqrstuvwxyz';
const privateText='classic-private-encoded-value-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789';
const source='function publicReader(){return '+JSON.stringify(publicText)+';}\n'+
  'const lexicalReader=()=>'+JSON.stringify(publicText)+';\n'+
  'var varReader=function(){return '+JSON.stringify(publicText)+';};\n'+
  'let letReader=()=>'+JSON.stringify(publicText)+';\n'+
  'globalThis.privateValue='+JSON.stringify(privateText)+';';

/** @returns {string} */
function page() {
  return [
    '<!doctype html><html><body><pre id="result"></pre>',
    '<script src="./entry.js"></script>',
    '<script>',
    'try{',
    'const result=[',
    'globalThis.publicReader.toString(),globalThis.publicReader(),',
    'lexicalReader.toString(),lexicalReader(),',
    'globalThis.varReader.toString(),globalThis.varReader(),',
    'letReader.toString(),letReader(),globalThis.privateValue,',
    'typeof globalThis.lexicalReader,typeof globalThis.letReader];',
    'document.getElementById("result").textContent=btoa(JSON.stringify(result));',
    '}catch(error){document.getElementById("result").textContent="ERROR:"+String(error.stack||error);}',
    '</script></body></html>'
  ].join('\n');
}

/** @returns {Promise<void>} */
async function main() {
  const output=obfuscateFiles([{path:'entry.js',sourceType:'script',code:source}],{
    mode:'coo',seed:'chromium-classic-global-source-review',
    strings:true,identifiers:false,properties:false,
    preservePublicCallableSource:true
  });
  const emitted=String(output.files[0].code);
  assert.ok(output.files[0].metrics.literals>=1,
    'An independent global literal must retain a real encoding');
  assert.ok(!emitted.includes(privateText),
    'Private literal source bytes must disappear from emitted JavaScript');
  /** @type {Map<string,{type:string,body:string}>} */
  const routes=new Map([
    ['/native/index.html',{type:'text/html; charset=utf-8',body:page()}],
    ['/native/entry.js',{type:'text/javascript; charset=utf-8',body:source}],
    ['/emitted/index.html',{type:'text/html; charset=utf-8',body:page()}],
    ['/emitted/entry.js',{type:'text/javascript; charset=utf-8',body:emitted}]
  ]);
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url??'/','http://127.0.0.1').pathname;
    const entry=routes.get(pathname);
    if(!entry){res.writeHead(404).end('missing');return;}
    res.writeHead(200,{'Content-Type':entry.type,'Cache-Control':'no-store'});
    res.end(entry.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    /** @param {'native'|'emitted'} variant @returns {Promise<[string,string,string,string,string,string,string,string,string,string]>} */
    async function run(variant) {
      const {stdout}=await runBrowser(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=3000','--dump-dom',
        origin+'/'+variant+'/index.html'
      ],{encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024});
      const match=/<pre id="result">([^<]*)<\/pre>/u.exec(String(stdout));
      assert.ok(match&&match[1]&&!match[1].startsWith('ERROR:'),
        String(stdout).slice(-3000));
      return /** @type {[string,string,string,string,string,string,string,string,string,string]} */ (
        JSON.parse(Buffer.from(match[1],'base64').toString('utf8')));
    }
    const native=await run('native');
    const protectedResult=await run('emitted');
    assert.deepEqual(protectedResult,native);
    assert.match(native[0],/function publicReader\(/u);
    assert.ok(native[2].includes(publicText),'Original lexical callable source must retain its literal');
    assert.equal(native[1],publicText);
    assert.equal(native[3],publicText);
    assert.ok(native[4].includes(publicText));
    assert.equal(native[5],publicText);
    assert.ok(native[6].includes(publicText));
    assert.equal(native[7],publicText);
    assert.equal(native[8],privateText);
    assert.equal(native[9],'undefined');
    process.stdout.write('CHROMIUM_CLASSIC_GLOBAL_SOURCE_PARITY '+
      JSON.stringify({matched:true,privateEncodedLiterals:output.files[0].metrics.literals,
        publicSourceLength:native[0].length,lexicalSourceLength:native[2].length,\n        varSourceLength:native[4].length,letSourceLength:native[6].length})+'\n');
  }finally {
    await new Promise(resolve=>server.close(resolve));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
