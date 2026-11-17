'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');
const {findInlineSvgSource}=require('../src/svg-assets');

const js={path:'entry.cjs',sourceType:'commonjs',code:'module.exports=7;'};

/** @param {string|Buffer} svg @param {'coo'|'sco'|'sno'} mode */
function transform(svg,mode) {
  return obfuscateFiles([
    js,{path:'assets/icon.svg',sourceType:'asset',code:svg}
  ],{mode,seed:'svg-disclosure-audit'});
}

test('static SVG script, event handlers and executable links are refused across all modes',()=>{
  const samples=[
    ['script element','<svg xmlns="http://www.w3.org/2000/svg"><script><![CDATA[window.privateSource=4;]]></script></svg>'],
    ['namespaced script','<svg xmlns:s="http://www.w3.org/2000/svg"><s:script>window.privateSource=5;</s:script></svg>'],
    ['onload','<svg xmlns="http://www.w3.org/2000/svg" onload="window.privateSource=6;"/>'],
    ['foreignObject event','<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div onclick="window.privateSource=7;"/></foreignObject></svg>'],
    ['entity-encoded JS URL','<svg xmlns="http://www.w3.org/2000/svg"><a href="java&#x73;cript:alert(1)"/></svg>'],
    ['XLink JS URL','<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"/></svg>'],
    ['embedded HTML data URL','<svg xmlns="http://www.w3.org/2000/svg"><a href="data:text/html;base64,PHNjcmlwdD4="/></svg>'],
    ['XHTML data URL','<svg xmlns="http://www.w3.org/2000/svg"><a href="data:application/xhtml+xml,%3Chtml%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxhtml%22%3E%3Cscript%3Ewindow.privateSource%3D10%3C%2Fscript%3E%3C%2Fhtml%3E"/></svg>'],
    ['animation URL rewrite','<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="href" to="javascript:alert(1)"/></svg>'],
    ['foreignObject XHTML srcdoc','<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><iframe xmlns="http://www.w3.org/1999/xhtml" srcdoc="&lt;script&gt;window.privateSource=9;&lt;/script&gt;"/></foreignObject></svg>'],
    ['foreignObject XHTML refresh','<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><meta xmlns="http://www.w3.org/1999/xhtml" http-equiv="refresh" content="0; URL=data:text/html,&lt;script&gt;privateSource()&lt;/script&gt;"/></foreignObject></svg>'],
    ['DTD','<!DOCTYPE svg [<!ENTITY leak "window.privateSource=8">]><svg xmlns="http://www.w3.org/2000/svg"/>'],
    ['conflicting XML encoding','<?xml version="1.0" encoding="UTF-16"?><svg xmlns="http://www.w3.org/2000/svg"/>']
  ];
  for(const [label,svg] of samples) {
    assert.ok(findInlineSvgSource(svg),label);
    for(const mode of ['coo','sco','sno']) {
      assert.throws(()=>transform(svg,mode),/SVG asset contains/,label+' '+mode);
    }
    assert.throws(()=>createScoHandler([
      {path:'assets/icon.svg',sourceType:'asset',code:svg}
    ]),/SVG asset contains/,label+' SCO');
  }
});

test('SVG animation URL lists screen every semicolon-separated state',()=>{
  const dangerous=[
    '<svg xmlns="http://www.w3.org/2000/svg"><a id="jump" href="#ok"><animate attributeName="href" values="#ok; javascript:alert(1)" dur="1s"/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="#ok"><animate attributeName="href" values="#ok;java&#x73;cript:alert(1)"/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="#ok"><animate attributeName="href" values="#ok;data:application/xhtml+xml,%3Cscript%3E"/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="#ok"><animate attributeName="xlink:href" values="#ok;data:text/html,%3Cscript%3E"/></a></svg>'
  ];
  for(const svg of dangerous) {
    assert.equal(findInlineSvgSource(svg),'embedded executable URL');
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      assert.throws(()=>transform(svg,mode),/SVG asset contains embedded executable URL/,mode);
    }
    assert.throws(()=>createScoHandler([
      {path:'assets/icon.svg',sourceType:'asset',code:svg}
    ]),/SVG asset contains embedded executable URL/);
  }
  const benign='<svg xmlns="http://www.w3.org/2000/svg"><a href="#ok"><animate attributeName="href" values="#ok; #next" dur="1s"/></a><circle r="4"><animate attributeName="r" values="4; 8; 4"/></circle></svg>';
  assert.equal(findInlineSvgSource(benign),null);
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    const file=transform(Buffer.from(benign,'utf8'),mode).files.find(item=>item.path==='assets/icon.svg');
    assert.ok(file);
    assert.deepEqual(file.code,Buffer.from(benign,'utf8'));
  }
});

