'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {unicodeCaseFold}=require('../src/unicode-casefold');
const {createPathInventory,registerFilePath}=require('../src/portable-paths');

test('Unicode 15.1 casefold fallback must not inherit later Node lowercase mappings',()=>{
  const source=String.fromCodePoint(0x1C89);
  const expected15_1=source;
  const actual=unicodeCaseFold(source);
  console.log('CASEFOLD_RUNTIME_DRIFT '+JSON.stringify({
    node:process.version,
    unicode:process.versions.unicode,
    sourceCodePoint:'1C89',
    nodeLower:[...source.toLowerCase()].map(value=>value.codePointAt(0)?.toString(16)),
    expectedUnicode15_1:[...expected15_1].map(value=>value.codePointAt(0)?.toString(16)),
    actual:[...actual].map(value=>value.codePointAt(0)?.toString(16))
  }));
  assert.equal(actual,expected15_1,
    'U+1C89 was unassigned in Unicode 15.1 and must remain unchanged in a pinned 15.1 full-fold implementation');
});

test('portable path inventory conservatively rejects the Unicode 16 Cyrillic Tje pair',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-casefold-runtime-pair-'));
  const upper=String.fromCodePoint(0x1C89)+'.txt';
  const lower=String.fromCodePoint(0x1C8A)+'.txt';
  try {
    await fs.writeFile(path.join(root,upper),'upper');
    await fs.writeFile(path.join(root,lower),'lower');
    const entries=await fs.readdir(root);
    const upperContents=await fs.readFile(path.join(root,upper),'utf8');
    const lowerContents=await fs.readFile(path.join(root,lower),'utf8');
    const inventory=createPathInventory();
    registerFilePath(inventory,upper);
    let inventoryRejects=false;
    try { registerFilePath(inventory,lower); } catch { inventoryRejects=true; }
    console.log('CASEFOLD_NATIVE_PAIR '+JSON.stringify({
      platform:process.platform,
      node:process.version,
      unicode:process.versions.unicode,
      upper,
      lower,
      entries,
      filesystemAliases:entries.length===1||upperContents===lowerContents,
      inventoryRejects
    }));
    assert.equal(inventoryRejects,true,
      'The portable inventory must reject this case pair under the active Node runtime');
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
});
