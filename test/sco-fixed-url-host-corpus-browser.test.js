'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {test}=require('node:test');
const {partitionScoSelectedAsyncExports}=require('../src');

const focused=process.env.OBFS_FOCUSED_TEST===
  'test/sco-fixed-url-host-corpus-browser.test.js';

/**
 * Fixed, deterministic corpus entirely inside the selected-private URL
 * compiler's supported ASCII absolute HTTP(S) literal syntax.
 * This is a sample, not an exhaustive proof of cross-host equivalence.
 * @returns {string[]}
 */
function fixedUrls(){
  const hosts=[
    'example.org','api.example.org','a-b.example.co',
    'alpha9.example.io','s1.stable.test','xn--bcher-kva.example'
  ];
  const paths=[
    '', '/', '/a', '/a/b', '/a_b-9', '/a~._',
    '/a?x=1', '/a?x=1&y=2', '/a/b?x=1&y=2',
    '/a?b', '/a?b&&z=0', '/a?x=1/y', '/a//b',
    '/a?=1', '/a?x=y&z=w', '/?x=1',
    '/a?b=1&c=2', '/a?x=1&x=2', '/./b', '/../b'
  ];
  return ['http','https'].flatMap(scheme=>
    hosts.flatMap(host=>paths.map(tail=>scheme+'://'+host+tail)));
}

/**
 * Native static-URL scalar serialization with no caller-modified builtins.
 * Called independently in Node and directly inside a real Chromium page.
 * @param {string[]} texts
 * @returns {Array<{href:string,host:string,hostname:string,origin:string,
 *   pathname:string,search:string,hash:string,protocol:string}>}
 */
function nativeUrlValues(texts){
  return texts.map(text=>{
    const value=new URL(text);
    return {
      href:value.href,
      host:value.host,
      hostname:value.hostname,
      origin:value.origin,
      pathname:value.pathname,
      search:value.search,
      hash:value.hash,
      protocol:value.protocol
    };
  });
}

/** @param {unknown} value @returns {string} */
function digest(value){
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

test('selected-SCO syntax admits each varied fixed valid URL scalar reference',{
  skip:!focused
},()=>{
  const urls=fixedUrls();
  assert.equal(urls.length,240);
  assert.equal(new Set(urls).size,urls.length);
  for(const [index,url] of urls.entries()){
    const code='export async function privateOp(){'+
      'const value=new URL('+JSON.stringify(url)+');return value.hostname;}'+
      'export function visible(){return 7;}';
    const partition=partitionScoSelectedAsyncExports({
      path:'url-corpus.mjs',sourceType:'module',code
    },{seed:'sco-url-corpus-20261123/'+index,privateNames:['privateOp']});
    assert.deepEqual(partition.privateNames,['privateOp'],url);
  }
  console.log('SCO_FIXED_URL_CORPUS '+JSON.stringify({
    property:'static scalar hostname',count:urls.length,
    sourceDigest:digest(urls),admitted:urls.length
  }));
});

test('real Node 22 and Chromium native URL scalar fields match in admitted literal corpus',{
  skip:!focused||process.platform==='win32',timeout:60000
},async()=>{
  const puppeteer=require('puppeteer-core');
  const browser=await puppeteer.launch({
    channel:process.env.CHROMIUM_BIN?undefined:'chrome',
    executablePath:process.env.CHROMIUM_BIN,
    headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });
  try{
    const page=await browser.newPage();
    const urls=fixedUrls();
    const nodeValues=nativeUrlValues(urls);
    const chromeValues=await page.evaluate(nativeUrlValues,urls);
    assert.deepEqual(chromeValues,nodeValues);
    console.log('SCO_FIXED_URL_NATIVE_PARITY '+JSON.stringify({
      urls:urls.length,fields:8,
      node:process.version,chrome:await browser.version(),
      nodeDigest:digest(nodeValues),chromeDigest:digest(chromeValues)
    }));
  }finally{
    await browser.close();
  }
});
