'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src/core');

const runChromium=promisify(execFile);

/** @returns {string} */
function bootstrap(){
  return [
    'const captured=[];',
    'const nativeBind=Function.prototype.bind;',
    'try{',
    '  Function.prototype.bind=function(...args){',
    '    captured.push(this);',
    '    return Reflect.apply(nativeBind,this,args);',
    '  };',
    '  const app=await import("./entry.mjs");',
    '  Function.prototype.bind=nativeBind;',
    '  const sources=captured.filter(fn=>typeof fn==="function")',
    '    .map(fn=>Function.prototype.toString.call(fn))',
    '    .filter(text=>text.includes("owner."));',
    '  const answer={value:app.hot(4,6),boundSource:app.hot.toString(),sources};',
    '  const pre=document.createElement("pre");',
    '  pre.id="result";pre.textContent=btoa(JSON.stringify(answer));',
    '  document.body.appendChild(pre);',
    '}catch(error){',
    '  Function.prototype.bind=nativeBind;',
    '  const pre=document.createElement("pre");pre.id="failure";',
    '  pre.textContent=String(error.stack||error);document.body.appendChild(pre);',
    '}'
  ].join('\n');
}

/**
 * Check a browser that actually runs the emitted ESM code under a host that
 * pre-instruments a native method, without modifying the emitted module.
 * @returns {Promise<{browser:string,protectedKeys:number,capturedFunctions:number}>}
 */
async function main(){
  const source='const owner={secretField:7,otherField:11};'+
    'const internal=(privateFirst,privateSecond)=>{'+
    'return ((privateFirst+owner.secretField)^owner.otherField)+privateSecond;};'+
    'export const hot=internal.bind(null);';
  const emitted=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:source}],{
    mode:'coo',closedWorld:true,seed:'hostile-browser-bind-interception',
    properties:true,identifiers:false,strings:false
  });
  const protectedKeys=emitted.files[0].metrics.properties;
  assert.ok(protectedKeys===0||protectedKeys===2,
    'the bound/exported callable must either fail closed or rename the complete owner: '+protectedKeys);
  const protectedCode=/** @type {string} */ (emitted.files[0].code);
  if(protectedKeys===0){
    assert.match(protectedCode,/secretField/u);
    assert.match(protectedCode,/otherField/u);
  }else{
    assert.doesNotMatch(protectedCode,/secretField|otherField/u);
  }
  const variants=new Map([
    ['/native/entry.mjs',source],
    ['/protected/entry.mjs',protectedCode],
    ['/native/bootstrap.mjs',bootstrap()],
    ['/protected/bootstrap.mjs',bootstrap()],
    ['/native/index.html','<!doctype html><html><body><script type="module" src="./bootstrap.mjs"></script></body></html>'],
    ['/protected/index.html','<!doctype html><html><body><script type="module" src="./bootstrap.mjs"></script></body></html>']
  ]);
  const server=http.createServer((request,response)=>{
    const name=new URL(request.url??'/','http://127.0.0.1').pathname;
    const body=variants.get(name);
    if(body===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{
      'content-type':name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store',
      'content-security-policy':"default-src 'none'; script-src 'self'; connect-src 'self'"
    });
    response.end(body);
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve(undefined));
  });
  try{
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('No browser test port');
    const origin='http://127.0.0.1:'+address.port;
    /** @type {Array<{value:number,boundSource:string,sources:string[]}>} */
    const observations=[];
    for(const variant of ['native','protected']){
      const {stdout}=await runChromium(process.env.CHROMIUM_BIN??'google-chrome',[
        '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
        '--no-first-run','--virtual-time-budget=8000','--dump-dom',
        origin+'/'+variant+'/index.html'
      ],{timeout:45000,maxBuffer:5*1024*1024,encoding:'utf8'});
      const token=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
      assert.ok(token,variant+' browser did not report an attack result: '+stdout.slice(0,1000));
      observations.push(/** @type {{value:number,boundSource:string,sources:string[]}} */(
        JSON.parse(Buffer.from(token,'base64').toString('utf8'))
      ));
    }
    const [native,protectedResult]=observations;
    assert.equal(native.value,protectedResult.value,'the actual computation still agrees');
    assert.equal(native.boundSource,protectedResult.boundSource,
      'the public bound function reports the same generic source');
    const nativeTarget=native.sources.find(text=>text.includes('owner.secretField'));
    const protectedTarget=protectedResult.sources.find(text=>text.includes('owner.'));
    assert.ok(nativeTarget,'the browser must intercept the native private target');
    assert.ok(protectedTarget,'the browser must intercept the emitted private target');
    if(protectedKeys===0){
      assert.ok(protectedTarget.includes('owner.secretField'));
      assert.ok(protectedTarget.includes('owner.otherField'));
    }else{
      assert.match(protectedTarget,/owner\\._p[0-9a-f]{10}/u);
      assert.ok(!protectedTarget.includes('secretField'));
      assert.ok(!protectedTarget.includes('otherField'));
    }
    const result={
      browser:'Chromium',
      protectedKeys,
      rewriteStatus:protectedKeys===0?'refused-to-preserve-source':'rewritten',
      capturedFunctions:protectedResult.sources.length,
      sourceChanged:protectedTarget!==nativeTarget
    };
    console.log('BOUND_RUNTIME_BROWSER_INTERCEPTION '+JSON.stringify(result));
    return result;
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
