'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');
const run = promisify(execFile);

/** @param {string} observation @param {boolean} changed @returns {string} */
function program(observation, changed) {
  const name = changed ? 'q' : 'privateNumber';
  return `const ${name}=8; const observed=${observation};` +
    `globalThis.result={value:${name},sourceMatch:observed.includes("private"+"Number")};`;
}

/** @param {string} dir @param {string} name @param {string} code @returns {Promise<{value:number,sourceMatch:boolean}>} */
async function browser(dir, name, code) {
  const filename = path.join(dir, name + '.html');
  const html = '<!doctype html><html><body><pre id="result">pending</pre>' +
    '<script id="script-probe">' + code + '</script>' +
    '<script>document.getElementById("result").textContent=' +
    'btoa(JSON.stringify(globalThis.result));</script></body></html>';
  await atomicWrite(filename, html);
  const {stdout,stderr} = await run(process.env.CHROMIUM_BIN || 'google-chrome', [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--virtual-time-budget=1500', '--dump-dom', pathToFileURL(filename).href
  ], {timeout:20000, maxBuffer:2*1024*1024});
  const encoded = stdout.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/u)?.[1];
  assert.ok(encoded, `browser did not return result for ${name}: ${stdout.slice(0,450)}; stderr=${stderr.slice(0,450)}`);
  return JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
}

/** @returns {Promise<void>} */
async function main() {
  const observations = [
    ['document-root-outer-html', 'document.documentElement.outerHTML'],
    ['body-inner-html', 'document.body.innerHTML'],
    ['html-selector-inner-html', 'document.querySelector("html").innerHTML'],
    ['id-script-text', 'document.getElementById("script-probe").textContent'],
  ];
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dom-serialization-audit-'));
  try {
    for (const [label, observation] of observations) {
      const original=program(observation,false);
      const renamedCode=program(observation,true);
      const compiled=obfuscateFiles([{path:'inline.js',sourceType:'script',code:original}],
        {mode:'coo',seed:'dom-serialization/'+label,strings:false,identifiers:true}).files[0];
      const native=await browser(dir,label+'-native',original);
      const renamed=await browser(dir,label+'-renamed',renamedCode);
      const emitted=await browser(dir,label+'-emitted',compiled.code);
      assert.deepEqual(native,{value:8,sourceMatch:true});
      assert.deepEqual(renamed,{value:8,sourceMatch:false});
      console.log(JSON.stringify({label,changed:compiled.code!==original,metrics:compiled.metrics,native,renamed,emitted}));
      assert.deepEqual(emitted,native,'Compiler must preserve DOM-visible source semantics');
    }
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
}
if(require.main===module) main().catch(err=>{console.error(err);process.exitCode=1;});
module.exports={main};
