'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {obfuscateFiles}=require('../src');

/** @param {string} binary @param {string} url @returns {Promise<string>} */
async function dumpDom(binary,url) {
  const {stdout}=await promisify(execFile)(binary,[
    '--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=5000','--dump-dom',url
  ],{timeout:45000,maxBuffer:8*1024*1024,encoding:'utf8'});
  return stdout;
}

/**
 * A real Chromium client executes native and flattened ESM exports in the
 * same page, including 4097 integer cases and 12 heterogeneous probes.
 * Browser hot timing is diagnostic only.
 * @returns {Promise<void>}
 */
async function main() {
  const source='export function gate(x){return x?((x^5)?((x*7)|3):((x+9)>>>1)):((x-13)^2);}';
  const transformed=obfuscateFiles([{
    path:'gate.mjs',sourceType:'module',code:source
  }],{
    mode:'coo',seed:'browser-branch-2026-11-15',
    strings:false,properties:false,identifiers:false,
    experimentalBranchBlocks:{'gate.mjs':['gate']}
  });
  assert.equal(transformed.files[0].metrics.branchBlocks,5);
  const client=/** @type {string} */ (transformed.files[0].code);
  assert.ok(client.includes('switch('));
  const page="<!doctype html><html><body><div id=\"answer\">pending</div>\n<script type=\"module\">\nimport {gate as native} from '/native.mjs';\nimport {gate as transformed} from '/transformed.mjs';\nconst values=[];\nfor(let x=-2048;x<=2048;x++)values.push(x);\nvalues.push('1','',true,false,null,undefined,NaN,Infinity,-Infinity,0n,3n,Symbol('tag'));\nfunction outcome(fn,value){\n  try{return ['ok',fn(value)];}\n  catch(error){return ['throw',error.name,error.message];}\n}\nfor(const value of values) {\n  const a=outcome(native,value),b=outcome(transformed,value);\n  if(a.length!==b.length||a.some((part,i)=>!Object.is(part,b[i]))) {\n    document.getElementById('answer').textContent='mismatch:'+String(value)+':'+JSON.stringify(a)+':'+JSON.stringify(b);\n    throw Error('Mismatched browser evaluation');\n  }\n}\nfunction measure(fn){\n  let checksum=0;\n  for(let warm=0;warm<200000;warm++)checksum=(checksum+fn((warm&1023)-512))|0;\n  const start=performance.now();\n  for(let i=0;i<3000000;i++)checksum=(checksum+fn((i&1023)-512))|0;\n  return {elapsed:performance.now()-start,checksum};\n}\nconst a=measure(native),b=measure(transformed);\nif(a.checksum!==b.checksum)throw Error('Browser performance probe changed checksum');\ndocument.getElementById('answer').textContent='pass:'+values.length+':'+a.elapsed.toFixed(3)+':'+b.elapsed.toFixed(3);\n</script></body></html>";
  const content=new Map([
    ['/test.html',page],
    ['/native.mjs',source],
    ['/transformed.mjs',client]
  ]);
  const server=http.createServer((request,response)=>{
    const filename=new URL(request.url??'/', 'http://127.0.0.1').pathname;
    const resource=content.get(filename);
    if(resource===undefined){response.writeHead(404).end();return;}
    response.writeHead(200,{'content-type':filename.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','cache-control':'no-store'});
    response.end(resource);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw Error('Missing HTTP port');
    const html=await dumpDom(process.env.CHROMIUM_BIN??'chromium',
      'http://127.0.0.1:'+address.port+'/test.html');
    const match=html.match(/id="answer">pass:(\d+):([0-9.]+):([0-9.]+)</u);
    assert.ok(match,'Chromium failed to publish a matching result: '+html.slice(-2500));
    assert.equal(Number(match[1]),4109);
    const nativeMs=Number(match[2]),obfuscatedMs=Number(match[3]);
    assert.ok(nativeMs>0&&obfuscatedMs>0);
    console.log(JSON.stringify({browser:'chromium',observations:Number(match[1]),
      nativeMs,obfuscatedMs,ratio:obfuscatedMs/nativeMs}));
  } finally {
    await new Promise(resolve=>server.close(resolve));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
