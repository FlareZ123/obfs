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
 * Evaluate a real Chromium ES module and read its JSON-serialized result.
 * @param {string} filename
 * @returns {Promise<{observed:string,value:number}>}
 */
async function browser(filename) {
  const {stdout}=await exec(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=3000','--dump-dom',
    pathToFileURL(filename).href
  ],{encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
  const encoded=stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\\/pre>/u)?.[1];
  assert.ok(encoded,'Chromium did not evaluate the CSS.escape module: '+stdout.slice(0,1000));
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
  const html='<!doctype html><meta charset="utf-8"><pre id="result"></pre>'+
    '<script type="module">'+javascript+'</script>'+
    '<script>addEventListener("load",()=>{'+
    'document.getElementById("result").textContent='+
    'btoa(JSON.stringify(globalThis.__cssResult));'+
    '});</script>';
  await atomicWrite(filename,html);
  return filename;
}

/** @returns {Promise<void>} */
async function main() {
  const common='const state={secretField:13};'+
    'function inspect(){return state.secretField;}';
  const scenarios=[
    {name:'function-source',denied:true,
      code:common+'globalThis.__cssResult={observed:CSS.escape(inspect),value:inspect()};'},
    {name:'literal-positive',denied:false,
      code:common+'globalThis.__cssResult={observed:CSS.escape("literal"),value:inspect()};'}
  ];
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-css-escape-'));
  try {
    for(const scenario of scenarios) {
      const emitted=obfuscateFiles([{
        path:scenario.name+'.mjs',sourceType:'module',code:scenario.code
      }],{mode:'coo',seed:'css-escape-browser/'+scenario.name,strings:true}).files[0];
      assert.equal(emitted.metrics.properties,scenario.denied?0:1,scenario.name);
      const native=await browser(await page(dir,scenario.name+'-native',scenario.code));
      const actual=await browser(await page(dir,scenario.name+'-emitted',
        /** @type {string} */(emitted.code)));
      assert.deepEqual(actual,native,'Native CSS.escape output changed: '+scenario.name);
      assert.equal(native.value,13,scenario.name);
      if(scenario.denied)assert.match(native.observed,/secretField/u);
      process.stdout.write('BROWSER_CSS_ESCAPE '+JSON.stringify({
        scenario:scenario.name,properties:emitted.metrics.properties,parity:true
      })+'\\n');
    }
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
