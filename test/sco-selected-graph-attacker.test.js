'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {partitionScoSelectedGraph}=require('../src');
const {recoverSingleRpc}=require('../sims/sco-selected-graph-attacker');

test('independent attacker extracts only published single-method SCO identities',()=>{
  const source='const PRIVATE_KEY="server-only";'+
    'export async function secret(value){return PRIVATE_KEY+value;}'+
    'export function local(value){return value.length;}';
  const graph=partitionScoSelectedGraph([{
    file:{path:'public.mjs',code:source,sourceType:'module'},
    options:{seed:'public-only-attack-parser',privateNames:['secret']}
  }]);
  const facade=graph.clientFiles[0].code;
  assert.doesNotMatch(facade,/PRIVATE_KEY|server-only/u);
  const actual=recoverSingleRpc(facade);
  assert.deepEqual(actual,{
    method:graph.partitions['public.mjs'].methodNames.secret,
    endpoint:'/obfs/rpc'
  });
  for(const bad of ['', 'fetch("/obfs/rpc",{});', 
    'fetch("/obfs/rpc",{});"m000000000000000000000000";"m111111111111111111111111";']){
    assert.throws(()=>recoverSingleRpc(bad),/public RPC facade grammar/u);
  }
});
