'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {readSourceTree}=require('../src/cli');

test('source reader preserves UTF-8 BOM, non-ASCII JavaScript, and raw asset bytes',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-utf8-valid-'));
  try {
    const original='\ufeffconst π="雪☃";\r\n';
    const asset=Buffer.from([0x00,0xff,0xfe,0x80,0x42]);
    await fs.writeFile(path.join(root,'entry.mjs'),Buffer.from(original,'utf8'));
    await fs.writeFile(path.join(root,'opaque.bin'),asset);
    const files=await readSourceTree(root);
    const script=files.find(file=>file.path==='entry.mjs');
    const opaque=files.find(file=>file.path==='opaque.bin');
    assert.equal(script?.code,original);
    assert.equal(opaque?.sourceType,'asset');
    assert.ok(Buffer.isBuffer(opaque?.code));
    assert.deepEqual(opaque.code,asset);
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('source reader rejects malformed UTF-8 in every JavaScript extension',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-utf8-invalid-'));
  try {
    for(const extension of ['js','mjs','cjs']) {
      const filename='entry.'+extension;
      const source=Buffer.concat([
        Buffer.from('const text="','utf8'),
        Buffer.from([0xc3,0x28]),
        Buffer.from('";\n','utf8')
      ]);
      await fs.writeFile(path.join(root,filename),source);
      await assert.rejects(readSourceTree(root),error=>
        error instanceof TypeError &&
        error.message==='Invalid UTF-8 JavaScript source: '+filename);
      await fs.rm(path.join(root,filename));
    }
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('CLI rejects lossy input before creating the output tree',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-utf8-cli-'));
  try {
    const input=path.join(root,'input'),output=path.join(root,'output');
    await fs.mkdir(input);
    await fs.writeFile(path.join(input,'entry.js'),
      Buffer.from([0x63,0x6f,0x6e,0x73,0x74,0x20,0x78,0x3d,0xff,0x3b]));
    const invocation=spawnSync(process.execPath,[
      path.join(__dirname,'../bin/coo.js'),
      '--root',input,'--entry','entry.js','--out',output
    ],{encoding:'utf8',timeout:15000});
    assert.notEqual(invocation.status,0);
    assert.match(invocation.stderr,/Invalid UTF-8 JavaScript source: entry\.js/);
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
