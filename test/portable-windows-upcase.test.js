'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {obfuscateFiles,createSnoLauncher,createScoHandler}=require('../src');

/** @typedef {import('../src/core').SourceFile} SourceFile */

/**
 * A physical casefold observation is the test oracle. JavaScript's Unicode
 * lowercasing is not the NTFS volume's on-disk UpCase table.
 *
 * @param {string} root
 * @param {'file'|'directory'} kind
 * @returns {Promise<boolean>}
 */
async function observedAliases(root,kind) {
  const left=path.join(root,'σ'+(kind==='file'?'.png':''));
  const right=path.join(root,'ς'+(kind==='file'?'.png':''));
  if(kind==='file')await fs.writeFile(left,Buffer.from([0x1]),{flag:'wx'});
  else await fs.mkdir(left);
  try {
    if(kind==='file')await fs.writeFile(right,Buffer.from([0x2]),{flag:'wx'});
    else await fs.mkdir(right);
    return false;
  } catch(error) {
    if(error instanceof Error&&'code' in error&&error.code==='EEXIST')return true;
    throw error;
  }
}

/**
 * @param {string} first
 * @param {string} second
 * @param {string} family
 */
function expectPortableRejection(first,second,family) {
  /** @type {SourceFile[]} */
  const assets=[
    {path:first,sourceType:'asset',code:Buffer.from([0,1])},
    {path:second,sourceType:'asset',code:Buffer.from([1,0])}
  ];
  /** @type {SourceFile} */
  const entry={path:'entry.cjs',sourceType:'commonjs',code:'module.exports=1;'};
  for(const mode of /** @type {const} */ (['coo','sno','sco'])){
    assert.throws(()=>obfuscateFiles([entry,...assets],{mode}),
      /Duplicate file|Ambiguous directory spelling|File conflicts with directory/,
      family+' compiled '+mode);
  }
  assert.throws(()=>createSnoLauncher([entry,...assets],'entry.cjs'),
    /Duplicate SNO file|Duplicate file|Ambiguous directory spelling/,
    family+' direct SNO');
  assert.throws(()=>createScoHandler(assets),
    /Duplicate file|Ambiguous directory spelling/,
    family+' direct SCO');
}

test('live filesystem sigma/final-sigma leaf identity matches emitted inventory',async t=>{
  assert.notEqual('σ'.normalize('NFC').toLowerCase(),
    'ς'.normalize('NFC').toLowerCase());
  assert.equal('σ'.toUpperCase(),'ς'.toUpperCase());
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-ntfs-casefold-leaf-'));
  try {
    const aliases=await observedAliases(root,'file');
    t.diagnostic(JSON.stringify({platform:process.platform,aliases,kind:'leaf'}));
    if(!aliases)return;
    expectPortableRejection('images/σ.png','images/ς.png','sigma leaf');
  } finally {
    await fs.rm(root,{force:true,recursive:true});
  }
});

test('live filesystem sigma/final-sigma directory identity matches emitted inventory',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-ntfs-casefold-dir-'));
  try {
    const aliases=await observedAliases(root,'directory');
    t.diagnostic(JSON.stringify({platform:process.platform,aliases,kind:'directory'}));
    if(!aliases)return;
    expectPortableRejection('images/σ/a.png','images/ς/b.png','sigma ancestor');
  } finally {
    await fs.rm(root,{force:true,recursive:true});
  }
});
