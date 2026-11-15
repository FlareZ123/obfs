'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');
const {isSourceMapAsset,hasSourceMapDirective}=require('../src/source-maps');

const app={path:'app.mjs',sourceType:'module',code:'export const secretValue=42;const local={hiddenField:4};console.log(local.hiddenField);'};
const map={
  path:'app.mjs.map',
  sourceType:'asset',
  code:Buffer.from(JSON.stringify({
    version:3,sources:['app-original.mjs'],
    sourcesContent:[app.code],names:['secretValue','hiddenField'],mappings:'AAAA'
  }))
};

test('source map sidecars containing original JS are rejected before any transformation',()=>{
  for(const mode of ['coo','sco','sno']){
    assert.throws(
      ()=>obfuscateFiles([app,map],{mode,seed:'source-map-leak'}),
      /Source-map asset would disclose original source: app\.mjs\.map/,
      mode
    );
  }
});

test('source-map filenames are case-insensitive, including nested map assets',()=>{
  assert.equal(isSourceMapAsset('nested/APP.JS.MAP'),true);
  assert.equal(isSourceMapAsset('nested/atlas.map'),true);
  assert.equal(isSourceMapAsset('nested/mapper.js'),false);
  assert.throws(()=>obfuscateFiles([
    app,{...map,path:'nested/APP.JS.MAP'}
  ],{mode:'coo'}),/Source-map asset/);
});

test('real line and block sourceMappingURL comments are refused in each mode',()=>{
  for(const directive of [
    '//# sourceMappingURL=app.mjs.map',
    '//@sourceMappingURL=data:application/json;base64,eyJzb3VyY2VzQ29udGVudCI6W119',
    '/*# sourceMappingURL=https://example.invalid/app.map */'
  ]) {
    const source='export const score=7;\n'+directive+'\n';
    assert.equal(hasSourceMapDirective(source),true,directive);
    for(const mode of ['coo','sco','sno']) {
      assert.throws(()=>obfuscateFiles([
        {path:'app.mjs',sourceType:'module',code:source}
      ],{mode,seed:'source-map-leak'}),/Source-map directive/,mode+' '+directive);
    }
  }
});

test('source-map-like text inside literals and unrelated comments is not treated as a directive',()=>{
  const source=[
    'const s="//# sourceMappingURL=not-a-real.map";',
    'const t=`/*# sourceMappingURL=not-a-real.map */`;',
    'const r=/sourceMappingURL=/;',
    '// Mention sourceMappingURL=link in documentation.',
    'export {s,t,r};'
  ].join('\n');
  assert.equal(hasSourceMapDirective(source),false);
  const result=obfuscateFiles([
    {path:'safe.mjs',sourceType:'module',code:source}
  ],{mode:'coo',seed:'non-directive',strings:false,properties:false,identifiers:false});
  assert.equal(result.files[0].code,source);
});

test('SCO serving preflight refuses explicitly published map assets and inline directives',()=>{
  assert.throws(()=>createScoHandler([app,map]),/Source-map asset/);
  assert.throws(()=>createScoHandler([{
    path:'inline.mjs',sourceType:'module',
    code:'export default 1;\n//# sourceMappingURL=data:application/json;base64,AAAA'
  }]),/Source-map directive/);
  assert.equal(typeof createScoHandler([app]),'function');
});
