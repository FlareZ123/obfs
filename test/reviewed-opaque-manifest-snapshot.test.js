'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {assertReviewedOpaqueAssets,obfuscateFiles,createScoHandler}=require('../src');

/** @param {string|Buffer} code @returns {string} */
const digest=code=>createHash('sha256').update(code).digest('hex');
const safe=Buffer.from('body{color:teal}');
const other=Buffer.from('public-data=OriginalSource_3113');
const safeFile={path:'theme.css',sourceType:/** @type {const} */('asset'),code:safe};
const otherFile={path:'preferences.txt',sourceType:/** @type {const} */('asset'),code:other};
const entry={path:'entry.cjs',sourceType:/** @type {const} */('commonjs'),
  code:'module.exports=function(value){return value+7};'};

test('reviewed manifest cannot inject an unindexed path through Symbol.iterator',()=>{
  const reviewed=[{path:'theme.css',sha256:digest(safe)}];
  // A caller-managed iterator could produce a different authority from
  // the array entries shown to an independent reviewer.
  Object.defineProperty(reviewed,Symbol.iterator,{
    value:function*(){yield {path:'preferences.txt',sha256:digest(other)};}
  });
  assert.throws(()=>assertReviewedOpaqueAssets([otherFile],reviewed),
    /Opaque asset not in reviewedOpaqueAssets/);
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    assert.throws(()=>obfuscateFiles([entry,otherFile],{
      mode,reviewedOpaqueAssets:reviewed
    }),/Opaque asset not in reviewedOpaqueAssets/,mode);
  }
  assert.throws(()=>createScoHandler([otherFile],{
    reviewedOpaqueAssets:reviewed
  }),/Opaque asset not in reviewedOpaqueAssets/);
});

test('an overridden manifest iterator is never called for valid indexed approval',()=>{
  const reviewed=[{path:'theme.css',sha256:digest(safe)}];
  Object.defineProperty(reviewed,Symbol.iterator,{
    value:()=>{throw new Error('untrusted approval iterator called');}
  });
  assert.doesNotThrow(()=>assertReviewedOpaqueAssets([safeFile],reviewed));
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const files=obfuscateFiles([entry,safeFile],{
      mode,reviewedOpaqueAssets:reviewed
    }).files;
    assert.deepEqual(files.find(file=>file.path==='theme.css')?.code,safe);
  }
  assert.equal(typeof createScoHandler([safeFile],{
    reviewedOpaqueAssets:reviewed
  }),'function');
});

test('manifest record path and digest getters are authoritative on first read',()=>{
  /** @returns {{manifest:{path:string,sha256:string}[],reads:{path:number,sha256:number}}} */
  function manifest(){
    const reads={path:0,sha256:0};
    const entry={
      get path(){return ++reads.path===1?'theme.css':'preferences.txt';},
      get sha256(){return ++reads.sha256===1?digest(safe):digest(other);}
    };
    return {manifest:[entry],reads};
  }
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const {manifest:reviewed,reads}=manifest();
    const output=obfuscateFiles([entry,safeFile],{
      mode,reviewedOpaqueAssets:reviewed
    });
    assert.deepEqual(output.files.find(file=>file.path==='theme.css')?.code,safe);
    assert.deepEqual(reads,{path:1,sha256:1},mode);
  }
  const {manifest:reviewed,reads}=manifest();
  assert.equal(typeof createScoHandler([safeFile],{
    reviewedOpaqueAssets:reviewed
  }),'function');
  assert.deepEqual(reads,{path:1,sha256:1});
});

test('manifest record insertion during validation does not extend approved inventory',()=>{
  /** @type {{path:string,sha256:string}[]} */
  const reviewed=[];
  reviewed.push({
    get path(){
      reviewed.push({path:'preferences.txt',sha256:digest(other)});
      return 'theme.css';
    },
    sha256:digest(safe)
  });
  assert.doesNotThrow(()=>assertReviewedOpaqueAssets([safeFile],reviewed));
  assert.equal(reviewed.length,2);
  assert.throws(()=>assertReviewedOpaqueAssets([safeFile],reviewed),
    /unused or missing published asset/);
});

