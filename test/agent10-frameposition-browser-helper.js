'use strict';

const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function dumpDom(url) {
  const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=8000','--dump-dom',url
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\\/pre>/u)?.[1];
  if(!encoded)throw new Error('Chromium did not expose the observation payload');
  return Buffer.from(encoded,'base64').toString('utf8');
}

/**
 * @param {string} stack
 * @param {string} pathname
 * @returns {{line:number,column:number,frame:string}}
 */
function parseFrame(stack,pathname) {
  const frame=stack.split('\\n').find(line=>line.includes(pathname))??'';
  if(!frame)throw new Error('Missing module frame for '+pathname+': '+stack);
  const match=frame.match(/:(\\d+):(\\d+)\\)?$/u);
  if(!match)throw new Error('Missing source coordinates in '+frame);
  return {line:Number(match[1]),column:Number(match[2]),frame};
}

/**
 * @param {string} source
 * @param {string} generatedCode
 * @param {string} suffix
 * @returns {Promise<{values:unknown[],stacks:string[]}>}
 */
async function compareBrowser(source,generatedCode,suffix) {
  const nativePath='/native-'+suffix+'.mjs';
  const generatedPath='/generated-'+suffix+'.mjs';
  const html=[
    '<!doctype html><html><body><pre id="result"></pre><script>',
    'window.__stacks=[];',
    'window.captureHostStack=function captureHostStack(){window.__stacks.push(new Error("frame probe").stack||"");};',
    '(async()=>{try{const native=await import("'+nativePath+'");const generated=await import("'+generatedPath+'");',
    'const result={values:[native.value,generated.value],stacks:window.__stacks};',
    'document.getElementById("result").textContent=btoa(JSON.stringify(result));',
    '}catch(error){document.getElementById("result").textContent=btoa(JSON.stringify({error:String(error),stack:error&&error.stack}));}})();',
    '</script></body></html>'
  ].join('\\n');
  const pages=new Map([
    ['/',{type:'text/html; charset=utf-8',body:html}],
    [nativePath,{type:'text/javascript; charset=utf-8',body:source}],
    [generatedPath,{type:'text/javascript; charset=utf-8',body:generatedCode}]
  ]);
  const server=http.createServer((request,response)=>{
    const entry=pages.get((request.url??'/').split('?')[0])??pages.get('/');
    if(!entry){response.writeHead(404);response.end();return;}
    response.writeHead(200,{'content-type':entry.type});
    response.end(entry.body);
  });
  try {
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing Chromium fixture port');
    return /** @type {{values:unknown[],stacks:string[]}} */ (
      JSON.parse(await dumpDom('http://127.0.0.1:'+address.port+'/'))
    );
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

module.exports={compareBrowser,parseFrame};
