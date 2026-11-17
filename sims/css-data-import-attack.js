'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const http=require('node:http');

/**
 * @typedef {'coo'|'sco'|'sno'} Mode
 * @typedef {{path:string,code:string|Buffer,sourceType:'commonjs'|'asset'}} File
 * @typedef {{
 *   obfuscateFiles:(files:File[],options:{mode:Mode,seed:string,strings:boolean})=>{files:{path:string,code:string|Buffer}[]},
 *   createScoHandler:(files:File[])=>import('node:http').RequestListener
 * }} Compiler
 */

/** @param {string} root @returns {Compiler} */
function loadCompiler(root) {
  return require(path.resolve(root,'src'));
}

/**
 * Read only published CSS, HTML or SVG to reconstruct a nested source map.
 * @param {string|Buffer} delivered
 * @returns {string}
 */
function recover(delivered) {
  const text=String(delivered);
  const value=/data:text\/css;base64,([A-Za-z0-9+/=]+)/iu.exec(text);
  assert.ok(value,'No nested CSS data URL in public asset');
  const css=Buffer.from(value[1],'base64').toString('utf8');
  const mapping=/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/u.exec(css);
  assert.ok(mapping,'No sourceMappingURL in nested CSS');
  const map=JSON.parse(Buffer.from(mapping[1],'base64').toString('utf8'));
  assert.equal(map.version,3);
  assert.ok(Array.isArray(map.sourcesContent));
  return map.sourcesContent[0];
}

/**
 * @param {import('node:http').RequestListener} handler
 * @param {string} file
 * @returns {Promise<{status:number,body:Buffer}>}
 */
async function getPublished(handler,file) {
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  const address=server.address();
  assert.ok(address && typeof address!=='string');
  try {
    return await new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port:address.port,path:'/obfs/'+file},response=>{
        /** @type {Buffer[]} */
        const chunks=[];
        response.on('data',chunk=>chunks.push(Buffer.from(chunk)));
        response.on('end',()=>resolve({status:response.statusCode??0,body:Buffer.concat(chunks)}));
        response.on('error',reject);
      }).on('error',reject);
    });
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

/**
 * @param {string} previousRoot
 * @param {string} currentRoot
 * @returns {Promise<{modes:{mode:Mode,recovered:number,refused:number}[],httpRecovered:number,httpRefused:number}>}
 */
async function compare(previousRoot,currentRoot) {
  const previous=loadCompiler(previousRoot);
  const current=loadCompiler(currentRoot);
  const original='function privateTransform(x){return x*29+41;}module.exports=privateTransform(7);';
  const map=Buffer.from(JSON.stringify({
    version:3,sources:['entry.cjs'],sourcesContent:[original],
    names:['privateTransform'],mappings:'AAAA'
  })).toString('base64');
  const nested='body{color:blue}/*# sourceMappingURL=data:application/json;base64,'+map+' */';
  const importCss='@import url("data:text/css;base64,'+
    Buffer.from(nested).toString('base64')+'");';
  /** @type {File} */
  const entry={path:'entry.cjs',sourceType:'commonjs',code:original};
  /** @type {File[]} */
  const assets=[
    {path:'theme.css',sourceType:'asset',code:importCss},
    {path:'index.html',sourceType:'asset',code:'<style>'+importCss+'</style>'},
    {path:'icon.svg',sourceType:'asset',
      code:'<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA['+importCss+']]></style></svg>'}
  ];
  /** @type {{mode:Mode,recovered:number,refused:number}[]} */
  const modes=[];
  for(const mode of /** @type {Mode[]} */ (['coo','sco','sno'])) {
    let recovered=0,refused=0;
    for(const asset of assets) {
      const options={mode,seed:'css-data-attack',strings:false};
      const previousOut=previous.obfuscateFiles([entry,asset],options);
      const published=previousOut.files.find(file=>file.path===asset.path);
      const executable=previousOut.files.find(file=>file.path==='entry.cjs');
      assert.ok(published);
      assert.ok(executable);
      assert.notEqual(String(executable.code),original);
      const native={module:{exports:null}},compiled={module:{exports:null}};
      vm.runInNewContext(original,native,{timeout:1500});
      vm.runInNewContext(String(executable.code),compiled,{timeout:1500});
      assert.equal(compiled.module.exports,native.module.exports);
      assert.equal(recover(published.code),original);
      recovered++;
      assert.throws(()=>current.obfuscateFiles([entry,asset],options),
        /(?:CSS data import cannot be audited|HTML asset contains inline CSS data import|SVG asset contains embedded CSS data import)/u);
      refused++;
    }
    // A safe stylesheet must preserve both ordinary emitted JavaScript
    // bytes and the exact asset bytes under this preflight-only change.
    const safeCss='@import url("https://cdn.example.test/public.css");.ok{color:#123}';
    /** @type {File} */
    const safeAsset={path:'safe.css',sourceType:'asset',code:Buffer.from(safeCss)};
    const beforeSafe=previous.obfuscateFiles([entry,safeAsset],{
      mode,seed:'css-data-safe',strings:false
    });
    const afterSafe=current.obfuscateFiles([entry,safeAsset],{
      mode,seed:'css-data-safe',strings:false
    });
    for(const candidate of [entry.path,safeAsset.path]) {
      const baseline=beforeSafe.files.find(file=>file.path===candidate);
      const hardened=afterSafe.files.find(file=>file.path===candidate);
      assert.ok(baseline);
      assert.ok(hardened);
      assert.deepEqual(hardened.code,baseline.code,
        'Preflight addition must not silently modify accepted bytes: '+candidate);
    }
    modes.push({mode,recovered,refused});
  }
  let httpRecovered=0,httpRefused=0;
  for(const asset of assets) {
    const published=await getPublished(previous.createScoHandler([asset]),asset.path);
    assert.equal(published.status,200);
    assert.equal(recover(published.body),original);
    httpRecovered++;
    assert.throws(()=>current.createScoHandler([asset]),
      /(?:CSS data import cannot be audited|HTML asset contains inline CSS data import|SVG asset contains embedded CSS data import)/u);
    httpRefused++;
  }
  return {modes,httpRecovered,httpRefused};
}

if(require.main===module) {
  const previous=process.argv[2],current=process.argv[3];
  if(!previous||!current)throw new TypeError('Expected previous and current repository roots');
  compare(previous,current).then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }).catch(error=>{
    process.stderr.write(String(error.stack||error)+'\n');
    process.exitCode=1;
  });
}

module.exports={compare,recover};
