'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/**
 * Load three real browser module graphs from the same site:
 * native, matching-host guarded, and denied-host guarded.
 * @returns {Promise<void>}
 */
async function main() {
  const directory=path.join(__dirname,'../examples/closed-graph-host/before');
  const files=['entry.mjs','logic.mjs','state.mjs'].map(name=>({
    path:name,sourceType:/** @type {'module'} */ ('module'),
    code:fs.readFileSync(path.join(directory,name),'utf8')
  }));
  /** @param {string} hostname */
  function guarded(hostname) {
    return obfuscateFiles(files,{
      mode:'coo',seed:'agent15-browser-graph-'+hostname,closedWorld:true,
      allowedHosts:[hostname],strings:false,identifiers:false
    }).files;
  }
  const allowed=guarded('127.0.0.1');
  const denied=guarded('forbidden.example');
  assert.equal(allowed.length,3);
  assert.equal(denied.length,3);
  /** @type {Map<string,string>} */
  const resources=new Map();
  for(const [folder,sources] of [
    ['native',files],['allowed',allowed],['denied',denied]
  ]) {
    for(const file of sources)resources.set('/'+folder+'/'+file.path,String(file.code));
  }
  /** @param {string} folder @returns {string} */
  function html(folder){
    return '<!doctype html><html><body><pre id="answer">pending</pre>'+
      '<script>globalThis.events=[];</script><script type="module">'+
      'import("/'+folder+'/entry.mjs").then(()=>{'+
      'document.getElementById("answer").textContent='+
      'JSON.stringify({events:globalThis.events,answer:globalThis.answer});'+
      '},error=>{document.getElementById("answer").textContent='+
      'JSON.stringify({events:globalThis.events,error:error.message});});'+
      '</script></body></html>';
  }
  for(const folder of ['native','allowed','denied']) {
    resources.set('/'+folder+'/index.html',html(folder));
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=resources.get(pathname);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':pathname.endsWith('.html')?
      'text/html; charset=utf-8':'text/javascript; charset=utf-8','cache-control':'no-store'});
    response.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing browser server port');
    /** @param {string} folder @returns {Promise<{events:string[],answer?:number,error?:string}>} */
    async function execute(folder) {
      const url='http://127.0.0.1:'+address.port+'/'+folder+'/index.html';
      const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
      ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
      const encoded=stdout.match(/<pre id="answer">([^<]+)<\/pre>/u)?.[1];
      assert.ok(encoded&&encoded!=='pending','Chromium did not complete '+folder+': '+stdout.slice(-900));
      return JSON.parse(encoded);
    }
    const original=await execute('native');
    const permitted=await execute('allowed');
    const blocked=await execute('denied');
    assert.deepEqual(original,{events:['state','logic','entry'],answer:24});
    assert.deepEqual(permitted,original);
    assert.deepEqual(blocked,{events:[],error:'Unauthorized execution host'});
    console.log(JSON.stringify({browser:'Chromium',original,permitted,blocked}));
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
