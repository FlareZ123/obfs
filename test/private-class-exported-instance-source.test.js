'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');

const source=[
  'const owner={privateField:7};',
  'class Reader{read(){return owner.privateField;}}',
  'export const reader=new Reader();'
].join('\n');

/**
 * Import the transformed module from a separate consumer and inspect the
 * exported method through the same Function#toString surface available to
 * an external module.
 * @param {string} code
 * @returns {Promise<{methodSource:string,value:number}>}
 */
async function inspectExportedInstance(code){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-private-instance-'));
  try{
    await atomicWrite(path.join(root,'reader.mjs'),code);
    await atomicWrite(path.join(root,'entry.mjs'),[
      'import {reader} from "./reader.mjs";',
      'process.stdout.write(JSON.stringify({methodSource:reader.read.toString(),value:reader.read()}));'
    ].join('\n'));
    const child=spawnSync(process.execPath,[path.join(root,'entry.mjs')],{
      cwd:root,encoding:'utf8',timeout:15000
    });
    assert.equal(child.status,0,child.stderr||child.error?.message);
    return /** @type {{methodSource:string,value:number}} */ (JSON.parse(child.stdout));
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

for(const mode of /** @type {Array<'coo'|'sno'|'sco'>} */ (['coo','sno','sco'])){
  test(mode+' exported instance declaration must not expose a renamed class method',async()=>{
    const native=await inspectExportedInstance(source);
    const transformed=obfuscateFiles([{
      path:'reader.mjs',sourceType:'module',code:source
    }],{
      mode,seed:'private-class-exported-instance/'+mode,
      properties:true,identifiers:false,strings:false
    });
    const output=transformed.files.find(file=>file.path==='reader.mjs');
    assert.ok(output,'the module must remain present in '+mode);
    assert.equal(output.metrics.properties,0,
      mode+': an exported instance is not a private class instance');
    assert.ok(output.code.includes('read(){return owner.privateField;}'),
      mode+': preserve the method body spelling for external source observers');

    if(mode!=='sco'){
      const emitted=await inspectExportedInstance(String(output.code));
      assert.equal(emitted.value,native.value,
        mode+': the exported method must preserve its computed result');
      assert.equal(emitted.methodSource,native.methodSource,
        mode+': Function#toString must remain byte-identical');
    }
  });
}
