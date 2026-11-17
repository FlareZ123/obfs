'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const http=require('node:http');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');

const entry={path:'main.cjs',sourceType:/** @type {const} */('commonjs'),
  code:'module.exports=function(value){return (value+7)|0;};'};
const safeCss=Buffer.from('@import "./public-theme.css";\n:root{color:teal}', 'utf8');
const safeAsset={path:'theme.css',sourceType:/** @type {const} */ ('asset'),code:safeCss};
const original='function OriginalPrivateSource_86271(value){return value^86271}';
const disguised=Buffer.from('public-key='+Buffer.from(original).toString('base64'));
const disguisedAsset={path:'preferences.txt',sourceType:/** @type {const} */('asset'),
  code:disguised};
/** @param {string|Buffer} bytes @returns {string} */
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
const approved=[{path:'theme.css',sha256:sha256(safeCss)}];

test('reviewed opaque bytes survive COO SNO SCO and direct SCO handler exactly',()=>{
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const result=obfuscateFiles([entry,safeAsset],{
      mode,seed:'independent-asset-review',reviewedOpaqueAssets:approved
    });
    const asset=result.files.find(file=>file.path==='theme.css');
    assert.ok(asset);
    assert.deepEqual(asset.code,safeCss);
  }
  assert.equal(typeof createScoHandler([safeAsset],{
    reviewedOpaqueAssets:approved
  }),'function');
});

test('unknown or stale reviewed asset bytes are refused in every mode and SCO',()=>{
  const manifest=[{path:'preferences.txt',sha256:sha256(safeCss)}];
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    assert.throws(()=>obfuscateFiles([entry,disguisedAsset],{
      mode,reviewedOpaqueAssets:manifest
    }),/Opaque asset differs from reviewed bytes/,mode);
    assert.throws(()=>obfuscateFiles([entry,safeAsset,disguisedAsset],{
      mode,reviewedOpaqueAssets:approved
    }),/Opaque asset not in reviewedOpaqueAssets/,mode+' unexpected');
  }
  assert.throws(()=>createScoHandler([disguisedAsset],{
    reviewedOpaqueAssets:manifest
  }),/Opaque asset differs from reviewed bytes/);
  assert.throws(()=>createScoHandler([safeAsset,disguisedAsset],{
    reviewedOpaqueAssets:approved
  }),/Opaque asset not in reviewedOpaqueAssets/);
});

test('a source-only reader can recover original bytes from an unrecognized encoded opaque asset',()=>{
  const decoded=Buffer.from(String(disguised).split('=',2)[1],'base64').toString('utf8');
  assert.equal(decoded,original);
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const output=obfuscateFiles([entry,disguisedAsset],{
      mode,seed:'legacy-public-asset-no-manifest'
    }).files.find(file=>file.path==='preferences.txt');
    assert.ok(output);
    assert.deepEqual(output.code,disguised);
  }
  // Explicitly approving that same source-bearing asset must remain allowed:
  // reviewed identity binds bytes, never certifies that their contents are safe.
  const reviewed=[{path:'preferences.txt',sha256:sha256(disguised)}];
  assert.doesNotThrow(()=>createScoHandler([disguisedAsset],{
    reviewedOpaqueAssets:reviewed
  }));
});

test('exact reviewed manifest rejects duplicate, mismatched-case and unused paths',()=>{
  const scenarios=[
    {manifest:[{path:'theme.css',sha256:sha256(safeCss)},
      {path:'THEME.CSS',sha256:sha256(safeCss)}],error:/Duplicate reviewedOpaqueAssets path/},
    {manifest:[{path:'THEME.CSS',sha256:sha256(safeCss)}],
      error:/Opaque asset not in reviewedOpaqueAssets/},
    {manifest:[{path:'theme.css',sha256:sha256(safeCss)},
      {path:'obsolete.txt',sha256:sha256(disguised)}],
      error:/unused or missing published asset/},
    {manifest:[{path:'theme.css',sha256:'A'.repeat(64)}],
      error:/lowercase SHA-256/}
  ];
  for(const scenario of scenarios){
    for(const mode of /** @type {const} */ (['coo','sno','sco'])){
      assert.throws(()=>obfuscateFiles([entry,safeAsset],{
        mode,reviewedOpaqueAssets:scenario.manifest
      }),scenario.error,mode);
    }
  }
});

test('strict reviewed manifest with no opaque assets allows transformed-only graphs',()=>{
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const output=obfuscateFiles([entry],{
      mode,seed:'empty-public-assets-reviewed',reviewedOpaqueAssets:[]
    });
    assert.equal(output.files.length,1);
    assert.equal(output.files[0].sourceType,'commonjs');
  }
  assert.equal(typeof createScoHandler([entry],{
    reviewedOpaqueAssets:[]
  }),'function');
});

test('SCO public response preserves reviewed payload bytes with exact handler binding',async()=>{
  const handler=createScoHandler([safeAsset],{
    reviewedOpaqueAssets:approved
  });
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  try{
    const response=await new Promise((resolve,reject)=>{
      http.get({hostname:'127.0.0.1',port:address.port,path:'/obfs/theme.css'},res=>{
        /** @type {Buffer[]} */
        const body=[];
        res.on('data',chunk=>body.push(Buffer.from(chunk)));
        res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(body)}));
        res.on('error',reject);
      }).on('error',reject);
    });
    assert.equal(response.status,200);
    assert.deepEqual(response.body,safeCss);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});
