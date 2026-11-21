'use strict';

const assert = require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');

for(const [first,second] of [
  ['s.cjs','\u017f.cjs'],
  ['i.cjs','\u0131.cjs']
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
