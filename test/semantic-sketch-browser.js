'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {makeSketch}=require('../sims/semantic-sketch-esm');

/**
 * Compare the original and actual compiler-emitted closed ESM graphs inside
 * Chromium, preserving external JS observations and requiring genuine
 * private-field rewrites in the positive sketch of each seed.
 * @returns {Promise<{cases:number,positiveRewrites:number}>}
 */
async function runBrowserSketches(){
  const cases=[];
  /** @type {Map<string,string>} */
  const scripts=new Map();
  let positiveRewrites=0;
  for(let seed=1;seed<=4;seed++){
    for(let style=0;style<16;style++){
      const sketch=makeSketch(seed,style);
      cases.push(sketch);
      for(const file of sketch.files){
        scripts.set('/native/'+sketch.id+'/'+file.path,file.code);
      }
      const emitted=obfuscateFiles(sketch.files,{
        mode:'coo',closedWorld:true,seed:'semantic-sketch/'+sketch.id,
        strings:false,identifiers:false
      });
      if(sketch.safeYield){
        assert.ok(emitted.crossFile.properties>=2,
          'Browser proof needs real private-field lowering: '+sketch.id);
        positiveRewrites+=emitted.crossFile.properties;
      }
      for(const file of emitted.files){
        assert.equal(typeof file.code,'string');
        scripts.set('/emitted/'+sketch.id+'/'+file.path,
          /** @type {string} */ (file.code));
      }
    }
  }
  const expected='PASSED:'+cases.length+':'+positiveRewrites;
  const moduleRows=cases.map(item=>item.id);
  const script='const ids='+JSON.stringify(moduleRows)+';'+
    'Promise.all(ids.map(async id=>{'+
    'const native=await import("/native/"+id+"/entry.mjs");'+
    'const emitted=await import("/emitted/"+id+"/entry.mjs");'+
    'return [await native.exercise(),await emitted.exercise()];'+
    '})).then(pairs=>{'+
    'const mismatch=pairs.findIndex(pair=>JSON.stringify(pair[0])!==JSON.stringify(pair[1]));'+
    'document.getElementById("out").textContent=mismatch<0?'+JSON.stringify(expected)+
    ':"MISMATCH:"+ids[mismatch]+":"+JSON.stringify(pairs[mismatch]);'+
    '}).catch(error=>{document.getElementById("out").textContent="ERROR:"+error.message});';
  const html='<!doctype html><html><body><pre id="out">PENDING</pre>'+
    '<script type="module">'+script+'</script></body></html>';
  const server=http.createServer((request,response)=>{
    const target=new URL(request.url??'/','http://localhost').pathname;
    if(target==='/'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      response.end(html);
      return;
    }
    const source=scripts.get(target);
    if(source===undefined){
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8',
      'cache-control':'no-store','x-content-type-options':'nosniff'});
    response.end(source);
  });
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const browser=process.env.CHROMIUM_BIN??'chromium';
    const {stdout}=await promisify(execFile)(browser,[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=18000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/'
    ],{timeout:90000,maxBuffer:8*1024*1024,encoding:'utf8',windowsHide:true});
    assert.ok(stdout.includes('<pre id="out">'+expected+'</pre>'),
      'Browser semantic sketch mismatch or timeout: '+stdout.slice(0,1200));
    return {cases:cases.length,positiveRewrites};
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>
      error?reject(error):resolve(undefined)));
  }
}

if(require.main===module)runBrowserSketches().then(result=>
  process.stdout.write('OBFS_BROWSER_SEMANTIC_SKETCH '+JSON.stringify(result)+'\n')
).catch(error=>{
  process.stderr.write(String(error.stack||error)+'\n');
  process.exitCode=1;
});

module.exports={runBrowserSketches};
