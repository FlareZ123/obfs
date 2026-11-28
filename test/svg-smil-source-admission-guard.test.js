'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {findInlineSvgSource}=require('../src/svg-assets');
const {findInlineHtmlSource,smilTargetsExecutableAttribute}=require('../src/html-assets');
const {assertNoSourceMapDisclosure}=require('../src/source-maps');

const svgStart='<?xml version="1.0" encoding="UTF-8"?>'+
  '<svg xmlns="http://www.w3.org/2000/svg">';
const svgEnd='</svg>';
const body='<rect id="hit" width="100" height="50">'+
  '<set attributeName="onmouseover" to="window.sourceObserver=23" begin="0s" dur="indefinite"/>'+
  '</rect>';
const rawSvg=svgStart+body+svgEnd;
const rawSvgXml=svgStart+body.replace('attributeName="onmouseover"',
  'attributeName="onmouseover" attributeType="XML"')+svgEnd;
const rawSvgNamespaced=svgStart+body.replace('attributeName="onmouseover"',
  'attributeName="x:onmouseover"')+svgEnd;
const benign=svgStart+'<rect width="100" height="50" fill="blue">'+
  '<set attributeName="fill" to="green" begin="0s" dur="indefinite"/>'+
  '</rect>'+svgEnd;
const html='<!doctype html><html><body><svg>'+
  body+'</svg></body></html>';
const xhtml='<?xml version="1.0" encoding="UTF-8"?>'+
  '<html xmlns="http://www.w3.org/1999/xhtml" '+
  'xmlns:s="http://www.w3.org/2000/svg"><body><s:svg>'+
  '<s:rect><s:set attributeName="onmouseover" '+
  'to="window.sourceObserver=23" begin="0s"/></s:rect>'+
  '</s:svg></body></html>';

/** @param {string} path @param {string} code */
function audit(path,code){
  return assertNoSourceMapDisclosure({path,sourceType:'asset',code});
}

test('SMIL only targets event code in an executable SVG animation, including prefixes',()=>{
  assert.equal(smilTargetsExecutableAttribute('set','onmouseover'),true);
  assert.equal(smilTargetsExecutableAttribute('animate','ONERROR'),true);
  assert.equal(smilTargetsExecutableAttribute('animate','x:onfocus'),true);
  assert.equal(smilTargetsExecutableAttribute('set','srcdoc'),true);
  assert.equal(smilTargetsExecutableAttribute('set','fill'),false);
  assert.equal(smilTargetsExecutableAttribute('rect','onmouseover'),false);
  assert.equal(smilTargetsExecutableAttribute('set',undefined),false);
});

test('SVG source scanner and production asset preflight reject three animation spellings',()=>{
  for(const source of [rawSvg,rawSvgXml,rawSvgNamespaced]){
    assert.match(findInlineSvgSource(source),/animation targets executable attribute/);
    assert.throws(()=>audit('art.svg',source),/SVG asset contains SVG animation targets executable attribute/);
  }
  assert.equal(findInlineSvgSource(benign),null);
  assert.doesNotThrow(()=>audit('art.svg',benign));
  assert.match(findInlineSvgSource(svgStart+
    '<rect onmouseover="window.sourceObserver=23"/>'+svgEnd),/event handler/);
});

test('HTML-inline SVG scanner rejects SMIL event target without rejecting benign fill',()=>{
  assert.match(findInlineHtmlSource(html),/animation targets executable attribute/);
  assert.throws(()=>audit('page.html',html),/HTML asset contains SVG animation targets executable attribute/);
  const camelCase=html.replace('<set ','<animateColor ');
  assert.match(findInlineHtmlSource(camelCase),/animation targets executable attribute/);
  const safe=html.replace('attributeName="onmouseover"','attributeName="fill"')
    .replace('to="window.sourceObserver=23"','to="green"');
  assert.equal(findInlineHtmlSource(safe),null);
  assert.doesNotThrow(()=>audit('page.html',safe));
});

test('HTML parser also screens SMIL URL value lists that synthesize later href',()=>{
  const dangerous='<!doctype html><html><body><svg><a>'+
    '<animate attributeName="href" values="#safe;javascript:window.sourceObserver=23" '+
    'begin="0s" dur="indefinite"></animate></a></svg></body></html>';
  assert.match(findInlineHtmlSource(dangerous),/SVG animation embeds executable URL/);
  assert.throws(()=>audit('page.html',dangerous),/SVG animation embeds executable URL/);
  const safe=dangerous.replace('javascript:window.sourceObserver=23','/trusted.js');
  assert.equal(findInlineHtmlSource(safe),null);
  assert.doesNotThrow(()=>audit('page.html',safe));
});

test('XHTML namespace-aware scanner refuses SVG SMIL target while retaining inert animation',()=>{
  assert.throws(()=>audit('page.xhtml',xhtml),
    /HTML asset contains SVG animation targets executable attribute/);
  const safe=xhtml.replace('attributeName="onmouseover"','attributeName="fill"')
    .replace('to="window.sourceObserver=23"','to="green"');
  assert.doesNotThrow(()=>audit('page.xhtml',safe));
});
