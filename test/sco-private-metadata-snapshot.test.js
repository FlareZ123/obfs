'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createScoHandler}=require('../src');

test('SCO treats the first declared private path list as authoritative',()=>{
  let reads=0;
  const facade={
    path:'public.css',sourceType:/** @type {const} */ ('asset'),
    code:'body{color:blue}',
    get privateModulePaths(){
      // A caller-controlled getter can return a different declaration on
      // successive reads. The first value explicitly forbids publication.
      reads++;
      return reads===1?['private.css']:[];
    }
  };
  assert.throws(()=>createScoHandler([
    facade,
    {path:'private.css',sourceType:'asset',code:'PRIVATE_SOURCE_CANARY_20261117'}
  ]),/must not serve private source/i);
  assert.equal(reads,1,'Private path metadata is read and snapshotted once');
});

test('SCO treats the first private original digest list as authoritative',()=>{
  const secret='PRIVATE_DIGEST_CANARY_20261117';
  const hash=createHash('sha256').update(secret).digest('hex');
  let reads=0;
  const facade={
    path:'public.css',sourceType:/** @type {const} */ ('asset'),
    code:'body{color:blue}',
    get privateOriginalDigests(){
      reads++;
      return reads===1?[hash]:[];
    }
  };
  assert.throws(()=>createScoHandler([
    facade,
    {path:'renamed-secret.css',sourceType:'asset',code:secret}
  ]),/must not serve original private graph source/i);
  assert.equal(reads,1,'Original private source digests are read once');
});

test('SCO stable caller manifests still reject private material',()=>{
  const secret='CANARY_PRIVATE_MATERIAL_20261117';
  const sha=createHash('sha256').update(secret).digest('hex');
  assert.throws(()=>createScoHandler([
    {path:'public.css',sourceType:'asset',code:'public',
      privateModulePaths:['hidden.css'],privateOriginalDigests:[sha]},
    {path:'hidden.css',sourceType:'asset',code:secret}
  ]),/must not serve private source/i);
  assert.throws(()=>createScoHandler([
    {path:'public.css',sourceType:'asset',code:'public',
      privateOriginalDigests:[sha]},
    {path:'renamed.css',sourceType:'asset',code:secret}
  ]),/original private graph source/i);
});

test('SCO snapshots one mutable digest-array element before validating it',()=>{
  const secret='PRIVATE_ARRAY_DIGEST_CANARY_20261117';
  const sha=createHash('sha256').update(secret).digest('hex');
  let reads=0;
  /** @type {string[]} */
  const values=[];
  Object.defineProperty(values,0,{
    configurable:true,enumerable:true,
    get(){
      reads++;
      return reads===1?sha:'0'.repeat(64);
    }
  });
  values.length=1;
  assert.throws(()=>createScoHandler([
    {path:'public.css',sourceType:'asset',code:'body{color:blue}',
      privateOriginalDigests:values},
    {path:'private-copy.css',sourceType:'asset',code:secret}
  ]),/original private graph source/i);
  assert.equal(reads,1,'An owned metadata snapshot reads each declared element only once');
});

test('SCO ignores caller-owned private path array map overrides',()=>{
  const paths=['hidden.css'];
  Object.defineProperty(paths,'map',{
    value:()=>[],configurable:true
  });
  assert.throws(()=>createScoHandler([
    {path:'public.css',sourceType:'asset',code:'body{color:blue}',
      privateModulePaths:paths},
    {path:'hidden.css',sourceType:'asset',code:'PRIVATE_PATH_ARRAY_MAP_CANARY_20261117'}
  ]),/must not serve private source/i);
});

test('SCO ignores caller-owned digest array iterator overrides',()=>{
  const secret='PRIVATE_ARRAY_ITERATOR_CANARY_20261117';
  const digest=createHash('sha256').update(secret).digest('hex');
  const digests=[digest];
  Object.defineProperty(digests,Symbol.iterator,{
    value:function*(){},configurable:true
  });
  assert.throws(()=>createScoHandler([
    {path:'public.css',sourceType:'asset',code:'body{color:blue}',
      privateOriginalDigests:digests},
    {path:'renamed.css',sourceType:'asset',code:secret}
  ]),/original private graph source/i);
});

test('SCO source file inventory cannot hide manifests through an own map override',()=>{
  const sourceFiles=[
    {path:'public.css',sourceType:'asset',code:'body{color:blue}',
      privateModulePaths:['private.css']},
    {path:'private.css',sourceType:'asset',code:'PRIVATE_FILE_INVENTORY_CANARY_20261117'}
  ];
  let mapCalls=0;
  Object.defineProperty(sourceFiles,'map',{
    configurable:true,
    value:/** @type {typeof sourceFiles.map} */ (function(callback){
      mapCalls++;
      if(mapCalls===1){
        // An overwritten first map can omit declarations while a second
        // map still publishes both files. The handler must use its own copy.
        return [
          {paths:undefined,digests:undefined},
          {paths:undefined,digests:undefined}
        ];
      }
      return Array.prototype.map.call(sourceFiles,callback);
    })
  });
  assert.throws(()=>createScoHandler(sourceFiles),/must not serve private source/i);
  assert.equal(mapCalls,0,'The input array map override is never used');
});
