'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');
const {findInlineHtmlSource}=require('../src/html-assets');

const entry={path:'entry.mjs',sourceType:/** @type {const} */ ('module'),
  code:'export const publicValue=17;'};
const original='const ORIGINAL_STYLESHEET_SOURCE_CANARY=192837;';
const map=JSON.stringify({
  version:3,sources:['original-private.js'],sourcesContent:[original],
  names:['ORIGINAL_STYLESHEET_SOURCE_CANARY'],mappings:'AAAA'
});
const css='body{color:blue}/*# sourceMappingURL=data:application/json;base64,'+
  Buffer.from(map).toString('base64')+' */';
const encodedCss=Buffer.from(css).toString('base64');

/**
 * Verify that the actual original plaintext is recoverable from the
 * otherwise innocuous HTML alone, without compiler keys or source files.
 * @param {string} html
 * @returns {string}
 */
function recoverOriginal(html) {
  const match=/data:text\/css;base64,([A-Za-z0-9+/=]+)/iu.exec(html);
  assert.ok(match);
  const stylesheet=Buffer.from(match[1],'base64').toString();
  const mapMatch=/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/u.exec(stylesheet);
  assert.ok(mapMatch);
  const parsed=JSON.parse(Buffer.from(mapMatch[1],'base64').toString());
  return parsed.sourcesContent[0];
}

test('embedded data-URL stylesheets must not publish original JS through CSS source maps',()=>{
  const fixtures=[
    '<!doctype html><link rel="stylesheet" href="data:text/css;base64,'+encodedCss+'">',
    '<!doctype html><link rel="alternate stylesheet" href="data:text/css;base64,'+encodedCss+'">',
    '<template><link REL="StyleSheet" HREF="data:text/css;base64,'+encodedCss+'"></template>',
    '<link rel="stylesheet" href="&#x64;ata:text/css;base64,'+encodedCss+'">',
    '<link rel="stylesheet" href="da&#10;ta:text/css;base64,'+encodedCss+'">',
    '<link rel="stylesheet" href="d&#9;ata:text/css;base64,'+encodedCss+'">'
  ];
  for(const html of fixtures) {
    if(html.includes('data:text/css;base64,')) {
      assert.equal(recoverOriginal(html),original);
    }
    assert.equal(findInlineHtmlSource(html),'embedded stylesheet data URL');
    const asset={path:'index.html',sourceType:/** @type {const} */ ('asset'),code:Buffer.from(html)};
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      assert.throws(()=>obfuscateFiles([entry,asset],{mode}),/HTML asset contains embedded stylesheet data URL/u,mode);
    }
    assert.throws(()=>createScoHandler([asset]),/HTML asset contains embedded stylesheet data URL/u);
  }
});

test('safe external stylesheets and ordinary image data URLs preserve exact bytes',()=>{
  const html='<link rel="stylesheet" href="./theme.css">'+
    '<link rel="icon" href="data:image/png;base64,iVBORw0KGgo=">'+
    '<p>Reference text</p>';
  assert.equal(findInlineHtmlSource(html),null);
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    const output=obfuscateFiles([
      entry,{path:'index.html',sourceType:'asset',code:Buffer.from(html)}
    ],{mode});
    const asset=output.files.find(file=>file.path==='index.html');
    assert.ok(asset);
    assert.deepEqual(asset.code,Buffer.from(html),mode);
  }
  assert.equal(typeof createScoHandler([
    {path:'index.html',sourceType:'asset',code:html}
  ]),'function');
});