test('sparse indexed reviewed manifests are refused rather than skipped',()=>{
  /** @type {{path:string,sha256:string}[]} */
  const sparse=new Array(2);
  sparse[1]={path:'theme.css',sha256:digest(safe)};
  assert.throws(()=>assertReviewedOpaqueAssets([safeFile],sparse),
    /reviewedOpaqueAssets entries need an exact path/);
});

test('final-distribution recheck ignores an array iterator that hides unapproved files',()=>{
  const reviewed=[{path:'theme.css',sha256:digest(safe)}];
  const files=[otherFile];
  Object.defineProperty(files,Symbol.iterator,{
    value:function*(){yield safeFile;}
  });
  assert.throws(()=>assertReviewedOpaqueAssets(files,reviewed),
    /Opaque asset not in reviewedOpaqueAssets/);
});

test('final-distribution recheck accepts valid indexed output without invoking its iterator',()=>{
  const files=[safeFile];
  Object.defineProperty(files,Symbol.iterator,{
    value:()=>{throw new Error('caller-controlled output iterator executed');}
  });
  assert.doesNotThrow(()=>assertReviewedOpaqueAssets(files,[
    {path:'theme.css',sha256:digest(safe)}
  ]));
});

test('published asset metadata getters are sampled once per recheck',()=>{
  const reads={path:0,code:0,sourceType:0};
  const observable={
    get path(){return ++reads.path===1?'theme.css':'preferences.txt';},
    get sourceType(){reads.sourceType++;return 'asset';},
    get code(){reads.code++;return safe;}
  };
  assert.doesNotThrow(()=>assertReviewedOpaqueAssets([observable],[
    {path:'theme.css',sha256:digest(safe)}
  ]));
  assert.deepEqual(reads,{path:1,code:1,sourceType:1});
});

test('final-distribution recheck rejects sparse published file inventories',()=>{
  /** @type {{path:string,code:string|Buffer,sourceType:string}[]} */
  const sparse=new Array(2);
  sparse[1]=safeFile;
  assert.throws(()=>assertReviewedOpaqueAssets(sparse,[
    {path:'theme.css',sha256:digest(safe)}
  ]),/Published files must contain indexed file records/);
});

test('duplicate approved asset copies cannot hide a missing reviewed path',()=>{
  const reviewed=[
    {path:'theme.css',sha256:digest(safe)},
    {path:'preferences.txt',sha256:digest(other)}
  ];
  assert.throws(()=>assertReviewedOpaqueAssets([safeFile,safeFile],reviewed),
    /Duplicate published opaque asset path/);
  assert.doesNotThrow(()=>assertReviewedOpaqueAssets([safeFile,otherFile],reviewed));
});

test('reviewed policy adds no emitted JavaScript work for the same seeded three-mode compile',()=>{
  const files=[
    {path:'entry.cjs',sourceType:/** @type {const} */('commonjs'),
      code:'module.exports=require("./worker.cjs")(7);'},
    {path:'worker.cjs',sourceType:/** @type {const} */('commonjs'),
      code:'module.exports=function(x){let y=x+7;return y*3;};'},
    {path:'theme.css',sourceType:/** @type {const} */('asset'),code:safe}
  ];
  const reviewed=[{path:'theme.css',sha256:digest(safe)}];
  /** @param {ReturnType<typeof obfuscateFiles>} result */
  const emitted=result=>result.files.map(file=>({
    path:file.path,sourceType:file.sourceType,code:Buffer.isBuffer(file.code)?
      file.code.toString('base64'):file.code,metrics:file.metrics
  }));
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    for(let seed=0;seed<12;seed++){
      const opts={mode,seed:'reviewed-emission-'+seed,closedWorld:true};
      const native=obfuscateFiles(files,opts);
      const approved=obfuscateFiles(files,{...opts,reviewedOpaqueAssets:reviewed});
      assert.deepEqual(emitted(approved),emitted(native),mode+' seed '+seed);
    }
  }
});

