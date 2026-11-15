'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {obfuscateFiles}=require('../src');
const {neutralizeHashedNames}=require('./offline-normalize');
const {fixture,execute}=require('./interfile-api-fuzz');

/**
 * Source-only attacker normalizes the public 12-digit cross-module property
 * names without any build secret or original source. A native ESM oracle
 * checks that the attacker's output remains executable and equivalent.
 * @param {number} [seedCount]
 * @returns {Promise<{graphs:number,normalizedKeys:number,semanticClones:number,
 *   originalNamesRecovered:number,nativeEqual:boolean}>}
 */
async function attack(seedCount=20) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-cross-normalize-'));
  try {
    const originals=Array.from({length:seedCount},(_,seed)=>fixture(seed,0));
    let normalizedKeys=0,semanticClones=0;
    const normalized=originals.map(item=>{
      const protectedFiles=obfuscateFiles(item.files,{
        mode:'coo',closedWorld:true,seed:'api-interfile-fuzz/'+item.index,
        strings:false,identifiers:false
      });
      assert.ok(protectedFiles.crossFile.properties>=2);
      const publicFiles=protectedFiles.files.map(file=>({
        path:file.path,sourceType:/** @type {'module'} */ ('module'),
        code:/** @type {string} */ (file.code)
      }));
      const attacker=neutralizeHashedNames(publicFiles);
      assert.ok(attacker.properties>=2);
      normalizedKeys+=attacker.properties;
      const before=publicFiles.map(file=>file.code).join('\n');
      const after=attacker.files.map(file=>file.code).join('\n');
      assert.ok(before.includes('_p'),'Expected emitted protected property markers');
      assert.ok(!after.includes('_p'),'Attacker left a protected property marker');
      // Original private spelling is not needed for functional recovery.
      const originalFields=/** @type {string} */ (item.files[0].code)
        .match(/(?:privateField|auxiliaryField)\d+/g)??[];
      assert.ok(originalFields.every(name=>!after.includes(name)));
      semanticClones++;
      return {index:item.index,files:attacker.files.map(file=>({
        ...file,sourceType:/** @type {'module'} */ ('module')
      }))};
    });
    const reference=await execute(path.join(root,'native'),originals);
    const cloned=await execute(path.join(root,'static-attacker'),normalized);
    assert.deepEqual(cloned,reference);
    return {graphs:originals.length,normalizedKeys,semanticClones,
      originalNamesRecovered:0,nativeEqual:true};
  } finally {
    await fs.rm(root,{recursive:true,force:true});
  }
}

if(require.main===module) {
  attack().then(value=>console.log(JSON.stringify(value,null,2)))
    .catch(error=>{console.error(error);process.exitCode=1;});
}

module.exports={attack};
