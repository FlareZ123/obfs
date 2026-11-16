'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {recoverPublicStrings}=require('../sims/jsdeobsbench-public-static-attack');

/**
 * Native Chromium loads a real same-origin ES module under strict CSP.
 * A page-owned API name must remain intact while public XOR-encoded strings
 * remain statically recoverable in every delivered mode.
 *
 * @returns {Promise<void>}
 */
async function main() {
  const secret='public-script-encoded-strings-are-extractable';
  const source='export const privateMessage='+JSON.stringify(secret)+';'+
    'window.externalBridge.accept(privateMessage);';
  /** @type {Map<string,{text:string,type:string}>} */
  const routes=new Map();
  routes.set('/host.js',{
    text:"window.externalBridge={accept(value){document.getElementById('answer').textContent='seen:'+value;}};",
    type:'text/javascript; charset=utf-8'
  });
  /** @type {{mode:string,encodedLiterals:number,recoveredLiterals:number}[]} */
  const rows=[];
  for(const mode of /** @type {const} */ (['coo','sco','sno'])) {
    const output=obfuscateFiles([{path:'source.mjs',sourceType:'module',code:source}],{
      mode,seed:'real-chrome-public-decoder-'+mode,identifiers:false,
      properties:false,strings:mode==='sno'?undefined:true
    }).files[0];
    assert.ok(output.metrics.literals>0,mode+' did not encode any literal');
    assert.match(/** @type {string} */ (output.code),/window\.externalBridge\.accept/u);
    const recovered=recoverPublicStrings(/** @type {string} */ (output.code),'module');
    assert.equal(recovered.literals,output.metrics.literals);
    assert.ok(recovered.code.includes(JSON.stringify(secret)));
    for(const [suffix,script] of [
      ['encoded',/** @type {string} */ (output.code)],
      ['recovered',recovered.code]
    ]) {
      routes.set('/'+mode+'-'+suffix+'.mjs',{
        text:script,type:'text/javascript; charset=utf-8'
      });
    }
    rows.push({mode,encodedLiterals:output.metrics.literals,
      recoveredLiterals:recovered.literals});
  }
  routes.set('/native.mjs',{text:source,type:'text/javascript; charset=utf-8'});
  for(const label of ['native','coo-encoded','coo-recovered','sco-encoded',
    'sco-recovered','sno-encoded','sno-recovered']) {
    const html='<!doctype html><html><body><div id="answer">pending</div>'+
      '<script src="/host.js"></script>'+
      '<script type="module" src="/'+label+'.mjs"></script></body></html>';
    routes.set('/'+label+'.html',{text:html,type:'text/html; charset=utf-8'});
  }
  const server=http.createServer((request,response)=>{
    const route=routes.get(new URL(request.url??'/','http://127.0.0.1').pathname);
    if(!route){response.writeHead(404).end('missing');return;}
    response.writeHead(200,{
      'Content-Type':route.type,
      'Cache-Control':'no-store',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; object-src 'none'"
    });
    response.end(route.text);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const chrome=process.env.CHROMIUM_BIN??'chromium';
    for(const label of ['native','coo-encoded','coo-recovered','sco-encoded',
      'sco-recovered','sno-encoded','sno-recovered']) {
      /** @type {string} */
      const page='http://127.0.0.1:'+address.port+'/'+label+'.html';
      /** @type {string} */
      const stdout=String((await promisify(execFile)(chrome,[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=3500','--dump-dom',page
      ],{encoding:'utf8',timeout:45000,maxBuffer:8*1024*1024})).stdout);
      /** @type {string|undefined} */
      const rendered=/<div id="answer">([^<]*)<\/div>/u.exec(stdout)?.[1];
      assert.equal(rendered,'seen:'+secret,
        'Chrome CSP/host ESM mismatch for '+label+': '+stdout.slice(-350));
    }
    process.stdout.write('CHROMIUM_PUBLIC_STRING_RECOVERY '+JSON.stringify({
      browser:'chromium',csp:"script-src 'self'",
      variants:7,externalCallbackPreserved:true,rows
    })+'\n');
  } finally {
    await new Promise(resolve=>server.close(()=>resolve(undefined)));
  }
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
module.exports={main};
