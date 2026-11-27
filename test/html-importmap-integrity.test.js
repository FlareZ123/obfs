'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const http=require('node:http');
const {test}=require('node:test');
const {obfuscateFiles,createScoHandler}=require('../src');
const {
  findInlineHtmlSource,hasPinnedLocalJavaScriptIntegrity
}=require('../src/html-assets');

const original='export const label="an exact import-map-bound source commitment";';
const digest='sha256-'+createHash('sha256').update(original).digest('base64');

/** @param {Record<string,unknown>} map @returns {string} */
function markup(map) {
  return '<!doctype html><html><head><script type="importmap">'+
    JSON.stringify(map)+'</script></head><body>'+
    '<script type="module" src="./consumer.mjs"></script></body></html>';
}

/** @param {string} html */
function files(html) {
  return [
    {path:'lib.mjs',sourceType:/** @type {const} */ ('module'),code:original},
    {path:'index.html',sourceType:/** @type {const} */ ('asset'),code:Buffer.from(html)}
  ];
}

/** @param {string} html @param {'coo'|'sno'|'sco'} mode */
function compile(html,mode){
  return obfuscateFiles(files(html),{
    mode,seed:'safe-importmap-pinning-'+mode,closedWorld:true,
    strings:true,identifiers:false,properties:false
  });
}

test('safe import map integrity pins original imported module bytes across modes',()=>{
  const html=markup({
    imports:{lib:'./lib.mjs'},
    integrity:{'./lib.mjs':digest}
  });
  assert.equal(findInlineHtmlSource(html),null,
    'an inert, URL-only import map does not embed JavaScript source');
  assert.equal(hasPinnedLocalJavaScriptIntegrity(files(html)),true);
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    const result=compile(html,mode);
    assert.equal(result.files[0].code,original,mode+' pinned original bytes');
    assert.deepEqual(result.files[1].code,Buffer.from(html));
  }
});

test('SCO serves original imported module bytes when import-map integrity pins it',async()=>{
  const html=markup({
    imports:{lib:'./lib.mjs'},
    integrity:{'./lib.mjs':digest}
  });
  const server=http.createServer(createScoHandler(files(html),{
    closedWorld:true,routePrefix:'/custom/'
  }));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    for(let attempt=0;attempt<2;attempt++){
      /** @type {globalThis.Response} */
      const response=await fetch('http://127.0.0.1:'+address.port+'/custom/lib.mjs');
      assert.equal(response.status,200);
      assert.equal(await response.text(),original);
    }
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
});

test('import map integrity commitment works under an unrecognized public mount',()=>{
  const html=markup({
    imports:{lib:'/deployment/lib.mjs'},
    integrity:{'/deployment/lib.mjs':digest}
  });
  assert.equal(findInlineHtmlSource(html),null);
  assert.equal(hasPinnedLocalJavaScriptIntegrity(files(html)),true,
    'byte-matched root URL must conserve source despite unknown deployment prefix');
});

test('safe unpinned and unrelated-relative import maps retain real transform yield',()=>{
  const cases=[
    markup({imports:{lib:'./lib.mjs'}}),
    markup({imports:{lib:'./lib.mjs?build=27#release-1'}}),
    markup({imports:{lib:'./lib.mjs'},integrity:{'./not-lib.mjs':digest}}),
    markup({imports:{lib:'./lib.mjs'},scopes:{'./pages/':{lib:'./lib.mjs'}}})
  ];
  for(const html of cases) {
    assert.equal(findInlineHtmlSource(html),null);
    assert.equal(hasPinnedLocalJavaScriptIntegrity(files(html)),false);
    const result=compile(html,'coo');
    assert.notEqual(result.files[0].code,original);
    assert.ok(result.files[0].metrics.literals>0);
  }
});

test('raw executable JavaScript syntax in import-map URL fragments remains refused',()=>{
  const exposed='./lib.mjs#(()=>{globalThis.PRIVATE_SOURCE_DISCLOSURE=17})()';
  const cases=[
    {imports:{lib:exposed}},
    {imports:{lib:'./lib.mjs'},scopes:{[exposed]:{lib:'./lib.mjs'}}},
    {imports:{lib:'./lib.mjs'},integrity:{[exposed]:digest}}
  ];
  for(const map of cases){
    const html=markup(map);
    assert.equal(findInlineHtmlSource(html),'inline script source',
      'URL fragment containing raw JavaScript must not be published as safe JSON');
    assert.throws(()=>compile(html,'coo'),/HTML asset contains inline script source/u);
  }
});

test('import-map data and script URLs are refused as embedded executable source',()=>{
  const denied=[
    {imports:{secret:'data:text/javascript,globalThis.secret=12'}},
    {imports:{secret:'javascript:globalThis.secret=12'}},
    {imports:{'function leaked(){return 12;}':'./lib.mjs'}},
    {imports:{secret:'./lib.mjs'},scopes:{'./pages/':{
      secret:'data:text/javascript,globalThis.secret=12'}}},
    {imports:{secret:'./lib.mjs'},integrity:{
      'data:text/javascript,globalThis.secret=12':digest}},
    {imports:{secret:'./lib.mjs'},integrity:{
      './lib.mjs':'function leaked(){return 12;}'}}
  ];
  for(const map of denied){
    const html=markup(map);
    assert.ok(findInlineHtmlSource(html),'unsafe import map URL must be refused');
    assert.throws(()=>compile(html,'coo'),/HTML asset contains/);
  }
  assert.ok(findInlineHtmlSource(
    '<script type="application/json">{"source":"function leaked(){}"}</script>'),
  'inert arbitrary JSON remains conservatively source-bearing');
});
