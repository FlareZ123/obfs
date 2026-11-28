'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const puppeteer=require('puppeteer-core');
const {findInlineSvgSource}=require('../src/svg-assets');
const {findInlineHtmlSource}=require('../src/html-assets');
const prefix='<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="128" height="96">';
const direct=prefix+'<rect id="hit" width="100" height="80" onmouseover="window._witness=23"/></svg>';
const benign=prefix+'<rect id="hit" width="100" height="80" fill="blue"><set attributeName="fill" to="green" begin="0s" dur="indefinite" fill="freeze"/></rect></svg>';
const animated=prefix+'<rect id="hit" width="100" height="80"><set attributeName="onmouseover" to="window._witness=23" begin="0s" dur="indefinite" fill="freeze"/></rect></svg>';
const animatedXml=animated.replace('attributeName="onmouseover"','attributeName="onmouseover" attributeType="XML"');
/** @returns {Promise<void>} */
async function main(){
  const preflight={direct:findInlineSvgSource(direct),benign:findInlineSvgSource(benign),animated:findInlineSvgSource(animated),animatedXml:findInlineSvgSource(animatedXml)};
  const server=http.createServer((req,res)=>{
    if(['/direct.svg','/animated.svg','/animated-xml.svg','/benign.svg'].includes(req.url)){
      res.writeHead(200,{'content-type':'image/svg+xml; charset=utf-8',
        'x-content-type-options':'nosniff','cache-control':'no-store'});
      res.end(req.url==='/direct.svg'?direct:req.url==='/benign.svg'?benign:req.url==='/animated-xml.svg'?animatedXml:animated);return;
    }
    res.writeHead(404);res.end();
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  let browser;
  try{
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    browser=await puppeteer.launch({executablePath:execFileSync('which',
      [process.env.CHROMIUM_BIN||'google-chrome'],{encoding:'utf8'}).trim(),
      headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
    const page=await browser.newPage();
    /** @param {'direct'|'benign'|'animated'|'animated-xml'} name */
    async function inspect(name){
      await page.goto(origin+'/'+name+'.svg',{waitUntil:'load'});
      await page.waitForFunction(()=>Boolean(document.getElementById('hit')),{timeout:6000});
      await new Promise(resolve=>setTimeout(resolve,500));
      return page.evaluate(()=>{
        const doc=document;
        const rect=doc.getElementById('hit');
        const win=window;
        win._witness=0;
        rect.dispatchEvent(new win.MouseEvent('mouseover',{bubbles:true}));
        return {executed:win._witness===23,witness:win._witness,
          reflected:rect.getAttribute('onmouseover'),fill:win.getComputedStyle(rect).fill,url:doc.URL};
      });
    }
    const control=await inspect('direct');
    const animationControl=await inspect('benign');
    const suspect=await inspect('animated');
    const xmlSuspect=await inspect('animated-xml');

    // An HTML-inlined SVG uses a different source parser. The animation
    // changes the effective link URL without any original javascript: href.
    const htmlPrefix='<!doctype html><html><body><svg xmlns="http://www.w3.org/2000/svg" width="128" height="96">';
    const htmlSuffix='</svg></body></html>';
    const htmlDirect=htmlPrefix+'<a id="go" href="javascript:window._smilHref=51">'+
      '<rect width="100" height="80" fill="red"/></a>'+htmlSuffix;
    const htmlAnimated=htmlPrefix+'<a id="go" href="#safe">'+
      '<set attributeName="href" to="javascript:window._smilHref=51" begin="0s" dur="indefinite" fill="freeze"/>'+
      '<rect width="100" height="80" fill="red"/></a>'+htmlSuffix;
    const htmlValues=htmlPrefix+'<a id="go" href="#safe">'+
      '<animate attributeName="href" values="#safe;javascript:window._smilHref=51" begin="0s" dur="1s" fill="freeze" calcMode="discrete"/>'+
      '<rect width="100" height="80" fill="red"/></a>'+htmlSuffix;
    const htmlPreflight={direct:findInlineHtmlSource(htmlDirect),
      animated:findInlineHtmlSource(htmlAnimated),values:findInlineHtmlSource(htmlValues)};
    const htmlPage=await browser.newPage();
    /** @param {string} html */
    async function inspectHtml(html) {
      await htmlPage.goto('about:blank');
      await htmlPage.setContent(html);
      await new Promise(resolve=>setTimeout(resolve,1300));
      const before=await htmlPage.evaluate(()=>{
        const anchor=document.getElementById('go');
        window._smilHref=0;
        return {base:anchor.href.baseVal,animated:anchor.href.animVal};
      });
      await htmlPage.mouse.click(30,30);
      await new Promise(resolve=>setTimeout(resolve,150));
      const after=await htmlPage.evaluate(()=>window._smilHref);
      return {before,after};
    }
    const htmlBrowser={direct:await inspectHtml(htmlDirect),
      animated:await inspectHtml(htmlAnimated),values:await inspectHtml(htmlValues)};
    console.log(JSON.stringify({preflight,control,animationControl,suspect,
      xmlSuspect,htmlPreflight,htmlBrowser,chrome:await browser.version()}));

    assert.match(preflight.direct,/event handler/);
    assert.equal(preflight.benign,null);
    assert.equal(preflight.animated,null);
    assert.equal(preflight.animatedXml,null);
    assert.equal(control.executed,true,'direct handler positive control must execute');
    assert.equal(animationControl.fill,'rgb(0, 128, 0)','benign SVG SMIL animation must apply');
    // The event-handler animation result remains observation-only: current
    // Chromium may not synthesize it despite an independent SVG advisory.
    assert.match(htmlPreflight.direct,/embedded executable URL/);
    assert.equal(htmlPreflight.animated,null);
    assert.equal(htmlPreflight.values,null);
    assert.equal(htmlBrowser.direct.after,51,'direct SVG link positive control');
    assert.equal(htmlBrowser.animated.before.animated,'javascript:window._smilHref=51');
    assert.equal(htmlBrowser.animated.after,51,'SMIL href must execute from HTML');
    assert.equal(htmlBrowser.values.before.animated,'javascript:window._smilHref=51');
    assert.equal(htmlBrowser.values.after,51,'SMIL values URL must execute from HTML');
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main,direct,animated,animatedXml,benign};
