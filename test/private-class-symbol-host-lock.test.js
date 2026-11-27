'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src/core');
const {atomicWrite}=require('../src/atomic');

const source=[
  'const owner={secretAlpha:23,secretBeta:7};',
  'class Reader{read(){return owner.secretAlpha;}}',
  'const reader=new Reader();',
  'globalThis.effects.push("read");',
  'export const value=reader.read()+owner.secretBeta;'
].join('\n');

/**
 * Execute one native ESM module in a fresh Node process, supplying the
 * exact browser-like host name before importing the guarded module.
 * @param {string} code
 * @param {string} hostname
 * @param {boolean} observeSymbol
 * @returns {Promise<{effects:string[],value?:number,error?:string,symbolCalls:number}>}
 */
async function run(code,hostname,observeSymbol){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-symbol-host-'));
  const runner=[
    'globalThis.location={hostname:'+JSON.stringify(hostname)+'};',
    'globalThis.effects=[];globalThis.symbolCalls=0;',
    observeSymbol?
      'const nativeSymbol=Symbol;globalThis.Symbol=new Proxy(nativeSymbol,{apply(target,receiver,args){globalThis.symbolCalls++;return Reflect.apply(target,receiver,args);}});':'',
    'import("./state.mjs").then(mod=>{',
    'process.stdout.write(JSON.stringify({effects:globalThis.effects,value:mod.value,symbolCalls:globalThis.symbolCalls}));',
    '},error=>{process.stdout.write(JSON.stringify({effects:globalThis.effects,error:error.message,symbolCalls:globalThis.symbolCalls}));});'
  ].join('\n');
  try{
    await Promise.all([
      atomicWrite(path.join(dir,'runner.mjs'),runner),
      atomicWrite(path.join(dir,'state.mjs'),code)
    ]);
    const child=spawnSync(process.execPath,[path.join(dir,'runner.mjs')],{
      cwd:dir,timeout:15000,encoding:'utf8'
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    return JSON.parse(child.stdout);
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}

test('closed ESM browser hostname guard precedes experimental native Symbol initialization',async()=>{
  const native=await run(source,'allowed.example',false);
  assert.deepEqual(native,{effects:['read'],value:30,symbolCalls:0});
  for(const mode of /** @type {const} */(['coo','sco'])){
    const transformed=obfuscateFiles([{
      path:'state.mjs',sourceType:'module',code:source
    }],{mode,seed:'private-class-symbol-host/'+mode,
      allowedHosts:['allowed.example'],closedWorld:true,
      properties:true,experimentalSymbolKeys:true,strings:false,identifiers:false}).files[0];
    assert.equal(transformed.metrics.symbolKeys,2);
    assert.match(String(transformed.code),/Unauthorized execution host/u);
    const allowed=await run(/** @type {string} */(transformed.code),'allowed.example',false);
    assert.deepEqual(allowed,native,'Authorized host preserves numeric output and effects');
    const denied=await run(/** @type {string} */(transformed.code),'denied.example',true);
    assert.deepEqual(denied.effects,[],mode+': denied host must not execute user body');
    assert.equal(denied.symbolCalls,0,mode+': denied host must not allocate generated Symbol keys');
    assert.match(denied.error??'',/Unauthorized execution host/u);
  }
});