test('SVG inline styles cannot publish CSS source-map annotations or source contents',()=>{
  const original='const PRIVATE_SVG_STYLE_CANARY=728391;';
  const map=Buffer.from(JSON.stringify({
    version:3,sources:['original-private.js'],sourcesContent:[original],
    names:['PRIVATE_SVG_STYLE_CANARY'],mappings:'AAAA'
  })).toString('base64');
  const hostile=[
    '<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA[.x{fill:red}/*# sourceMappingURL=data:application/json;base64,'+map+' */]]></style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>/*@ sourceMappingURL=./original-private.css.map */.x{opacity:1}</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>/*# sourceMap&#112;ingURL=./original-private.css.map */</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>/*# source<![CDATA[MappingURL=./original-private.css.map]]> */</style></svg>'
  ];
  for(const svg of hostile) {
    assert.equal(findInlineSvgSource(svg),'embedded CSS source-map directive');
    for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
      assert.throws(()=>transform(svg,mode),/SVG asset contains embedded CSS source-map directive/,mode);
    }
    assert.throws(()=>createScoHandler([
      {path:'assets/icon.svg',sourceType:'asset',code:svg}
    ]),/SVG asset contains embedded CSS source-map directive/);
  }
  const safe='<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA[.x::before{content:"/*# sourceMappingURL=not-a-directive */"}.x{fill:red}]]></style><circle class="x" r="4"/></svg>';
  assert.equal(findInlineSvgSource(safe),null);
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    const file=transform(Buffer.from(safe,'utf8'),mode).files.find(item=>item.path==='assets/icon.svg');
    assert.ok(file);
    assert.deepEqual(file.code,Buffer.from(safe,'utf8'));
  }
});

test('safe SVG geometry, raster image data, and external references remain byte-identical',()=>{
  const svg=[
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16">',
    '<path d="M0 0 L16 16" fill="#000"/>',
    '<image xlink:href="data:image/png;base64,AAAA" width="4" height="4"/>',
    '<use href="icons.svg#check"/>',
    '<foreignObject><meta xmlns="http://www.w3.org/1999/xhtml" http-equiv="refresh" content="30; URL=https://example.test/next.html"/></foreignObject>',
    '</svg>'
  ].join('');
  assert.equal(findInlineSvgSource(svg),null);
  for(const mode of ['coo','sco','sno']) {
    const out=transform(Buffer.from(svg),mode).files.find(file=>file.path==='assets/icon.svg');
    assert.ok(out);
    assert.deepEqual(out.code,Buffer.from(svg));
  }
  assert.equal(typeof createScoHandler([
    {path:'assets/icon.svg',sourceType:'asset',code:Buffer.from(svg)}
  ]),'function');
});

test('SVG XML malformed input, UTF-16 content and invalid UTF-8 are refused',()=>{
  const inputs=[
    Buffer.from('<svg><path></svg>'),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>','utf16le'),
    Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('<svg/>','utf16le')]),
    Buffer.from([0xc0,0xaf])
  ];
  for(const svg of inputs) {
    for(const mode of ['coo','sco','sno']) {
      assert.throws(()=>transform(svg,mode),/(?:Malformed SVG XML|SVG asset is not valid UTF-8|SVG asset contains NUL)/,mode);
    }
    assert.throws(()=>createScoHandler([
      {path:'assets/icon.svg',sourceType:'asset',code:svg}
    ]),/(?:Malformed SVG XML|SVG asset is not valid UTF-8|SVG asset contains NUL)/);
  }
});

test('XML stylesheet processing instruction cannot embed unaudited CSS source maps',()=>{
  const original='const PRIVATE_XML_PI_STYLE_ORIGINAL=482910;';
  const map=Buffer.from(JSON.stringify({
    version:3,sources:['private-original.js'],sourcesContent:[original],
    names:['PRIVATE_XML_PI_STYLE_ORIGINAL'],mappings:'AAAA'
  })).toString('base64');
  const nested='/*# sourceMappingURL=data:application/json;base64,'+map+' */';
  const encoded=Buffer.from(nested).toString('base64');
  const svg='<?xml-stylesheet type="text/css" href="data:text/css;base64,'+encoded+
    '"?><svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
  const publicUrl=/data:text\/css;base64,([A-Za-z0-9+/=]+)/u.exec(svg);
  assert.ok(publicUrl);
  const recoveredNested=Buffer.from(publicUrl[1],'base64').toString();
  const publicMap=/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/u.exec(recoveredNested);
  assert.ok(publicMap);
  assert.equal(JSON.parse(Buffer.from(publicMap[1],'base64').toString()).sourcesContent[0],original);
  assert.equal(findInlineSvgSource(svg),'embedded XML stylesheet data URL');
  const escaped=svg.replace('href="data:text/css','href="&#x64;&#97;ta&#58;text/css');
  assert.equal(findInlineSvgSource(escaped),'embedded XML stylesheet data URL');
  const tabScheme=svg.replace('href="data:text/css','href="d&#x9;ata:text/css');
  assert.equal(findInlineSvgSource(tabScheme),'embedded XML stylesheet data URL');
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    assert.throws(()=>transform(svg,mode),/SVG asset contains embedded XML stylesheet data URL/,mode);
    assert.throws(()=>transform(escaped,mode),/SVG asset contains embedded XML stylesheet data URL/,mode+' charrefs');
    assert.throws(()=>transform(tabScheme,mode),/SVG asset contains embedded XML stylesheet data URL/,mode+' URL tab');
  }
  assert.throws(()=>createScoHandler([
    {path:'assets/icon.svg',sourceType:'asset',code:svg}
  ]),/SVG asset contains embedded XML stylesheet data URL/);

  const safe='<?xml-stylesheet type="text/css" href="./theme.css"?>'+
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="2"/></svg>';
  assert.equal(findInlineSvgSource(safe),null);
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    const result=transform(Buffer.from(safe),mode).files.find(file=>file.path==='assets/icon.svg');
    assert.ok(result);
    assert.deepEqual(result.code,Buffer.from(safe));
  }
});
