'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');

const xhtmlNamespace='http://www.w3.org/1999/xhtml';

/**
 * A generic .xml resource whose root and executable elements are in the
 * XHTML namespace. A deployment may serve this as application/xml or text/xml.
 * @param {string} insideHead
 * @returns {Buffer}
 */
function xmlDocument(insideHead) {
  return Buffer.from('<?xml version="1.0" encoding="UTF-8"?>'+
    '<html xmlns="'+xhtmlNamespace+'"><head>'+
    insideHead+'</head><body><p>XML document</p></body></html>');
}

/**
 * Compile a JavaScript file together with an opaque XML document.
 * @param {Buffer} asset
 * @param {'coo'|'sno'|'sco'} mode
 */
function compile(asset,mode) {
  const source='globalThis.xmlResult="unchanged-public-source-canary-value";';
  const files=[
    {path:'client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'index.xml',sourceType:/** @type {const} */('asset'),code:asset}
  ];
  const result=obfuscateFiles(files,{
    mode,closedWorld:true,seed:'xml-document-source-audit-'+mode,
    strings:true,identifiers:false,properties:false
  });
  return {source,files:result.files};
}

test('generic XML assets refuse executable XHTML namespace source in all modes',()=>{
  const cases=[
    xmlDocument('<script type="text/javascript">globalThis.xmlSecret="plain-xml-script-source";</script>'),
    xmlDocument('<h:script xmlns:h="'+xhtmlNamespace+'"><![CDATA[globalThis.xmlSecret="prefixed-xml-script-source";]]></h:script>'),
    xmlDocument('<button onclick="globalThis.xmlSecret=1">Click</button>'),
    xmlDocument('<svg:svg xmlns:svg="http://www.w3.org/2000/svg">'+
      '<svg:script><![CDATA[globalThis.xmlSecret="svg-script-source";]]></svg:script>'+
      '</svg:svg>')
  ];
  for(const asset of cases) {
    for(const mode of /** @type {const} */(['coo','sno','sco'])) {
      assert.throws(()=>compile(asset,mode),/HTML asset contains/,
        'generic XML '+mode);
    }
    assert.throws(()=>createScoHandler([
      {path:'index.xml',sourceType:/** @type {const} */('asset'),code:asset}
    ]),/HTML asset contains/,'generic XML SCO serving preflight');
  }
});

test('generic XML local SRI pins exact JavaScript bytes but unrelated XML retains rewrite yield',()=>{
  const source='globalThis.xmlResult="unchanged-public-source-canary-value";';
  const integrity=createHash('sha256').update(source).digest('base64');
  const pinned=xmlDocument('<script type="text/javascript" src="./client.js" integrity="sha256-'+integrity+'"></script>');
  const prefixed=xmlDocument('<h:script xmlns:h="'+xhtmlNamespace+'" type="text/javascript" '+
    'src="./client.js" integrity="sha256-'+integrity+'"></h:script>');
  const unpinned=xmlDocument('<script type="text/javascript" src="./client.js"></script>');
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    const held=compile(pinned,mode);
    const namespaced=compile(prefixed,mode);
    const free=compile(unpinned,mode);
    assert.equal(held.files[0].code,source,mode+': XML SRI must preserve the exact local JavaScript bytes');
    assert.equal(namespaced.files[0].code,source,mode+': prefixed XHTML script SRI must preserve exact bytes');
    assert.deepEqual(held.files[1].code,pinned);
    assert.notEqual(free.files[0].code,source,
      mode+': ordinary unpinned XML must retain positive transform yield');
    assert.deepEqual(free.files[1].code,unpinned);
  }
});

test('unrelated XML base and remote SRI do not suppress local transformation yield',()=>{
  const asset=xmlDocument('<section xml:base="/not-the-script/"><p>independent</p></section>'+
    '<script src="https://cdn.example.test/unrelated.js" integrity="sha256-'+
    'a'.repeat(43)+'"></script>');
  for(const mode of /** @type {const} */(['coo','sno','sco'])) {
    const result=compile(asset,mode);
    assert.notEqual(result.files[0].code,result.source,
      mode+': unrelated XML base and remote SRI must not veto local transformation');
  }
});

test('SCO keeps unknown .xml assets on its conservative octet-stream fallback',async()=>{
  const asset=xmlDocument('<title>XML source asset</title>');
  const handler=createScoHandler([
    {path:'index.xml',sourceType:/** @type {const} */('asset'),code:asset}
  ]);
  const server=require('node:http').createServer(handler);
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/index.xml');
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'application/octet-stream');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),asset);
  } finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
});
