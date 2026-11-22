'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const http=require('node:http');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');

/** @typedef {'coo'|'sno'|'sco'} Mode */

/**
 * A generic XML resource can contain browser-executable HTML-namespace
 * elements when its response media type is application/xml or text/xml.
 * @param {string} markup
 * @returns {Buffer}
 */
function xml(markup){
  return Buffer.from('<?xml version="1.0" encoding="UTF-8"?>'+
    '<root xmlns:h="http://www.w3.org/1999/xhtml">'+markup+'</root>');
}

/**
 * @param {Buffer} asset
 * @param {Mode} mode
 * @returns {{source:string,files:{path:string,code:string|Buffer}[]}}
 */
function compile(asset,mode){
  const source='globalThis.xmlCanary="unchanged-public-source-for-integrity";';
  const result=obfuscateFiles([
    {path:'client.js',sourceType:/** @type {const} */('script'),code:source},
    {path:'document.xml',sourceType:/** @type {const} */('asset'),code:asset}
  ],{mode,closedWorld:true,strings:true,identifiers:false,properties:false,
    seed:'generic-xml-source-'+mode});
  return {source,files:result.files};
}

test('generic XML refuses HTML-namespace script, handlers and SVG executable content',()=>{
  const cases=[
    xml('<h:script><![CDATA[globalThis.xmlPrivate=11;]]></h:script>'),
    xml('<h:script>globalThis.xmlPrivate=12;</h:script>'),
    xml('<h:button onclick="globalThis.xmlPrivate=13">go</h:button>'),
    xml('<svg:svg xmlns:svg="http://www.w3.org/2000/svg">'+
      '<svg:script><![CDATA[globalThis.xmlPrivate=14;]]></svg:script></svg:svg>')
  ];
  for(const asset of cases){
    for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
      assert.throws(()=>compile(asset,mode),/HTML asset contains/,
        'XML executable source '+mode);
    }
    assert.throws(()=>createScoHandler([
      {path:'document.xml',sourceType:/** @type {const} */('asset'),code:asset}
    ]),/HTML asset contains/,'SCO public XML must preflight');
  }
});

test('XML SRI script references preserve exact emitted JavaScript bytes',()=>{
  const source='globalThis.xmlCanary="unchanged-public-source-for-integrity";';
  const integrity=createHash('sha256').update(source).digest('base64');
  const pinned=xml('<h:script src="./client.js" integrity="sha256-'+integrity+'"/>');
  const unpinned=xml('<h:script src="./client.js"/>');
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
    const locked=compile(pinned,mode);
    const free=compile(unpinned,mode);
    assert.equal(locked.files[0].code,source,
      mode+': local XML document pins original JS bytes');
    assert.deepEqual(locked.files[1].code,pinned);
    assert.notEqual(free.files[0].code,source,
      mode+': XML without SRI retains positive rewrite yield');
    assert.deepEqual(free.files[1].code,unpinned);
  }
});

test('ordinary XML data without executable namespaces is preserved',()=>{
  const doc=xml('<inventory><record id="12">ordinary payload</record></inventory>');
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
    const result=compile(doc,mode);
    assert.notEqual(result.files[0].code,result.source,
      mode+': benign XML must allow positive JS rewrite');
    assert.deepEqual(result.files[1].code,doc);
  }
});

test('SCO serves ordinary XML with declared browser XML MIME and exact bytes',async()=>{
  const document=xml('<title>XML document</title>');
  const handler=createScoHandler([
    {path:'document.xml',sourceType:/** @type {const} */('asset'),code:document}
  ]);
  const server=http.createServer(handler);
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/document.xml');
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'application/xml; charset=utf-8');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),document);
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
});

test('non-executable XML namespaces may carry script and style data as text',()=>{
  const doc=xml('<d:inventory xmlns:d="urn:obfs:inventory">'+
    '<d:script>plain text payload in an unrelated XML namespace</d:script>'+
    '<d:style>/*# sourceMappingURL=opaque-data.map */</d:style>'+
    '<d:record onclick="literal-data" href="javascript:literal-data">safe record</d:record>'+
    '</d:inventory>');
  for(const mode of /** @type {Mode[]} */(['coo','sno','sco'])){
    const result=compile(doc,mode);
    assert.notEqual(result.files[0].code,result.source,
      mode+': unrelated XML namespace data must retain positive rewrite yield');
    assert.deepEqual(result.files[1].code,doc,
      mode+': non-executable XML data must remain byte-for-byte unchanged');
  }
});
