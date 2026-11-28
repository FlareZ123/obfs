'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');

const enabled=process.env.OBFS_FOCUSED_TEST===
  'test/sco-regexp-modifier-native-browser.test.js'&&process.platform!=='win32';

/**
 * Compare new ECMAScript RegExp modifier-group availability. The constructor
 * pattern is a string literal: the JS parser does not need to support literal
 * regex modifier syntax in advance for the code to execute.
 * @returns {Record<string,string>}
 */
function probe(){
  /** @type {Record<string,string>} */
  const result={};
  for(const [label,pattern,subject] of [
    ['inline-i','(?i:abc)','ABC'],
    ['inline-s','(?s:a.b)','a\nb'],
    ['inline-m','(?m:^b$)','a\nb'],
    ['plain','abc','ABC']
  ]){
    try{
      result[label]=String(new RegExp(pattern).test(subject));
    }catch(error){
      const e=/** @type {Error} */(error);
      result[label]=e.name+':'+e.message;
    }
  }
  return result;
}

test('Node 22 and real Chromium feature grammar parity must be measured before SCO relocation',{
  skip:!enabled,timeout:60000
},async()=>{
  const puppeteer=require('puppeteer-core');
  const browser=await puppeteer.launch({
    channel:process.env.CHROMIUM_BIN?undefined:'chrome',
    executablePath:process.env.CHROMIUM_BIN,
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });
  try{
    const page=await browser.newPage();
    const node=probe();
    const chrome=/** @type {ReturnType<typeof probe>} */(await page.evaluate(probe));
    assert.equal(node.plain,chrome.plain);
    console.log('SCO_REGEXP_MODIFIER_NATIVE '+JSON.stringify({
      node:process.version,chrome:await browser.version(),nodeResults:node,browserResults:chrome
    }));
    assert.notEqual(node['inline-i'],chrome['inline-i'],
      'Feature gap may have disappeared; re-evaluate this candidate');
  }finally{
    await browser.close();
  }
});
