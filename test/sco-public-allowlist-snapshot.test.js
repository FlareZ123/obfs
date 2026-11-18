'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createScoHandler}=require('../src');

const files=[
  {path:'public.css',sourceType:'asset',code:'body{color:blue}'},
  {path:'private.css',sourceType:'asset',code:'PRIVATE_PUBLICPATHS_CANARY_20261118'}
];

test('SCO uses the first declared positive allowlist even if an options getter later expands it',()=>{
  let reads=0;
  const options={
    get publicPaths(){
      reads++;
      return reads===1?['public.css']:['public.css','private.css'];
    }
  };
  assert.throws(()=>createScoHandler(files,options),/not in publicPaths: private\.css/u);
  assert.equal(reads,1,'The allowlist configuration getter is read once');
});

test('SCO ignores caller-owned publicPaths iterator overrides',()=>{
  const publicPaths=['public.css'];
  let iteratorCalls=0;
  Object.defineProperty(publicPaths,Symbol.iterator,{
    configurable:true,
    value:function*(){
      iteratorCalls++;
      yield 'public.css';
      yield 'private.css';
    }
  });
  assert.throws(()=>createScoHandler(files,{publicPaths}),
    /not in publicPaths: private\.css/u);
  assert.equal(iteratorCalls,0,'The allowlist is copied by indexed data access');
});

test('SCO snapshots each publicPaths indexed value once',()=>{
  const publicPaths=['public.css'];
  let elementReads=0;
  Object.defineProperty(publicPaths,0,{
    configurable:true,
    enumerable:true,
    get(){
      elementReads++;
      return elementReads===1?'public.css':'private.css';
    }
  });
  assert.throws(()=>createScoHandler(files,{publicPaths}),
    /not in publicPaths: private\.css/u);
  assert.equal(elementReads,1);
});

test('SCO permits exactly the first declared public file inventory',()=>{
  let reads=0;
  const options={
    get publicPaths(){
      reads++;
      return reads===1?['public.css','private.css']:['public.css'];
    }
  };
  assert.doesNotThrow(()=>createScoHandler(files,options));
  assert.equal(reads,1);
});
