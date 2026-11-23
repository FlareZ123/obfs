'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {createScoHandler}=require('../src');

const sourceFiles=[
  {
    path:'index.js',
    sourceType:'script',
    code:[
      '{',
      '  const privateOffset = 3;',
      '  const entryLabel = "entry-private";',
      '  globalThis.finalValue = globalThis.helperValue + privateOffset + entryLabel.length;',
      '}'
    ].join('\n')
  },
  {
    path:'lib/helper.js',
    sourceType:'script',
    code:[
      '{',
      '  const privateLabel = "helper-private";',
      '  globalThis.helperValue = 35 + privateLabel.length;',
      '}'
    ].join('\n')
  }
];
const graphPaths=sourceFiles.map(file=>file.path);
const sourceByPath=new Map(sourceFiles.map(file=>[file.path,file.code]));
const sourceTypeByPath=new Map(sourceFiles.map(file=>[file.path,file.sourceType]));

/**
 * @param {http.Server} server
 * @returns {Promise<number>}
 */
function listen(server) {
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const address=server.address();
      if(!address||typeof address==='string') {
        reject(new Error('Expected an IPv4 TCP listener'));
        return;
      }
      resolve(address.port);
    });
  });
}

/** @param {http.Server} server */
function close(server) {
  return new Promise((resolve,reject)=>{
    server.close(error=>error?reject(error):resolve());
  });
}

/**
 * Capture every public script response in the known two-file graph.
 * @param {number} port
 * @returns {Promise<Record<string,string>>}
 */
async function captureGraph(port) {
  /** @type {Record<string,string>} */
  const captured={};
  for(const name of graphPaths) {
    const response=await fetch('http://127.0.0.1:'+port+'/obfs/'+name);
    assert.equal(response.status,200,'Expected public graph response for '+name);
    captured[name]=await response.text();
  }
  return captured;
}

/**
 * Run the source-only normalizer in a separate process. Its input contains
 * only captured response bodies and public module names, never original code,
 * server state, or the per-request nonce.
 * @param {Record<string,string>} captured
 * @returns {Record<string,string>}
 */
function reconstructInChild(captured) {
  const files={};
  for(const name of graphPaths) {
    files[name]={sourceType:sourceTypeByPath.get(name),code:captured[name]};
  }
  const child=spawnSync(
    process.execPath,
    [path.join(__dirname,'../sims/sco-multifile-response-normalizer.js')],
    {
      input:JSON.stringify({files}),
      encoding:'utf8',
      timeout:10000,
      windowsHide:true
    }
  );
  if(child.error)throw child.error;
  assert.equal(child.status,0,'Source-only normalizer failed: '+child.stderr);
  return JSON.parse(child.stdout).files;
}

/**
 * Execute the captured two-script graph in a fresh isolated JavaScript realm.
 * @param {Record<string,string>} graph
 */
function executeGraph(graph) {
  const context=vm.createContext({});
  vm.runInContext(graph['lib/helper.js'],context,{timeout:1000});
  vm.runInContext(graph['index.js'],context,{timeout:1000});
  return context.finalValue;
}

async function main() {
  const scoServer=http.createServer(createScoHandler(sourceFiles));
  const plainServer=http.createServer((request,response)=>{
    const url=new URL(request.url??'/','http://127.0.0.1');
    const name=url.pathname.startsWith('/obfs/')?decodeURIComponent(url.pathname.slice('/obfs/'.length)):'';
    const code=sourceByPath.get(name);
    if(code===undefined) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200,{
      'content-type':'text/javascript; charset=utf-8',
      'cache-control':'no-store'
    });
    response.end(code);
  });
  let scoListening=false;
  let plainListening=false;
  try {
    const scoPort=await listen(scoServer);
    scoListening=true;
    const plainPort=await listen(plainServer);
    plainListening=true;

    const [scoRoundA,scoRoundB,plainRoundA,plainRoundB]=await Promise.all([
      captureGraph(scoPort),
      captureGraph(scoPort),
      captureGraph(plainPort),
      captureGraph(plainPort)
    ]);

    for(const name of graphPaths) {
      assert.notEqual(scoRoundA[name],scoRoundB[name],
        'SCO should emit a fresh per-request variant for '+name);
      assert.equal(plainRoundA[name],plainRoundB[name],
        'Ordinary service should serve stable source for '+name);
    }
    assert.ok(!scoRoundA['index.js'].includes('privateOffset'));
    assert.ok(!scoRoundA['lib/helper.js'].includes('privateLabel'));

    const [reconstructedA,reconstructedB]=[
      reconstructInChild(scoRoundA),
      reconstructInChild(scoRoundB)
    ];
    for(const name of graphPaths) {
      assert.equal(reconstructedA[name],reconstructedB[name],
        'Captured per-request variants must normalize to one canonical script: '+name);
    }

    const nativeGraph=Object.fromEntries(sourceFiles.map(file=>[file.path,file.code]));
    const [nativeValue,reconstructedValue,controlValue]=[
      executeGraph(nativeGraph),
      executeGraph(reconstructedA),
      executeGraph(plainRoundA)
    ];
    assert.equal(nativeValue,65,'Native two-script graph should produce expected value');
    assert.equal(reconstructedValue,nativeValue,
      'Source-only reconstruction of every captured SCO script must preserve behavior');
    assert.equal(controlValue,nativeValue,
      'Same-trust ordinary HTTP control must preserve native behavior');
  } finally {
    if(plainListening)await close(plainServer);
    if(scoListening)await close(scoServer);
  }
}

main().catch(error=>{
  process.stderr.write(String(error?.stack??error)+'\n');
  process.exitCode=1;
});
