'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const puppeteer=require('puppeteer-core');
const {obfuscateFiles}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */
/** @type {SourceFile[]} */
const files=[
  {path:'independent.mjs',sourceType:'module',
    code:'const record={privateB:23};const primitive=record.privateB;export function unrelated(){return primitive;}'},
  {path:'entry.mjs',sourceType:'module',code:[
    'import {unrelated} from "./independent.mjs";',
    'const frame=frames["sourceView"];',
    'const page=frame["doc"+"ument"];',
    'const raw=page["body"]["textContent"];',
    'export const observation={visible:raw.includes("privateB"),value:unrelated()};'
  ].join('\n')}
];

/** @param {boolean} declaredFrame @returns {string} */
function html(declaredFrame){
  const preload=declaredFrame?'':[
    'const iframe=document.createElement("iframe");',
    'iframe.name="sourceView";',
    'const ready=new Promise(resolve=>iframe.addEventListener("load",resolve,{once:true}));',
    'iframe.src="./independent.mjs?plain=1";',
    'document.body.appendChild(iframe);',
    'await ready;'
  ].join('');
  return '<!doctype html><html><meta charset="utf-8"><body><script type="module">'+
    preload+
    'const {observation}=await import("./entry.mjs");'+
    'document.body.dataset.observation=JSON.stringify(observation);'+
    '</script></body></html>';
}

/**
 * Default compile-time file-graph proof can overlook a same-origin host
 * iframe installed by external HTML. The declared ESM imports use the
 * global frames collection to read the selected source text as plain HTML.
 * `--expect-red` is an immutable prepatch native/generated counterexample;
 * `--expect-guarded` is the compiler's conservative source-byte refusal.
 * @returns {Promise<void>}
 */
async function main(){
  const expectRed=process.argv.includes('--expect-red');
  const declaredFrame=process.argv.includes('--declared-frame');
  /** @type {SourceFile[]} */
  const graph=declaredFrame?[
    files[0],
    {path:'entry.mjs',sourceType:'module',code:[
      'import {unrelated} from "./independent.mjs";',
      'const frame=document.createElement("iframe");',
      'const ready=new Promise(resolve=>frame.addEventListener("load",resolve,{once:true}));',
      'frame.src="./independent.mjs?plain=1";',
      'document.body.appendChild(frame);',
      'await ready;',
      'const raw=frame.contentDocument.body.textContent;',
      'export const observation={visible:raw.includes("privateB"),value:unrelated()};'
    ].join('\n')}
  ]:files;
  const output=obfuscateFiles(graph,{
    mode:'coo',closedWorld:true,seed:'default-iframe-source-20261118',
    strings:false,properties:true,identifiers:false
  });
  const leaf=output.files.find(file=>file.path==='independent.mjs');
  assert.ok(leaf&&typeof leaf.code==='string');
  const renamed=leaf.metrics.properties;

  /** @type {Map<string,string>} */
  const resources=new Map();
  for(const [variant,graph] of /** @type {Array<[string,SourceFile[]]>} */
      ([['native',graph],['emitted',output.files]])){
    for(const file of graph)resources.set('/'+variant+'/'+file.path,String(file.code));
    resources.set('/'+variant+'/index.html',html(declaredFrame));
  }
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url??'/','http://127.0.0.1');
    const text=resources.get(url.pathname);
    if(text===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':url.searchParams.get('plain')==='1'?'text/plain; charset=utf-8':
        url.pathname.endsWith('.html')?'text/html; charset=utf-8':
        'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(text);
  });
  /** @type {import('puppeteer-core').Browser|undefined} */
  let browser;
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(undefined));
    });
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    browser=await puppeteer.launch({
      executablePath:process.env.CHROMIUM_BIN??'/usr/bin/google-chrome',
      headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run']
    });
    /** @type {Record<string,{visible:boolean,value:number}>} */
    const observations={};
    for(const variant of ['native','emitted']){
      const tab=await browser.newPage();
      try{
        await tab.goto('http://127.0.0.1:'+address.port+'/'+variant+'/index.html',{
          waitUntil:'domcontentloaded',timeout:45000
        });
        await tab.waitForFunction(()=>Boolean(document.body.dataset.observation),{
          timeout:30000
        });
        const answer=await tab.$eval('body',body=>body.dataset.observation);
        observations[variant]=JSON.parse(answer??'null');
      }finally{
        await tab.close();
      }
    }
    assert.deepEqual(observations.native,{visible:true,value:23});
    if(expectRed){
      assert.ok(renamed>0,'Red control must genuinely transform source-visible own fields');
      assert.deepEqual(observations.emitted,{visible:false,value:23});
    }else{
      assert.equal(renamed,0,'Compiler must preserve source-visible file bytes');
      assert.deepEqual(observations.emitted,observations.native);
    }
    console.log('DEFAULT_FRAME_SOURCE '+JSON.stringify({
      status:renamed>0?'source-observation-changed':'source-preserved',
      observations,renamed,chromium:await browser.version(),
      phase:expectRed?'red':'guarded',sourceView:declaredFrame?'module-dom':'host-frame'
    }));
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
