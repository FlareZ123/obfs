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
 * Recover an exact original source from only public CSS bytes. No original
 * input source or compiler seed is supplied to the attacker.
 * @param {Buffer|string} published
 * @returns {string}
 */
function recoverOriginal(published) {
  const normalized=String(published).replace(/&#(?:x([0-9a-f]+)|([0-9]+));/giu,
    (_whole,hex,decimal)=>String.fromCodePoint(Number.parseInt(hex??decimal,hex===undefined?10:16)));
  const importUrl=/data:text\/css;base64,([A-Za-z0-9+/=]+)/iu.exec(normalized);
  assert.ok(importUrl);
  const nested=Buffer.from(importUrl[1],'base64').toString('utf8');
  const map=/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/iu.exec(nested);
  assert.ok(map);
  const decoded=JSON.parse(Buffer.from(map[1],'base64').toString('utf8'));
  assert.equal(decoded.version,3);
  assert.ok(Array.isArray(decoded.sourcesContent));
  return decoded.sourcesContent[0];
}

/**
 * @param {import('node:http').RequestListener} handler
 * @param {string} [resource]
 * @returns {Promise<{status:number,body:Buffer}>}
 */
async function publishedCssOverHttp(handler,resource='/obfs/style.css') {
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  try {
    return await new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port:address.port,path:resource},response=>{
        /** @type {Buffer[]} */
        const buffers=[];
        response.on('data',part=>buffers.push(Buffer.from(part)));
        response.on('end',()=>resolve({status:response.statusCode??0,body:Buffer.concat(buffers)}));
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
 * @returns {Promise<{prepatch:string,protected:string,modes:{mode:Mode,extracted:boolean,refused:boolean}[],svgPiModes:{mode:Mode,extracted:boolean,refused:boolean}[],scoHttpExtracted:boolean,scoPublicationRefused:boolean,scoSvgHttpExtracted:boolean,scoSvgPublicationRefused:boolean}>}
 */
async function compare(previousRoot,currentRoot) {
  const previous=loadCompiler(previousRoot),current=loadCompiler(currentRoot);
  const original='function secretTransform(x){return 13*x+17;}module.exports=secretTransform(3);';
  const map=Buffer.from(JSON.stringify({
    version:3,sources:['private-original.cjs'],sourcesContent:[original],
    names:['secretTransform'],mappings:'AAAA'
  })).toString('base64');
  const nested='/*# sourceMappingURL=data:application/json;base64,'+map+' */';
  const css='@import url("data:text/css;base64,'+Buffer.from(nested).toString('base64')+'");';
  /** @type {File} */
  const entry={path:'entry.cjs',sourceType:'commonjs',code:original};
  /** @type {File} */
  const asset={path:'style.css',sourceType:'asset',code:Buffer.from(css)};
  /** @type {{mode:Mode,extracted:boolean,refused:boolean}[]} */
  const modes=[];
  for(const mode of /** @type {Mode[]} */ (['coo','sco','sno'])) {
    const options={mode,seed:'nested-css-disclosure',strings:false};
    const published=previous.obfuscateFiles([entry,asset],options);
    const assetOutput=published.files.find(file=>file.path==='style.css');
    const executable=published.files.find(file=>file.path==='entry.cjs');
    assert.ok(assetOutput);
    assert.ok(executable);
    assert.notEqual(String(executable.code),original,
      'The baseline must actually obfuscate the separate executable');
    const native={module:{exports:null}},generated={module:{exports:null}};
    vm.runInNewContext(original,native,{timeout:1500});
    vm.runInNewContext(String(executable.code),generated,{timeout:1500});
    assert.equal(generated.module.exports,native.module.exports);
    assert.equal(recoverOriginal(assetOutput.code),original);
    assert.throws(()=>current.obfuscateFiles([entry,asset],options),
      /CSS data import would publish unaudited nested stylesheet/u);
    modes.push({mode,extracted:true,refused:true});
  }
  const response=await publishedCssOverHttp(previous.createScoHandler([asset]));
  assert.equal(response.status,200);
  assert.equal(recoverOriginal(response.body),original);
  assert.throws(()=>current.createScoHandler([asset]),
    /CSS data import would publish unaudited nested stylesheet/u);
  const svg='<?xml-stylesheet type="text/css" href="data:text/css;base64,'+
    Buffer.from(nested).toString('base64')+'"?>'+
    '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
  /** @type {File} */
  const svgAsset={path:'icon.svg',sourceType:'asset',code:Buffer.from(svg)};
  /** @type {{mode:Mode,extracted:boolean,refused:boolean}[]} */
  const svgPiModes=[];
  for(const mode of /** @type {Mode[]} */ (['coo','sco','sno'])) {
    const options={mode,seed:'xml-pi-source-leak',strings:false};
    const output=previous.obfuscateFiles([entry,svgAsset],options);
    const published=output.files.find(file=>file.path==='icon.svg');
    assert.ok(published);
    assert.equal(recoverOriginal(published.code),original);
    assert.throws(()=>current.obfuscateFiles([entry,svgAsset],options),
      /SVG asset contains embedded XML stylesheet data URL/u);
    svgPiModes.push({mode,extracted:true,refused:true});
  }
  const escapedSvg=svg.replace('href="data:text/css','href="&#x64;&#97;ta&#58;text/css');
  /** @type {File} */
  const escapedAsset={path:'encoded.svg',sourceType:'asset',code:Buffer.from(escapedSvg)};
  const encodedPublished=previous.obfuscateFiles([entry,escapedAsset],{
    mode:'coo',seed:'xml-pi-encoded-source-leak',strings:false
  }).files.find(file=>file.path==='encoded.svg');
  assert.ok(encodedPublished);
  assert.equal(recoverOriginal(encodedPublished.code),original);
  assert.throws(()=>current.obfuscateFiles([entry,escapedAsset],{
    mode:'coo',seed:'xml-pi-encoded-source-leak',strings:false
  }),/SVG asset contains embedded XML stylesheet data URL/u);
  const svgResponse=await publishedCssOverHttp(previous.createScoHandler([svgAsset]),'/obfs/icon.svg');
  assert.equal(svgResponse.status,200);
  assert.equal(recoverOriginal(svgResponse.body),original);
  assert.throws(()=>current.createScoHandler([svgAsset]),
    /SVG asset contains embedded XML stylesheet data URL/u);
  return {prepatch:path.resolve(previousRoot),protected:path.resolve(currentRoot),
    modes,svgPiModes,scoHttpExtracted:true,scoPublicationRefused:true,
    scoSvgHttpExtracted:true,scoSvgPublicationRefused:true};
}

if(require.main===module) {
  const previous=process.argv[2],current=process.argv[3];
  if(!previous||!current)throw new TypeError('Expected previous and current repository paths');
  compare(previous,current).then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }).catch(error=>{
    process.stderr.write(String(error.stack||error)+'\n');
    process.exitCode=1;
  });
}

module.exports={compare,recoverOriginal};
