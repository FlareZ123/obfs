'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const vm=require('node:vm');
const http=require('node:http');
const {spawnSync}=require('node:child_process');

/** @typedef {'coo'|'sno'|'sco'} Mode */
/** @typedef {{path:string,code:string|Buffer,sourceType:'commonjs'|'asset'}} File */
/**
 * @typedef {{
 *   obfuscateFiles:(files:File[],options:{mode:Mode,seed:string,strings:boolean})=>{files:{path:string,code:string|Buffer}[]},
 *   createScoHandler:(files:File[])=>import('node:http').RequestListener
 * }} Compiler
 */

/** @param {string} root @returns {Compiler} */
function load(root){return require(path.resolve(root,'src'));}

/**
 * The source-only extractor process is given only copied emitted asset bytes.
 * @param {string|Buffer} asset
 * @returns {string}
 */
function recoverIsolated(asset) {
  const run=spawnSync(process.execPath,[
    path.join(__dirname,'css-leading-c0-extractor.js')
  ],{input:asset,encoding:'utf8',maxBuffer:8*1024*1024});
  assert.equal(run.status,0,run.stderr);
  return run.stdout;
}

/**
 * @param {import('node:http').RequestListener} handler
 * @param {string} filename
 * @returns {Promise<{status:number,body:Buffer}>}
 */
async function getAsset(handler,filename){
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  try{
    const address=server.address();
    assert.ok(address && typeof address==='object');
    return await new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port:address.port,path:'/obfs/'+filename},response=>{
        /** @type {Buffer[]} */
        const parts=[];
        response.on('data',part=>parts.push(Buffer.from(part)));
        response.on('end',()=>resolve({
          status:response.statusCode??0,body:Buffer.concat(parts)
        }));
        response.on('error',reject);
      }).on('error',reject);
    });
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

/**
 * @param {string} beforeRoot
 * @param {string} afterRoot
 * @returns {Promise<{modes:Record<string,{extracted:number,refused:number,byteParity:number}>,scoHttpExtracted:number,scoHttpRefused:number}>}
 */
async function compare(beforeRoot,afterRoot){
  const previous=load(beforeRoot),current=load(afterRoot);
  const original='function privateTransform(x){return x*29+41;}module.exports=privateTransform(7);';
  const map=Buffer.from(JSON.stringify({
    version:3,sources:['entry.cjs'],sourcesContent:[original],
    names:['privateTransform'],mappings:'AAAA'
  })).toString('base64');
  const nested='body{color:red}/*# sourceMappingURL=data:application/json;base64,'+map+' */';
  const data='data:text/css;base64,'+Buffer.from(nested).toString('base64');
  const css=String.raw`@import "\1 `+data+String.raw`";`;
  assert.equal(new URL(String.fromCodePoint(1)+data).protocol,'data:');
  /** @type {File} */
  const entry={path:'entry.cjs',sourceType:'commonjs',code:original};
  /** @type {File[]} */
  const assets=[
    {path:'style.css',sourceType:'asset',code:Buffer.from(css)},
    {path:'index.html',sourceType:'asset',code:'<style>'+css+'</style>'},
    {path:'icon.svg',sourceType:'asset',
      code:'<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA['+css+']]></style></svg>'}
  ];
  /** @type {Record<string,{extracted:number,refused:number,byteParity:number}>} */
  const modes={};
  for(const mode of /** @type {Mode[]} */ (['coo','sno','sco'])){
    let extracted=0,refused=0,byteParity=0;
    for(const asset of assets){
      const options={mode,seed:'css-c0-source-extraction-20261118',strings:false};
      const old=previous.obfuscateFiles([entry,asset],options);
      const emitted=old.files.find(file=>file.path===asset.path);
      const js=old.files.find(file=>file.path===entry.path);
      assert.ok(emitted);assert.ok(js);
      assert.notEqual(String(js.code),original);
      const native={module:{exports:null}},compiled={module:{exports:null}};
      vm.runInNewContext(original,native,{timeout:1500});
      vm.runInNewContext(String(js.code),compiled,{timeout:1500});
      assert.equal(compiled.module.exports,native.module.exports);
      assert.equal(recoverIsolated(emitted.code),original);
      extracted++;
      assert.throws(()=>current.obfuscateFiles([entry,asset],options),
        /(?:CSS data import|embedded stylesheet data import)/u);
      refused++;
    }
    const safe={path:'safe.css',sourceType:/** @type {const} */ ('asset'),
      code:Buffer.from('@import "./theme.css";.ok{color:#123}')};
    const options={mode,seed:'css-c0-safe-parity',strings:false};
    const old=previous.obfuscateFiles([entry,safe],options);
    const recent=current.obfuscateFiles([entry,safe],options);
    for(const file of old.files){
      assert.deepEqual(recent.files.find(out=>out.path===file.path)?.code,file.code);
      byteParity++;
    }
    modes[mode]={extracted,refused,byteParity};
  }
  let scoHttpExtracted=0,scoHttpRefused=0;
  for(const asset of assets){
    const response=await getAsset(previous.createScoHandler([asset]),asset.path);
    assert.equal(response.status,200);
    assert.equal(recoverIsolated(response.body),original);
    scoHttpExtracted++;
    assert.throws(()=>current.createScoHandler([asset]),
      /(?:CSS data import|embedded stylesheet data import)/u);
    scoHttpRefused++;
  }
  return {modes,scoHttpExtracted,scoHttpRefused};
}

if(require.main===module){
  const before=process.argv[2],after=process.argv[3];
  if(!before||!after)throw new TypeError('Provide prepatch and patched source roots');
  compare(before,after).then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(error=>{console.error(error);process.exitCode=1;});
}
module.exports={compare};
