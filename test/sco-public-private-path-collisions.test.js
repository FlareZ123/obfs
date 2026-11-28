'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createScoHandler}=require('../src');

const source='export function read(){return 7;}';

/**
 * A public pathname and private dependency name must coexist in a portable
 * source tree, not merely be distinct normalized full strings. The private
 * dependency metadata is separately captured and is not an executable route.
 */
for(const {name,publicPath,privatePath} of [
  {name:'public file used as private parent directory',
    publicPath:'bundle.mjs',privatePath:'bundle.mjs/secret.mjs'},
  {name:'private file used as public parent directory',
    publicPath:'bundle.mjs/public.mjs',privatePath:'bundle.mjs'},
  {name:'ambiguous public/private ancestor case',
    publicPath:'PUBLIC/api.mjs',privatePath:'public/secret.mjs'},
  {name:'NFC-equivalent source paths',
    publicPath:'caf\u00e9.mjs',privatePath:'cafe\u0301.mjs'},
  {name:'equal-uppercase source paths',
    publicPath:'\u03a3.mjs',privatePath:'\u03c2.mjs'}
]){
  test('SCO publication rejects '+name,()=>{
    assert.throws(()=>createScoHandler([{
      path:publicPath,code:source,sourceType:'module',
      privateModulePaths:[privatePath]
    }]),error=>error instanceof TypeError &&
      /SCO must not serve private source|Ambiguous directory spelling|File conflicts with directory/u
        .test(error.message));
  });
}


test('SCO publication preserves shared-directory siblings with different leaf files',()=>{
  assert.equal(typeof createScoHandler([{
    path:'modules/public.mjs',code:source,sourceType:'module',
    privateModulePaths:['modules/private.mjs']
  }]),'function');
});

test('SCO publication accepts two public files with one repeated private dependency',()=>{
  const privateModulePaths=['private/secret.mjs'];
  const files=['public/a.mjs','public/b.mjs'].map(name=>({
    path:name,code:source,sourceType:'module',
    privateModulePaths:[...privateModulePaths]
  }));
  assert.equal(typeof createScoHandler(files),'function');
});
