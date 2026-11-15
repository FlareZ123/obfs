'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

/**
 * Browser navigation covers HTTP ESM graph fetching and complete hot calls.
 * This is wall time, not isolated CPU computation or a universal bound.
 * @returns {Promise<void>}
 */
async function main() {
  const root=path.join(__dirname,'..','examples','coo-native-shards');
  /** @type {Record<string,Map<string,string>>} */
  const graphs=Object.create(null);
  graphs.native=new Map([['main.mjs',
    await fs.readFile(path.join(root,'before','main.mjs'),'utf8')]]);
  for(const [label,folder] of [['split','after'],['paired','after-paired']]) {
    /** @type {Map<string,string>} */
    const files=new Map();
    for(const name of await fs.readdir(path.join(root,folder))) {
      if(name.endsWith('.mjs'))files.set(name,await fs.readFile(path.join(root,folder,name),'utf8'));
    }
    graphs[label]=files;
  }
  const client=[
    "const med=a=>a.sort((x,y)=>x-y)[Math.floor(a.length/2)];",
    "const rows=[];",
    "for(const calls of [0,1,256,4096,65536]) {",
    " const times={native:[],paired:[],split:[]};",
    " for(let trial=0;trial<18;trial++) {",
    "  const order=trial%3===0?['native','paired','split']:trial%3===1?",
    "    ['paired','split','native']:['split','native','paired'];",
    "  const sums={};",
    "  for(const kind of order) {",
    "   const start=performance.now();",
    "   const mod=await import('/'+kind+'/'+calls+'-'+trial+'/main.mjs');",
    "   let checksum=0;",
    "   for(let i=0;i<calls;i++)checksum^=mod.scramble((Math.imul(i,1664525)+1013904223)|0);",
    "   const elapsed=performance.now()-start;",
    "   sums[kind]=checksum;",
    "   if(trial>=4)times[kind].push(elapsed);",
    "  }",
    "  if(sums.native!==sums.paired||sums.native!==sums.split)throw Error('Checksum mismatch');",
    " }",
    " const n=med(times.native),p=med(times.paired),s=med(times.split);",
    " rows.push({calls,nativeMs:n,pairedMs:p,splitMs:s,pairedRatio:p/n,splitRatio:s/n});",
    "}",
    "document.getElementById('results').textContent='RESULT:'+JSON.stringify(rows);"
  ].join('\n');
  const html='<!doctype html><html><body><pre id="results">pending</pre>'+
    '<script type="module">'+client+'</script></body></html>';
  const server=http.createServer((request,response)=>{
    if(request.url==='/index.html') {
      response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      response.end(html);
      return;
    }
    const matches=/^\/(native|paired|split)\/[0-9-]+\/([^/?]+)$/u.exec(request.url??'');
    const file=matches&&graphs[matches[1]]?.get(matches[2]);
    if(!file){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
    response.end(file);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(null)));
  try {
    const address=server.address();
    assert.ok(address&&typeof address!=='string');
    const {stdout}=await promisify(execFile)(process.env.CHROMIUM_BIN??'chromium',[
      '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run','--virtual-time-budget=30000','--dump-dom',
      'http://127.0.0.1:'+address.port+'/index.html'
    ],{timeout:60000,maxBuffer:8*1024*1024,encoding:'utf8'});
    const match=stdout.match(/RESULT:([\s\S]*?)<\/pre>/u);
    assert.ok(match,'Chrome graph session did not finish: '+stdout.slice(-1800));
    /** @type {{calls:number,nativeMs:number,pairedMs:number,splitMs:number,pairedRatio:number,splitRatio:number}[]} */
    const rows=JSON.parse(match[1].replace(/&quot;/gu,'"').replace(/&amp;/gu,'&'));
    assert.equal(rows.length,5);
    console.log(JSON.stringify({browser:'chromium',freshGraphsPerVariant:70,excludedWarmups:4,
      httpModuleLoading:true,rows},null,2));
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
