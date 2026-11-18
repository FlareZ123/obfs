'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const exec=promisify(execFile);

/** @typedef {'coo'|'sco'|'sno'} Mode */
/** @typedef {'pure'|'captured'} Fixture */

/** @type {Record<Fixture,string>} */
const originals={
  pure:
    "globalThis.outside='outside-chromium-encoded';"+
    "with(globalThis.opaqueScope){"+
    "globalThis.inside='inside-chromium-plain';"+
    "globalThis.nested=()=> 'inside-nested-chromium';}"+
    "globalThis.nestedValue=globalThis.nested();",
  captured:
    "function observed(){return 'browser-source-observation';}"+
    "const get=Reflect.get;"+
    "with(globalThis.opaqueScope){"+
    "globalThis.captured=get({known:2},'known');}"
};

/**
 * Read the actual document produced by Chromium's classic-script execution.
 * Do not treat compiler metrics alone as runtime equivalence.
 *
 * @param {string} url
 * @returns {Promise<{outside?:string,inside?:string,nested?:string,captured?:string,error?:string}>}
 */
async function readBrowser(url) {
  const {stdout}=await exec(process.env.CHROMIUM_BIN??'chromium',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=3500','--dump-dom',url
  ],{encoding:'utf8',timeout:45000,maxBuffer:5*1024*1024,windowsHide:true});
  const match=stdout.match(/<pre id="out">([^<]*)<\/pre>/u);
  assert.ok(match,'Chromium did not produce the expected DOM result: '+stdout.slice(0,1000));
  return JSON.parse(match[1]);
}

/** @param {string} scriptUrl @returns {string} */
function browserDocument(scriptUrl) {
  return [
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<pre id="out">pending</pre>',
    '<script>',
    "globalThis.browserError='';",
    'globalThis.addEventListener("error",event=>{globalThis.browserError=event.message;});',
    'globalThis.opaqueScope=new Proxy(Object.create(null),{',
    'has(_target,key){return typeof key==="string" && key!=="globalThis";},',
    'get(_target,key){',
    'if(key===Symbol.unscopables)return undefined;',
    'if(key==="get")return ()=>globalThis.observed.toString();',
    'return ["intercepted-generated-helper"];',
    '}',
    '});',
    '</script>',
    '<script src="'+scriptUrl+'"></script>',
    '<script>',
    'document.getElementById("out").textContent=JSON.stringify({',
    'outside:globalThis.outside,inside:globalThis.inside,',
    'nested:globalThis.nestedValue,captured:globalThis.captured,',
    'error:globalThis.browserError',
    '});',
    '</script></body></html>'
  ].join('\n');
}

/** @returns {Promise<void>} */
async function main() {
  /** @type {Map<string,{type:string,body:string}>} */
  const routes=new Map();
  /** @type {{mode:Mode,fixture:Fixture,encoded:number}[]} */
  const cases=[];
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    for(const fixture of /** @type {const} */ (['pure','captured'])) {
      const source=originals[fixture];
      const output=obfuscateFiles([{
        path:'dynamic.js',sourceType:'script',code:source
      }],{
        mode,seed:'browser-with-scope/'+mode+'/'+fixture,
        strings:true,properties:false,identifiers:false
      }).files[0];
      assert.equal(output.metrics.literals,fixture==='pure'?1:0,
        'Unexpected string coverage for '+mode+'/'+fixture);
      if(fixture==='pure') {
        assert.ok(!String(output.code).includes('outside-chromium-encoded'),
          'Positive outside-with string remains encoded');
        assert.ok(String(output.code).includes('inside-chromium-plain'),
          'Literal inside dynamic with body must be preserved');
      }
      for(const variant of /** @type {const} */ (['native','compiled'])) {
        const prefix='/'+mode+'/'+fixture+'/'+variant;
        routes.set(prefix+'/dynamic.js',{type:'text/javascript; charset=utf-8',
          body:variant==='native'?source:String(output.code)});
        routes.set(prefix+'/index.html',{type:'text/html; charset=utf-8',
          body:browserDocument(prefix+'/dynamic.js')});
      }
      cases.push({mode,fixture,encoded:output.metrics.literals});
    }
  }

  const server=http.createServer((request,response)=>{
    const route=routes.get((request.url??'').split('?')[0]);
    if(!route){response.writeHead(404);response.end('Missing route');return;}
    response.writeHead(200,{'content-type':route.type,'cache-control':'no-store'});
    response.end(route.body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing loopback listener');
    const origin='http://127.0.0.1:'+address.port;
    for(const item of cases) {
      const base=origin+'/'+item.mode+'/'+item.fixture;
      const native=await readBrowser(base+'/native/index.html');
      const compiled=await readBrowser(base+'/compiled/index.html');
      assert.equal(native.error,'');
      assert.equal(compiled.error,'');
      if(item.fixture==='pure') {
        assert.deepEqual(native,{
          outside:'outside-chromium-encoded',
          inside:'inside-chromium-plain',
          nested:'inside-nested-chromium',error:''
        });
      } else {
        assert.equal(native.captured,
          "function observed(){return 'browser-source-observation';}");
      }
      assert.deepEqual(compiled,native,
        'Real Chromium host scope semantic mismatch in '+item.mode+'/'+item.fixture);
      process.stdout.write('WITH_SCOPE_CHROMIUM '+JSON.stringify({
        mode:item.mode,fixture:item.fixture,encoded:item.encoded,native,
        browserParity:true
      })+'\n');
    }
  }finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});

module.exports={main};
