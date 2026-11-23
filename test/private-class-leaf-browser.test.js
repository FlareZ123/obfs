'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');
const {neutralizeHashedNames}=require('../sims/offline-normalize');
const {recoverSymbolKeys}=require('../sims/symbol-key-static-recover');

const runChrome=promisify(execFile);

/** @typedef {'private'|'visible'|'symbol'} CaseName */
/** @typedef {'native'|'emitted'|'neutralized'} VariantName */

/** @type {Record<CaseName,string>} */
const sources={
  private:[
    'const owner={secretAlpha:23,secretBeta:7};',
    'class Reader{read(){return owner.secretAlpha;}}',
    'const reader=new Reader();',
    'const another=new Reader();',
    'export const value=reader.read()+another.read()+owner.secretBeta;'
  ].join('\n'),
  symbol:[
    'const owner={secretAlpha:23,secretBeta:7};',
    'class Reader{read(){return owner.secretAlpha;}}',
    'const reader=new Reader();',
    'const another=new Reader();',
    'export const value=reader.read()+another.read()+owner.secretBeta;'
  ].join('\n'),
  visible:[
    'const owner={secretAlpha:23};',
    'class Reader{read(){return owner.secretAlpha;}}',
    'const reader=new Reader();',
    'export const read=reader.read;'
  ].join('\n')
};

/** @param {CaseName} name @returns {string} */
function html(name){
  return [
    '<!doctype html><html><body><pre id="result">PENDING</pre>',
    '<script type="module">',
    'try {',
    'const mod=await import("./state.mjs");',
    name==='visible' ? 'const value=mod.read.toString();' : 'const value=mod.value;',
    'document.getElementById("result").textContent=btoa(JSON.stringify(value));',
    '} catch(error) {',
    'document.getElementById("result").textContent="ERROR:"+error.message;',
    '}',
    '</script></body></html>'
  ].join('\n');
}

/**
 * Run the network-delivered native, compiler-emitted and source-normalized
 * module in actual Chromium, not an AST interpreter.
 * @param {string} origin
 * @param {CaseName} name
 * @param {VariantName} variant
 * @returns {Promise<unknown>}
 */
async function run(origin,name,variant){
  const {stdout}=await runChrome(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=10000','--dump-dom',
    origin+'/'+name+'/'+variant+'/index.html'
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8',windowsHide:true});
  const matched=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(matched,name+'/'+variant+': browser did not return encoded result: '+stdout.slice(0,1200));
  return JSON.parse(Buffer.from(matched,'base64').toString('utf8'));
}

test('Chromium preserves private class-leaf output, source visibility and public clone', {
  skip:process.platform==='win32'
},async()=>{
  /** @type {Map<string,string>} */
  const served=new Map();
  for(const name of /** @type {const} */(['private','visible','symbol'])){
    const source=sources[name];
    const output=obfuscateFiles([{
      path:'state.mjs',sourceType:'module',code:source
    }],{mode:'coo',seed:'class-leaf-browser-'+name,
      properties:true,identifiers:false,strings:false,
      experimentalSymbolKeys:name==='symbol'}).files[0];
    const expected=name==='visible'?0:2;
    assert.equal(output.metrics.properties,expected,name+': correct rename/refusal');
    if(name==='symbol')assert.equal(output.metrics.symbolKeys,2,
      'Symbols represent both truly private owner fields');
    const symbolRecovery=name==='symbol'?
      recoverSymbolKeys(/** @type {string} */(output.code),'module'):null;
    const literalRecovery=name==='symbol'?null:neutralizeHashedNames([{
      path:'state.mjs',sourceType:'module',
      code:/** @type {string} */(output.code)
    }]);
    const recoveredCount=symbolRecovery?.keys??literalRecovery?.properties??0;
    const recoveredCode=symbolRecovery?.code??literalRecovery?.files[0].code??'';
    assert.equal(recoveredCount,expected,
      'Public-source attacker must reconstruct both private fields');
    for(const [variant,code] of /** @type {Array<[VariantName,string]>} */([
      ['native',source],
      ['emitted',/** @type {string} */(output.code)],
      ['neutralized',recoveredCode]
    ])){
      served.set('/'+name+'/'+variant+'/state.mjs',code);
      served.set('/'+name+'/'+variant+'/index.html',html(name));
    }
  }
  const server=http.createServer((request,response)=>{
    const target=new URL(request.url??'/','http://localhost').pathname;
    const content=served.get(target);
    if(content===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':target.endsWith('.html')?'text/html; charset=utf-8':
        'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(content);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    for(const name of /** @type {const} */(['private','visible','symbol'])){
      const native=await run(origin,name,'native');
      const emitted=await run(origin,name,'emitted');
      const normalized=await run(origin,name,'neutralized');
      assert.equal(emitted,native,name+': native and emitted Chrome output');
      assert.equal(normalized,native,name+': source-only attacker replay');
      if(name!=='visible')assert.equal(native,53);
      else assert.match(String(native),/secretAlpha/u);
    }
    process.stdout.write('PRIVATE_CLASS_LEAF_CHROMIUM '+JSON.stringify({
      cases:3,realChrome:true,privateKeys:2,privateSymbolKeys:2,observedMethodRefusal:true,
      literalNamesRecovered:2,symbolBindingsReconstructed:2,publicCloneEqual:true
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve(undefined)));
  }
});
