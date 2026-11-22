'use strict';

const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

/** @typedef {{label:string,bytes:number[]}} DecoderCase */
/** @type {DecoderCase[]} */
const samples=[
  {label:'windows-1252',bytes:[0x80]},
  {label:'gbk',bytes:[0xff]},
  {label:'utf-8',bytes:[65,66]}
];

/** @param {DecoderCase} sample @returns {number[]} */
function decodeInNode(sample){
  return Array.from(new TextDecoder(sample.label).decode(Uint8Array.from(sample.bytes)),
    character=>character.codePointAt(0)??0);
}

async function main(){
  const nativeNode=samples.map(decodeInNode);
  const script='const samples='+JSON.stringify(samples)+';'+
    'document.getElementById("answer").textContent=JSON.stringify('+ 
    'samples.map(sample=>Array.from('+ 
    'new TextDecoder(sample.label).decode(Uint8Array.from(sample.bytes)),'+
    'character=>character.codePointAt(0))));';
  const html='<!doctype html><html><body><pre id="answer">loading</pre>'+
    '<script>'+script+'</script></body></html>';
  const binary=process.env.CHROMIUM_BIN??'google-chrome';
  const url='data:text/html;charset=utf-8,'+encodeURIComponent(html);
  const {stdout}=await promisify(execFile)(binary,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=3000','--dump-dom',url
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const captured=stdout.match(/<pre id="answer">([^<]+)<\/pre>/u);
  assert.ok(captured,'Browser decoder results must be present in DOM');
  /** @type {number[][]} */
  const browser=JSON.parse(captured[1]);
  assert.deepEqual(browser[0],[0x20ac],
    'Chromium windows-1252 0x80 must decode as U+20AC according to WHATWG');
  assert.deepEqual(browser[2],[65,66],
    'Chromium baseline UTF-8 must preserve ASCII bytes');
  assert.deepEqual(nativeNode[2],[65,66],
    'Node baseline UTF-8 must preserve ASCII bytes');
  const mismatch=samples.map((sample,index)=>({
    label:sample.label,
    bytes:sample.bytes,
    node:nativeNode[index],
    browser:browser[index],
    equal:JSON.stringify(nativeNode[index])===JSON.stringify(browser[index])
  }));
  console.log('Cross-host TextDecoder native comparison: '+JSON.stringify({
    nodeVersion:process.version,browserEngine:binary,mismatch
  }));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
