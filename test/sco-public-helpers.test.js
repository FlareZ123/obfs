'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {partitionScoSelectedAsyncExports,bindScoModuleExports}=require('../src');
const {parse}=require('../src/ast');

/**
 * @param {string} source
 * @param {string[]} [publicHelperNames]
 * @returns {import('../src/sco-selective-partition').ScoSelectivePartition}
 */
function partition(source,publicHelperNames=['normalizeInput','formatCount']){
  return partitionScoSelectedAsyncExports({path:'mixed.mjs',sourceType:'module',code:source},{
    seed:'sco-public-helpers-20261115',privateNames:['secret'],publicHelperNames
  });
}

const SOURCE=[
  'const PRIVATE_KEY="SCO_HIDDEN_HELPER_CANARY_673912";',
  'const privateFold=value=>value.length+PRIVATE_KEY.length;',
  'function normalizeInput(value){return String(value).trim().toLowerCase();}',
  'const formatCount=function(value){return value.toString(16);};',
  'export async function secret(value){return privateFold(value);}',
  'export function normalize(value){return normalizeInput(value);}',
  'export function label(value){return formatCount(value.length);}',
  'export async function combined(value){return formatCount(await secret(normalizeInput(value)));}'
].join('\n');

test('checked-in mixed helper example matches the actual emitted client bytes',async()=>{
  const root=path.join(__dirname,'../examples/sco-public-helpers');
  const source=(await fs.readFile(path.join(root,'before','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const expected=(await fs.readFile(path.join(root,'after','mixed.mjs'),'utf8')).replace(/\r\n/gu,'\n');
  const generated=partitionScoSelectedAsyncExports({path:'mixed.mjs',sourceType:'module',code:source},{
    seed:'sco-public-helpers-20261115-example',privateNames:['secret'],
    publicHelperNames:['normalizeInput','formatCount']
  });
  assert.equal(generated.clientFile.code,expected);
  assert.doesNotMatch(expected,/SCO_PUBLIC_HELPER_PRIVATE_CANARY|privateFold|PRIVATE_KEY/u);
  assert.match(expected,/function normalizeInput/u);
  assert.match(expected,/const formatCount/u);
  assert.doesNotThrow(()=>parse(expected,'module'));
});

test('explicit public helpers stay native while private helpers and constants remain server-only',async()=>{
  const split=partition(SOURCE);
  assert.deepEqual(split.publicNames,['normalize','label','combined']);
  assert.deepEqual(split.publicHelperNames,['formatCount','normalizeInput']);
  assert.deepEqual(split.privateNames,['secret']);
  assert.doesNotMatch(split.clientFile.code,/SCO_HIDDEN_HELPER_CANARY|privateFold|PRIVATE_KEY/u);
  assert.match(split.clientFile.code,/function normalizeInput\(/u);
  assert.match(split.clientFile.code,/const formatCount=function\(/u);
  assert.doesNotThrow(()=>parse(split.clientFile.code,'module'));
  const original=await import('data:text/javascript,'+encodeURIComponent(SOURCE));
  const registry=bindScoModuleExports(split,original);
  const previousFetch=globalThis.fetch;
  try{
    globalThis.fetch=async(url,init)=>{
      assert.equal(url,'/obfs/rpc');
      assert.equal(init?.method,'POST');
      const request=JSON.parse(/** @type {string} */ (init.body));
      assert.equal(request.method,split.methodNames.secret);
      const value=await registry[request.method](...request.args);
      return /** @type {Response} */ (/** @type {unknown} */ ({
        ok:true,json:async()=>({ok:true,value})
      }));
    };
    const client=await import('data:text/javascript,'+encodeURIComponent(split.clientFile.code));
    for(const input of ['  Mixed ','beta','\u03b2 eta','ONE']){
      assert.equal(client.normalize(input),original.normalize(input));
      assert.equal(client.label(input),original.label(input));
      assert.equal(await client.combined(input),await original.combined(input));
    }
  }finally{
    globalThis.fetch=previousFetch;
  }
});

test('explicit public helper graph rejects unknown and duplicate selections',()=>{
  assert.throws(()=>partition(SOURCE,['missing']),/Unknown selective SCO public helper/u);
  assert.throws(()=>partition(SOURCE,['formatCount','formatCount']),/distinct privateNames/u);
  assert.throws(()=>partition(SOURCE,['normalize']),/Unknown selective SCO public helper/u);
  assert.throws(()=>partition(SOURCE,['privateFold','normalizeInput']),/server-only constant/u);
});

test('public helper dependency checks reject private source exposure and cross-boundary state',()=>{
  const cases=[
    [
      'const PRIVATE_KEY="hidden";function publicReader(){return PRIVATE_KEY;}'+
      'export async function secret(){return 1;}export function visible(){return publicReader();}',
      /server-only constant/u
    ],
    [
      'function hidden(){return 1;}function publicReader(){return hidden();}'+
      'export async function secret(){return hidden();}export function visible(){return publicReader();}',
      /server-only helper/u
    ],
    [
      'function publicReader(){return secret;}'+
      'export async function secret(){return 1;}export function visible(){return publicReader();}',
      /private function value/u
    ],
    [
      'function publicReader(){return 1;}'+
      'export async function secret(){return publicReader();}export function visible(){return publicReader();}',
      /separated public binding/u
    ],
    [
      'function publicReader(){return globalThis.shared;}'+
      'export async function secret(){return globalThis.shared;}export function visible(){return publicReader();}',
      /share ambient state/u
    ],
    [
      'const PRIVATE_KEY=process.env.OBFS_KEY;function publicReader(){return this.process;}'+
      'export async function secret(){return PRIVATE_KEY;}export function visible(){return publicReader();}',
      /primitive literal/u
    ]
  ];
  for(const [source,error] of cases){
    assert.throws(()=>partition(source,['publicReader']),error,source);
  }
  const envSource=cases[cases.length-1][0];
  assert.throws(()=>partitionScoSelectedAsyncExports({
    path:'mixed.mjs',sourceType:'module',code:envSource
  },{privateNames:['secret'],publicHelperNames:['publicReader'],
    allowServerEnvConstants:true,seed:'sco-public-helper-env'}),
  /cannot share server environment/u);
});
