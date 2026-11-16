'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {ROOT,NAMES,SEED}=require('../examples/application-challenge/build.cjs');
const {ablate,withOwnKeyCalls,withNullPrototypeRecord}=
  require('../sims/application-challenge-observer-ablation');

const exec=promisify(execFile);
const CASES=[[0,0],[0,1],[0xffffffff,3],
  ...Array.from({length:61},(_,i)=>[
    Math.imul(i+173,2654435761)>>>0,13*i+7
  ])];

/** @returns {number} */
function countCases(){return CASES.length;}

/** @param {number} value @returns {number} */
function externalValue(value){
  let x=(value^0xa5a5a5a5)>>>0;
  x=Math.imul(x^(x>>>16),0x45d9f3b)>>>0;
  return (x^(x>>>16))>>>0;
}

/**
 * Real Chromium evaluation of two separate legitimate six-module application
 * source contracts, each paired with its own emitted COO graph. The null-
 * prototype variant deliberately retains the dynamic missing-key call and
 * runs against a caller-injected Object.prototype host Function.
 * @returns {Promise<void>}
 */
async function main(){
  /** @type {{path:string,sourceType:'module',code:string}[]} */
  const original=await Promise.all(NAMES.map(async name=>({
    path:name,sourceType:'module',
    code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
  })));
  const withoutObservers=ablate(original,'both');
  const ownNative=withOwnKeyCalls(withoutObservers);
  const nullNative=withNullPrototypeRecord(withoutObservers);
  const compile=(/** @type {{path:string,sourceType:'module',code:string}[]} */ files)=>
    obfuscateFiles(files,{mode:'coo',closedWorld:true,seed:SEED,
      identifiers:true,properties:true,strings:false});
  const ownCompiled=compile(ownNative);
  const nullCompiled=compile(nullNative);
  assert.equal(ownCompiled.crossFile.properties,2,
    'Own-key-only application must rename two genuinely private fields');
  assert.equal(nullCompiled.crossFile.properties,2,
    'Null-prototype application must retain its missing-key call and rename two fields');
  const sources=new Map();
  for(const [prefix,files] of [
    ['/own-native/',ownNative],['/own-compiled/',ownCompiled.files],
    ['/null-native/',nullNative],['/null-compiled/',nullCompiled.files]
  ]) {
    for(const file of files)sources.set(prefix+file.path,
      /** @type {string} */(file.code));
  }
  const html=[
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<script type="module">',
    'try {',
    'Object.prototype.noSuchField=Function;',
    'window.externalValue='+externalValue.toString()+';',
    'const [ownNative,ownCompiled,nullNative,nullCompiled]=await Promise.all([',
    '  import("/own-native/app.mjs"),import("/own-compiled/app.mjs"),',
    '  import("/null-native/app.mjs"),import("/null-compiled/app.mjs")',
    ']);',
    'const cases='+JSON.stringify(CASES)+';',
    'const ownRaw=cases.map(([seed,count])=>ownNative.evaluate(seed,count));',
    'const ownChanged=cases.map(([seed,count])=>ownCompiled.evaluate(seed,count));',
    'const nullRaw=cases.map(([seed,count])=>nullNative.evaluate(seed,count));',
    'const nullChanged=cases.map(([seed,count])=>nullCompiled.evaluate(seed,count));',
    'const missingTypes=[typeof nullRaw[0].missing.value,',
    '  typeof nullChanged[0].missing.value];',
    'const pre=document.createElement("pre");',
    'pre.id="result";pre.textContent=btoa(JSON.stringify({',
    '  ownRaw,ownChanged,nullRaw,nullChanged,missingTypes',
    '}));document.body.append(pre);',
    '} catch(error) {',
    'const pre=document.createElement("pre");pre.id="failure";',
    'pre.textContent=String(error.stack||error);document.body.append(pre);',
    '}',
    '</script></body></html>'
  ].join('\n');
  const server=http.createServer((request,response)=>{
    if(request.method!=='GET'){response.writeHead(405);response.end();return;}
    if(request.url==='/'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      response.end(html);return;
    }
    const source=request.url?sources.get(request.url):undefined;
    if(typeof source!=='string'){
      response.writeHead(404);response.end();return;
    }
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
    response.end(source);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing HTTP port');
    const origin='http://127.0.0.1:'+address.port;
    for(const variant of ['own','null']){
      const emittedSource=await fetch(origin+'/'+variant+'-compiled/private.mjs');
      assert.equal(emittedSource.status,200);
      const bytes=await emittedSource.text();
      assert.ok(bytes.includes('_p'),'Expected emitted private-property spellings');
      assert.ok(!bytes.includes('secretOffset:19') &&
        !bytes.includes('secretSalt:37'),
        'Browser-delivered owner literal must use renamed keys');
      const nativeSource=await fetch(origin+'/'+variant+'-native/private.mjs');
      assert.equal(nativeSource.status,200);
      assert.notEqual(await nativeSource.text(),bytes,
        'Both browser graphs must have genuinely different source bytes');
    }
    const chromium=process.env.CHROMIUM_BIN??'google-chrome';
    const {stdout}=await exec(chromium,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=12000','--dump-dom',origin+'/'
    ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
    const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
    assert.ok(encoded,'Chromium did not evaluate both graph variants: '+stdout.slice(0,1800));
    const result=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
    assert.equal(result.ownRaw.length,countCases());
    assert.equal(result.nullRaw.length,countCases());
    assert.deepEqual(result.ownChanged,result.ownRaw,
      'Real Chromium must preserve own-key-only ESM app outputs exactly');
    assert.deepEqual(result.nullChanged,result.nullRaw,
      'Real Chromium must preserve null-prototype ESM app outputs exactly');
    assert.deepEqual(result.missingTypes,['undefined','undefined'],
      'Host Function injected on Object.prototype must not reach a null-prototype record');
    process.stdout.write('VERIFIED_RECORD_CHROMIUM '+JSON.stringify({
      cases:CASES.length,renamedPrivateFields:ownCompiled.crossFile.properties,
      nullPrototypePrivateFieldsRenamed:nullCompiled.crossFile.properties,
      nullPrototypeMissingKeyWithHostFunction:'undefined',
      privateSourcePubliclyFetchable:true,allOutputsMatch:true,
      originalGraphFiles:ownNative.length,emittedGraphFiles:ownCompiled.files.length,
      distinctSourceVariants:2
    })+'\n');
  }finally{
    await new Promise((resolve,reject)=>server.close(
      error=>error?reject(error):resolve()));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
