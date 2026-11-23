'use strict';

const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

/**
 * @typedef {{
 *   label:string,
 *   bytes?:number[],
 *   chunks?:number[][],
 *   fatal?:boolean,
 *   ignoreBOM?:boolean,
 *   input?:'string'|'object'|'number'|'null'
 * }} DecoderProbe
 */

/** @type {DecoderProbe[]} */
const probes=[
  {label:'utf-8',bytes:[65],fatal:true},
  {label:'utf-8',bytes:[0x80],fatal:true},
  {label:'utf-8',bytes:[0xe2,0x82],fatal:true},
  {label:'utf-8',bytes:[0xc0,0xaf],fatal:true},
  {label:'utf-8',bytes:[0xed,0xa0,0x80],fatal:true},
  {label:'utf-8',bytes:[0xf4,0x90,0x80,0x80],fatal:true},
  {label:'UTF8',chunks:[[0xe2],[0x28]],fatal:true},
  {label:'UTF8',chunks:[[0xe2],[0x82]],fatal:true},
  {label:'utf-8',bytes:[0xef,0xbb,0xbf],fatal:true,ignoreBOM:true},
  {label:'utf-8',input:'string'},
  {label:'utf-8',input:'object'},
  {label:'utf-8',input:'number'},
  {label:'utf-8',input:'null'}
];

/**
 * Run the exact same observable native call sequence in Node and Chromium.
 * Only standard globals are referenced, so the function string can be
 * evaluated independently by the browser without external dependencies.
 * @param {DecoderProbe} sample
 * @returns {{ok:true,value:string}|{ok:false,name:string,message:string}}
 */
function observe(sample){
  try{
    const decoder=new TextDecoder(sample.label,{
      fatal:sample.fatal===true,ignoreBOM:sample.ignoreBOM===true
    });
    if(sample.input==='string')return {ok:true,value:decoder.decode('a')};
    if(sample.input==='object')return {ok:true,value:decoder.decode({})};
    if(sample.input==='number')return {ok:true,value:decoder.decode(3)};
    if(sample.input==='null')return {ok:true,value:decoder.decode(null)};
    const value=sample.chunks?
      sample.chunks.map((bytes,index)=>decoder.decode(Uint8Array.from(bytes),
        {stream:index+1<sample.chunks.length})).join(''):
      decoder.decode(Uint8Array.from(sample.bytes??[]));
    return {ok:true,value};
  }catch(error){
    return {ok:false,name:String(error.name),message:String(error.message)};
  }
}

async function main(){
  const node=probes.map(observe);
  const script='const probes='+JSON.stringify(probes)+';'+
    'const observe='+observe.toString()+';'+
    'document.getElementById("answer").textContent='+
    'encodeURIComponent(JSON.stringify(probes.map(observe)));';
  const html='<!doctype html><html><body><pre id="answer">loading</pre>'+
    '<script>'+script+'</script></body></html>';
  const binary=process.env.CHROMIUM_BIN??'google-chrome';
  const {stdout}=await promisify(execFile)(binary,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=3000','--dump-dom',
    'data:text/html;charset=utf-8,'+encodeURIComponent(html)
  ],{timeout:45000,maxBuffer:4*1024*1024,encoding:'utf8'});
  const captured=stdout.match(/<pre id="answer">([^<]+)<\/pre>/u);
  assert.ok(captured,'Browser fatal diagnostic results must be present in DOM');
  /** @type {ReturnType<typeof observe>[]} */
  const browser=JSON.parse(decodeURIComponent(captured[1]));
  assert.equal(browser.length,probes.length);
  assert.deepEqual(browser[0],{ok:true,value:'A'});
  const mismatches=probes.flatMap((sample,index)=>
    JSON.stringify(node[index])===JSON.stringify(browser[index])?[]:[{
      sample,node:node[index],browser:browser[index]
    }]);
  console.log('Native TextDecoder failure diagnostics: '+JSON.stringify({
    nodeVersion:process.version,browserEngine:binary,
    compared:probes.length,mismatches
  }));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
