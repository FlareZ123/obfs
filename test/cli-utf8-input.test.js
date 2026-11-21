'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {readSourceTree}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');

test('source reader preserves UTF-8 BOM, non-ASCII JavaScript, and raw asset bytes',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-utf8-valid-'));
  try {
    const original='\ufeffconst π="雪☃";\r\n';
    const asset=Buffer.from([0x00,0xff,0xfe,0x80,0x42]);
    await atomicWrite(path.join(root,'entry.mjs'),Buffer.from(original,'utf8'));
    await atomicWrite(path.join(root,'caf\u00e9.mjs'),'export const value=17;');
    await atomicWrite(path.join(root,'opaque.bin'),asset);
    const files=await readSourceTree(root);
    const script=files.find(file=>file.path==='entry.mjs');
    const opaque=files.find(file=>file.path==='opaque.bin');
    assert.equal(script?.code,original);
    assert.equal(files.find(file=>file.path==='caf\u00e9.mjs')?.code,'export const value=17;');
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
    const invalidSequences=[
      [0xc3,0x28],       // invalid continuation
      [0xe2,0x82],       // truncated sequence
      [0xc0,0xaf],       // overlong encoding
      [0xed,0xa0,0x80],  // UTF-8 encoding of a surrogate
      [0xf4,0x90,0x80,0x80], // above Unicode maximum
      [0x80]            // stray continuation
    ];
    for(const extension of ['js','mjs','cjs']) {
      const filename='entry.'+extension;
      for(const sequence of invalidSequences) {
        const source=Buffer.concat([
          Buffer.from('const text="','utf8'),
          Buffer.from(sequence),
          Buffer.from('";\n','utf8')
        ]);
        await atomicWrite(path.join(root,filename),source);
        await assert.rejects(readSourceTree(root),error=>
          error instanceof TypeError &&
          error.message==='Invalid UTF-8 JavaScript source: '+filename);
        await fs.rm(path.join(root,filename));
      }
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
    await atomicWrite(path.join(input,'entry.js'),
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


test('POSIX source filename bytes reject malformed UTF-8 before aliasing U+FFFD',{
  skip:process.platform==='win32'
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-utf8-filename-'));
  try {
    const bad=Buffer.concat([
      Buffer.from(root+path.sep+'bad-','utf8'),
      Buffer.from([0xff]),
      Buffer.from('.js','utf8')
    ]);
    // A tiny one-off fixture must be created through its raw byte path.
    await fs.writeFile(bad,'module.exports=1;',{flag:'wx'});
    await atomicWrite(path.join(root,'bad-\ufffd.js'),'module.exports=2;');
    await assert.rejects(readSourceTree(root),
      /Invalid UTF-8 source filename in \.: /);
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
