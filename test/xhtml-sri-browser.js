'use strict';

const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const http=require('node:http');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

const runBrowser=promisify(execFile);

/** @typedef {{path:string,sourceType:'script'|'asset',code:string|Buffer}} File */

/** @returns {File[]} */
function originals() {
  const source='document.documentElement.setAttribute("data-xhtml-sri","loaded");'+
    'globalThis.xhtmlProof="this client is observed by XHTML integrity";';
  const integrity=createHash('sha256').update(source).digest('base64');
  const markup='<?xml version="1.0" encoding="UTF-8"?>'+
    '<html xmlns="http://www.w3.org/1999/xhtml"><head>'+
    '<script src="./client.js" integrity="sha256-'+integrity+'"></script>'+
    '</head><body><p>XHTML SRI browser</p></body></html>';
  return [
    {path:'client.js',sourceType:'script',code:source},
    {path:'index.xhtml',sourceType:'asset',code:Buffer.from(markup)}
  ];
}

/** @param {string} browser @param {string} address @returns {Promise<string>} */
async function readBrowser(browser,address) {
  const result=await runBrowser(browser,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=10000','--dump-dom',address
  ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
  return result.stdout;
}

/**
 * Demonstrate execution and SRI in an actual XHTML document served with its
 * XML media type. The compiled complete-graph source must remain byte-pinned,
 * while an independently modified script must be rejected by Chromium.
 * @returns {Promise<void>}
 */
async function main() {
  const original=originals();
  const safe=obfuscateFiles(original,{
    mode:'coo',seed:'xhtml-browser-complete-graph',
    strings:true,identifiers:false,properties:false
  });
  assert.equal(safe.files[0].code,original[0].code);
  const unsafe=obfuscateFiles([original[0]],{
    mode:'coo',seed:'xhtml-browser-unsafe-counterfactual',
    strings:true,identifiers:false,properties:false
  });
  assert.notEqual(unsafe.files[0].code,original[0].code);

  const markup=Buffer.from(original[1].code).toString('utf8');
  const prefixedMarkup=markup.replace('<script src=',
    '<h:script xmlns:h="http://www.w3.org/1999/xhtml" src=').replace('</script>','</h:script>');
  const prefixedSafe=obfuscateFiles([
    original[0],{path:'index.xhtml',sourceType:/** @type {const} */('asset'),
      code:Buffer.from(prefixedMarkup)}
  ],{mode:'coo',seed:'xhtml-browser-prefixed-complete-graph',
    strings:true,identifiers:false,properties:false});
  assert.equal(prefixedSafe.files[0].code,original[0].code);
  const inline='<?xml version="1.0" encoding="UTF-8"?>'+
    '<html xmlns="http://www.w3.org/1999/xhtml"><head>'+
    '<script><![CDATA[document.documentElement.setAttribute("data-inline","executed");]]></script>'+
    '</head><body><p>XHTML inline script</p></body></html>';
  const inlineSvg='<?xml version="1.0" encoding="UTF-8"?>'+
    '<html xmlns="http://www.w3.org/1999/xhtml"><head>'+
    '<svg:svg xmlns:svg="http://www.w3.org/2000/svg">'+
    '<svg:script><![CDATA[document.documentElement.setAttribute("data-svg-inline","executed");]]></svg:script>'+
    '</svg:svg></head><body><p>XHTML SVG inline script</p></body></html>';
  const inlinePrefixed=inline.replace('<script>',
    '<h:script xmlns:h="http://www.w3.org/1999/xhtml">').replace('</script>','</h:script>');
  /** @type {Map<string,Map<string,string>>} */
  const variants=new Map([
    ['native',new Map([['client.js',/** @type {string} */(original[0].code)],['index.xhtml',markup]])],
    ['safe',new Map([['client.js',/** @type {string} */(safe.files[0].code)],['index.xhtml',markup]])],
    ['unsafe',new Map([['client.js',/** @type {string} */(unsafe.files[0].code)],['index.xhtml',markup]])],
    ['prefixed',new Map([['client.js',/** @type {string} */(prefixedSafe.files[0].code)],
      ['index.xhtml',prefixedMarkup]])],
    ['prefixed-unsafe',new Map([['client.js',/** @type {string} */(unsafe.files[0].code)],
      ['index.xhtml',prefixedMarkup]])],
    ['inline-prefixed',new Map([['index.xhtml',inlinePrefixed]])],
    ['inline-svg',new Map([['index.xhtml',inlineSvg]])],
    ['inline',new Map([['index.xhtml',inline]])]
  ]);
  const server=http.createServer((request,response)=>{
    const parts=(new URL(request.url??'/','http://127.0.0.1')).pathname
      .split('/').filter(Boolean);
    const contents=parts.length===2?variants.get(parts[0])?.get(parts[1]):undefined;
    if(contents===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':parts[1].endsWith('.xhtml')?
      'application/xhtml+xml; charset=utf-8':'text/javascript; charset=utf-8'});
    response.end(contents);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const origin='http://127.0.0.1:'+address.port;
    const browser=process.env.CHROMIUM_BIN??'google-chrome';
    /** @type {Record<string,boolean>} */
    const outcomes={};
    for(const variant of ['native','safe','unsafe','prefixed','prefixed-unsafe','inline','inline-prefixed','inline-svg']) {
      const page=await readBrowser(browser,origin+'/'+variant+'/index.xhtml');
      assert.match(page,/XHTML (?:SRI browser|inline script)/u);
      outcomes[variant]=variant==='inline-svg'?
        /data-svg-inline="executed"/u.test(page):variant.startsWith('inline')?
        /data-inline="executed"/u.test(page):/data-xhtml-sri="loaded"/u.test(page);
    }
    assert.deepEqual(outcomes,{
      native:true,safe:true,unsafe:false,prefixed:true,
      'prefixed-unsafe':false,inline:true,'inline-prefixed':true,
      'inline-svg':true
    },'XHTML executes inline script and rejects integrity-invalid external scripts');
    process.stdout.write('XHTML_SRI_BROWSER '+JSON.stringify(outcomes)+'\n');
  } finally {
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={main};
