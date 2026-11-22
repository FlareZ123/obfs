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
 *   TimeoutErrorStack:string,
 *   StructuredCloneErrorMessage:string,
 *   InvalidUrlErrorMessage:string,
 *   InvalidAtobErrorMessage:string,
 *   InvalidDecoderErrorMessage:string
 * }} HostWitness
 */

/** @returns {Promise<HostWitness>} */
async function observeHost(){
  const signal=AbortSignal.timeout(10);
  await new Promise(resolve=>
    signal.addEventListener('abort',()=>resolve(),{once:true}));
  let cloneMessage='';
  try {
    structuredClone(()=>7);
  } catch(error) {
    if(!(error instanceof DOMException)||error.name!=='DataCloneError')throw error;
    cloneMessage=error.message;
  }
  /** @param {()=>unknown} action @returns {string} */
  function caughtMessage(action){
    try {action();return '';}
    catch(error){return error instanceof Error?error.message:String(error);}
  }
  return {
    InvalidUrlErrorMessage:caughtMessage(()=>new URL('%%%')),
    InvalidAtobErrorMessage:caughtMessage(()=>atob('bad?')),
    InvalidDecoderErrorMessage:caughtMessage(()=>new TextDecoder('not-a-charset')),
    StructuredCloneErrorMessage:cloneMessage,
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
    // Probe 768 deterministic Latin1 strings covering each byte as a
    // one-, two- and three-byte sequence. Browser and Node must agree on
    // encoded output and its decoded binary-string roundtrip.
    /** @type {string[]} */
    const samples=[];
    for(let i=0;i<256;i++){
      samples.push(String.fromCharCode(i));
      samples.push(String.fromCharCode(i,(i*73+19)%256));
      samples.push(String.fromCharCode(i,(i*73+19)%256,(i*31+7)%256));
    }
    const nodeEncoded=samples.map(value=>btoa(value));
    const browserEncoded=await page.evaluate(
      values=>values.map(value=>btoa(value)),samples);
    assert.deepEqual(browserEncoded,nodeEncoded,'btoa valid Latin1 parity');
    const nodeDecoded=nodeEncoded.map(value=>atob(value));
    const browserDecoded=await page.evaluate(
      values=>values.map(value=>atob(value)),nodeEncoded);
    assert.deepEqual(nodeDecoded,samples,'native atob(btoa) roundtrip');
    assert.deepEqual(browserDecoded,samples,'Chrome atob(btoa) roundtrip');
    const codecSamples={count:samples.length,
      encodedSha256:crypto.createHash('sha256').update(nodeEncoded.join(','),'utf8').digest('hex')};
    console.log(JSON.stringify({
      codecSamples,
      node:process.version,
      platform:process.platform,
      browser:await browser.version(),
      cases
    },null,2));
  } finally {
    await browser.close();
  }
});
