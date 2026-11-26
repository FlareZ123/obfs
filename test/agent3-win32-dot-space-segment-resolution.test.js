'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');

test('Win32 filesystem resolves a trailing-space parent segment as dot-dot', {
  skip:process.platform!=='win32'
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-win32-dot-space-'));
  try{
    await fs.mkdir(path.join(root,'public','folder'),{recursive:true});
    await fs.writeFile(path.join(root,'public','client.js'),'target bytes');
    const alias=path.join(root,'public','folder','.. ','client.js');
    assert.equal(await fs.readFile(alias,'utf8'),'target bytes',
      'a Win32 static server that decodes URL escapes before opening the path may resolve ..<space> as ..');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
