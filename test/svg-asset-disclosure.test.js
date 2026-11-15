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
