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
 * Execute a CommonJS module with a hostile thenable. In non-strict CommonJS,
 * V8 CallSite.getFunction() exposes the active private function objects.
 * @param {string} source
 * @returns {Promise<{seen:{name:string,source:string|null}[],same:boolean}>}
 */
async function inspectThenableReader(source){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-async-reader-observer-'));
  try{
    await atomicWrite(path.join(root,'reader.cjs'),source);
    await atomicWrite(path.join(root,'entry.cjs'),[
      'const {run}=require("./reader.cjs");',
      'Error.prepareStackTrace=(_error,sites)=>sites;',
      'const seen=[];',
      'const thenable=new Proxy({}, {',
      '  get(target,key,receiver){',
      '    if(key==="then"){',
      '      const frames=new Error().stack;',
      '      for(const site of frames){',
      '        const name=site.getFunctionName();',
      '        if(name==="read"||name==="outer"){',
      '          const fn=site.getFunction();',
      '          seen.push({name,source:typeof fn==="function"?Function.prototype.toString.call(fn):null});',
      '        }',
      '      }',
      '      return undefined;',
      '    }',
      '    return Reflect.get(target,key,receiver);',
      '  }',
      '});',
      'run(thenable).then(value=>process.stdout.write(JSON.stringify({seen,same:value===thenable})));'
    ].join('\n'));
    const child=spawnSync(process.execPath,[path.join(root,'entry.cjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{seen:{name:string,source:string|null}[],same:boolean}} */ (JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('private async reader cannot expose its function source through implicit thenable assimilation',async()=>{
  const source=[
    'function outer(payload){',
    '  const owner={privateField:payload};',
    '  async function read(){return owner.privateField;}',
    '  return read();',
    '}',
    'function run(input){return outer(input);}',
    'module.exports={run};'
  ].join('\n');
  const native=await inspectThenableReader(source);
  assert.ok(native.seen.some(item=>item.name==='read'&&item.source?.includes('owner.privateField')),
    'native Promise resolution should expose the active async reader frame to the hostile thenable');
  assert.ok(native.seen.some(item=>item.name==='outer'&&item.source?.includes('owner.privateField')),
    'the nested private helper source should be visible through the active caller frame');

  /** @type {{mode:string,properties:number,seen:{name:string,source:string|null}[],same:boolean}|{mode:string,error:string}[]} */
  const observations=[];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    try{
      const transformed=obfuscateFiles([{
        path:'reader.cjs',sourceType:'commonjs',code:source
      }],{
        mode,seed:'agent4-async-reader-thenable/'+mode,
        properties:true,identifiers:false,strings:false
      });
      const output=transformed.files.find(file=>file.path==='reader.cjs');
      assert.ok(output);
      const emitted=await inspectThenableReader(String(output.code));
      observations.push({mode,properties:output.metrics.properties,seen:emitted.seen,same:emitted.same});
      assert.equal(emitted.same,native.same,mode+': thenable result identity must remain equal');
    }catch(error){
      observations.push({mode,error:String(error)});
    }
  }
  console.log('AGENT4_ASYNC_READER_THENABLE_WITNESS '+JSON.stringify({
    native,observations
  }));
  const tested=observations.filter(item=>item.mode==='coo'||item.mode==='sno'||item.mode==='sco');
  assert.equal(tested.length,3,'all three modes must execute');
  assert.ok(tested.every(item=>!item.error&&item.properties===0&&
    JSON.stringify(item.seen)===JSON.stringify(native.seen)),
    'async private readers whose returned values may be thenables must not admit source-changing owner-key rewrites');
});
