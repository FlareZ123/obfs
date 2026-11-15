'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const http=require('node:http');
const {performance}=require('node:perf_hooks');

/**
 * @typedef {'coo'|'sco'|'sno'} Mode
 * @typedef {{path:string,code:string|Buffer,sourceType:'module'|'commonjs'|'asset'}} File
 * @typedef {{obfuscateFiles:(files:File[],opts:{mode:Mode,seed:string})=>{files:{path:string,code:string|Buffer}[]},createScoHandler:(files:File[])=>import('node:http').RequestListener}} Compiler
 */

/**
 * @param {string} root
 * @returns {Compiler}
 */
function compilerAt(root) {
  return require(path.resolve(root,'src'));
}

/**
 * @param {import('node:http').RequestListener} handler
 * @param {string} name
 * @returns {Promise<{status:number,body:Buffer}>}
 */
async function readScoAsset(handler,name) {
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();
  assert.ok(address && typeof address!=='string');
  try {
    return await new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port:address.port,path:'/obfs/'+name},response=>{
        /** @type {Buffer[]} */
        const chunks=[];
        response.on('data',chunk=>chunks.push(Buffer.from(chunk)));
        response.on('end',()=>resolve({status:response.statusCode??0,body:Buffer.concat(chunks)}));
      }).on('error',reject);
    });
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

/**
 * @param {string} baselineRoot
 * @param {string} protectedRoot
 * @returns {Promise<object>}
 */
async function evaluate(baselineRoot,protectedRoot) {
  const baseline=compilerAt(baselineRoot);
  const protectedCompiler=compilerAt(protectedRoot);
  const secret='privateCalculationToken_77f9d7';
  const source='const '+secret+'=23; module.exports='+secret+';';
  const entry=/** @type {File} */ ({path:'entry.cjs',sourceType:'commonjs',code:source});
  const map=/** @type {File} */ ({
    path:'entry.cjs.map',sourceType:'asset',
    code:Buffer.from(JSON.stringify({
      version:3,sources:['original-source.js'],
      sourcesContent:[source],names:[secret],mappings:'AAAA'
    }))
  });
  const html=/** @type {File} */ ({
    path:'index.html',sourceType:'asset',
    code:Buffer.from('<!doctype html><script>window.'+secret+'=23;</script>')
  });
  const disguised=/** @type {File} */ ({
    path:'original.jsx',sourceType:'asset',code:Buffer.from(source)
  });
  const svg=/** @type {File} */ ({
    path:'icon.svg',sourceType:'asset',
    code:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>window.'+secret+'=31;</script></svg>')
  });
  const safeHtml=/** @type {File} */ ({
    path:'safe.html',sourceType:'asset',
    code:Buffer.from('<!doctype html><script src="./entry.cjs"></script>')
  });
  /** @type {{mode:Mode,disclosedByBaseline:number,refusedByProtected:number,safeHtmlPreserved:boolean,executableBytesUnchangedWithSafeHtml:boolean,baselineBuildMs:number,protectedBuildMs:number}[]} */
  const rows=[];
  for(const mode of /** @type {Mode[]} */ (['coo','sco','sno'])) {
    const options={mode,seed:'asset-disclosure-attack-control'};
    const sourceArtifacts=[map,html,disguised,svg];
    let disclosedByBaseline=0;
    let refusedByProtected=0;
    const startBaseline=performance.now();
    for(const asset of sourceArtifacts) {
      const out=baseline.obfuscateFiles([entry,asset],options).files.find(f=>f.path===asset.path);
      assert.ok(out,asset.path);
      const published=Buffer.isBuffer(out.code)?out.code.toString('utf8'):out.code;
      if(asset.path.endsWith('.map')) {
        const decoded=JSON.parse(published);
        assert.equal(decoded.sourcesContent[0],source);
        disclosedByBaseline++;
      } else {
        assert.ok(published.includes(secret),asset.path);
        disclosedByBaseline++;
      }
    }
    const baselineBuildMs=performance.now()-startBaseline;
    const startProtected=performance.now();
    for(const asset of sourceArtifacts) {
      assert.throws(()=>protectedCompiler.obfuscateFiles([entry,asset],options),
        /(?:Source-map asset|HTML asset|SVG asset|Untransformed source asset)/);
      refusedByProtected++;
    }
    const protectedBuildMs=performance.now()-startProtected;
    const baselineSafe=baseline.obfuscateFiles([entry,safeHtml],options);
    const safe=protectedCompiler.obfuscateFiles([entry,safeHtml],options);
    const onlyJS=protectedCompiler.obfuscateFiles([entry],options);
    const protectedHtml=safe.files.find(f=>f.path===safeHtml.path);
    assert.ok(protectedHtml);
    const safeHtmlPreserved=Buffer.from(protectedHtml.code).equals(Buffer.from(safeHtml.code));
    assert.ok(safeHtmlPreserved);
    const executableBytesUnchangedWithSafeHtml=String(safe.files.find(f=>f.path===entry.path)?.code)===
      String(onlyJS.files.find(f=>f.path===entry.path)?.code);
    assert.ok(executableBytesUnchangedWithSafeHtml);
    assert.ok(baselineSafe.files.some(f=>f.path===safeHtml.path));
    rows.push({mode,disclosedByBaseline,refusedByProtected,safeHtmlPreserved,
      executableBytesUnchangedWithSafeHtml,baselineBuildMs,protectedBuildMs});
  }

  const baselineMapResponse=await readScoAsset(baseline.createScoHandler([map]),map.path);
  assert.equal(baselineMapResponse.status,200);
  assert.equal(JSON.parse(baselineMapResponse.body.toString('utf8')).sourcesContent[0],source);
  assert.throws(()=>protectedCompiler.createScoHandler([map]),/Source-map asset/);
  const baselineHtmlResponse=await readScoAsset(baseline.createScoHandler([html]),html.path);
  assert.equal(baselineHtmlResponse.status,200);
  assert.ok(baselineHtmlResponse.body.toString('utf8').includes(secret));
  assert.throws(()=>protectedCompiler.createScoHandler([html]),/HTML asset/);
  const baselineSvgResponse=await readScoAsset(baseline.createScoHandler([svg]),svg.path);
  assert.equal(baselineSvgResponse.status,200);
  assert.ok(baselineSvgResponse.body.toString('utf8').includes(secret));
  assert.throws(()=>protectedCompiler.createScoHandler([svg]),/SVG asset/);
  const result={
    baselinePath:path.resolve(baselineRoot),
    protectedPath:path.resolve(protectedRoot),
    attack:'Read distributed opaque asset without executing or deobfuscating JavaScript',
    rows,
    scoAssetExtraction:{sourceMapRecovered:true,htmlRecovered:true,svgRecovered:true,protectedRefusal:true},
    note:'Timings are cold, tiny preflight samples and are NOT runtime overhead benchmarks.'
  };
  return result;
}

if(require.main===module) {
  const baseline=process.argv[2];
  const protectedRoot=process.argv[3];
  if(!baseline||!protectedRoot)throw new TypeError('Expected baseline and protected repository roots');
  evaluate(baseline,protectedRoot).then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }).catch(error=>{
    process.stderr.write(String(error.stack||error)+'\n');
    process.exitCode=1;
  });
}

module.exports={evaluate};
