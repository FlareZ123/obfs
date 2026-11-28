'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const {createHash}=require('node:crypto');
const http=require('node:http');
const {once}=require('node:events');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');
const {findInlineHtmlSource}=require('../src/html-assets');

const source='globalThis._selectSriWitness=137;'+
  'globalThis._selectSriPayload="SRI hidden SELECT base original exact bytes";';
const digest=createHash('sha256').update(source).digest('base64');
const html='<!doctype html><html><body>'+
  '<select><base href="../assets/"><option>Safe UI</option></select>'+
  '<script src="./client.js" integrity="sha256-'+digest+'"></script>'+
  '<p id="sentinel">Script integrity check</p></body></html>';
/** @type {{path:string,sourceType:'asset'|'script',code:string|Buffer}[]} */
const files=[
  {path:'assets/client.js',sourceType:'script',code:source},
  {path:'pages/index.html',sourceType:'asset',code:Buffer.from(html)}
];
const options={
  mode:/** @type {const} */('coo'),
  seed:'agent7-select-hidden-base-sri',
  strings:true,
  properties:false,
  identifiers:false
};

test('fail closed on SELECT-hidden BASE before rewriting local SRI-pinned JavaScript',()=>{
  assert.equal(findInlineHtmlSource(html),'URL base in select context');
  for(const mode of /** @type {const} */(['coo','sco','sno'])){
    assert.throws(()=>obfuscateFiles(files,{...options,mode}),
      /HTML asset contains URL base in select context/,mode);
  }
  // An ordinary SELECT with options and unrelated SRI references remains
  // admissible and does not suppress a provably unrelated local rewrite.
  const benign=html.replace('<base href="../assets/">','')
    .replace('./client.js','./unrelated.js');
  const transformed=obfuscateFiles([
    files[0],{path:'pages/index.html',sourceType:'asset',code:Buffer.from(benign)}
  ],options);
  assert.notEqual(transformed.files[0].code,source,
    'positive unrelated-script string encoding still has nonzero yield');
});

test('real HTTP Chromium uses SELECT-hidden BASE for SRI and blocks a changed script',{
  skip:process.platform!=='linux',timeout:60000
},async()=>{
  const altered=obfuscateFiles([files[0]],options);
  const bad=String(altered.files[0].code);
  assert.notEqual(bad,source,'the counterfactual actually changes pinned JS bytes');
  /** @type {Map<string,string>} */
  const routes=new Map([
    ['/native/pages/index.html',html],
    ['/native/assets/client.js',source],
    ['/unsafe/pages/index.html',html],
    ['/unsafe/assets/client.js',bad]
  ]);
  const server=http.createServer((req,res)=>{
    const path=req.url??'';
    const content=routes.get(path);
    if(content===undefined){res.writeHead(404);res.end('not found');return;}
    res.writeHead(200,{
      'content-type':path.endsWith('.html')?'text/html; charset=utf-8':
        'text/javascript; charset=utf-8',
      'x-content-type-options':'nosniff',
      'cache-control':'no-store'
    });
    res.end(content);
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  /** @type {import('puppeteer-core').Browser|null} */
  let browser=null;
  try{
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN || '/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
    });
    /** @param {'native'|'unsafe'} kind */
    async function inspect(kind){
      const page=await /** @type {import('puppeteer-core').Browser} */(browser).newPage();
      try{
        const response=await page.goto(
          'http://127.0.0.1:'+address.port+'/'+kind+'/pages/index.html',
          {waitUntil:'load'});
        assert.equal(response?.status(),200,kind+' HTML status');
        return await page.evaluate(()=>({
          base:document.baseURI,
          value:globalThis._selectSriWitness,
          payload:globalThis._selectSriPayload
        }));
      }finally{await page.close();}
    }
    const native=await inspect('native');
    const unsafe=await inspect('unsafe');
    assert.equal(native.base,'http://127.0.0.1:'+address.port+'/native/assets/');
    assert.equal(unsafe.base,'http://127.0.0.1:'+address.port+'/unsafe/assets/');
    assert.equal(native.value,137,'native hash pinned script executes');
    assert.equal(native.payload,'SRI hidden SELECT base original exact bytes');
    assert.equal(unsafe.value,undefined,'mutated script rejected by SRI');
    assert.equal(unsafe.payload,undefined,'no mutated script observable');
  }finally{
    if(browser)await browser.close();
    server.close();
    await once(server,'close');
  }
});
