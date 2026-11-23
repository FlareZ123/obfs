'use strict';

const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

/** @typedef {{label:string,bytes:number[],recoverConstructor?:boolean,chunks?:number[][],ignoreBOM?:boolean,fatal?:boolean,readProperty?:'encoding'|'fatal'|'ignoreBOM'}} DecoderCase */
/** @type {DecoderCase[]} */
const samples=[
  {label:'windows-1252',bytes:[0x80]},
  {label:'gbk',bytes:[0xff]},
  {label:'utf-8',bytes:[65,66]}
];
// Boundary vectors cover valid 1–4 byte scalar values, BOM handling, and
// malformed UTF-8 replacement behavior, including truncated and overlong
// sequences. The exhaustive single-byte sweep checks the entire lead-byte
// range without claiming parity for arbitrary streaming workloads.
const utf8Edges=[
  [],[0x00],[0x7f],[0xc2,0xa2],[0xe2,0x82,0xac],
  [0xf0,0x9f,0x92,0xa9],[0xef,0xbb,0xbf,0x41],
  [0x80],[0xc2],[0xe2,0x82],[0xf0,0x9f,0x92],
  [0xc0,0xaf],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80],
  [0xf5,0x80,0x80,0x80],[0xe2,0x28,0xa1],[0x61,0xef,0xbb,0xbf,0x62]
];
for(const bytes of utf8Edges)samples.push({label:'utf-8',bytes});
for(let byte=0;byte<256;byte++)samples.push({label:'utf-8',bytes:[byte]});
samples.push(
  {label:'UTF8',bytes:[0xf0,0x9f,0x92,0xa9]},
  {label:'unicode-1-1-utf-8',bytes:[0xe2,0x82,0xac]},
  {label:'windows-1252',bytes:[0x80],recoverConstructor:true},
  {label:'gbk',bytes:[0xff],recoverConstructor:true}
);
// UTF-8 multi-call decoding must preserve pending bytes and BOM state.
// The final chunk always flushes with stream:false; no exceptions are expected.
const streamingUtf8Cases=[
  {label:'utf-8',bytes:[],chunks:[[0xe2],[0x82],[0xac]]},
  {label:'utf-8',bytes:[],chunks:[[0xf0,0x9f],[0x92],[0xa9]]},
  {label:'utf-8',bytes:[],chunks:[[0xc2],[0x41]]},
  {label:'utf-8',bytes:[],chunks:[[0xed,0xa0],[0x80]]},
  {label:'utf-8',bytes:[],chunks:[[],[0xe2,0x82]]},
  {label:'utf-8',bytes:[],chunks:[[0xef],[0xbb],[0xbf],[0x41]]},
  {label:'utf-8',bytes:[],chunks:[[0xef],[0xbb],[0xbf],[0x41]],ignoreBOM:true},
  {label:'utf-8',bytes:[],chunks:[[0xef,0xbb,0xbf],[0xef,0xbb,0xbf]]},
  {label:'utf-8',bytes:[],chunks:[[0xe2],[0x28,0xa1]]},
  {label:'utf-8',bytes:[],chunks:[[0x61],[0x00],[0x62]]},
  {label:'utf-8',bytes:[],chunks:[[0x80],[0xbf]]},
  {label:'utf-8',bytes:[],chunks:[[0xf4,0x8f],[0xbf,0xbf]]}
];
samples.push(...streamingUtf8Cases);
const scalarGetterCases=[
  {label:'utf-8',bytes:[],readProperty:'encoding'},
  {label:'UTF8',bytes:[],readProperty:'encoding'},
  {label:'utf-8',bytes:[],readProperty:'fatal'},
  {label:'utf-8',bytes:[],readProperty:'fatal',fatal:true},
  {label:'utf-8',bytes:[],readProperty:'ignoreBOM'},
  {label:'utf-8',bytes:[],readProperty:'ignoreBOM',ignoreBOM:true}
];
samples.push(...scalarGetterCases);

/** @param {DecoderCase} sample @returns {number[]} */
function decodeInNode(sample){
  const Decoder=sample.recoverConstructor?
    (new TextDecoder('utf-8')).constructor:TextDecoder;
  const decoder=new Decoder(sample.label,{
    ignoreBOM:sample.ignoreBOM===true,fatal:sample.fatal===true
  });
  const decoded=sample.readProperty?String(decoder[sample.readProperty]):
    sample.chunks?
      sample.chunks.map((chunk,index)=>decoder.decode(Uint8Array.from(chunk),
        {stream:index+1<sample.chunks.length})).join(''):
      decoder.decode(Uint8Array.from(sample.bytes));
  return Array.from(decoded,character=>character.codePointAt(0)??0);
}

async function main(){
  const nativeNode=samples.map(decodeInNode);
  const script='const samples='+JSON.stringify(samples)+';'+
    'document.getElementById("answer").textContent=JSON.stringify('+ 
    'samples.map(sample=>{const Decoder=sample.recoverConstructor?'+
    '(new TextDecoder("utf-8")).constructor:TextDecoder;'+
    'const decoder=new Decoder(sample.label,{ignoreBOM:sample.ignoreBOM===true,'+
    'fatal:sample.fatal===true});'+
    'const decoded=sample.readProperty?String(decoder[sample.readProperty]):'+
    'sample.chunks?sample.chunks.map((chunk,index)=>'+
    'decoder.decode(Uint8Array.from(chunk),{stream:index+1<sample.chunks.length})).join(""):'+ 
    'decoder.decode(Uint8Array.from(sample.bytes));'+
    'return Array.from(decoded,character=>character.codePointAt(0));}));';
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
  const recoveredLegacyIndex=samples.findIndex(sample=>
    sample.label==='windows-1252'&&sample.recoverConstructor===true);
  assert.notEqual(recoveredLegacyIndex,-1);
  assert.deepEqual(nativeNode[recoveredLegacyIndex],nativeNode[0],
    'A UTF-8 decoder instance exposes the same legacy native constructor');
  assert.deepEqual(browser[recoveredLegacyIndex],browser[0],
    'The browser instance constructor recovers the same legacy decoder');
  for(let index=0;index<samples.length;index++){
    const label=samples[index].label.toLowerCase();
    if(!['utf-8','utf8','unicode-1-1-utf-8'].includes(label))continue;
    assert.deepEqual(nativeNode[index],browser[index],
      'UTF-8 Node/Chromium decoder mismatch at case '+index+
      ': '+JSON.stringify(samples[index]));
  }
  if(process.version==='v22.16.0'){
    assert.deepEqual(nativeNode[0],[0x80],
      'Pinned Node 22.16.0 should preserve the legacy windows-1252 mismatch');
    assert.notDeepEqual(nativeNode[0],browser[0],
      'Pinned older Node decoder and Chromium have a source-visible mapping difference');
  }
  const mismatch=samples.flatMap((sample,index)=>
    JSON.stringify(nativeNode[index])===JSON.stringify(browser[index])?[]:[{
      label:sample.label,bytes:sample.bytes,
      node:nativeNode[index],browser:browser[index]
    }]);
  console.log('Cross-host TextDecoder native comparison: '+JSON.stringify({
    nodeVersion:process.version,browserEngine:binary,
    compared:samples.length,streamingUtf8Cases:streamingUtf8Cases.length,
    scalarGetterCases:scalarGetterCases.length,utf8Cases:samples.filter(sample=>
      ['utf-8','utf8','unicode-1-1-utf-8'].includes(sample.label.toLowerCase())).length,
    mismatch
  }));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
