'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

test('query-acquired HTMLLinkElement can have an opaque SRI setter',()=>{
  const client='export const queriedLinkModule="source hash observed";';
  const html={path:'index.html',sourceType:/** @type {const} */('asset'),
    code:Buffer.from('<!doctype html><link id="preload"><script src="./loader.js"></script>')};
  const clientFile={path:'client.mjs',sourceType:/** @type {const} */('module'),code:client};
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    const options={mode,closedWorld:true,seed:'query-link-SRI/'+mode,
      strings:true,identifiers:false,properties:false};
    const loader=(/** @type {string} */ setter)=>({
      path:'loader.js',sourceType:/** @type {const} */('script'),
      code:'const link=document.getElementById("preload");'+setter+
        'link.rel="modulepreload";link.href="./client.mjs";'
    });
    const control=obfuscateFiles([
      clientFile,loader('link.title="benign";'),html
    ],options);
    assert.notEqual(control.files[0].code,client,
      'Known unrelated setter must retain rewriting yield in '+mode);
    const tested=obfuscateFiles([
      clientFile,loader('const key=globalThis.linkField||"integrity";'+
        'link[key]=globalThis.expectedSri;'),html
    ],options);
    assert.equal(tested.files[0].code,client,
      'Unknown setter on DOM-queried link may carry SRI in '+mode);
  }
});
