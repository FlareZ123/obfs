'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');
const {hasCssSourceMapDirective}=require('../src/source-maps');

const entry={path:'entry.mjs',sourceType:'module',code:'export const result=42;'};
const map=Buffer.from(JSON.stringify({
  version:3,sources:['private-original.js'],
  sourcesContent:['const TOP_SECRET_CSS_MAP_CANARY=182736;'],
  names:['TOP_SECRET_CSS_MAP_CANARY'],mappings:'AAAA'
})).toString('base64');

/**
 * @param {string|Buffer} stylesheet
 * @param {string} [path]
 * @returns {void}
 */
function deny(stylesheet,path='style.css') {
  assert.equal(hasCssSourceMapDirective(stylesheet),true);
  const asset={path,sourceType:'asset',code:stylesheet};
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    assert.throws(()=>obfuscateFiles([entry,asset],{mode}),/CSS source-map directive/,mode);
  }
  assert.throws(()=>createScoHandler([asset]),/CSS source-map directive/);
}

test('CSS mapping comments cannot carry original source in inline data URL or external map link',()=>{
  const forms=[
    'body{color:black}/*# sourceMappingURL=data:application/json;base64,'+map+' */',
    '/*@ sourceMappingURL=./private.css.map */.safe{opacity:1}',
    '\uFEFFdiv{display:block}\n/* # sourceMappingURL = https://example.invalid/private.map */\n',
    '/* regular comment */\n/*#sourceMappingURL=data:application/json;base64,'+map+'*/'
  ];
  for(const css of forms) {
    deny(css);
    deny(Buffer.from(css,'utf8'),'STYLES.CSS');
  }
});

test('CSS quoted content and ordinary unrelated comments remain byte-identical assets',()=>{
  const css=[
    '/* A discussion of sourceMappingURL=debug.map without directive sigil */',
    '.quoted::before{content:"/*# sourceMappingURL=debug.css.map */"}',
    ".quoted::after{content:'/*@ sourceMappingURL=another.css.map */'}",
    '.escaped::before{content:"a\\"/*# sourceMappingURL=unused.css.map */"}',
    '.external{background-image:url("https://example.invalid/logo.png")}'
  ].join('\n');
  assert.equal(hasCssSourceMapDirective(css),false);
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    const transformed=obfuscateFiles([
      entry,{path:'style.css',sourceType:'asset',code:Buffer.from(css)}
    ],{mode});
    const asset=transformed.files.find(file=>file.path==='style.css');
    assert.ok(asset);
    assert.deepEqual(asset.code,Buffer.from(css));
  }
  assert.equal(typeof createScoHandler([
    {path:'style.css',sourceType:'asset',code:Buffer.from(css)}
  ]),'function');
});

test('unterminated quoted CSS string ends at newline before a real sourceMappingURL comment',()=>{
  const code='.bad{content:"unterminated\n/*# sourceMappingURL=private.map */';
  deny(code);
});

test('CSS assets with invalid UTF-8 and NUL padding are refused before release',()=>{
  const invalid=[
    Buffer.from([0xc0,0xaf,0x2f,0x2a,0x23,0x20,0x73]),
    Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('/*# sourceMappingURL=private.map */','utf16le')]),
    Buffer.from('/*# sourceMappingURL=private.map */','utf16le')
  ];
  for(const bytes of invalid) {
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      assert.throws(()=>obfuscateFiles([
        entry,{path:'theme.css',sourceType:'asset',code:bytes}
      ],{mode}),/CSS asset is not valid UTF-8 or contains NUL/,mode);
    }
    assert.throws(()=>createScoHandler([
      {path:'theme.css',sourceType:'asset',code:bytes}
    ]),/CSS asset is not valid UTF-8 or contains NUL/);
  }
});
