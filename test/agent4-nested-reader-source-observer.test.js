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
 * Load an exported CommonJS caller and inspect its source from an external
 * consumer. A nested private reader is part of the exported caller's source.
 * @param {string} source
 * @returns {Promise<{callerSource:string,value:number}>}
 */
async function inspectNestedReader(source){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-nested-reader-source-'));
  try{
    await atomicWrite(path.join(root,'reader.cjs'),source);
    await atomicWrite(path.join(root,'entry.cjs'),[
      'const {create}=require("./reader.cjs");',
      'process.stdout.write(JSON.stringify({callerSource:create.toString(),value:create(7)}));'
    ].join('\n'));
    const child=spawnSync(process.execPath,[path.join(root,'entry.cjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{callerSource:string,value:number}} */ (JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

test('a private member reader nested inside an exported caller cannot change that caller source',async()=>{
  const source=[
    'function create(payload){',
    '  const owner={privateField:payload};',
    '  function read(input){return input.privateField;}',
    '  return read(owner);',
    '}',
    'module.exports={create};'
  ].join('\n');
  const native=await inspectNestedReader(source);
  assert.ok(native.callerSource.includes('input.privateField'));

  /** @type {{mode:string,properties:number,callerSource:string,value:number}|{mode:string,error:string}[]} */
  const observations=[];
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    try{
      const transformed=obfuscateFiles([{
        path:'reader.cjs',sourceType:'commonjs',code:source
      }],{
        mode,seed:'agent4-nested-reader-source/'+mode,
        properties:true,identifiers:false,strings:false
      });
      const output=transformed.files.find(file=>file.path==='reader.cjs');
      assert.ok(output);
      const emitted=await inspectNestedReader(String(output.code));
      observations.push({mode,properties:output.metrics.properties,...emitted});
      assert.equal(emitted.value,native.value,mode+': computed result should remain equal');
    }catch(error){
      observations.push({mode,error:String(error)});
    }
  }
  console.log('AGENT4_NESTED_READER_SOURCE_WITNESS '+JSON.stringify({
    native,observations
  }));
  const tested=observations.filter(item=>item.mode==='coo'||item.mode==='sno'||item.mode==='sco');
  assert.equal(tested.length,3,'all three modes must execute');
  assert.ok(tested.every(item=>!item.error&&item.properties===0&&
    item.callerSource===native.callerSource),
    'the reader body is textually nested in the source-observable caller and must not be rewritten');
});
