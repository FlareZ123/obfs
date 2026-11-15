'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {fixture,kinds}=require('../sims/heldout-object-flow-attack');

/**
 * Real Chrome loads an external module runner, which dynamically imports
 * every unmodified or obfuscated ESM graph. The input graph itself is not
 * permitted to depend on this harness, preserving its external API boundary.
 * @param {number} graphs
 * @param {'native'|'obfuscated'} flavor
 * @param {0|1} [apiVariant]
 * @returns {string}
 */
function runner(graphs,flavor,apiVariant=0) {
  const keyPrefix=apiVariant===0?'privateMetric':'weightedFactor';
  const offset=apiVariant===0?5:31;
  const bonus=apiVariant===0?9:19;
  const imports=Array.from({length:graphs},(_,index)=>
    'results.push((await import("/'+flavor+'/'+index+'/entry.mjs")).result);'
  ).join('');
  return [
    'globalThis.window.api={offset:'+offset+',',
    'keyFor(index){return '+JSON.stringify(keyPrefix)+'+index;},',
    'read(object){const key=Object.keys(object).find(name=>name.startsWith('+JSON.stringify(keyPrefix)+'));',
    'if(key===undefined)throw Error("Missing externally observed private key");',
    'return object[key]+'+bonus+';}};',
    'const results=[];',
    'try{',imports,
    'document.getElementById("answer").textContent=JSON.stringify(results);',
    '}catch(error){document.getElementById("answer").textContent="ERROR:"+String(error);}'
  ].join('');
}

/** @param {string} browser @param {string} url @returns {Promise<unknown[]>} */
async function runChrome(browser,url) {
  const args=[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=12000','--dump-dom',url
  ];
  const {stdout}=await promisify(execFile)(browser,args,{
    timeout:60000,encoding:'utf8',maxBuffer:4*1024*1024
  });
  const match=stdout.match(/<pre id="answer">([^<]*)<\/pre>/u);
  assert.ok(match,'Browser did not report its module graph results: '+stdout.slice(0,1200));
  assert.ok(!match[1].startsWith('ERROR:'),'Browser module error: '+match[1]);
  const parsed=JSON.parse(match[1]);
  assert.ok(Array.isArray(parsed));
  return parsed;
}

/**
 * @param {number} [seedCount]
 * @param {string} [browser]
 * @returns {Promise<{graphs:number,apiConfigurations:number,positiveGraphs:number,refusalGraphs:number,
 *     renamedFields:number,chromeMatches:number}>}
 */
async function runHeldoutChrome(seedCount=3,browser=process.env.CHROMIUM_BIN??'chromium') {
  const cases=[];
  for(let seed=0;seed<seedCount;seed++)for(const kind of kinds)cases.push(fixture(seed,kind));
  const content=new Map();
  let positiveGraphs=0,refusalGraphs=0,renamedFields=0;
  for(const item of cases) {
    const compiled=obfuscateFiles(item.files,{
      mode:'coo',seed:'heldout-chrome/'+item.index,
      closedWorld:true,strings:false,identifiers:false
    });
    assert.equal(compiled.crossFile.properties,item.expected,item.kind);
    renamedFields+=compiled.crossFile.properties;
    if(item.expected)positiveGraphs++;else refusalGraphs++;
    for(const file of item.files)content.set('/native/'+item.index+'/'+file.path,file.code);
    for(const file of compiled.files) {
      if(typeof file.code!=='string')throw new TypeError('ESM text required');
      content.set('/obfuscated/'+item.index+'/'+file.path,file.code);
    }
  }
  for(const apiVariant of /** @type {(0|1)[]} */ ([0,1])) {
    for(const flavor of /** @type {('native'|'obfuscated')[]} */ (['native','obfuscated'])) {
      const base=flavor+'-'+apiVariant;
      content.set('/runtime-'+base+'.mjs',runner(cases.length,flavor,apiVariant));
      content.set('/'+base+'.html',
        '<!doctype html><meta charset="utf-8"><pre id="answer">pending</pre>'+
        '<script type="module" src="/runtime-'+base+'.mjs"></script>');
    }
  }
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url??'/', 'http://127.0.0.1');
    const body=content.get(url.pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    const isHtml=url.pathname.endsWith('.html');
    response.setHeader('content-type',isHtml?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8');
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try {
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const root='http://127.0.0.1:'+address.port;
    let chromeMatches=0;
    for(const apiVariant of /** @type {(0|1)[]} */ ([0,1])) {
      const baseline=await runChrome(browser,root+'/native-'+apiVariant+'.html');
      const transformed=await runChrome(browser,root+'/obfuscated-'+apiVariant+'.html');
      assert.equal(baseline.length,cases.length);
      assert.deepEqual(transformed,baseline);
      chromeMatches+=transformed.length;
    }
    return {graphs:cases.length,apiConfigurations:2,positiveGraphs,refusalGraphs,
      renamedFields,chromeMatches};
  }finally{
    await new Promise((resolve,reject)=>
      server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module) {
  runHeldoutChrome().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error?.stack??error);process.exitCode=1;});
}

module.exports={runHeldoutChrome,runner,runChrome};