test('approval is not an override for independently forbidden source-bearing asset formats',()=>{
  const items=[
    {path:'archive.map',sourceType:/** @type {const} */('asset'),
      code:Buffer.from(JSON.stringify({
        version:3,file:'bundle.js',sources:['src/original.js'],
        sourcesContent:['function originalSecret(){return 31337;}'],names:[],mappings:'AAAA'
      }))},
    {path:'page.html',sourceType:/** @type {const} */('asset'),
      code:Buffer.from('<html><body><script>globalThis.originalSecret=31337</script></body></html>')}
  ];
  const entry={path:'entry.cjs',sourceType:/** @type {const} */('commonjs'),
    code:'module.exports=17;'};
  for(const asset of items){
    const reviewedOpaqueAssets=[{path:asset.path,sha256:digest(asset.code)}];
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      assert.throws(()=>obfuscateFiles([entry,asset],{
        mode,reviewedOpaqueAssets,seed:'approval-is-not-a-security-bypass'
      }),/source.map|inline script/i,mode+' '+asset.path);
    }
    assert.throws(()=>createScoHandler([asset],{
      reviewedOpaqueAssets
    }),/source.map|inline script/i,'SCO handler '+asset.path);
  }
});

test('reviewed manifest follows portable canonical path collision policy',()=>{
  const collisions=[
    ['Σ.css','ς.css'],
    ['Café.css','Cafe\u0301.css'],
    ['straße.css','STRASSE.css'],
    ['Images/a.css','images/b.css']
  ];
  for(const [first,second] of collisions){
    const files=[
      {path:first,sourceType:/** @type {const} */('asset'),code:safe},
      {path:second,sourceType:/** @type {const} */('asset'),code:other}
    ];
    const approved=[
      {path:first,sha256:digest(safe)},
      {path:second,sha256:digest(other)}
    ];
    assert.throws(()=>assertReviewedOpaqueAssets(files,approved),
      /Duplicate reviewedOpaqueAssets path|Ambiguous directory spelling/,
      'reviewed paths must use compiler-equivalent portable identities');
    assert.throws(()=>assertReviewedOpaqueAssets(files,[approved[0]]),
      /Duplicate published opaque asset path|Ambiguous directory spelling/,
      'published paths must also enforce portable identities');
  }
  const independent=[
    {path:'σ.css',sourceType:/** @type {const} */('asset'),code:safe},
    {path:'λ.css',sourceType:/** @type {const} */('asset'),code:other}
  ];
  assert.doesNotThrow(()=>assertReviewedOpaqueAssets(independent,[
    {path:'σ.css',sha256:digest(safe)},
    {path:'λ.css',sha256:digest(other)}
  ]));
});

test('standalone asset review refuses compiler-unsafe paths in both input inventories',()=>{
  const invalid=[
    '../theme.css',
    'assets/../theme.css',
    '/theme.css',
    'assets\\theme.css',
    'CON.txt',
    'assets/aux.css',
    'public~1.css',
    'assets//theme.css',
    'assets/ .css',
    'bad\uD800.css'
  ];
  for(const name of invalid){
    const approved=[{path:name,sha256:digest(safe)}];
    assert.throws(()=>assertReviewedOpaqueAssets([safeFile],approved),
      /Unsafe/, 'invalid reviewed path: '+name);
    assert.throws(()=>assertReviewedOpaqueAssets([
      {path:name,sourceType:/** @type {const} */('asset'),code:safe}
    ],[{path:'theme.css',sha256:digest(safe)}]),
    /Unsafe/, 'invalid published asset path: '+name);
  }
  assert.doesNotThrow(()=>assertReviewedOpaqueAssets([
    {path:'assets/theme.css',sourceType:/** @type {const} */('asset'),code:safe}
  ],[{path:'assets/theme.css',sha256:digest(safe)}]));
});
