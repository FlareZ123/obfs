'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');

/** @typedef {{upper:[number,string][],lower:[number,string][],nfkc:[number,string][]}} UnicodeMappings */

/**
 * Descriptive Unicode single-scalar host fingerprint. Two V8 hosts may ship
 * different Unicode versions and still be conforming to their own releases.
 * Composite input sequences and normalization-stability guarantees are outside
 * the scope of this probe.
 * @returns {UnicodeMappings}
 */
function collectMappings(){
  /** @type {[number,string][]} */
  const upper=[];
  /** @type {[number,string][]} */
  const lower=[];
  /** @type {[number,string][]} */
  const nfkc=[];
  for(let cp=0;cp<=0x10ffff;cp++){
    if(cp>=0xd800&&cp<=0xdfff)continue;
    const value=String.fromCodePoint(cp);
    const up=value.toUpperCase();
    const lo=value.toLowerCase();
    const normalized=value.normalize('NFKC');
    if(up!==value)upper.push([cp,up]);
    if(lo!==value)lower.push([cp,lo]);
    if(normalized!==value)nfkc.push([cp,normalized]);
  }
  return {upper,lower,nfkc};
}

/**
 * Output only a bounded sample. Raw change maps remain available to the
 * runtime comparison, including unchanged values represented by absence.
 * @param {UnicodeMappings} nodeMappings
 * @param {UnicodeMappings} browserMappings
 * @returns {Record<string,unknown>}
 */
function compareMappings(nodeMappings,browserMappings){
  /** @type {Record<string,unknown>} */
  const cases={};
  for(const key of /** @type {(keyof UnicodeMappings)[]} */(['upper','lower','nfkc'])){
    const a=new Map(nodeMappings[key]);
    const b=new Map(browserMappings[key]);
    const changed=new Set([...a.keys(),...b.keys()]);
    const differences=[...changed].filter(cp=>a.get(cp)!==b.get(cp))
      .sort((a,b)=>a-b);
    cases[key]={
      nodeChanged:a.size,
      chromeChanged:b.size,
      differences:differences.length,
      examples:differences.slice(0,15).map(cp=>({
        cp:'U+'+cp.toString(16).toUpperCase().padStart(4,'0'),
        node:a.get(cp)??String.fromCodePoint(cp),
        chrome:b.get(cp)??String.fromCodePoint(cp)
      }))
    };
  }
  return cases;
}

/**
 * This test surveys a candidate cross-host migration hazard and intentionally
 * does not assert equality or inequality across independently updated ICU
 * versions. Any mismatch is a witness requiring an actual selected-SCO
 * original/emitted differential before changing compiler admission.
 */
test('native single-scalar Unicode mappings on Node and Chromium are catalogued',{
  skip:process.env.OBFS_FOCUSED_TEST!=='test/sco-unicode-host-browser.test.js'||
    process.platform==='win32'
},async()=>{
  const puppeteer=require('puppeteer-core');
  const browser=await puppeteer.launch({
    channel:process.env.CHROMIUM_BIN?undefined:'chrome',
    executablePath:process.env.CHROMIUM_BIN,
    headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });
  try{
    const node=collectMappings();
    const page=await browser.newPage();
    const chrome=/** @type {UnicodeMappings} */(await page.evaluate(collectMappings));
    assert.ok(node.upper.length>0&&chrome.upper.length>0);
    const cases=compareMappings(node,chrome);
    console.log('SCO_UNICODE_HOST_PARITY '+JSON.stringify({
      node:process.version,
      nodeUnicode:process.versions.unicode,
      nodeIcu:process.versions.icu,
      chrome:await browser.version(),
      cases
    }));
  }finally{
    await browser.close();
  }
});
