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
