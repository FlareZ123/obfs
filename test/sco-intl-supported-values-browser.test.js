'use strict';

const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {test}=require('node:test');

/** @typedef {{currency:string[],collation:string[],unit:string[]}} HostValues */

/** @returns {HostValues} */
function hostValues(){
  return {
    currency:Intl.supportedValuesOf('currency'),
    collation:Intl.supportedValuesOf('collation'),
    unit:Intl.supportedValuesOf('unit')
  };
}

/** @returns {{getCollationsType:string,collationsLength:number|null,getCalendarsType:string,calendarsLength:number|null}} */
function localeShape(){
  const locale=new Intl.Locale('en');
  const collations=Reflect.get(locale,'collations');
  const calendars=Reflect.get(locale,'calendars');
  return {
    getCollationsType:typeof Reflect.get(locale,'getCollations'),
    collationsLength:Array.isArray(collations)?collations.length:null,
    getCalendarsType:typeof Reflect.get(locale,'getCalendars'),
    calendarsLength:Array.isArray(calendars)?calendars.length:null
  };
}

/** @param {string[]} values @returns {string} */
function digest(values){
  return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

/**
 * This experiment is intentionally descriptive. Two hosts may legitimately
 * ship the same ICU/CLDR data; an equality or difference assertion would
 * make the test brittle and would not establish universal host equivalence.
 */
test('native SCO host-data probe records exact Node/Chromium Intl differences',{
  skip:process.env.OBFS_FOCUSED_TEST!=='test/sco-intl-supported-values-browser.test.js'||
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
    const page=await browser.newPage();
    const node=hostValues();
    const client=/** @type {HostValues} */ (await page.evaluate(hostValues));
    const browserLocale=await page.evaluate(localeShape);
    const nodeLocale=localeShape();
    /** @type {Record<string,unknown>} */
    const cases={};
    for(const key of /** @type {(keyof HostValues)[]} */(Object.keys(node))){
      const a=node[key];
      const b=client[key];
      assert.ok(Array.isArray(b),key);
      assert.equal(new Set(a).size,a.length,key+' Node values unique');
      assert.equal(new Set(b).size,b.length,key+' Chromium values unique');
      cases[key]={
        nodeLength:a.length,
        chromeLength:b.length,
        nodeOnly:a.filter(value=>!b.includes(value)),
        chromeOnly:b.filter(value=>!a.includes(value)),
        nodeDigest:digest(a),
        chromeDigest:digest(b)
      };
    }
    console.log(JSON.stringify({
      node:process.version,
      icu:process.versions.icu,
      cldr:process.versions.cldr,
      chrome:await browser.version(),
      cases,
      localeShape:{node:nodeLocale,browser:browserLocale},
      selectedFunctionExample:{
        privateNode:Intl.supportedValuesOf('currency').includes('ZWG'),
        originalBrowser:client.currency.includes('ZWG')
      }
    },null,2));
  }finally{
    await browser.close();
  }
});
