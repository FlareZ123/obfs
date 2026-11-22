'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const http=require('node:http');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');

/** @typedef {'coo'|'sno'|'sco'} Mode */

/**
 * A valid XML-syntax document with HTML namespace script elements.
 * Browsers may execute these documents when served as application/xhtml+xml.
 * @param {string} insideHead
 * @returns {Buffer}
 */
function xhtml(insideHead) {
  return Buffer.from('<?xml version="1.0" encoding="UTF-8"?>'+
    '<html xmlns="http://www.w3.org/1999/xhtml"><head>'+
    insideHead+'</head><body><p>visible</p></body></html>');
}

/**
 * Compile one browser script and one XHTML asset in each supported mode.
 * @param {string} extension
 * @param {Buffer} asset
 * @param {Mode} mode
 */
function compile(extension,asset,mode) {
  const source='globalThis.xhtmlResult="unchanged-public-source-canary-value";';
  const files=[
    {path:'client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'index.'+extension,sourceType:/** @type {const} */('asset'),code:asset}
  ];
  const result=obfuscateFiles(files,{
    mode,closedWorld:true,seed:'xhtml-public-asset-'+extension+'-'+mode,
    strings:true,identifiers:false,properties:false
  });
  return {source,files:result.files};
}

test('XHTML extensions refuse embedded executable source in all three publication modes',()=>{
  for(const extension of ['xhtml','xht']){
    const cases=[
      xhtml('<script>globalThis.xhtmlSecret="plain-text-private-source";</script>'),
      xhtml('<script><![CDATA[globalThis.xhtmlSecret="xml-cdata-private-source";]]></script>'),
      xhtml('<button onclick="globalThis.xhtmlSecret=1">Click</button>'),
      xhtml('<h:script xmlns:h="http://www.w3.org/1999/xhtml">'+
        'globalThis.xhtmlSecret="prefixed-script-plaintext";</h:script>'),
      xhtml('<svg:svg xmlns:svg="http://www.w3.org/2000/svg">'+
        '<svg:script><![CDATA[globalThis.xhtmlSecret="svg-xml-plaintext";]]></svg:script>'+ 
        '</svg:svg>'),
      xhtml('<svg:svg xmlns:svg="http://www.w3.org/2000/svg">'+
        '<svg:animate attributeName="href" values="#safe;java&#x73;cript:alert(1)"></svg:animate>'+ 
        '</svg:svg>')
    ];
    for(const asset of cases){
      for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
        assert.throws(()=>compile(extension,asset,mode),/HTML asset contains/,
          extension+' '+mode);
      }
      assert.throws(()=>createScoHandler([
        {path:'index.'+extension,sourceType:/** @type {const} */('asset'),code:asset}
      ]),/HTML asset contains/,extension+' SCO standalone serving');
    }
  }
});

test('XHTML SRI-pinned local script retains exact source bytes in COO SNO and SCO',()=>{
  const source='globalThis.xhtmlResult="unchanged-public-source-canary-value";';
  const integrity=createHash('sha256').update(source).digest('base64');
  const pinned=xhtml('<script src="./client.js" integrity="sha256-'+integrity+'"></script>');
  const prefixed=xhtml('<h:script xmlns:h="http://www.w3.org/1999/xhtml" '+
    'src="./client.js" integrity="sha256-'+integrity+'"></h:script>');
  const unpinned=xhtml('<script src="./client.js"></script>');
  for(const extension of ['xhtml','xht']){
    for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
      const held=compile(extension,pinned,mode);
      const free=compile(extension,unpinned,mode);
      assert.equal(held.files[0].code,source,
        extension+' '+mode+': SRI requires identical published JavaScript bytes');
      assert.deepEqual(held.files[1].code,pinned);
      assert.notEqual(free.files[0].code,source,
        extension+' '+mode+': safe ordinary XHTML should retain positive rewrite yield');
      assert.deepEqual(free.files[1].code,unpinned);
      const namespaced=compile(extension,prefixed,mode);
      assert.equal(namespaced.files[0].code,source,
        extension+' '+mode+': XML namespace-prefixed script integrity pins the source');
    }
  }
});

test('XHTML XML declaration and simple DOCTYPE permit safe rewrites',()=>{
  const safe=xhtml('<title>Visible XHTML asset</title>').toString('utf8')
    .replace('?>','?><!DOCTYPE html>');
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])) {
    const compiled=compile('xhtml',Buffer.from(safe),mode);
    assert.notEqual(compiled.files[0].code,compiled.source,
      mode+': harmless XML doctype must not suppress protected-work yield');
  }
});

test('XHTML DTD entity declarations and embedded SVG style maps are refused',()=>{
  const dtd=xhtml('<title>value &source;</title>').toString('utf8')
    .replace('?>','?><!DOCTYPE html [<!ENTITY source "hidden">]>');
  const css=xhtml('<svg:svg xmlns:svg="http://www.w3.org/2000/svg">'+
    '<svg:style><![CDATA[/*# sourceMappingURL=private.css.map */]]></svg:style>'+
    '</svg:svg>');
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])) {
    assert.throws(()=>compile('xhtml',Buffer.from(dtd),mode),
      /DTD declaration|Malformed XHTML XML/);
    assert.throws(()=>compile('xhtml',css,mode),
      /HTML asset contains inline CSS source-map directive/);
  }
});

test('XHTML all declared base candidates preserve a locally pinned script',()=>{
  const source='globalThis.xhtmlResult="unchanged-public-source-canary-value";';
  const hash=createHash('sha256').update(source).digest('base64');
  // A template base is inert for a document. A later live base can change a
  // script URL from pages/client.js to client.js in the published file group.
  const markup=xhtml('<template><base href="/inert-path/"/></template>'+
    '<base href="/"/>'+
    '<script src="./client.js" integrity="sha256-'+hash+'"></script>');
  const files=[
    {path:'client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'pages/index.xhtml',sourceType:/** @type {const} */('asset'),code:markup}
  ];
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])) {
    const result=obfuscateFiles(files,{
      mode,seed:'xhtml-multiple-base-'+mode,closedWorld:true,
      strings:true,identifiers:false,properties:false
    });
    assert.equal(result.files[0].code,source,
      mode+': a later live base pins client.js even after an inert base');
  }
});

test('unrelated xml:base does not disable a provably independent external SRI script',()=>{
  const source='globalThis.xhtmlResult="unchanged-public-source-canary-value";';
  const markup=xhtml('<section xml:base="/not-the-script/"><p>independent</p></section>'+
    '<script src="https://cdn.example.test/unrelated.js" integrity="sha256-'+
    'a'.repeat(43)+'"></script>');
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])) {
    const result=compile('xhtml',markup,mode);
    assert.notEqual(result.files[0].code,source,
      mode+': unrelated XML base and external integrity must not erase transformation yield');
  }
});

test('SCO serves reviewed XHTML with the XML MIME type and preserves exact bytes',async()=>{
  const markup=xhtml('<title>XHTML XML-native document</title>');
  for(const extension of ['xhtml','xht']) {
    const handler=createScoHandler([
      {path:'index.'+extension,sourceType:/** @type {const} */('asset'),code:markup}
    ]);
    const server=http.createServer(handler);
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    try {
      const address=server.address();
      assert.ok(address&&typeof address!=='string');
      const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/index.'+extension);
      assert.equal(response.status,200);
      assert.equal(response.headers.get('content-type'),'application/xhtml+xml; charset=utf-8');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),markup);
    }finally {
      await new Promise((resolve,reject)=>
        server.close(error=>error?reject(error):resolve(undefined)));
    }
  }
});
