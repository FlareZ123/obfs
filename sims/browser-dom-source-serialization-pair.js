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
  return 'function calculate(input){const '+name+'=input+5;return '+name+';}' +
    'const observed='+observation+';' +
    'globalThis.result={value:calculate(3),sourceMatch:observed.includes("private"+"Number")};';
}

/** @param {string} dir @param {string} name @param {string} code @param {'script'|'module'} sourceType @returns {Promise<{value:number,sourceMatch:boolean}>} */
async function browser(dir, name, code, sourceType) {
  const filename = path.join(dir, name + '.html');
  const html = '<!doctype html><html><body><pre id="result">pending</pre>' +
    '<script id="script-probe"' +
    (sourceType==='module' ? ' type="module"' : '') + '>' + code + '</script>' +
    '<script>window.addEventListener("load",()=>{' +
    'document.getElementById("result").textContent=' +
    'btoa(JSON.stringify(globalThis.result));});</script></body></html>';
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
  /** @type {Array<[string,string,'script'|'module']>} */
  const observations = [
    ['document-root-outer-html', 'document.documentElement.outerHTML', 'script'],
    ['body-inner-html', 'document.body.innerHTML', 'script'],
    ['html-selector-inner-html', 'document.querySelector("html").innerHTML', 'script'],
    ['id-script-text', 'document.getElementById("script-probe").textContent', 'script'],
    ['html-root-text-content', 'document.documentElement.textContent', 'script'],
    ['xml-serializer-document', 'new XMLSerializer().serializeToString(document)', 'script'],
    ['tree-walker-text', '(()=>{const w=document.createTreeWalker(document,NodeFilter.SHOW_TEXT);let t="";let n;while((n=w.nextNode()))t+=n.nodeValue;return t;})()', 'script'],
    ['range-clone-text', '(()=>{const r=document.createRange();r.selectNodeContents(document.documentElement);return r.cloneContents().textContent;})()', 'script'],
    ['script-child-data', 'document.getElementById("script-probe").firstChild.data', 'script'],
    // Inline module source is present in the document even though currentScript
    // is null during module execution.
    ['module-document-root-outer-html', 'document.documentElement.outerHTML', 'module'],
    ['module-xml-serializer-document', 'new XMLSerializer().serializeToString(document)', 'module'],
  ];
  // This must be a genuinely eligible function-local binding. A top-level
  // classic-script lexical is not proof of transformability.
  const inert='function calculate(input){const privateNumber=input+5;'+
    'return privateNumber;}globalThis.result=calculate(3);';
  const eligible=obfuscateFiles([{path:'inline.js',sourceType:'script',code:inert}],
    {mode:'coo',seed:'dom-serialization/positive-control',strings:false,identifiers:true}).files[0];
  console.log(JSON.stringify({label:'inert-positive-rename',
    bindings:eligible.metrics.bindings,changed:eligible.code!==inert}));
  assert.ok(eligible.metrics.bindings>0,
    'The identifier transform must have positive eligible rewrite yield');
  const mismatches=[];
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'dom-serialization-audit-'));
  try {
    // A benign DOM read remains a positive-yield control. Source-data
    // compatibility guards should not silently disable every document user.
    const benign=program('document.title',false);
    const benignCompiled=obfuscateFiles([
      {path:'inline.js',sourceType:'script',code:benign}
    ],{mode:'coo',seed:'dom-serialization/benign-document-title',
      strings:false,identifiers:true}).files[0];
    assert.ok(typeof benignCompiled.code==='string');
    const benignNative=await browser(dir,'document-title-native',benign,'script');
    const benignEmitted=await browser(dir,'document-title-emitted',benignCompiled.code,'script');
    console.log(JSON.stringify({label:'benign-document-title',native:benignNative,
      emitted:benignEmitted,bindings:benignCompiled.metrics.bindings}));
    assert.deepEqual(benignNative,{value:8,sourceMatch:false});
    assert.deepEqual(benignEmitted,benignNative);
    assert.ok(benignCompiled.metrics.bindings>0,
      'Ordinary document.title should retain positive identifier rename yield');
    for (const [label, observation, sourceType] of observations) {
      const original=program(observation,false);
      const renamedCode=program(observation,true);
      const compiled=obfuscateFiles([{path:'inline.js',sourceType,code:original}],
        {mode:'coo',seed:'dom-serialization/'+label,strings:false,identifiers:true}).files[0];
      const native=await browser(dir,label+'-native',original,sourceType);
      const renamed=await browser(dir,label+'-renamed',renamedCode,sourceType);
      assert.ok(typeof compiled.code==='string');
      const emitted=await browser(dir,label+'-emitted',compiled.code,sourceType);
      assert.deepEqual(native,{value:8,sourceMatch:true});
      assert.deepEqual(renamed,{value:8,sourceMatch:false});
      console.log(JSON.stringify({label,changed:compiled.code!==original,metrics:compiled.metrics,native,renamed,emitted}));
      if(emitted.value!==native.value || emitted.sourceMatch!==native.sourceMatch)
        mismatches.push(label);
    }
  } finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
  assert.deepEqual(mismatches,[],
    'Compiler changed DOM-visible source semantics in these source readers');
}
if(require.main===module) main().catch(err=>{console.error(err);process.exitCode=1;});
module.exports={main};
