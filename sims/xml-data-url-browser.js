'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

const run=promisify(execFile);

/** @param {string} executable @param {string} url @returns {Promise<string>} */
async function dumpDom(executable,url) {
  const {stdout}=await run(executable,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
  ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
  return stdout;
}

/**
 * Browser-document XML media types can embed ordinary HTML-namespace script
 * elements. Probe execution in a real Chromium iframe; an in-JS text parser
 * alone cannot establish browser behavior or effective origin isolation.
 * @returns {Promise<void>}
 */
async function main() {
  const browser=process.env.CHROMIUM_BIN??'chromium';
  const namespace='http://www.w3.org/1999/xhtml';
  const xml='<html xmlns="'+namespace+'"><head>'+
    '<script type="text/javascript">window.parent.postMessage("xml-executed","*");</script>'+
    '</head><body><p>XML document</p></body></html>';
  const document=new Map();
  for(const [label,mime] of [
    ['xhtml','application/xhtml+xml'],
    ['application-xml','application/xml'],
    ['text-xml','text/xml']
  ]) {
    const dataUrl='data:'+mime+','+encodeURIComponent(xml);
    document.set('/'+label+'.html',
      '<!doctype html><html><body><span id="answer">pending</span>'+
      '<script>window.addEventListener("message",event=>{'+
      'if(event.data==="xml-executed")document.getElementById("answer").textContent="executed";'+
      '});</script><iframe src="'+dataUrl+'"></iframe></body></html>');
  }
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=document.get(pathname);
    if(!body){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    response.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    assert.ok(address && typeof address!=='string');
    for(const label of ['xhtml','application-xml','text-xml']) {
      const page=await dumpDom(browser,'http://127.0.0.1:'+address.port+'/'+label+'.html');
      assert.match(page,/id="answer">executed</u,label+' XML iframe did not send script message: '+page.slice(0,350));
      process.stdout.write(label+': browser executed XML-namespace HTML script\n');
    }
  }finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module) {
  main().catch(error=>{
    process.stderr.write(String(error.stack||error)+'\n');
    process.exitCode=1;
  });
}

module.exports={main};
