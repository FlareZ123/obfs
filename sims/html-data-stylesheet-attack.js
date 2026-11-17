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

/** @param {string} root @returns {Compiler} */
function loadCompiler(root) {
  return require(path.resolve(root,'src'));
}

/**
 * Public-artifact-only nested data CSS and source-map extractor.
 * The attacker receives only delivered HTML, not the obfuscation seed,
 * original JS, or private compiler state.
 * @param {Buffer|string} html
 * @returns {string}
 */
function recoverOriginal(html) {
  const source=String(html);
  const embedded=/data:text\/css;base64,([A-Za-z0-9+/=]+)/iu.exec(source);
  assert.ok(embedded,'HTML did not contain a data stylesheet');
  const css=Buffer.from(embedded[1],'base64').toString('utf8');
  const mapping=/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/u.exec(css);
  assert.ok(mapping,'CSS did not carry a source map');
  const decoded=JSON.parse(Buffer.from(mapping[1],'base64').toString('utf8'));
  assert.equal(decoded.version,3);
  assert.ok(Array.isArray(decoded.sourcesContent));
  return decoded.sourcesContent[0];
}

/**
 * @param {import('node:http').RequestListener} handler
 * @returns {Promise<{status:number,body:Buffer}>}
 */
async function getPublishedHtml(handler) {
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  const address=server.address();
  assert.ok(address && typeof address!=='string');
  try {
    return await new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port:address.port,path:'/obfs/index.html'},response=>{
        /** @type {Buffer[]} */
        const parts=[];
        response.on('data',part=>parts.push(Buffer.from(part)));
        response.on('end',()=>resolve({
          status:response.statusCode??0,body:Buffer.concat(parts)
        }));
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
 * @returns {Promise<{prepatch:string,protected:string,modes:{mode:Mode,extracted:boolean,refused:boolean}[],scoHttpExtracted:boolean,scoPublicationRefused:boolean}>}
 */
async function compare(previousRoot,currentRoot) {
  const previous=loadCompiler(previousRoot);
  const current=loadCompiler(currentRoot);
  const original='function privateScore(x){return 41*x+7;}module.exports=privateScore(3);';
  const map=Buffer.from(JSON.stringify({
    version:3,sources:['entry.cjs'],sourcesContent:[original],
    names:['privateScore'],mappings:'AAAA'
  })).toString('base64');
  const css='body{color:black}/*# sourceMappingURL=data:application/json;base64,'+map+' */';
  const html='<!doctype html><link rel="stylesheet" href="data:text/css;base64,'+
    Buffer.from(css).toString('base64')+'"><p>safe page</p>';
  /** @type {File} */
  const entry={path:'entry.cjs',code:original,sourceType:'commonjs'};
  /** @type {File} */
  const asset={path:'index.html',sourceType:'asset',code:Buffer.from(html)};
  /** @type {{mode:Mode,extracted:boolean,refused:boolean}[]} */
  const modes=[];
  for(const mode of /** @type {Mode[]} */ (['coo','sco','sno'])) {
    const opts={mode,seed:'data-style-source-leak',strings:false};
    const output=previous.obfuscateFiles([entry,asset],opts);
    const published=output.files.find(file=>file.path==='index.html');
    const executable=output.files.find(file=>file.path==='entry.cjs');
    assert.ok(published);
    assert.ok(executable);
    assert.notEqual(String(executable.code),original,
      'The baseline comparison must include actually transformed code');
    const before={module:{exports:null}},after={module:{exports:null}};
    vm.runInNewContext(original,before,{timeout:1500});
    vm.runInNewContext(String(executable.code),after,{timeout:1500});
    assert.equal(after.module.exports,before.module.exports);
    const actual=recoverOriginal(published.code);
    assert.equal(actual,original);
    assert.throws(()=>current.obfuscateFiles([entry,asset],opts),
      /HTML asset contains embedded stylesheet data URL/u);
    modes.push({mode,extracted:true,refused:true});
  }
  const previousResponse=await getPublishedHtml(previous.createScoHandler([asset]));
  assert.equal(previousResponse.status,200);
  assert.equal(recoverOriginal(previousResponse.body),original);
  assert.throws(()=>current.createScoHandler([asset]),
    /HTML asset contains embedded stylesheet data URL/u);
  return {prepatch:path.resolve(previousRoot),protected:path.resolve(currentRoot),
    modes,scoHttpExtracted:true,scoPublicationRefused:true};
}

if(require.main===module) {
  const previous=process.argv[2],current=process.argv[3];
  if(!previous || !current)throw new TypeError('Expected previous and current repository paths');
  compare(previous,current).then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }).catch(error=>{
    process.stderr.write(String(error.stack||error)+'\n');
    process.exitCode=1;
  });
}

module.exports={compare,recoverOriginal};
