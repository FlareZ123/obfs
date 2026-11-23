'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {createScoHandler}=require('../src');

const sourceFiles=[
  {
    path:'index.mjs',
    sourceType:'module',
    code:[
      "import { helperValue } from './lib/helper.mjs';",
      "const privateOffset = 3;",
      "const entryLabel = 'entry-private';",
      "export const finalValue = helperValue + privateOffset + entryLabel.length;"
    ].join('\n')
  },
  {
    path:'lib/helper.mjs',
    sourceType:'module',
    code:[
      "const privateMultiplier = 7;",
      "const helperLabel = 'helper-private';",
      "function calculate(input) {",
      "  const privateProduct = input * privateMultiplier;",
      "  return privateProduct + helperLabel.length;",
      "}",
      "export const helperValue = calculate(5);"
    ].join('\n')
  }
];
const graphPaths=sourceFiles.map(file=>file.path);
const sourceByPath=new Map(sourceFiles.map(file=>[file.path,file.code]));

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
 * Capture every public ESM response in the known graph.
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
  for(const name of graphPaths)files[name]={sourceType:'module',code:captured[name]};
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
 * @param {string} root
 * @param {Record<string,string>} graph
 */
async function writeGraph(root,graph) {
  for(const [name,code] of Object.entries(graph)) {
    const file=path.join(root,name);
    await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.writeFile(file,code,'utf8');
  }
}

/** @param {string} root */
async function executeGraph(root) {
  const module=await import(pathToFileURL(path.join(root,'index.mjs')).href);
  return module.finalValue;
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
  /** @type {string[]} */
  const tempRoots=[];
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
    assert.ok(!scoRoundA['index.mjs'].includes('privateOffset'));
    assert.ok(!scoRoundA['lib/helper.mjs'].includes('privateMultiplier'));
    assert.ok(!scoRoundA['lib/helper.mjs'].includes('privateProduct'));

    const [reconstructedA,reconstructedB]=[
      reconstructInChild(scoRoundA),
      reconstructInChild(scoRoundB)
    ];
    for(const name of graphPaths) {
      assert.equal(reconstructedA[name],reconstructedB[name],
        'Captured per-request variants must normalize to one canonical module: '+name);
      assert.ok(!reconstructedA[name].includes('/* variant:'),
        'Canonical source must not retain the per-request marker');
    }

    const nativeDir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-native-'));
    const reconstructedDir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-reconstructed-'));
    const controlDir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-control-'));
    tempRoots.push(nativeDir,reconstructedDir,controlDir);
    const nativeGraph=Object.fromEntries(sourceFiles.map(file=>[file.path,file.code]));
    await writeGraph(nativeDir,nativeGraph);
    await writeGraph(reconstructedDir,reconstructedA);
    await writeGraph(controlDir,plainRoundA);

    const [nativeValue,reconstructedValue,controlValue]=await Promise.all([
      executeGraph(nativeDir),
      executeGraph(reconstructedDir),
      executeGraph(controlDir)
    ]);
    assert.equal(nativeValue,65,'Native two-module graph should produce expected value');
    assert.equal(reconstructedValue,nativeValue,
      'Source-only reconstruction of every captured SCO module must preserve behavior');
    assert.equal(controlValue,nativeValue,
      'Same-trust ordinary HTTP control must preserve native behavior');
  } finally {
    if(plainListening)await close(plainServer);
    if(scoListening)await close(scoServer);
    await Promise.all(tempRoots.map(root=>fs.rm(root,{recursive:true,force:true})));
  }
}

main().catch(error=>{
  process.stderr.write(String(error?.stack??error)+'\n');
  process.exitCode=1;
});
