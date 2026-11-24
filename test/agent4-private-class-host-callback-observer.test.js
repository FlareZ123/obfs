'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

/**
 * Execute a CommonJS module whose private enclosing function calls a
 * host-provided callback. V8 exposes the active function through CallSite.
 * @param {string} source
 * @returns {Promise<{outerSource:string|null,value:number}>}
 */
async function inspectHostCallback(source){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-host-callback-'));
  try{
    await atomicWrite(path.join(root,'reader.cjs'),source);
    await atomicWrite(path.join(root,'entry.cjs'),[
      'Error.prepareStackTrace=(_error,sites)=>sites;',
      'let outerSource=null;',
      'global.hostCallback=function hostCallback(){',
      '  const frames=new Error().stack;',
      '  const site=frames.find(frame=>frame.getFunctionName()==="outer");',
      '  const fn=site?.getFunction();',
      '  outerSource=typeof fn==="function"?Function.prototype.toString.call(fn):null;',
      '};',
      'const {run}=require("./reader.cjs");',
      'const value=run(7);',
      'process.stdout.write(JSON.stringify({outerSource,value}));'
    ].join('\n'));
    const child=spawnSync(process.execPath,[path.join(root,'entry.cjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{outerSource:string|null,value:number}} */ (JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('private class method is not source-private when its enclosing function invokes a host callback',async()=>{
  const source=[
    'function outer(payload){',
    '  const owner={privateField:payload};',
    '  class Reader{read(){return owner.privateField;}}',
    '  const reader=new Reader();',
    '  hostCallback();',
    '  return reader.read();',
    '}',
    'function run(input){return outer(input);}',
    'module.exports={run};'
  ].join('\n');
  const native=await inspectHostCallback(source);
  assert.ok(native.outerSource?.includes('owner.privateField'),
    'the host callback must be able to inspect the native enclosing function source');

  /** @type {{mode:string,properties:number,outerSource:string|null,value:number}|{mode:string,error:string}[]} */
  const observations=[];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    try{
      const transformed=obfuscateFiles([{
        path:'reader.cjs',sourceType:'commonjs',code:source
      }],{
        mode,seed:'agent4-private-class-host-callback/'+mode,
        properties:true,identifiers:false,strings:false
      });
      const output=transformed.files.find(file=>file.path==='reader.cjs');
      assert.ok(output);
      const emitted=await inspectHostCallback(String(output.code));
      observations.push({mode,properties:output.metrics.properties,...emitted});
      assert.equal(emitted.value,native.value,mode+': ordinary execution result must remain equal');
    }catch(error){
      observations.push({mode,error:String(error)});
    }
  }
  console.log('AGENT4_PRIVATE_CLASS_HOST_CALLBACK_WITNESS '+JSON.stringify({
    native,observations
  }));
  const tested=observations.filter(item=>item.mode==='coo'||item.mode==='sno'||item.mode==='sco');
  assert.equal(tested.length,3,'all three modes must execute');
  assert.ok(tested.every(item=>!item.error&&item.properties===0&&
    item.outerSource===native.outerSource),
    'a private enclosing function that invokes a host callback must not expose transformed nested method source');
});
