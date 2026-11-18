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
