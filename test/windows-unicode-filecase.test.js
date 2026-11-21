'use strict';

const assert = require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');

for(const [first,second] of [
  ['s.cjs','\u017f.cjs'],
  ['i.cjs','\u0131.cjs'],
  ['\u03c2.cjs','\u03c3.cjs']
]) {
  test('case-insensitive Windows output preflight must refuse Unicode-alias files '+first+'/'+second,
    async t=>{
      if(process.platform!=='win32') {
        t.skip('Physical NTFS case folding requires a Windows runner');
        return;
      }
      const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-unicode-fold-'));
      try {
        await fs.writeFile(path.join(dir,first),'original',{flag:'wx'});
        const observed=await fs.readFile(path.join(dir,second),'utf8').catch(()=>null);
        if(observed!=='original') {
          t.skip('This filesystem does not alias the two supplied Unicode path spellings');
          return;
        }
        const files=[first,second].map((file,index)=>({
          path:file,sourceType:/** @type {'commonjs'} */ ('commonjs'),
          code:'module.exports='+index+';'
        }));
        assert.throws(()=>obfuscateFiles(files,{
          mode:'sno',seed:'windows-unicode-filename-collision',strings:false,
          properties:false,identifiers:false
        }),/Duplicate file/u);
      }finally {
        await fs.rm(dir,{recursive:true,force:true});
      }
    });
}


test('actual Windows casefold rejects aliases missed by JavaScript lowercase keys',async t=>{
  if(process.platform!=='win32'){
    t.skip('Requires a real Windows case-insensitive filesystem');
    return;
  }
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-upcase-screen-'));
  try {
    await fs.writeFile(path.join(dir,'reference-a.cjs'),'control',{flag:'wx'});
    const control=await fs.readFile(path.join(dir,'reference-A.cjs'),'utf8').catch(()=>null);
    if(control!=='control'){
      t.skip('The selected Windows volume enables case-sensitive directories');
      return;
    }
    const candidates=[0x00b5,0x0131,0x017f,0x0345,0x03c2,0x03d0,0x03d1,
      0x03d5,0x03d6,0x03f0,0x03f1,0x03f5,0x1c80,0x1c81,0x1c82,0x1c83,
      0x1c84,0x1c85,0x1c86,0x1c87,0x1c88,0x1e9b,0x1fbe];
    let collisions=0;
    for(let index=0;index<candidates.length;index++){
      const unit=String.fromCharCode(candidates[index]);
      const upper=unit.toUpperCase();
      assert.equal(upper.length,1);
      assert.notEqual(unit.toLowerCase(),upper.toLowerCase());
      const first=index+'-'+unit+'.cjs';
      const second=index+'-'+upper+'.cjs';
      await fs.writeFile(path.join(dir,first),'marker',{flag:'wx'});
      const aliased=await fs.readFile(path.join(dir,second),'utf8').catch(()=>null);
      if(aliased!=='marker')continue;
      collisions++;
      const files=[first,second].map((file,i)=>({
        path:file,sourceType:/** @type {'commonjs'} */ ('commonjs'),
        code:'module.exports='+i+';'
      }));
      assert.throws(()=>obfuscateFiles(files,{
        mode:'sno',seed:'windows-upcase-table-audit',strings:false,
        properties:false,identifiers:false
      }),/Duplicate file/u,'accepted physical path alias U+'+candidates[index].toString(16));
    }
    process.stdout.write('Actual Windows Unicode casefold candidates: '+
      candidates.length+', physical collisions: '+collisions+'\n');
  }finally {
    await fs.rm(dir,{recursive:true,force:true});
  }
});
