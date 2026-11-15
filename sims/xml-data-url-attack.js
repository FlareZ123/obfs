'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const http=require('node:http');

/**
 * @typedef {'coo'|'sco'|'sno'} Mode
 * @typedef {{path:string,code:string|Buffer,sourceType:'commonjs'|'asset'}} File
 * @typedef {{obfuscateFiles:(files:File[],options:{mode:Mode,seed:string})=>{files:{path:string,code:string|Buffer}[]},createScoHandler:(files:File[])=>import('node:http').RequestListener}} Compiler
 */

/** @param {string} root @returns {Compiler} */
function compilerAt(root) {
  return require(path.resolve(root,'src'));
}

/**
 * @param {import('node:http').RequestListener} handler
 * @param {string} assetName
 * @returns {Promise<{status:number,body:string}>}
 */
async function servedAsset(handler,assetName) {
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  const address=server.address();
  assert.ok(address && typeof address!=='string');
  try {
    return await new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port:address.port,path:'/obfs/'+assetName},response=>{
        /** @type {Buffer[]} */
        const chunks=[];
        response.on('data',chunk=>chunks.push(Buffer.from(chunk)));
        response.on('end',()=>resolve({
          status:response.statusCode??0,body:Buffer.concat(chunks).toString('utf8')
        }));
      }).on('error',reject);
    });
  }finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

/**
 * Compare against the immediate parent compiler that had HTML refresh/SVG
 * srcdoc guards but did not know that XHTML/XML media types can execute.
 * @param {string} previousRoot
 * @param {string} currentRoot
 * @returns {Promise<{previous:string,current:string,byMode:{mode:Mode,published:number,refused:number}[],scoHttpPublished:number,scoHttpRefused:number}>}
 */
async function compare(previousRoot,currentRoot) {
  const previous=compilerAt(previousRoot);
  const current=compilerAt(currentRoot);
  const secret='xmlDocumentPrivateSource_4fc3d2';
  const xml='<html xmlns="http://www.w3.org/1999/xhtml">'+
    '<head><script>window.'+secret+'=17;</script></head></html>';
  const entry=/** @type {File} */ ({path:'entry.cjs',sourceType:'commonjs',code:'module.exports=7;'});
  /** @type {File[]} */
  const specimens=[];
  for(const [label,mime] of [
    ['xhtml','application/xhtml+xml'],
    ['application-xml','application/xml'],
    ['text-xml','text/xml']
  ]) {
    const url='data:'+mime+','+encodeURIComponent(xml);
    specimens.push(
      {path:label+'-iframe.html',sourceType:'asset',code:'<iframe src="'+url+'"></iframe>'},
      {path:label+'-refresh.html',sourceType:'asset',code:'<meta http-equiv="refresh" content="0; URL='+url+'">'},
      {path:label+'-link.svg',sourceType:'asset',code:'<svg xmlns="http://www.w3.org/2000/svg"><a href="'+url+'"/></svg>'}
    );
  }
  /** @type {{mode:Mode,published:number,refused:number}[]} */
  const byMode=[];
  for(const mode of /** @type {Mode[]} */ (['coo','sco','sno'])) {
    let published=0;
    let refused=0;
    for(const asset of specimens) {
      const options={mode,seed:'xml-mime-immediate-parent'};
      const before=previous.obfuscateFiles([entry,asset],options);
      const copy=before.files.find(file=>file.path===asset.path);
      assert.ok(copy,asset.path);
      const content=Buffer.isBuffer(copy.code)?copy.code.toString('utf8'):copy.code;
      assert.ok(content.includes(secret),asset.path+' prepatch disclosed source');
      published++;
      assert.throws(()=>current.obfuscateFiles([entry,asset],options),
        /(?:HTML|SVG) asset contains embedded executable (?:URL|refresh URL)/,
        asset.path+' postpatch refused source');
      refused++;
    }
    byMode.push({mode,published,refused});
  }
  let scoHttpPublished=0;
  let scoHttpRefused=0;
  for(const asset of specimens) {
    const original=await servedAsset(previous.createScoHandler([asset]),asset.path);
    assert.equal(original.status,200,asset.path);
    assert.ok(original.body.includes(secret),asset.path);
    scoHttpPublished++;
    assert.throws(()=>current.createScoHandler([asset]),
      /(?:HTML|SVG) asset contains embedded executable (?:URL|refresh URL)/);
    scoHttpRefused++;
  }
  // A non-script data URL remains byte-for-byte intact in every mode.
  const benign=/** @type {File} */ ({
    path:'json-data.html',sourceType:'asset',
    code:'<iframe src="data:application/json,%7B%22ok%22%3Atrue%7D"></iframe>'
  });
  for(const mode of /** @type {Mode[]} */ (['coo','sco','sno'])) {
    const output=current.obfuscateFiles([entry,benign],{mode,seed:'xml-mime-benign'});
    assert.equal(output.files.find(file=>file.path===benign.path)?.code,benign.code);
  }
  return {previous:path.resolve(previousRoot),current:path.resolve(currentRoot),byMode,
    scoHttpPublished,scoHttpRefused};
}

if(require.main===module) {
  const previous=process.argv[2];
  const current=process.argv[3];
  if(!previous||!current)throw new TypeError('Expected immediate previous and protected roots');
  compare(previous,current).then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }).catch(error=>{
    process.stderr.write(String(error.stack||error)+'\n');
    process.exitCode=1;
  });
}

module.exports={compare};
