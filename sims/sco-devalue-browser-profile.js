'use strict';

const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {promisify}=require('node:util');
const {pairedBudgetBound}=require('./paired-budget-bound');

const runFile=promisify(execFile);

/**
 * Real Chromium browser-module loading and hot-cycle study of a pinned public
 * graph transport. The production SCO handler is not changed or imported.
 *
 * @param {'native'|'graph'|'graph-hot'} variant
 * @returns {string}
 */
function pageSource(variant){
  const importSource=variant==='native'?'':'import {stringify,parse} from "/vendor/index.js";';
  const body=String.raw`
const bootMs=performance.now();
function payload(count){
  return {category:"browser-json-tree",records:Array.from({length:count},(_,index)=>({
    index,label:"event-"+index+(index%11===0?"終":"")+(index%13===0?"🧪":""),
    quantity:Math.imul(index+1,2654435761)|0
  }))};
}
function task(data,heavy){
  let state=0x13579bdf;
  for(const record of data.records){
    state=Math.imul((state^record.quantity^record.index)|0,0x45d9f3b)|0;
    state=(state+record.label.length)|0;
  }
  if(heavy)for(let round=0;round<25000;round++)
    state=Math.imul((state^round)|0,0x27d4eb2d)|0;
  return state|0;
}
function timing(codec,data,repeats,heavy){
  let checksum=0;
  const started=performance.now();
  for(let count=0;count<repeats;count++){
    const revived=codec(data);
    if(revived.records.length!==data.records.length)
      throw Error("Record count changed");
    checksum=(checksum+task(revived,heavy))|0;
  }
  return {ms:performance.now()-started,checksum};
}
`;
  const graphBody=variant==='graph-hot'?String.raw`
const native=source=>source;
const json=source=>JSON.parse(JSON.stringify(source));
const graph=source=>parse(stringify(source));
const codecs={native,json,graph};
const orders=[
  ["native","json","graph"],["graph","json","native"],
  ["json","native","graph"],["native","graph","json"],
  ["graph","native","json"],["json","graph","native"]
];
const rows=[];
for(const count of [1,32,256,1024]){
  const input=payload(count);
  if(JSON.stringify(json(input))!==JSON.stringify(graph(input)))
    throw Error("Graph transport altered ordinary JSON input");
  const repeats=Math.max(4,Math.min(96,Math.floor(8192/count)));
  for(const heavy of [false,true]){
    const values={native:[],json:[],graph:[]},checksums={native:[],json:[],graph:[]};
    for(let warm=0;warm<6;warm++)for(const fn of Object.values(codecs))
      timing(fn,input,1,heavy);
    for(let trial=0;trial<9;trial++)for(const name of orders[trial%orders.length]){
      const observation=timing(codecs[name],input,repeats,heavy);
      values[name].push(observation.ms);
      checksums[name].push(observation.checksum);
    }
    if(JSON.stringify(checksums.native)!==JSON.stringify(checksums.json)||
       JSON.stringify(checksums.native)!==JSON.stringify(checksums.graph))
      throw Error("Native/JSON/graph task output changed");
    rows.push({count,heavy,repeats,values});
  }
}
const graphValue={shared:{}};
graphValue.refs=[graphValue.shared,graphValue.shared];
graphValue.self=graphValue;
graphValue.nan=NaN;
graphValue.negative=-0;
graphValue.missing=undefined;
graphValue.large=123n;
const restored=graph(graphValue);
if(restored.self!==restored||restored.refs[0]!==restored.refs[1]||
  !Number.isNaN(restored.nan)||!Object.is(restored.negative,-0)||
  !Object.hasOwn(restored,"missing")||restored.missing!==undefined||
  restored.large!==123n)
  throw Error("Browser graph codec roundtrip mismatch");
`:'';
  const output='document.getElementById("out").textContent="pass:"+JSON.stringify({bootMs,variant:'+
    JSON.stringify(variant)+',rows:typeof rows==="undefined"?[]:rows});';
  return '<!doctype html><html><head><meta charset="utf-8"></head><body>'+
    '<pre id="out">pending</pre><script type="module">\n'+
    importSource+'\n'+body+'\n'+graphBody+'\n'+output+
    '\n</script></body></html>';
}

