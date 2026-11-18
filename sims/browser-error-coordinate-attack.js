'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const exec=promisify(execFile);

const specimens=[
  {
    name:'global-onerror',
    source:[
      'globalThis.onerror=(message,source,line,column)=>{',
      '  globalThis.captured=line+":"+column;return true;',
      '};',
      'null.value;'
    ].join('\n')
  },
  {
    name:'global-error-event',
    source:[
      'globalThis.addEventListener("error",event=>{',
      '  globalThis.captured=event.lineno+":"+event.colno;',
      '});',
      'null.value;'
    ].join('\n')
  }
];

/**
 * @param {string} code
 * @param {number} port
 * @param {string} route
 * @returns {Promise<string>}
 */
async function executeChromium(code,port,route){
  const url='http://127.0.0.1:'+port+route;
  const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=8000','--dump-dom',url
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium failed to expose error coordinate: '+stdout.slice(0,1000));
  return Buffer.from(encoded,'base64').toString('utf8');
}

/**
 * @param {boolean} guarded
 * @returns {Promise<void>}
 */
async function run(guarded){
  /** @type {Map<string,string>} */
  const pages=new Map();
  /** @type {{name:string,nativeRoute:string,generatedRoute:string}[]} */
  const comparisons=[];
  for(const specimen of specimens){
    const options={
      mode:'coo',seed:'browser-error-event-'+specimen.name,
      strings:false,properties:false,identifiers:false,
      allowedHosts:['127.0.0.1']
    };
    if(guarded){
      assert.throws(
        ()=>obfuscateFiles([{path:'entry.js',sourceType:'script',code:specimen.source}],options),
        /Host locking cannot preserve observable source/u,
        specimen.name+': coordinate-observing host lock must fail closed'
      );
      continue;
    }
    const generated=/** @type {string} */(obfuscateFiles([
      {path:'entry.js',sourceType:'script',code:specimen.source}
    ],options).files[0].code);
    const nativeRoute='/native-'+specimen.name;
    const generatedRoute='/generated-'+specimen.name;
    pages.set(nativeRoute,specimen.source);
    pages.set(generatedRoute,generated);
    comparisons.push({name:specimen.name,nativeRoute,generatedRoute});
  }

  const safe='globalThis.captured="safe-host-lock";';
  const safeGenerated=/** @type {string} */(obfuscateFiles([
    {path:'safe.js',sourceType:'script',code:safe}
  ],{
    mode:'coo',seed:'browser-error-event-safe',
    strings:false,properties:false,identifiers:false,
    allowedHosts:['127.0.0.1']
  }).files[0].code);
  pages.set('/safe',safeGenerated);

  const server=http.createServer((req,res)=>{
    const route=(req.url??'/').split('?')[0];
    const code=pages.get(route);
    if(code===undefined){res.writeHead(404).end();return;}
    const html='<!doctype html><html><body><script>\n'+code+
      '\n</script><script>setTimeout(()=>{const pre=document.createElement("pre");'+
      'pre.id="result";pre.textContent=btoa(String(globalThis.captured));'+
      'document.body.append(pre);},0);<\/script></body></html>';
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end(html);
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing Chromium fixture port');
    assert.equal(await executeChromium(safeGenerated,address.port,'/safe'),'safe-host-lock');
    for(const item of comparisons){
      const native=await executeChromium(pages.get(item.nativeRoute)??'',address.port,item.nativeRoute);
      const transformed=await executeChromium(pages.get(item.generatedRoute)??'',address.port,item.generatedRoute);
      assert.match(native,/^\d+:\d+$/u);
      assert.match(transformed,/^\d+:\d+$/u);
      assert.notEqual(transformed,native,
        item.name+': pre-guard host wrapper must shift browser error coordinates');
      process.stdout.write('BROWSER_ERROR_COORDINATE '+JSON.stringify({
        specimen:item.name,native,transformed,parity:native===transformed
      })+'\n');
    }
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)run(process.argv.includes('--expect-guarded'))
  .catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run,specimens};
