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

/**
 * Find every pair among BMP single-codepoint filenames that shares modern
 * ECMAScript uppercase identity but not its lowercase identity. Query the
 * real filesystem for each candidate, rather than assuming its per-volume
 * NTFS upcase table follows the current JavaScript Unicode tables.
 *
 * @returns {Array<[string,string]>}
 */
function modernUpperOnlyCandidates() {
  /** @type {Map<string,Map<string,string>>} */
  const groups=new Map();
  for(let codepoint=0x20;codepoint<0x10000;codepoint++){
    const character=String.fromCharCode(codepoint);
    if(/[<>:\\x22|?*\\\\/\\x00-\\x1f\\uD800-\\uDFFF]/u.test(character)||
       /[. ]$/u.test(character))continue;
    const normalized=character.normalize('NFC');
    const upper=normalized.toUpperCase().normalize('NFC');
    const lower=normalized.toLowerCase().normalize('NFC');
    let lowerClasses=groups.get(upper);
    if(!lowerClasses){lowerClasses=new Map();groups.set(upper,lowerClasses);}
    if(!lowerClasses.has(lower))lowerClasses.set(lower,character);
  }
  return [...groups.values()].filter(classes=>classes.size>1).
    map(classes=>/** @type {[string,string]} */([...classes.values()].slice(0,2)));
}

test('live filesystem uppercase divergence sweep finds no unrefused portable aliases',async t=>{
  const candidates=modernUpperOnlyCandidates();
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-ntfs-upcase-sweep-'));
  /** @type {Array<{first:string,second:string}>} */
  const observed=[];
  try{
    for(let index=0;index<candidates.length;index++){
      const [first,second]=candidates[index];
      const directory=path.join(root,String(index));
      await fs.mkdir(directory);
      await fs.writeFile(path.join(directory,first+'.png'),Buffer.from([1]),{flag:'wx'});
      let aliases=false;
      try{
        await fs.writeFile(path.join(directory,second+'.png'),Buffer.from([2]),{flag:'wx'});
      }catch(error){
        if(error instanceof Error&&'code' in error&&error.code==='EEXIST')aliases=true;
        else throw error;
      }
      if(aliases)observed.push({first,second});
    }
    t.diagnostic(JSON.stringify({
      platform:process.platform,modernUpperOnlyCandidates:candidates.length,
      actualFilesystemAliases:observed
    }));
    for(const {first,second} of observed){
      expectPortableRejection('images/'+first+'.png','images/'+second+'.png',
        'live uppercase collision U+'+first.codePointAt(0)?.toString(16));
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
