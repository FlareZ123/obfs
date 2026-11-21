'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createSnoLauncher}=require('../src');
const {main}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');

/** @returns {Buffer} */
function invalidPackageBytes() {
  return Buffer.concat([
    Buffer.from('{"type":"commonjs","note":"','utf8'),
    Buffer.from([0xc0,0xaf]),
    Buffer.from('"}','utf8')
  ]);
}

test('direct SNO launcher refuses malformed UTF-8 in the nearest package scope',()=>{
  const files=[
    {path:'package.json',code:Buffer.from('{"type":"module"}')},
    {path:'child/package.json',code:Buffer.from('{"type":"commonjs","note":"雪"}')},
    {path:'child/entry.js',code:'module.exports=21;'}
  ];
  assert.doesNotThrow(()=>createSnoLauncher(files,'child/entry.js'));
  files[1].code=invalidPackageBytes();
  assert.throws(()=>createSnoLauncher(files,'child/entry.js'),
    /Invalid UTF-8 package metadata: child\/package\.json/);
});

test('SNO CLI fails before writing output when scoped package metadata is malformed',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-package-utf8-'));
  try {
    const input=path.join(root,'input');
    const output=path.join(root,'output');
    await atomicWrite(path.join(input,'package.json'),Buffer.from('{"type":"commonjs"}'));
    await atomicWrite(path.join(input,'child','package.json'),invalidPackageBytes());
    await atomicWrite(path.join(input,'child','entry.js'),'module.exports=37;');
    await assert.rejects(
      main('sno',['--root',input,'--entry','child/entry.js','--out',output]),
      /Invalid UTF-8 package metadata: child\/package\.json/
    );
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});


test('direct SNO module-scope detector accepts one leading JSON BOM',()=>{
  const files=[
    {path:'package.json',code:Buffer.from('\ufeff{"type":"module"}','utf8')},
    {path:'entry.js',code:'module.exports=17;'}
  ];
  assert.throws(()=>createSnoLauncher(files,'entry.js'),
    /cannot require an ESM \.js entry/);
  files[0].code=Buffer.from('\ufeff{"type":"commonjs"}','utf8');
  assert.doesNotThrow(()=>createSnoLauncher(files,'entry.js'));
  files[0].code=Buffer.from('\ufeff\ufeff{"type":"commonjs"}','utf8');
  assert.throws(()=>createSnoLauncher(files,'entry.js'),SyntaxError);
});

test('SNO CLI and native Node accept nested BOM package metadata',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-package-bom-'));
  try {
    const input=path.join(root,'input');
    const output=path.join(root,'output');
    await atomicWrite(path.join(input,'package.json'),'\ufeff{"type":"module"}');
    await atomicWrite(path.join(input,'child','package.json'),'\ufeff{"type":"commonjs"}');
    await atomicWrite(path.join(input,'child','entry.js'),'module.exports=41;');
    const probe='process.stdout.write(String(require(process.argv[1])))';
    const native=spawnSync(process.execPath,['-e',probe,path.join(input,'child','entry.js')],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(native.status,0,native.stderr);
    assert.equal(native.stdout,'41');

    await main('sno',['--root',input,'--entry','child/entry.js','--out',output]);
    const emitted=spawnSync(process.execPath,['-e',probe,path.join(output,'sno-entry.cjs')],{
      encoding:'utf8',timeout:15000
    });
    assert.equal(emitted.status,0,emitted.stderr);
    assert.equal(emitted.stdout,native.stdout);
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
