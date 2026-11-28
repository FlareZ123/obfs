'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
  partitionScoAsyncGraph,
  partitionScoSelectedGraph,
  partitionScoSelectedAsyncExports
}=require('../src');

const simple='export async function secret(value){return value+1;}'+
  'export function local(value){return value;}';

/** @param {string} a @param {string} b */
function privateGraph(a,b){
  return partitionScoAsyncGraph([
    {path:a,code:simple},
    {path:b,code:simple}
  ],{seed:'portable-private-graph-20261128',exposedPaths:[a]});
}

/** @param {string} a @param {string} b */
function selectedGraph(a,b){
  return partitionScoSelectedGraph([
    {file:{path:a,code:simple},options:{
      seed:'portable-selected-graph-20261128',privateNames:['secret']
    }},
    {file:{path:b,code:simple},options:{
      seed:'portable-selected-graph-20261128',privateNames:['secret']
    }}
  ]);
}

/**
 * Both sources are syntactically reachable from the selected private export,
 * making collision refusal the only expected reason for admission to fail.
 * @param {string} a @param {string} b
 */
function selectiveGraph(a,b){
  const code='import {value as x} from "./'+a+'";\n'+
    'import {value as y} from "./'+b+'";\n'+
    'export async function secret(z){return x+y+z;}\n'+
    'export function local(z){return z;}';
  const sources=[{path:a,code:'export const value=1;'},
    {path:b,code:'export const value=2;'}];
  return partitionScoSelectedAsyncExports({
    path:'entry.mjs',sourceType:'module',code
  },{
    seed:'portable-selective-source-20261128',
    privateNames:['secret'],
    privateModuleImports:['./'+a,'./'+b],
    privateModuleSources:sources
  });
}

const collisions=[
  {kind:'NFC',a:'caf\u00e9.mjs',b:'cafe\u0301.mjs'},
  {kind:'Greek equal-uppercase',a:'\u03a3.mjs',b:'\u03c2.mjs'},
  {kind:'ancestor directory',a:'PRIVATE/a.mjs',b:'private/b.mjs'},
  {kind:'file/directory',a:'bundle.mjs',b:'bundle.mjs/dependency.mjs'}
];

for(const {kind,a,b} of collisions){
  test('SCO private graph refuses '+kind+' portable collision',()=>{
    assert.throws(()=>privateGraph(a,b),error=>error instanceof TypeError &&
      /Duplicate private graph path|Ambiguous directory spelling|File conflicts with directory/u
        .test(error.message));
  });
  test('SCO selected graph refuses '+kind+' portable collision',()=>{
    assert.throws(()=>selectedGraph(a,b),error=>error instanceof TypeError &&
      /Case-colliding selected SCO module path|Ambiguous directory spelling|File conflicts with directory/u
        .test(error.message));
  });
}

// The private static import source grammar is independent from public graph
// admission. Both source modules are explicitly imported and their fields used.
for(const {kind,a,b} of collisions.slice(0,3)){
  test('SCO selective import closure refuses '+kind+' portable collision',()=>{
    assert.throws(()=>selectiveGraph(a,b),error=>error instanceof TypeError &&
      /distinct \.mjs paths|Ambiguous directory spelling|File conflicts with directory/u
        .test(error.message));
  });
}

test('SCO selected graph permits repeated identical private dependency with matching digest',()=>{
  const source='import {value} from "./private/shared.mjs";'+
    'export async function secret(z){return value+z;}'+
    'export function local(z){return z;}';
  const units=['alpha.mjs','beta.mjs'].map(name=>({
    file:{path:name,code:source},options:{
      privateNames:['secret'],seed:'shared-portable-path-20261128',
      privateModuleImports:['./private/shared.mjs'],
      privateModuleSources:[{path:'private/shared.mjs',code:'export const value=7;'}]
    }
  }));
  const graph=partitionScoSelectedGraph(units);
  assert.deepEqual(graph.privatePaths,['private/shared.mjs']);
  assert.equal(graph.privateSourceDigests.filter(x=>
    x.path==='private/shared.mjs').length,1);
});



for(const {kind,a,b} of collisions){
  test('SCO selective publication refuses public/private '+kind+' collision',()=>{
    assert.throws(()=>partitionScoSelectedAsyncExports({
      path:a,code:simple,sourceType:'module'
    },{
      privateNames:['secret'],seed:'selected-public-private-alias-20261128',
      additionalPrivateModulePaths:[b]
    }),error=>error instanceof TypeError &&
      /Selected SCO private source path aliases|Ambiguous directory spelling|File conflicts with directory/u
        .test(error.message));
  });
}

test('SCO path inventory preserves unambiguous source graphs',()=>{
  assert.equal(privateGraph('a.mjs','b.mjs').exposedPaths.length,1);
  assert.equal(selectedGraph('alpha.mjs','beta.mjs').exposedPaths.length,2);
  assert.deepEqual(selectiveGraph('PRIVATE/a.mjs','PRIVATE/b.mjs').clientFile.privateModulePaths,
    ['PRIVATE/a.mjs','PRIVATE/b.mjs']);
  assert.deepEqual(partitionScoSelectedAsyncExports({
    path:'entry.mjs',code:simple,sourceType:'module'
  },{
    seed:'positive-private-source-path-20261128',privateNames:['secret'],
    additionalPrivateModulePaths:['private/dependency.mjs']
  }).clientFile.privateModulePaths,['private/dependency.mjs']);
});
