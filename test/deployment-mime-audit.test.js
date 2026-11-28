'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const http=require('node:http');
const {gzipSync}=require('node:zlib');
const {test}=require('node:test');
const {verifyPublishedDeployment}=require('../src');

/** @typedef {'asset'|'script'|'module'|'commonjs'} SourceType */
/** @typedef {{path:string,code:string|Buffer,sourceType:SourceType}} File */
/** @typedef {{path:string,sha256:string,contentType:string}} Approval */
/** @typedef {{type:string,body:Buffer,headers?:Record<string,string>,status?:number}} Reply */

/**
 * @param {File[]} files
 * @param {string[]} types
 * @returns {Approval[]}
 */
function approve(files,types){
  return files.map((file,i)=>({
    path:file.path,
    sha256:createHash('sha256').update(file.code).digest('hex'),
    contentType:types[i]
  }));
}

/**
 * @param {Map<string,Reply>} responses
 * @param {(origin:string)=>Promise<void>} use
 * @returns {Promise<void>}
 */
async function withServer(responses,use){
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const route=responses.get(pathname);
    if(!route){response.writeHead(404).end();return;}
    response.writeHead(route.status??200,{
      'content-type':route.type,
      'x-content-type-options':'nosniff',
      ...route.headers
    });
    response.end(route.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    await use('http://127.0.0.1:'+address.port+'/');
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

test('reviewed staging MIME and exact response bytes admit safe assets and transformed scripts',async()=>{
  /** @type {File[]} */
  const files=[
    {path:'client.js',sourceType:'script',code:'globalThis.witness="public-decoder";'},
    {path:'state.blob',sourceType:'asset',
      code:'<r xmlns:d="urn:records"><d:item>data</d:item></r>'},
    {path:'styles/site.blob',sourceType:'asset',code:'body{color:navy}'},
    {path:'page.blob',sourceType:'asset',
      code:'<!doctype html><html><body><p>safe data document</p></body></html>'}
  ];
  const types=['text/javascript; charset=utf-8','application/xml',
    'text/css; charset=utf-8','text/html; charset=utf-8'];
  const responses=new Map([
    ['/client.js',{type:types[0],body:Buffer.from(files[0].code)}],
    ['/state.blob',{type:types[1],body:Buffer.from(files[1].code)}],
    ['/styles/site.blob',{type:types[2],body:Buffer.from(files[2].code)}],
    ['/page.blob',{type:types[3],body:Buffer.from(files[3].code)}]
  ]);
  await withServer(responses,async origin=>{
    assert.deepEqual(await verifyPublishedDeployment(origin,files,approve(files,types)),
      {verified:4,sourceFiles:1,assets:3});
  });
});

test('opaque JavaScript MIME, active HTML/XML/SVG and CSS disclosures are refused independently of suffix',async()=>{
  const cases=[
    ['text/javascript; charset=utf-8','window.untransformed=9;',/executable JavaScript/],
    ['application/javascript; charset=utf-8','globalThis.untransformed=9;',/executable JavaScript/],
    ['application/xml',
      '<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:script>window.plain=9;</h:script></h:html>',
      /HTML asset contains/],
    ['application/xhtml+xml',
      '<h:html xmlns:h="http://www.w3.org/1999/xhtml"><h:button onclick="alert(1)"/></h:html>',
      /HTML asset contains/],
    ['text/html; charset=utf-8','<html><script>window.plain=9;</script></html>',/HTML asset contains/],
    ['image/svg+xml',
      '<svg xmlns="http://www.w3.org/2000/svg"><script>window.plain=9;</script></svg>',
      /SVG asset contains/],
    ['text/css; charset=utf-8','@import url("data:text/css;base64,YQ==");',
      /CSS data import/],
    ['application/pdf','%PDF-1.4'+String.fromCharCode(10),
      /Executable-capable PDF/],
    ['application/atom+xml','<feed/>',/Unsupported public asset MIME/]
  ];
  for(const [type,code,expected] of cases){
    assert.equal(typeof code,'string');
    assert.ok(expected instanceof RegExp);
    /** @type {File[]} */
    const files=[{path:'payload.blob',sourceType:'asset',code}];
    await assert.rejects(()=>
      verifyPublishedDeployment('http://127.0.0.1:1/',files,approve(files,[type])),
      expected,type+' must be audited before any HTTP request');
  }
});

test('staging refuses malformed executable UTF-8 and lossy source strings before HTTP',async()=>{
  const invalid=Buffer.from([0xc0,0xaf]);
  /** @type {Array<File & {type:string}>} */
  const cases=[
    {path:'client.blob',sourceType:'script',
      code:Buffer.concat([Buffer.from('/*'),invalid,Buffer.from('*/\nglobalThis.ok=1;')]),
      type:'text/javascript; charset=utf-8'},
    {path:'page.blob',sourceType:'asset',
      code:Buffer.concat([Buffer.from('<html><p>'),invalid,Buffer.from('</p></html>')]),
      type:'text/html; charset=utf-8'},
    {path:'style.blob',sourceType:'asset',
      code:Buffer.concat([Buffer.from('body{/*'),invalid,Buffer.from('*/color:navy}')]),
      type:'text/css; charset=utf-8'},
    {path:'xml.blob',sourceType:'asset',
      code:Buffer.concat([Buffer.from('<root>'),invalid,Buffer.from('</root>')]),
      type:'application/xml; charset=utf-8'}
  ];
  for(const file of cases){
    await assert.rejects(()=>verifyPublishedDeployment('http://127.0.0.1:1/',
      [file],approve([file],[file.type])),/not valid UTF-8/,file.type);
  }
  /** @type {File} */
  const surrogate={path:'client.js',sourceType:'script',
    code:'globalThis.unpaired="'+String.fromCharCode(0xd800)+'";'};
  await assert.rejects(()=>verifyPublishedDeployment('http://127.0.0.1:1/',
    [surrogate],approve([surrogate],['text/javascript; charset=utf-8'])),
  /raw unpaired surrogate/);
  // A valid astral-pair source and truly opaque non-UTF-8 image bytes remain
  // admissible: do not turn the executable-text check into a blanket ban.
  /** @type {File[]} */
  const passing=[
    {path:'ok.js',sourceType:'script',code:'globalThis.label="🧪";'},
    {path:'opaque.bin',sourceType:'asset',code:Buffer.from([0xff,0xd8,0xff])}
  ];
  const types=['text/javascript; charset=utf-8','image/jpeg'];
  await withServer(new Map([
    ['/ok.js',{type:types[0],body:Buffer.from(passing[0].code)}],
    ['/opaque.bin',{type:types[1],body:Buffer.from(passing[1].code)}]
  ]),async origin=>{
    assert.deepEqual(await verifyPublishedDeployment(origin,passing,approve(passing,types)),
      {verified:2,sourceFiles:1,assets:1});
  });
});

test('executable text response charset cannot silently diverge from UTF-8 audit',async()=>{
  const candidates=[
    {sourceType:'script',code:'globalThis.plain=7;',type:'text/javascript',
      expected:/explicit UTF-8 charset/},
    {sourceType:'script',code:'globalThis.plain=7;',type:'text/javascript; charset=windows-1252',
      expected:/explicit UTF-8 charset/},
    {sourceType:'asset',code:'<html><body>safe</body></html>',type:'text/html',
      expected:/explicit UTF-8 charset/},
    {sourceType:'asset',code:'body{color:blue}',type:'text/css; charset=iso-8859-1',
      expected:/explicit UTF-8 charset/},
    {sourceType:'asset',code:'<root/>',type:'application/xml; charset=utf-16le',
      expected:/non-UTF-8 charset/}
  ];
  for(const sample of candidates){
    /** @type {File[]} */
    const files=[{path:'document.blob',
      sourceType:/** @type {SourceType} */(sample.sourceType),code:sample.code}];
    await assert.rejects(()=>
      verifyPublishedDeployment('http://127.0.0.1:1/',files,
        approve(files,[sample.type])),sample.expected,sample.type);
  }
});

test('untrusted HTTP MIME, bytes, redirects and nosniff omissions fail the contract',async()=>{
  /** @type {File[]} */
  const files=[{path:'icon.bin',sourceType:'asset',code:Buffer.from([1,2,3,4])}];
  const manifest=approve(files,['image/png']);
  const response={type:'image/png',body:Buffer.from([1,2,3,4])};
  const responses=new Map([['/icon.bin',response]]);
  await withServer(responses,async origin=>{
    assert.deepEqual(await verifyPublishedDeployment(origin,files,manifest),
      {verified:1,sourceFiles:0,assets:1});
    response.type='text/javascript';
    await assert.rejects(()=>
      verifyPublishedDeployment(origin,files,manifest),/Content-Type differs/);
    response.type='image/png';
    response.body=Buffer.from([1,2,3,5]);
    await assert.rejects(()=>
      verifyPublishedDeployment(origin,files,manifest),/bytes differ/);
    response.body=Buffer.from([1,2,3,4]);
    response.headers={'x-content-type-options':'invalid'};
    await assert.rejects(()=>
      verifyPublishedDeployment(origin,files,manifest),/lacks nosniff/);
    response.headers={'vary':'Sec-Fetch-Dest'};
    await assert.rejects(()=>
      verifyPublishedDeployment(origin,files,manifest),/varies by request context/);
    response.headers={'vary':'Accept-Encoding'};
    assert.deepEqual(await verifyPublishedDeployment(origin,files,manifest),
      {verified:1,sourceFiles:0,assets:1},
      'Only decoded compression variants are accepted as byte-identical');
    response.headers=undefined;
    response.status=302;
    await assert.rejects(()=>
      verifyPublishedDeployment(origin,files,manifest),/HTTP 200/);
  });
});

test('decoded gzip publication and literal URL hash/percent path segments are reviewed byte-exact',async()=>{
  /** @type {File[]} */
  const files=[
    {path:'pages/hash#inside/file%25.blob',sourceType:'asset',
      code:'<r><item>uncompressed reviewed XML bytes</item></r>'}
  ];
  const type='application/xml; charset=utf-8';
  const responses=new Map([[
    '/pages/hash%23inside/file%2525.blob',
    {type,body:gzipSync(Buffer.from(files[0].code)),
      headers:{'content-encoding':'gzip'}}
  ]]);
  await withServer(responses,async origin=>{
    assert.deepEqual(await verifyPublishedDeployment(origin,files,approve(files,[type])),
      {verified:1,sourceFiles:0,assets:1});
  });
});

test('manifest hashes and complete portable path inventory are required before network access',async()=>{
  /** @type {File[]} */
  const files=[{path:'data.bin',sourceType:'asset',code:'immutable'}];
  const record=approve(files,['application/octet-stream'])[0];
  await assert.rejects(()=>
    verifyPublishedDeployment('http://127.0.0.1:1/',files,
      [{...record,sha256:'0'.repeat(64)}]),/Local publication differs/);
  await assert.rejects(()=>
    verifyPublishedDeployment('http://127.0.0.1:1/',files,[]),/Missing exact reviewed response/);
  await assert.rejects(()=>
    verifyPublishedDeployment('http://127.0.0.1:1/',files,[record,record]),/Duplicate reviewed response/);
  await assert.rejects(()=>
    verifyPublishedDeployment('http://127.0.0.1:1/',[
      ...files,{path:'DATA.bin',sourceType:'asset',code:'immutable'}
    ],[record,{...record,path:'DATA.bin'}]),/Unsafe|duplicate|Duplicate/i);
  await assert.rejects(()=>
    verifyPublishedDeployment('file:///unsafe/',files,[record]),/bare HTTP/);
  await assert.rejects(()=>
    verifyPublishedDeployment('http://127.0.0.1:1/subdir/',files,[record]),/bare HTTP/);
  await assert.rejects(()=>
    verifyPublishedDeployment('http://example.com/',files,[record]),/HTTPS or loopback HTTP/);
});
