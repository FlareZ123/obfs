'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const http=require('node:http');
const vm=require('node:vm');

/**
 * @typedef {'coo'|'sco'|'sno'} Mode
 * @typedef {{path:string,code:string|Buffer,sourceType:'commonjs'|'asset'}} File
 * @typedef {{
 *   obfuscateFiles:(files:File[],options:{mode:Mode,seed:string,strings:boolean})=>{files:{path:string,code:string|Buffer}[]},
 *   createScoHandler:(files:File[])=>import('node:http').RequestListener
 * }} Compiler
 */

/**
 * @param {string} code
 * @returns {unknown}
 */
function runCommonjs(code) {
  const context={module:{exports:null}};
  vm.runInNewContext(code,context,{timeout:1500});
  return context.module.exports;
}

/** @param {string} root @returns {Compiler} */
function loadCompiler(root) {
  return require(path.resolve(root,'src'));
}

/**
 * Decode the complete original source from the asset's delivered base64 CSS
 * source-map annotation. No compiler seed or original source is supplied to
 * this extraction function.
 * @param {string|Buffer} delivered
 * @returns {string}
 */
function extractOriginal(delivered) {
  const text=Buffer.isBuffer(delivered)?delivered.toString('utf8'):delivered;
  const match=/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/u.exec(text);
  assert.ok(match,'delivered asset lacked the source-map annotation');
  const map=JSON.parse(Buffer.from(match[1],'base64').toString('utf8'));
  assert.equal(map.version,3);
  assert.ok(Array.isArray(map.sourcesContent));
  assert.equal(typeof map.sourcesContent[0],'string');
  return map.sourcesContent[0];
}

/**
 * @param {import('node:http').RequestListener} handler
 * @param {string} name
 * @returns {Promise<{status:number,body:Buffer}>}
 */
async function readPublicAsset(handler,name) {
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  const address=server.address();
  assert.ok(address && typeof address!=='string');
  try {
    return await new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port:address.port,path:'/obfs/'+name},response=>{
        /** @type {Buffer[]} */
        const parts=[];
        response.on('data',chunk=>parts.push(Buffer.from(chunk)));
        response.on('end',()=>resolve({
          status:response.statusCode??0,body:Buffer.concat(parts)
        }));
        response.on('error',reject);
      }).on('error',reject);
    });
  }finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

/**
 * Compare the exact immediate prepatch compiler with the current compiler
 * over delivered assets. A real SCO HTTP response is tested independently.
 * @param {string} previousRoot
 * @param {string} currentRoot
 * @returns {Promise<{previous:string,current:string,byMode:{mode:Mode,extracted:number,refused:number}[],scoExtracted:number,scoRefused:number}>}
 */
async function compare(previousRoot,currentRoot) {
  const previous=loadCompiler(previousRoot);
  const current=loadCompiler(currentRoot);
  const original='function privateScore(x){return x*173+59;}module.exports=privateScore(3);';
  const encoded=Buffer.from(JSON.stringify({
    version:3,sources:['entry.cjs'],sourcesContent:[original],
    names:['privateScore'],mappings:'AAAA'
  })).toString('base64');
  const annotation='/*# sourceMappingURL=data:application/json;base64,'+encoded+' */';
  const entry=/** @type {File} */({
    path:'entry.cjs',sourceType:'commonjs',code:original
  });
  /** @type {File[]} */
  const specimens=[
    {path:'inline.svg',sourceType:'asset',
      code:'<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA[circle{fill:red}'+annotation+']]></style><circle r="3"/></svg>'},
    {path:'inline.html',sourceType:'asset',
      code:'<!doctype html><html><head><style>body{color:red}'+annotation+'</style></head><body>safe</body></html>'},
    {path:'template.html',sourceType:'asset',
      code:'<!doctype html><template><style>'+annotation+'</style></template>'}
  ];
  /** @type {{mode:Mode,extracted:number,refused:number}[]} */
  const byMode=[];
  for(const mode of /** @type {Mode[]} */ (['coo','sco','sno'])) {
    const options={mode,seed:'inline-map-attack',strings:false};
    let extracted=0,refused=0;
    for(const asset of specimens) {
      const result=previous.obfuscateFiles([entry,asset],options);
      const published=result.files.find(file=>file.path===asset.path);
      const executable=result.files.find(file=>file.path===entry.path);
      assert.ok(published);
      assert.ok(executable);
      assert.notEqual(String(executable.code),original,'baseline must have transformed the input');
      assert.equal(runCommonjs(String(executable.code)),runCommonjs(original));
      assert.equal(extractOriginal(published.code),original);
      extracted++;
      assert.throws(()=>current.obfuscateFiles([entry,asset],options),
        /(?:HTML|SVG) asset contains inline CSS source-map directive|SVG asset contains embedded CSS source-map directive/);
      refused++;
    }
    byMode.push({mode,extracted,refused});
  }
  let scoExtracted=0,scoRefused=0;
  for(const asset of specimens) {
    const response=await readPublicAsset(previous.createScoHandler([asset]),asset.path);
    assert.equal(response.status,200,asset.path);
    assert.equal(extractOriginal(response.body),original,asset.path);
    scoExtracted++;
    assert.throws(()=>current.createScoHandler([asset]),
      /(?:HTML|SVG) asset contains (?:inline|embedded) CSS source-map directive/,
      asset.path);
    scoRefused++;
  }
  /** @type {File[]} */
  const safe=[
    {path:'safe.svg',sourceType:'asset',
      code:'<svg xmlns="http://www.w3.org/2000/svg"><style>circle{fill:red}</style><circle r="3"/></svg>'},
    {path:'safe.html',sourceType:'asset',
      code:'<!doctype html><style>body::before{content:"/*# sourceMappingURL=quoted.map */"}</style>'}
  ];
  for(const mode of /** @type {Mode[]} */ (['coo','sco','sno'])) {
    const result=current.obfuscateFiles([entry,...safe],{mode,seed:'inline-map-safe',strings:false});
    for(const asset of safe) {
      assert.deepEqual(result.files.find(file=>file.path===asset.path)?.code,asset.code);
    }
  }
  return {previous:path.resolve(previousRoot),current:path.resolve(currentRoot),
    byMode,scoExtracted,scoRefused};
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

module.exports={compare};
