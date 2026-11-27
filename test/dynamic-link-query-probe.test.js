'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {obfuscateFiles}=require('../src');

test('query-acquired HTMLLinkElement can have an opaque SRI setter',()=>{
  const client='export const queriedLinkModule="source hash observed";';
  const html={path:'index.html',sourceType:/** @type {const} */('asset'),
    code:Buffer.from('<!doctype html><link id="preload"><p id="text"></p><script src="./loader.js"></script>')};
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
    const opaque='const key=globalThis.linkField||"integrity";';
    const active='link.rel="modulepreload";link.href="./client.mjs";';
    /** @type {[string,string,boolean][]} */
    const cases=[
      ['querySelector id','const link=document.querySelector("#preload");'+
        opaque+'link[key]=globalThis.expectedSri;'+active,true],
      ['querySelector typed link',
        'const link=document.querySelector("link#preload");'+
          opaque+'link[key]=globalThis.expectedSri;'+active,true],
      ['querySelector type exclusion is not a hostile-host proof',
        'const link=document.querySelector("p#text");'+
          opaque+'link[key]=globalThis.expectedSri;'+active,true],
      ['simple alias','const link=document.getElementById("preload");'+
        'const alias=link;'+opaque+'alias[key]=globalThis.expectedSri;'+active,true],
      ['direct query target',opaque+
        'document.getElementById("preload")[key]=globalThis.expectedSri;'+
        'const link=document.getElementById("preload");'+active,true],
      ['opaque Document method',
        'const method=globalThis.queryMethod||"getElementById";'+
        'const link=document[method]("preload");'+opaque+
          'link[key]=globalThis.expectedSri;'+active,true],
      ['unrelated object method',
        'const fake={getElementById(){return {};}};'+
        'const link=fake.getElementById("preload");'+opaque+
          'link[key]=globalThis.expectedSri;',false],
      ['known harmless query property',
        'const link=document.querySelector("link#preload");'+
          'link.title="not integrity";'+active,false]
    ];
    for(const [label,bootstrap,expectPinned] of cases) {
      const result=obfuscateFiles([clientFile,{
        path:'loader.js',sourceType:/** @type {const} */('script'),
        code:bootstrap
      },html],options);
      if(expectPinned)assert.equal(result.files[0].code,client,
        label+' can SRI-pin JavaScript in '+mode);
      else assert.notEqual(result.files[0].code,client,
        label+' must retain rewrite yield in '+mode);
    }
  }
});
