'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');
const {hasCssDataImport}=require('../src/css-data-imports');
const {hasCssSourceMapDirective}=require('../src/css-source-maps');

const entry={path:'entry.mjs',sourceType:/** @type {const} */ ('module'),code:'export const result=42;'};
const canary='function NEVER_PUBLISH_ORIGINAL_CSS_IMPORT_SOURCE() { return 67321; }';
const map=Buffer.from(JSON.stringify({
  version:3,sources:['original-private.js'],sourcesContent:[canary],
  names:['NEVER_PUBLISH_ORIGINAL_CSS_IMPORT_SOURCE'],mappings:'AAAA'
})).toString('base64');
const nested='/*# sourceMappingURL=data:application/json;base64,'+map+' */';
const css='@import url("data:text/css;base64,'+Buffer.from(nested).toString('base64')+'");';

/**
 * This is a public-byte attacker; it can recover the untouched original from
 * the nested stylesheet without compromising the obfuscator or private source.
 * @param {string} publishedCss
 * @returns {string}
 */
function extractNestedCanary(publishedCss) {
  const encoded=/data:text\/css;base64,([A-Za-z0-9+/=]+)/u.exec(publishedCss)?.[1];
  assert.ok(encoded);
  const imported=Buffer.from(encoded,'base64').toString('utf8');
  const mapBytes=/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/u.exec(imported)?.[1];
  assert.ok(mapBytes);
  return JSON.parse(Buffer.from(mapBytes,'base64').toString('utf8')).sourcesContent[0];
}

test('a data stylesheet import previously bypassed plain CSS mapping-comment scanning',()=>{
  assert.equal(hasCssSourceMapDirective(css),false);
  assert.equal(hasCssDataImport(css),true);
  assert.equal(extractNestedCanary(css),canary);
});

test('CSS nested data stylesheet sources are refused for COO, SCO, SNO and public SCO assets',()=>{
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    assert.throws(()=>obfuscateFiles([
      entry,{path:'style.css',sourceType:'asset',code:Buffer.from(css)}
    ],{mode}),/CSS data import would publish unaudited nested stylesheet/,mode);
  }
  assert.throws(()=>createScoHandler([
    {path:'style.css',sourceType:'asset',code:Buffer.from(css)}
  ]),/CSS data import would publish unaudited nested stylesheet/);
});

test('data stylesheet import under inline HTML/SVG styles is also refused',()=>{
  const assets=[
    {path:'index.html',sourceType:/** @type {const} */ ('asset'),
      code:'<!doctype html><style>'+css+'</style><body>safe</body>'},
    {path:'mark.svg',sourceType:/** @type {const} */ ('asset'),
      code:'<svg xmlns="http://www.w3.org/2000/svg"><style>'+css+'</style></svg>'}
  ];
  for(const asset of assets) {
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      assert.throws(()=>obfuscateFiles([entry,asset],{mode}),/embedded stylesheet data import/,asset.path+' '+mode);
    }
    assert.throws(()=>createScoHandler([asset]),/embedded stylesheet data import/,asset.path);
  }
});

test('ordinary external and relative CSS imports remain unchanged, including quoted text',()=>{
  const normal=[
    '@import "./theme.css";',
    '@import url(https://example.invalid/public.css);',
    'p:before{content:"@import url(data:text/css,FAKE)"}',
    '/* @import "data:text/css,FAKE" */',
    '.box{background:url("data:image/png;base64,YWJj")}'
  ].join('\n');
  assert.equal(hasCssDataImport(normal),false);
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    const output=obfuscateFiles([
      entry,{path:'style.css',sourceType:'asset',code:Buffer.from(normal)}
    ],{mode});
    assert.deepEqual(output.files.find(file=>file.path==='style.css')?.code,Buffer.from(normal));
  }
  assert.equal(typeof createScoHandler([
    {path:'style.css',sourceType:'asset',code:Buffer.from(normal)}
  ]),'function');
});

test('CSS escapes and intervening comments cannot disguise a data stylesheet import',()=>{
  const cases=[
    '@IMPORT URL("DATA:text/css,body{}");',
    '@import/**/url/**/(data:text/css,body{});',
    '@\\69mport url(\\64 ata:text/css,body{});',
    '@import "\\64 ata:text/css,body{}";',
    '@import \t url("  data:text/css,body{}");',
    '@import url("da\\9 ta:text/css,body{}");',
    '@import url("d\\a ata:text/css,body{}");'
  ];
  for(const sample of cases)assert.equal(hasCssDataImport(sample),true,sample);
  assert.equal(hasCssDataImport('@import url(./assets/theme.css)'),false);
});

test('embedded data stylesheet checker rejects malformed UTF-8 and NUL bytes',()=>{
  assert.throws(()=>hasCssDataImport(Buffer.from([0xc0,0xaf])));
  assert.throws(()=>hasCssDataImport(Buffer.from('a\0b')));
});
