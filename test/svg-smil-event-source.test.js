'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {findInlineSvgSource}=require('../src/svg-assets');
const {main,direct,animated,animatedXml,benign}=require('../sims/svg-smil-event-source-witness');

test('static source scanner: direct handler refused, animated target currently admitted',()=>{
  assert.match(findInlineSvgSource(direct),/event handler/);
  assert.equal(findInlineSvgSource(benign),null);
  assert.equal(findInlineSvgSource(animated),null);
  assert.equal(findInlineSvgSource(animatedXml),null);
});

test('red-team Chromium HTML-inline SVG SMIL href execution bypass (pass means BYPASS)',
  {skip:process.platform!=='linux',timeout:45000},main);
