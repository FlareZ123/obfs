'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {parse}=require('../src/ast');
const {renameLocalIdentifiers}=require('../src/identifiers');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

const execute=promisify(execFile);

/**
 * A self-contained browser inline script has exact access to its executing
 * bytes through HTMLScriptElement.text. The field is split in the lookup
 * string so a changed binding's source spelling is observable.
 * @param {string} observation
 * @returns {string}
 */
function sample(observation) {
  return 'function compute(input){const privateNumber=input+5;return privateNumber;}'+
    observation+
    'globalThis.result={value:compute(3),'+
    'sourceMatch:observed.includes("private"+"Number")};';
}

/**
 * Execute an inline classic script inside actual Chromium.
 * @param {string} dirname
 * @param {string} label
 * @param {string} javascript
 * @returns {Promise<{value:number,sourceMatch:boolean}>}
 */
async function browser(dirname,label,javascript){
  const filename=path.join(dirname,label+'.html');
  const html='<!doctype html><meta charset="utf-8">'+
    '<pre id="answer">pending</pre><script>'+javascript+'</script>'+
    '<script>document.getElementById("answer").textContent='+
    'btoa(JSON.stringify(globalThis.result));</script>';
  await atomicWrite(filename,html);
  const {stdout}=await execute(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=3000','--dump-dom',
    pathToFileURL(filename).href
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const encoded=stdout.match(/<pre id="answer">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium did not execute inline script: '+stdout.slice(0,1100));
  return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
}

/** @returns {Promise<void>} */
async function main(){
  const samples=[
    {name:'current-script',observation:'const observed=document.currentScript.text;'},
    {name:'script-collection',observation:'const observed=document.scripts[0].textContent;'},
    {name:'window-document-alias',observation:
      'const root=globalThis;const doc=root.document;'+
      'const observed=doc.currentScript.text;'}
  ];
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-dom-source-browser-'));
  try {
    for(const scenario of samples){
      const original=sample(scenario.observation);
      const emitted=obfuscateFiles([{
        path:'inline.js',sourceType:'script',code:original
      }],{mode:'coo',seed:'chromium-dom-source/'+scenario.name,
        strings:false,identifiers:true}).files[0];
      assert.equal(emitted.code,original,
        'Compiler must retain the exact embedded source when it is inspectable');
      assert.equal(emitted.metrics.bindings,0);
      // Independent pre-guard negative control, using the unchanged low-level
      // identifier transformer against the same source. This is a deliberate
      // unsafe ablation, never a protected release artifact.
      const unguarded=renameLocalIdentifiers(original,parse(original,'script'),{
        seed:'unsafe-dom-source-ablation',sourceType:'script'
      });
      assert.ok(unguarded.bindings>0,'Ablation must change actual source text');
      assert.notEqual(unguarded.code,original);
      const baseline=await browser(temp,scenario.name+'-native',original);
      const protectedResult=await browser(temp,scenario.name+'-guarded',emitted.code);
      const unsafeResult=await browser(temp,scenario.name+'-ablation',unguarded.code);
      assert.deepEqual(baseline,{value:8,sourceMatch:true});
      assert.deepEqual(protectedResult,baseline,
        'Actual published source must preserve DOM source inspection');
      assert.deepEqual(unsafeResult,{value:8,sourceMatch:false},
        'Removing the source guard must observably change execution');
      process.stdout.write('DOM_INLINE_SOURCE_CHROMIUM '+JSON.stringify({
        scenario:scenario.name,unguardedBindings:unguarded.bindings,
        protectedBindings:emitted.metrics.bindings,baseline,protectedResult,unsafeResult
      })+'\n');
    }
  } finally {
    await fs.rm(temp,{recursive:true,force:true});
  }
}
if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={main};
