'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createScoHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'commonjs',code:string}} CommonJsFile */

/**
 * Fetch each SCO source unit as a browser/client would.
 * @param {CommonJsFile[]} source
 * @returns {Promise<CommonJsFile[]>}
 */
async function receive(source) {
  const server=http.createServer(createScoHandler(source,{closedWorld:true}));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen({port:0,host:'127.0.0.1'},()=>resolve(undefined));
  });
  try {
    const address=server.address();
    if(!address||typeof address==='string')throw new Error('Expected TCP server address');
    /** @type {CommonJsFile[]} */
    const output=[];
    for(const file of source) {
      /** @type {Response} */
      const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/'+file.path);
      assert.equal(response.status,200,file.path);
      output.push({...file,code:await response.text()});
    }
    return output;
  }finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
  }
}

/**
 * Execute a source group under a host callback sink that reads but never invokes.
 * @param {CommonJsFile[]} files
 * @returns {Promise<{stdout:string,source:string,invoked:boolean,helper:string}>}
 */
async function execute(files) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-host-held-spelling-'));
  try {
    for(const file of files)await atomicWrite(path.join(directory,file.path),file.code);
    const observationPath=path.join(directory,'observation.json');
    const preload=[
      "'use strict';",
      "const fs=require('node:fs');",
      'globalThis.queueMicrotask=function(callback){',
      '  const source=Function.prototype.toString.call(callback);',
      "  fs.writeFileSync(process.env.OBFS_SCO_OBSERVATION,JSON.stringify({source,invoked:false}));",
      '};'
    ].join('\n');
    const preloadPath=path.join(directory,'preload.cjs');
    await atomicWrite(preloadPath,preload);
    const child=spawnSync(process.execPath,
      ['--require',preloadPath,path.join(directory,'entry.cjs')],{
        encoding:'utf8',timeout:15000,
        env:{...process.env,OBFS_SCO_OBSERVATION:observationPath}
      });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    const observation=JSON.parse(await fs.readFile(observationPath,'utf8'));
    return {
      stdout:child.stdout.trim(),
      source:observation.source,
      invoked:observation.invoked,
      helper:await fs.readFile(path.join(directory,'helper.cjs'),'utf8')
    };
  }finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

test('SCO request spelling variation mutates cross-file host-held callback source',{
  timeout:30000
},async()=>{
  /** @type {CommonJsFile[]} */
  const files=[
    {path:'helper.cjs',sourceType:'commonjs',code:
      "function createHidden(){return function hidden(){globalThis.result='helperCallbackSourceLiteral';return globalThis.result;};}"+
      'module.exports={createHidden};'},
    {path:'entry.cjs',sourceType:'commonjs',code:
      "const {createHidden}=require('./helper.cjs');"+
      'const hidden=createHidden();queueMicrotask(hidden);console.log(hidden());'}
  ];
  const native=await execute(files);
  const delivered=await receive(files);
  const emitted=await execute(delivered);
  assert.equal(native.stdout,'helperCallbackSourceLiteral');
  assert.equal(emitted.stdout,native.stdout);
  assert.ok(native.source.includes("'helperCallbackSourceLiteral'"));
  assert.notEqual(emitted.source,native.source,
    'The delivered helper callback source should expose request-time spelling mutation if the full graph observer is missed');
  assert.ok(!emitted.source.includes("'helperCallbackSourceLiteral'"),
    'The helper literal should no longer retain its original source spelling');
  assert.equal(native.invoked,false);
  assert.equal(emitted.invoked,false);
  console.log('AGENT24_SCO_HOST_HELD_SPELLING '+JSON.stringify({
    native:native.source,
    emitted:emitted.source,
    helper:emitted.helper,
    callbackInvoked:emitted.invoked
  }));
});
