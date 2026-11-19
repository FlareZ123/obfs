'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const exec=promisify(execFile);

const specimens=[
  {
    name:'host-lock-prefix',
    source:'globalThis.__opaqueOutput=globalThis.__opaqueInput.value;',
    options:{
      mode:'coo',seed:'browser-opaque-error-coordinate-host-lock',
      strings:false,properties:false,identifiers:false,
      allowedHosts:['127.0.0.1']
    },
    check(result,generated){
      assert.notEqual(generated,this.source);
      assert.match(generated,/Unauthorized execution host/u);
      assert.equal(result.metrics.properties,0);
    }
  },
  {
    name:'property-rewrite',
    source:"'use strict';const owner={distinctivelyLongPrivateField:73};"+
      "const value=owner.distinctivelyLongPrivateField;"+
      "void opaqueInput.missingField;opaqueOutput=value;",
    options:{
      mode:'coo',seed:'browser-opaque-error-coordinate-property',
      strings:false,identifiers:false
    },
    check(result,generated){
      assert.ok(result.metrics.properties>0,generated);
    }
  }
];

/**
 * @param {number} port
 * @param {string} scriptPath
 * @param {boolean} fail
 * @returns {Promise<string>}
 */
async function executeChromium(port,scriptPath,fail){
  const url='http://127.0.0.1:'+port+'/page?script='+
    encodeURIComponent(scriptPath)+'&fail='+(fail?'1':'0');
  const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium did not expose the opaque-host result: '+stdout.slice(0,1200));
  return Buffer.from(encoded,'base64').toString('utf8');
}

/** @returns {Promise<void>} */
async function run(){
  /** @type {Map<string,string>} */
  const scripts=new Map();
  /** @type {{name:string,nativePath:string,generatedPath:string,properties:number}[]} */
  const comparisons=[];

  for(const specimen of specimens){
    const output=obfuscateFiles([{
      path:'entry.js',sourceType:'script',code:specimen.source
    }],specimen.options).files[0];
    const generated=String(output.code);
    specimen.check(output,generated);
    const nativePath='/'+specimen.name+'-native.js';
    const generatedPath='/'+specimen.name+'-generated.js';
    scripts.set(nativePath,specimen.source);
    scripts.set(generatedPath,generated);
    comparisons.push({
      name:specimen.name,nativePath,generatedPath,
      properties:output.metrics.properties
    });
  }

  const server=http.createServer((req,res)=>{
    const parsed=new URL(req.url??'/', 'http://127.0.0.1');
    if(parsed.pathname==='/page'){
      const script=parsed.searchParams.get('script');
      const fail=parsed.searchParams.get('fail')==='1';
      if(!script||!scripts.has(script)){
        res.writeHead(400).end();
        return;
      }
      const input=fail?'null':'{value:73,missingField:1}';
      const html='<!doctype html><html><body><script>'+
        'globalThis.__opaqueInput='+input+';globalThis.__opaqueOutput=null;'+
        'globalThis.opaqueInput=globalThis.__opaqueInput;'+
        'globalThis.opaqueOutput=null;globalThis.__opaqueError="";'+
        'globalThis.onerror=(message,source,line,column)=>{'+
        'globalThis.__opaqueError=line+":"+column;return true;};'+
        '<\/script><script src="'+script+'"><\/script><script>'+
        'setTimeout(()=>{const value='+(
          fail ? 'globalThis.__opaqueError' :
            '"ok:"+(globalThis.opaqueOutput??globalThis.__opaqueOutput)'
        )+';const pre=document.createElement("pre");pre.id="result";'+
        'pre.textContent=btoa(String(value));document.body.append(pre);},0);'+
        '<\/script></body></html>';
      res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
      res.end(html);
      return;
    }
    const code=scripts.get(parsed.pathname);
    if(code!==undefined){
      res.writeHead(200,{'content-type':'application/javascript; charset=utf-8'});
      res.end(code);
      return;
    }
    res.writeHead(404).end();
  });

  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Missing Chromium fixture port');

    for(const item of comparisons){
      const nativeSafe=await executeChromium(address.port,item.nativePath,false);
      const generatedSafe=await executeChromium(address.port,item.generatedPath,false);
      assert.equal(nativeSafe,'ok:73',item.name);
      assert.equal(generatedSafe,nativeSafe,item.name);

      const nativeFailure=await executeChromium(address.port,item.nativePath,true);
      const generatedFailure=await executeChromium(address.port,item.generatedPath,true);
      assert.match(nativeFailure,/^\d+:\d+$/u,item.name);
      assert.match(generatedFailure,/^\d+:\d+$/u,item.name);
      assert.notEqual(generatedFailure,nativeFailure,
        item.name+': opaque host error observer should expose transformed coordinates');

      process.stdout.write('OPAQUE_BROWSER_ERROR_COORDINATE '+JSON.stringify({
        specimen:item.name,properties:item.properties,
        nativeSafe,generatedSafe,nativeFailure,generatedFailure,
        parity:nativeFailure===generatedFailure
      })+'\n');
    }
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run,specimens};
