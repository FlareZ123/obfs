'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');

test('Node Win32 filesystem does not collapse a trailing-space parent segment to dot-dot', {
  skip:process.platform!=='win32'
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-win32-dot-space-'));
  try{
    await fs.mkdir(path.join(root,'public','folder'),{recursive:true});
    await fs.writeFile(path.join(root,'public','client.js'),'target bytes');
    const alias=path.join(root,'public','folder','.. ','client.js');
    await assert.rejects(fs.readFile(alias,'utf8'),error=>error.code==='ENOENT',
      'Node Win32 file access treats ".. " as a distinct missing segment, not ".."');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
