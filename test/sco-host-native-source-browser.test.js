'use strict';

const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {test}=require('node:test');

/**
 * This deliberately observes native, non-obfuscated host objects in both
 * runtimes. It is a negative control for selected SCO relocation admission.
 *
 * @typedef {{
 *   BlobConstructor:string,
 *   BlobSliceMethod:string,
 *   BlobStreamConstructor:string,
 *   TimeoutErrorStack:string
 * }} HostWitness
 */

/** @returns {Promise<HostWitness>} */
async function observeHost(){
  const signal=AbortSignal.timeout(10);
  await new Promise(resolve=>
    signal.addEventListener('abort',()=>resolve(),{once:true}));
  return {
    BlobConstructor:String(Blob),
    BlobSliceMethod:String(new Blob([]).slice),
    BlobStreamConstructor:String(new Blob([]).stream().constructor),
    TimeoutErrorStack:String(signal.reason.stack)
  };
}

/** @param {string} value @returns {{length:number,sha256:string,prefix:string}} */
function fingerprint(value){
  return {
    length:value.length,
    sha256:crypto.createHash('sha256').update(value,'utf8').digest('hex'),
    prefix:value.slice(0,100)
  };
}

// Ordinary npm test must not require Chromium. The opt-in focused workflow
// runs this test on Node 22 Ubuntu/Windows with the existing puppeteer-core.
const selected=process.env.OBFS_FOCUSED_TEST==='test/sco-host-native-source-browser.test.js';

test('native Node and Chromium expose distinct SCO host-source witnesses',{
  skip:!selected
},async()=>{
  const puppeteer=require('puppeteer-core');
  const browser=await puppeteer.launch({
    channel:process.env.CHROMIUM_BIN?undefined:'chrome',
    executablePath:process.env.CHROMIUM_BIN,
    headless:true,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });
  try {
    const page=await browser.newPage();
    const browserWitness=await page.evaluate(observeHost);
    // Node AbortSignal.timeout uses an unref timer, so keep the event loop
    // alive while independently collecting the same unmodified host result.
    const keepAlive=setTimeout(()=>{},1000);
    /** @type {HostWitness} */
    let nodeWitness;
    try {
      nodeWitness=await observeHost();
    } finally {
      clearTimeout(keepAlive);
    }
    /** @type {Record<keyof HostWitness,{node:ReturnType<typeof fingerprint>,browser:ReturnType<typeof fingerprint>}>} */
    const cases=/** @type {any} */ ({});
    for(const key of /** @type {(keyof HostWitness)[]} */ (Object.keys(nodeWitness))) {
      assert.equal(typeof browserWitness[key],'string',key);
      assert.notEqual(nodeWitness[key],browserWitness[key],key+' must differ across hosts');
      cases[key]={
        node:fingerprint(nodeWitness[key]),
        browser:fingerprint(browserWitness[key])
      };
    }
    console.log(JSON.stringify({
      node:process.version,
      platform:process.platform,
      browser:await browser.version(),
      cases
    },null,2));
  } finally {
    await browser.close();
  }
});
