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

const exec=promisify(execFile);

/**
 * Load an actual classic browser script and extract its serialized result.
 * The original and emitted files use separate HTML documents and processes.
 * @param {string} filename
 * @returns {Promise<{value:number,observed?:string,clone?:unknown}>}
 */
async function browser(filename) {
  const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=3000','--dump-dom',
    pathToFileURL(filename).href
  ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium failed to evaluate the script: '+stdout.slice(0,1500));
  return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
}

/**
 * @param {string} directory
 * @param {string} label
 * @param {string} javascript
 * @returns {Promise<string>}
 */
async function page(directory,label,javascript) {
  const filename=path.join(directory,label+'.html');
  const html='<!doctype html><meta charset="utf-8">'+
    '<pre id="result"></pre><script>'+javascript+'</script>';
  await atomicWrite(filename,html);
  return filename;
}

/** @returns {Promise<void>} */
async function main() {
  const expression="const hidden={secretField:17};"+
    "function inspect(){const embedded='opaque-literal';return hidden.secretField+embedded.length;}";
  const finish="document.getElementById('result').textContent="+
    "btoa(JSON.stringify({value:inspect(),observed,clone}));";
  const scenarios=[
    {
      name:'structured-clone-error',
      code:expression+"let observed;let clone=null;try{structuredClone(inspect)}"+
        "catch(error){observed=error.message;}"+finish,
      denied:true
    },
    {
      name:'message-port-error',
      code:expression+"let observed;let clone=null;const channel=new MessageChannel();"+
        "try{channel.port1.postMessage(inspect)}catch(error){observed=error.message;}"+
        "finally{channel.port1.close();channel.port2.close();}"+finish,
      denied:true
    },
    {
      name:'inert-record',
      code:expression+"const observed='safe';const clone=structuredClone("+
        "{kind:'ping',nested:[1,{status:true}]});"+finish,
      denied:false
    }
  ];
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-browser-clone-'));
  try {
    for(const item of scenarios){
      const emitted=obfuscateFiles([{
        path:item.name+'.js',sourceType:'script',code:item.code
      }],{mode:'coo',seed:'browser-clone/'+item.name,strings:true}).files[0];
      assert.equal(emitted.metrics.properties,item.denied?0:1,
        'Source-observer protected-work yield: '+item.name);
      const expected=await browser(await page(directory,item.name+'-native',item.code));
      const actual=await browser(await page(directory,item.name+'-emitted',emitted.code));
      assert.deepEqual(actual,expected,'Real Chromium differential mismatch: '+item.name);
      if(item.denied){
        assert.match(expected.observed??'',/function inspect\(\)/u);
        assert.equal(emitted.metrics.bindings,0);
        assert.equal(emitted.metrics.literals,0);
      }
      process.stdout.write('BROWSER_CLONE '+JSON.stringify({
        scenario:item.name,privateProperties:emitted.metrics.properties,
        nativeParity:true,sourceError:item.denied
      })+'\n');
    }
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
