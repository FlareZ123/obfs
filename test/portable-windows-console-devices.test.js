'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles,createSnoLauncher,createScoHandler}=require('../src');

/** @param {string} name @returns {{path:string,sourceType:'asset',code:Buffer}} */
function asset(name){
  return {path:name,sourceType:'asset',code:Buffer.from('safe')};
}

const entry={path:'entry.cjs',sourceType:/** @type {const} */('commonjs'),
  code:'module.exports=17;'};

for(const device of ['CONIN$','CONOUT$','conin$','CoNoUt$']){
  test('prefixed Win32 console device spelling is a valid ordinary asset '+device,()=>{
    const files=[entry,asset('assets/'+device)];
    for(const mode of /** @type {const} */(['coo','sno','sco'])){
      const output=obfuscateFiles(files,{mode});
      assert.deepEqual(output.files.map(file=>file.path),
        files.map(file=>file.path));
    }
    assert.doesNotThrow(()=>createSnoLauncher(files,'entry.cjs'));
    assert.doesNotThrow(()=>createScoHandler(files.slice(1)));
  });
}

test('non-bare console names retain positive acceptance',()=>{
  const files=[entry,asset('assets/CONIN$.txt'),asset('assets/CONOUT$.txt')];
  for(const mode of /** @type {const} */(['coo','sno','sco'])){
    const output=obfuscateFiles(files,{mode});
    assert.deepEqual(output.files.map(file=>file.path),
      files.map(file=>file.path));
  }
});

test('Windows Node filesystem treats directory-prefixed CONIN$/CONOUT$ as ordinary files',async(t)=>{
  if(process.platform!=='win32')return t.skip('Windows-only native Win32 path audit');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-condevice-'));
  try{
    for(const device of ['CONIN$','CONOUT$','CONIN$.txt','CONOUT$.txt']){
      const target=path.join(root,device);
      /** @type {string|undefined} */
      let writeError;
      /** @type {string|undefined} */
      let lstatError;
      /** @type {string|undefined} */
      let readback;
      try{await fs.writeFile(target,'witness');}
      catch(error){writeError=String(error);}
      try{await fs.lstat(target);}
      catch(error){lstatError=String(error);}
      if(!writeError){
        try{readback=await fs.readFile(target,'utf8');}
        catch(error){readback=String(error);}
      }
      console.log('WIN32_DEVICE_PATH_AUDIT '+JSON.stringify({
        device,writeError,lstatError,readback}));
      assert.equal(writeError,undefined,device+' should be writable with a parent directory');
      assert.equal(lstatError,undefined,device+' should be stat-able with a parent directory');
      assert.equal(readback,'witness',device+' should round trip verbatim');
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
