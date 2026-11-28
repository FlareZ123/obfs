'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {test}=require('node:test');
const {once}=require('node:events');
const puppeteer=require('puppeteer-core');
const {findInlineHtmlSource}=require('../src/html-assets');
const {assertNoSourceMapDisclosure}=require('../src/source-maps');

const SVG='http://www.w3.org/2000/svg';
const prefix='<!doctype html><html><body>';
const anchor='<a id="probe" href="#safe"><set attributeName="href" '+
  'to="javascript:window._smilHref=51" begin="0s" dur="indefinite"/>'+
  '<rect width="90" height="50"/></a>';

/**
 * Parser integration points in a real HTML document. Browser ESM import and
 * DOM mutations outside these assets are deliberately not part of this proof.
 * The link's SMIL href animVal is executable even though baseVal stays #safe.
 * @type {{name:string,html:string}[]}
 */
const positives=[
  {name:'direct-svg',html:'<svg>'+anchor+'</svg>'},
  {name:'nested-svg',html:'<svg><svg>'+anchor+'</svg></svg>'},
  {name:'foreignobject-to-svg',html:'<svg><foreignObject><svg>'+anchor+'</svg></foreignObject></svg>'},
  {name:'foreignobject-html-to-svg',html:'<svg><foreignObject><div><svg>'+anchor+'</svg></div></foreignObject></svg>'},
  {name:'math-mtext-svg',html:'<math><mtext><svg>'+anchor+'</svg></mtext></math>'},
  {name:'math-annotation-html-svg',html:'<math><annotation-xml encoding="text/html"><svg>'+anchor+'</svg></annotation-xml></math>'},
  {name:'math-annotation-xhtml-svg',html:'<math><annotation-xml encoding="application/xhtml+xml"><svg>'+anchor+'</svg></annotation-xml></math>'},
  {name:'table-foster-svg',html:'<table><svg>'+anchor+'</svg></table>'},
  {name:'select-svg',html:'<select><svg>'+anchor+'</svg></select>'},
  {name:'video-svg',html:'<video><svg>'+anchor+'</svg></video>'},
  {name:'uppercase-svg',html:'<SVG>'+anchor.replace('<set ','<SET ')+'</SVG>'},
  {name:'html-head-svg',html:'<head><svg>'+anchor+'</svg></head>'},
  {name:'html-pre-svg',html:'<pre><svg>'+anchor+'</svg></pre>'},
];

/** @param {string} html @returns {string} */
function document(html){return prefix+html+'</body></html>';}

/** @param {string} path @param {string} html */
function audit(path,html){
  return assertNoSourceMapDisclosure({path,sourceType:'asset',code:Buffer.from(html)});
}

test('SMIL href admission screens a browser-active namespace/HTML-parser corpus',()=>{
  for(const fixture of positives){
    const full=document(fixture.html);
    assert.match(findInlineHtmlSource(full),/SVG animation embeds executable URL/,
      fixture.name+' source preflight');
    assert.throws(()=>audit('index.html',full),
      /HTML asset contains SVG animation embeds executable URL/,fixture.name+' publication');
  }
});

test('inert HTML integration points are not mistaken for live SVG anchors',()=>{
  const inert=[
    {name:'SVG desc HTML integration',html:'<svg><desc>'+anchor+'</desc></svg>'},
    {name:'SVG title HTML integration',html:'<svg><title>'+anchor+'</title></svg>'},
    {name:'literal comment',html:'<!--<svg>'+anchor+'</svg>-->'},
  ];
  for(const fixture of inert){
    const full=document(fixture.html);
    assert.equal(findInlineHtmlSource(full),null,fixture.name+' source preflight');
    assert.doesNotThrow(()=>audit('index.html',full),fixture.name+' publication');
  }
  // A template is inert until host code instantiates it; fail closed so the
  // unmodified opaque HTML cannot hide an eventual executable SMIL link.
  const template=document('<template><svg>'+anchor+'</svg></template>');
  assert.match(findInlineHtmlSource(template),/SVG animation embeds executable URL/);
});

/**
 * This is a real browser DOM/SMIL proof, not an on-click execution guarantee.
 * The separate source-pinned real-HTTP browser attack in run 46114988303
 * established actual javascript: link activation for two core constructions.
 */
test('Chrome real-HTTP nosniff produces executable animated href in all declared namespace contexts',{
  skip:process.platform!=='linux',
  timeout:60000
},async()=>{
  /** @type {Map<string,string>} */
  const documents=new Map(positives.map(item=>[item.name,document(item.html)]));
  const server=http.createServer((req,res)=>{
    const name=decodeURIComponent(new URL(req.url??'/', 'http://127.0.0.1').pathname.slice(1));
    const html=documents.get(name);
    if(html===undefined){res.writeHead(404);res.end('missing');return;}
    res.writeHead(200,{
      'content-type':'text/html; charset=utf-8',
      'x-content-type-options':'nosniff',
      'cache-control':'no-store'
    });
    res.end(html);
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
      headless:true,
      args:['--no-sandbox','--disable-dev-shm-usage']
    });
    for(const fixture of positives){
      const page=await browser.newPage();
      try{
        const response=await page.goto('http://127.0.0.1:'+address.port+'/'+fixture.name,
          {waitUntil:'load'});
        assert.equal(response?.status(),200,fixture.name);
        assert.equal(response?.headers()['x-content-type-options'],'nosniff',fixture.name);
        const state=await page.evaluate(()=>{
          const link=document.getElementById('probe');
          const href=/** @type {SVGAnimatedString|undefined} */ (link?.href);
          return {
            mime:document.contentType,
            namespace:link?.namespaceURI,
            base:href?.baseVal,
            animated:href?.animVal
          };
        });
        assert.equal(state.mime,'text/html',fixture.name);
        assert.equal(state.namespace,SVG,fixture.name+' parser namespace');
        assert.equal(state.base,'#safe',fixture.name+' literal href');
        assert.equal(state.animated,'javascript:window._smilHref=51',
          fixture.name+' SMIL href');
      }finally{await page.close();}
    }
  }finally{
    if(browser)await browser.close();
    server.close();
    await once(server,'close');
  }
});
