'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');
const {hasUnauditedCssDataImport}=require('../src/css-data-imports');

const entry={path:'entry.cjs',sourceType:/** @type {const} */ ('commonjs'),
  code:'module.exports=23;'};
const original='function PRIVATE_DATA_IMPORT_SOURCE(){return 8219;}';
const map=Buffer.from(JSON.stringify({
  version:3,sources:['original.js'],sourcesContent:[original],
  names:['PRIVATE_DATA_IMPORT_SOURCE'],mappings:'AAAA'
})).toString('base64');
const nested='body{color:red}/*# sourceMappingURL=data:application/json;base64,'+map+' */';
const embedded=Buffer.from(nested).toString('base64');
const imports=[
  '@import url("data:text/css;base64,'+embedded+'");',
  '@import "data:text/css;base64,'+embedded+'";',
  String.raw`@import "d\61 ta:text/css;base64,${embedded}";`,
  String.raw`@\69mport url(data:text/css;base64,${embedded});`
];

test('parser-backed CSS data import auditor detects quoted, URL and escaped identifiers',()=>{
  for(const css of imports) {
    assert.equal(hasUnauditedCssDataImport(css),true,css.slice(0,55));
  }
});

test('nested data CSS imports cannot publish source maps through CSS HTML or SVG assets',()=>{
  for(const css of imports) {
    const specimens=[
      {path:'style.css',sourceType:/** @type {const} */ ('asset'),code:Buffer.from(css)},
      {path:'index.html',sourceType:/** @type {const} */ ('asset'),code:Buffer.from('<style>'+css+'</style>')},
      {path:'icon.svg',sourceType:/** @type {const} */ ('asset'),
        code:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA['+css+']]></style></svg>')}
    ];
    for(const specimen of specimens) {
      for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
        assert.throws(()=>obfuscateFiles([entry,specimen],{mode}),
          /(?:CSS data import cannot be audited|HTML asset contains inline CSS data import|SVG asset contains embedded CSS data import)/u,
          mode+' '+specimen.path);
      }
      assert.throws(()=>createScoHandler([specimen]),
        /(?:CSS data import cannot be audited|HTML asset contains inline CSS data import|SVG asset contains embedded CSS data import)/u);
    }
  }
});

test('ordinary external CSS imports and inline image data remain byte-exact',()=>{
  const css='@import url("https://cdn.example.test/public.css");.ok{background:url("data:image/png;base64,AAAA")}';
  const html='<style>'+css+'</style>';
  const svg='<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA['+css+']]></style><circle r="2"/></svg>';
  for(const candidate of [css,html,svg]) {
    assert.equal(hasUnauditedCssDataImport(css),false);
    const filename=candidate===css?'style.css':candidate===html?'index.html':'icon.svg';
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      const result=obfuscateFiles([
        entry,{path:filename,sourceType:'asset',code:Buffer.from(candidate)}
      ],{mode});
      assert.deepEqual(result.files.find(file=>file.path===filename)?.code,Buffer.from(candidate));
    }
  }
  assert.equal(typeof createScoHandler([
    {path:'safe.css',sourceType:'asset',code:Buffer.from(css)}
  ]),'function');
  assert.equal(hasUnauditedCssDataImport('.x::after{content:"@import data:text/css,unsafe"}'),false);
  assert.equal(hasUnauditedCssDataImport('/*@import "data:text/css,unsafe";*/.x{color:blue}'),false);
});