/**
 * @param {string} root
 * @param {'native'|'graph'|'graph-hot'} variant
 * @returns {Promise<{bootMs:number,variant:string,rows:{count:number,heavy:boolean,repeats:number,values:{native:number[],json:number[],graph:number[]}}[]}>}
 */
async function browserSample(root,variant){
  const url=root+'/'+variant+'.html';
  const {stdout}=await runFile(process.env.CHROMIUM_BIN??'google-chrome',[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=12000','--dump-dom',url
  ],{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
  const json=stdout.match(/<pre id="out">pass:(\{[^<]*\})<\/pre>/u)?.[1];
  assert.ok(json,'Browser did not complete module: '+variant+' '+stdout.slice(-800));
  const output=JSON.parse(json);
  assert.equal(output.variant,variant);
  assert.ok(Number.isFinite(output.bootMs)&&output.bootMs>0);
  return output;
}

/** @returns {Promise<object>} */
async function run(){
  const rootDir=path.join(process.cwd(),'node_modules','devalue','src');
  const names=(await fs.readdir(rootDir)).filter(name=>/^[a-z0-9-]+\.js$/u.test(name));
  assert.ok(names.includes('index.js'),'Pinned devalue ESM source missing');
  const assets=new Map();
  for(const name of names){
    const file=await fs.readFile(path.join(rootDir,name),'utf8');
    assets.set('/vendor/'+name,file);
  }
  for(const variant of /** @type {const} */(['native','graph','graph-hot']))
    assets.set('/'+variant+'.html',pageSource(variant));

  const server=http.createServer((request,response)=>{
    const target=request.url??'';
    if(request.method!=='GET'||!assets.has(target)){
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200,{
      'content-type':target.endsWith('.html')?
        'text/html; charset=utf-8':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(assets.get(target));
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const root='http://127.0.0.1:'+address.port;
    const cold={native:[],graph:[]};
    for(let i=0;i<9;i++){
      const order=i%2===0?
        /** @type {const} */ (['native','graph']):
        /** @type {const} */ (['graph','native']);
      for(const variant of order){
        const result=await browserSample(root,variant);
        cold[variant].push(result.bootMs);
      }
    }
    const hot=await browserSample(root,'graph-hot');
    assert.equal(hot.rows.length,8);
    const hotResults=hot.rows.map(row=>{
      for(const variant of ['native','json','graph']){
        assert.equal(row.values[variant].length,9);
        assert.ok(row.values[variant].every(ms=>Number.isFinite(ms)&&ms>0));
      }
      return {
        count:row.count,heavy:row.heavy,repeats:row.repeats,
        jsonVsNative:pairedBudgetBound(row.values.native,row.values.json),
        graphVsNative:pairedBudgetBound(row.values.native,row.values.graph),
        graphVsJson:pairedBudgetBound(row.values.json,row.values.graph),
        samples:row.values
      };
    });
    return {node:process.version,platform:process.platform,
      candidate:'devalue@6.0.3',browser:process.env.CHROMIUM_BIN??'google-chrome',
      vendorSourceModules:names.length,
      coldModuleReadyMs:cold,coldGraphVsNative:pairedBudgetBound(cold.native,cold.graph),
      hotResults,
      boundary:'real Chromium localhost static ESM loading and in-page CPU; no SCO RPC, authorization or network RTT'};
  }finally{
    await new Promise((resolve,reject)=>server.close(
      error=>error?reject(error):resolve()));
  }
}

if(require.main===module)run().then(result=>{
  process.stdout.write('SCO_DEVALUE_CHROMIUM_PROFILE '+JSON.stringify(result)+'\n');
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports={run,pageSource,browserSample};
