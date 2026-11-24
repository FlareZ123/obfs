'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createScoHandler}=require('../src');
const {atomicWrite}=require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/**
 * Fetch each SCO response as an independent browser module request.
 * @param {ModuleFile[]} source
 * @returns {Promise<ModuleFile[]>}
 */
async function receive(source){
  const server=http.createServer(createScoHandler(source,{closedWorld:true}));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  try{
    const address=server.address();
    assert.ok(address&&typeof address==='object');
    const output=[];
    for(const file of source){
      const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/'+file.path);
      assert.equal(response.status,200,file.path);
      output.push({...file,code:await response.text()});
    }
    return output;
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

/**
 * Execute the served client modules under a host-controlled callback API.
 * The host captures callback source and deliberately does not invoke it.
 * @param {ModuleFile[]} files
 * @returns {Promise<{stdout:string,source:string,invoked:boolean}>}
 */
async function execute(files){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-held-callable-'));
  try{
    for(const file of files){
      const destination=path.join(directory,file.path);
      await fs.mkdir(path.dirname(destination),{recursive:true});
      await atomicWrite(destination,file.code);
    }
    const observationPath=path.join(directory,'observation.json');
    const preload=[
      "'use strict';",
      "const fs=require('node:fs');",
      'globalThis.ARM_HOST_OBSERVER=function(){',
      '  globalThis.queueMicrotask=function(callback){',
      '    const source=Function.prototype.toString.call(callback);',
      "    fs.writeFileSync(process.env.OBFS_SCO_HOST_HELD_OBSERVATION,JSON.stringify({source,invoked:false}));",
      '  };',
      '};'
    ].join('\n');
    const preloadPath=path.join(directory,'preload.cjs');
    await atomicWrite(preloadPath,preload);
    const child=spawnSync(process.execPath,
      ['--require',preloadPath,path.join(directory,'entry.mjs')],{
        encoding:'utf8',timeout:15000,
        env:{...process.env,OBFS_SCO_HOST_HELD_OBSERVATION:observationPath}
      });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    const observed=JSON.parse(await fs.readFile(observationPath,'utf8'));
    return {stdout:child.stdout.trim(),source:observed.source,invoked:observed.invoked};
  }finally{
    await fs.rm(directory,{recursive:true,force:true});
  }
}

test('SCO handler source delivery lets a client host observe a returned private callback',{
  timeout:30000
},async()=>{
  /** @type {ModuleFile[]} */
  const source=[
    {
      path:'helper.mjs',sourceType:'module',
      code:[
        'function hidden(inputValue){return inputValue+1;}',
        'export function getCallback(){return hidden;}'
      ].join('\n')
    },
    {
      path:'entry.mjs',sourceType:'module',
      code:[
        "import {getCallback} from './helper.mjs';",
        'ARM_HOST_OBSERVER();',
        'queueMicrotask(getCallback());',
        "console.log('done');"
      ].join('\n')
    }
  ];
  const native=await execute(source);
  assert.equal(native.stdout,'done');
  assert.equal(native.source,'function hidden(inputValue){return inputValue+1;}');
  assert.equal(native.invoked,false);

  const delivered=await receive(source);
  const transformed=await execute(delivered);
  assert.equal(transformed.stdout,native.stdout);
  assert.notEqual(transformed.source,native.source,
    'SCO per-request client source mutation must account for host-held callable observation');
  assert.equal(transformed.invoked,false);
  console.log('AGENT9_SCO_HOST_HELD_CALLABLE '+JSON.stringify({
    native:native.source,emitted:transformed.source,invoked:transformed.invoked,
    helperBytes:Buffer.byteLength(delivered.find(file=>file.path==='helper.mjs')?.code??'')
  }));
});
