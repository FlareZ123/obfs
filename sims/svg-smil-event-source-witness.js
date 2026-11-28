'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {findInlineSvgSource}=require('../src/svg-assets');
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
    browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_BIN||'google-chrome',
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
    console.log(JSON.stringify({preflight,control,animationControl,suspect,xmlSuspect,chrome:await browser.version()}));
    assert.match(preflight.direct,/event handler/);
    assert.equal(preflight.benign,null);
    assert.equal(preflight.animated,null);
    assert.equal(preflight.animatedXml,null);
    assert.equal(control.executed,true,'direct handler positive control must execute');
    assert.equal(animationControl.fill,'rgb(0, 128, 0)','benign SVG SMIL animation must apply');
    assert.ok(suspect.executed||xmlSuspect.executed,
      'At least one animated handler must execute to establish source preflight bypass');
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main,direct,animated,animatedXml,benign};
