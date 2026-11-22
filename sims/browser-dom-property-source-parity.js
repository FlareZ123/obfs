'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

const run=promisify(execFile);

/**
 * Generate a private record whose key has no identity escape. The caller
 * chooses whether the same inline ESM module can see its source through DOM.
 *
 * @param {string} reader
 * @param {boolean} manuallyRenamed
 * @returns {string}
 */
function program(reader,manuallyRenamed){
  const key=manuallyRenamed?'k':'internalSecret';
  return 'function calculate(){const owner={'+key+':8};return owner.'+key+';}' +
    'const observed='+reader+';' +
    'globalThis.result={value:calculate(),sourceMatch:observed.includes("internal"+"Secret")};';
}

/** @param {string} directory @param {string} name @param {string} code @returns {Promise<{value:number,sourceMatch:boolean}>} */
async function browser(directory,name,code){
  const filename=path.join(directory,name+'.html');
  const html='<!doctype html><html><body><pre id="result">pending</pre>'+
    '<script type="module" id="probe">'+code+'</script>'+
    '<script>window.addEventListener("load",()=>{'+
    'document.getElementById("result").textContent='+
    'btoa(JSON.stringify(globalThis.result));});</script></body></html>';
  await atomicWrite(filename,html);
  const {stdout,stderr}=await run(process.env.CHROMIUM_BIN||'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=1500','--dump-dom',pathToFileURL(filename).href
  ],{timeout:20000,maxBuffer:2*1024*1024});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Browser did not return module result: '+stdout.slice(0,500)+
    '; stderr='+stderr.slice(0,250));
  return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
}

/** @returns {Promise<void>} */
async function main(){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'dom-private-key-source-'));
  /** @type {Array<[string,string,boolean]>} */
  const cases=[
    ['benign-document-title','document.title',false],
    ['document-outer-html','document.documentElement.outerHTML',true],
    ['document-xml-serializer','new XMLSerializer().serializeToString(document)',true]
  ];
  /** @type {string[]} */
  const mismatches=[];
  try{
    for(const [label,reader,sourceVisible] of cases){
      const original=program(reader,false);
      const renamed=program(reader,true);
      const file=obfuscateFiles([{path:'entry.mjs',sourceType:'module',code:original}],
        {mode:'coo',seed:'dom-private-record/'+label,identifiers:false,
          strings:false,properties:true,closedWorld:true}).files[0];
      assert.ok(typeof file.code==='string');
      const nativeResult=await browser(directory,label+'-original',original);
      const manualResult=await browser(directory,label+'-manual',renamed);
      const emittedResult=await browser(directory,label+'-emitted',file.code);
      console.log(JSON.stringify({label,sourceVisible,metrics:file.metrics,
        nativeResult,manualResult,emittedResult}));
      assert.deepEqual(nativeResult,{value:8,sourceMatch:sourceVisible});
      assert.deepEqual(manualResult,{value:8,sourceMatch:false});
      if(!sourceVisible)assert.ok(file.metrics.properties>0,
        'Benign DOM control must retain private-record rename yield');
      if(emittedResult.value!==nativeResult.value||
         emittedResult.sourceMatch!==nativeResult.sourceMatch)mismatches.push(label);
    }
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
  assert.deepEqual([],mismatches,
    'Publisher must preserve source-visible original private property spellings');
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
