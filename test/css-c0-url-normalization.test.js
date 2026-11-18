'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');
const {hasCssDataImport}=require('../src/css-data-imports');

const original='function PRIVATE_CSS_C0_SOURCE(){return 73717;}';
const map=Buffer.from(JSON.stringify({
  version:3,sources:['original.js'],sourcesContent:[original],
  names:['PRIVATE_CSS_C0_SOURCE'],mappings:'AAAA'
})).toString('base64');
const nested='body{}/*# sourceMappingURL=data:application/json;base64,'+map+' */';
const encoded=Buffer.from(nested).toString('base64');
const data='data:text/css;base64,'+encoded;
const imports=[
  String.raw`@import "\1 `+data+String.raw`";`,
  String.raw`@import url("\1 `+data+String.raw`");`,
  String.raw`@import "\1 \2 `+data+String.raw`";`,
  String.raw`@import "\1  `+data+String.raw`";`
];
const entry={path:'entry.mjs',sourceType:/** @type {const} */ ('module'),code:'export const answer=42;'};

test('WHATWG URL resolution trims leading C0 controls, not interior C0',()=>{
  for(const point of [1,2,7,8,11,12,14,31,32]) {
    const address=String.fromCharCode(point)+data;
    assert.equal(new URL(address).protocol,'data:','leading C0 U+'+point.toString(16));
  }
  assert.throws(()=>new URL('da'+String.fromCharCode(1)+'ta:text/css,canary'));
});

test('CSS escapes cannot disguise leading C0 prefix on a data stylesheet import',()=>{
  for(const css of imports)assert.equal(hasCssDataImport(css),true,css.slice(0,75));
  assert.equal(hasCssDataImport(String.raw`@import "da\1 ta:text/css,canary";`),false);
});

test('C0-prefixed data stylesheet source map is refused in all three modes and SCO',()=>{
  for(const css of imports) {
    for(const asset of [
      {path:'style.css',sourceType:/** @type {const} */ ('asset'),code:Buffer.from(css)},
      {path:'index.html',sourceType:/** @type {const} */ ('asset'),
        code:Buffer.from('<style>'+css+'</style>')},
      {path:'icon.svg',sourceType:/** @type {const} */ ('asset'),
        code:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA['+css+']]></style></svg>')}
    ]) {
      for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
        assert.throws(()=>obfuscateFiles([entry,asset],{mode}),
          /(?:CSS data import|embedded stylesheet data import)/u,asset.path+' '+mode);
      }
      assert.throws(()=>createScoHandler([asset]),
        /(?:CSS data import|embedded stylesheet data import)/u,asset.path);
    }
  }
});
