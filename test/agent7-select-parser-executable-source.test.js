'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const {once}=require('node:events');
const puppeteer=require('puppeteer-core');
const {findInlineHtmlSource}=require('../src/html-assets');
const {assertNoSourceMapDisclosure}=require('../src/source-maps');

/**
 * These are browser-native executable source witnesses, not hypothetical
 * SMIL-only URLs. Chrome 144 accepted all three inside a SELECT in ordinary
 * HTML; parse5 7.3 discarded the relevant SVG/IFRAME tree in the first
 * red Linux/Windows source-pinned run 46127443303.
 * @type {{id:string,html:string,issue:RegExp,expected:number}[]}
 */
const executable=[
  {id:'svg-script',
    html:'<select><svg><script>window._inlineWitness=61</script></svg></select>',
    issue:/inline script source/,expected:61},
  {id:'svg-onload',
    html:'<select><svg onload="window._inlineWitness=63"></svg></select>',
    issue:/inline event handler/,expected:63},
  {id:'iframe-srcdoc',
    html:'<select><iframe srcdoc="<script>parent._inlineWitness=69</script>"></iframe></select>',
    issue:/embedded iframe source/,expected:69},
  {id:'option-svg-script',
    html:'<select><option><svg><script>window._inlineWitness=66</script></svg></option></select>',
    issue:/inline script source/,expected:66},
  {id:'math-svg-script',
    html:'<select><math><mtext><svg><script>window._inlineWitness=64</script></svg></mtext></math></select>',
    issue:/inline script source/,expected:64}
];
const encodedSmil='<select><svg><a id="encodedHref" href="#safe">'+
  '<set attributeName="href" to="jav&#x61;script:window._inlineWitness=72" '+
  'begin="0s" dur="indefinite"/></a></svg></select>';

/** @param {string} html @returns {string} */
const doc=html=>'<!doctype html><html><body>'+html+'</body></html>';

/** @param {string} html */
function audit(html){
  return assertNoSourceMapDisclosure({
    path:'index.html',sourceType:'asset',code:Buffer.from(doc(html))
  });
}

test('SELECT insertion mode cannot conceal executable SVG script, handler, srcdoc or entity-decoded SMIL',()=>{
  /** @type {string[]} */
  const misses=[];
  for(const fixture of executable) {
    const observation=findInlineHtmlSource(doc(fixture.html));
    let refused=false;
    try{audit(fixture.html);}
    catch(error){refused=fixture.issue.test(String(error));}
    console.log(JSON.stringify({case:fixture.id,detected:observation,refused}));
    if(!observation||!fixture.issue.test(observation)||!refused)
      misses.push(fixture.id);
  }
  const smil=findInlineHtmlSource(doc(encodedSmil));
  let refusedSmil=false;
  try{audit(encodedSmil);}
  catch(error){refusedSmil=/SVG animation embeds executable URL/u.test(String(error));}
  console.log(JSON.stringify({case:'entity-smil',detected:smil,refused:refusedSmil}));
  if(!smil||!/SVG animation embeds executable URL/u.test(smil)||!refusedSmil)
    misses.push('entity-smil');
  assert.deepEqual(misses,[], 'all browser-executed source paths must be rejected');
});

test('inert parser controls remain admissible',()=>{
  const safe=[
    '<select><option value="alpha">Alpha</option><option>Beta</option></select>',
    '<!--<select><svg><script>not executable</script></svg></select>-->',
    '<div data-note="select">No scripts</div>',
    '<textarea><select><svg><script>not executable</script></svg></select></textarea>',
    '<style>/* <select><svg><script>not executable</script></svg></select> */</style>',
    '<script type="importmap">{"imports":{"sample":"./safe.mjs"}}</script><select><option>Safe</option></select>',
    '<select><svg><a href="#safe"><set attributeName="href" to="#other" begin="0s"/></a></svg></select>'
  ];
  for(const html of safe){
    assert.equal(findInlineHtmlSource(doc(html)),null,html);
    assert.doesNotThrow(()=>audit(html),html);
  }
});

test('real HTTP Chrome executes source-bearing markup that parse5 7.3 erased',{
  skip:process.platform!=='linux',timeout:60000
},async()=>{
  const docs=new Map(executable.map(item=>[item.id,doc(item.html)]));
  docs.set('smil',doc(encodedSmil));
  const server=http.createServer((req,res)=>{
    const id=(req.url??'/').slice(1);
    if(!docs.has(id)){res.writeHead(404);res.end('missing');return;}
    res.writeHead(200,{
      'content-type':'text/html; charset=utf-8',
      'x-content-type-options':'nosniff'
    });
    res.end(docs.get(id));
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const addr=server.address();
  assert.ok(addr&&typeof addr!=='string');
  /** @type {import('puppeteer-core').Browser|null} */
  let browser=null;
  try{
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN || '/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
    });
    for(const fixture of executable){
      const page=await browser.newPage();
      try{
        const response=await page.goto('http://127.0.0.1:'+addr.port+'/'+fixture.id,
          {waitUntil:'load'});
        assert.equal(response?.status(),200,fixture.id);
        await page.waitForFunction('window._inlineWitness === '+fixture.expected,
          {timeout:5000});
        assert.equal(await page.evaluate(()=>window._inlineWitness),fixture.expected,
          fixture.id+' actual JavaScript execution');
      }finally{await page.close();}
    }
    const page=await browser.newPage();
    try{
      await page.goto('http://127.0.0.1:'+addr.port+'/smil',{waitUntil:'load'});
      const state=await page.evaluate(()=>{
        const element=document.getElementById('encodedHref');
        const href=/** @type {SVGAnimatedString|undefined} */(element?.href);
        return href?.animVal;
      });
      assert.equal(state,'javascript:window._inlineWitness=72',
        'HTML entity-decoded script scheme in native SMIL animation');
    }finally{await page.close();}
  }finally{
    if(browser)await browser.close();
    server.close();
    await once(server,'close');
  }
});
