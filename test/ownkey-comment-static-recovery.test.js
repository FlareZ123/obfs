'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {atomicWrite}=require('../src/atomic');
const {ROOT,NAMES,SEED}=require('../examples/application-challenge/build.cjs');
const {ablate,withOwnKeyCalls}=require('../sims/application-challenge-observer-ablation');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */

/** @param {ModuleFile[]} files @param {string} folder @returns {Promise<void>} */
async function materialize(files,folder) {
  for(const file of files)await atomicWrite(path.join(folder,file.path),file.code);
}

/** @param {string} folder @param {number[][]} cases @returns {unknown[]} */
function evaluate(folder,cases) {
  const child=spawnSync(process.execPath,[
    path.join(folder,'entry.mjs'),JSON.stringify(cases)
  ],{encoding:'utf8',timeout:20000});
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return JSON.parse(child.stdout);
}

test('independent public JSDoc attacker reconstructs both private field names and behavior',
  async()=>{
    /** @type {ModuleFile[]} */
    const original=await Promise.all(NAMES.map(async name=>({
      path:name,sourceType:'module',
      code:await fs.readFile(path.join(ROOT,'before',name),'utf8')
    })));
    const native=withOwnKeyCalls(ablate(original,'both'));
    const transformed=obfuscateFiles(native,{
      mode:'coo',closedWorld:true,seed:SEED,identifiers:true,
      properties:true,strings:false
    });
    assert.equal(transformed.crossFile.properties,2);
    const delivered=/** @type {ModuleFile[]} */ (transformed.files);
    const folder=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-comment-attack-'));
    try{
      const nativeDir=path.join(folder,'native');
      const publicDir=path.join(folder,'public');
      const recoveredDir=path.join(folder,'recovered');
      await Promise.all([
        materialize(native,nativeDir),
        materialize(delivered,publicDir)
      ]);
      // Child attacker sees ONLY the emitted directory and uses built-in Node.
      const child=spawnSync(process.execPath,[
        path.join(__dirname,'../sims/ownkey-comment-static-attacker.js'),publicDir
      ],{encoding:'utf8',timeout:10000});
      if(child.error)throw child.error;
      assert.equal(child.status,0,child.stderr);
      const {mapping,leakedTypeNames}=JSON.parse(child.stdout);
      assert.deepEqual(leakedTypeNames,['secretOffset','secretSalt']);
      assert.deepEqual(Object.keys(mapping),['secretOffset','secretSalt']);
      assert.ok(Object.values(mapping).every(value=>/^_p[0-9a-f]{12}$/u.test(
        /** @type {string} */ (value))));
      const reconstructed=delivered.map(file=>{
        let code=file.code;
        for(const [originalName,emittedName] of Object.entries(mapping)) {
          code=code.replaceAll(/** @type {string} */ (emittedName),originalName);
        }
        return {...file,code};
      });
      await materialize(reconstructed,recoveredDir);
      const cases=[[0,0],[0,1],[1,1],[4294967295,3],
        ...Array.from({length:80},(_,i)=>[
          Math.imul(i+37,2654435761)>>>0,(i*317)%5000
        ])];
      const expected=evaluate(nativeDir,cases);
      assert.deepEqual(evaluate(publicDir,cases),expected);
      assert.deepEqual(evaluate(recoveredDir,cases),expected,
        'Independent public-file spelling reconstruction must preserve native outputs');
      process.stdout.write('OWNKEY_COMMENT_STATIC_ATTACK '+JSON.stringify({
        publicOnly:true,sourceOriginalsAvailableToAttacker:false,
        privateKeysRecovered:Object.keys(mapping).length,
        nativeMatchedCases:cases.length,publicMatchedCases:cases.length,
        reconstructedMatchedCases:cases.length
      })+'\n');
    }finally{
      await fs.rm(folder,{recursive:true,force:true});
    }
  });
