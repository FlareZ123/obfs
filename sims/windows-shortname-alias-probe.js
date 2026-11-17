'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');

/**
 * Check whether a host filesystem maps an NTFS-style 8.3 short name to a
 * distinct input filename. The alias candidates are an empirical probe;
 * Windows volumes can disable short names or use a different algorithm.
 * @typedef {{original:string,extension:string}} Fixture
 */

/** @type {Fixture[]} */
const fixtures=[
  {original:'privateLongOriginal.mjs',extension:'MJS'},
  {original:'secretValueHostEngine.cjs',extension:'CJS'},
  {original:'abcdefghijklmnop.js',extension:'JS'},
  {original:'long filename.js',extension:'JS'},
  {original:'private source module.mjs',extension:'MJS'}
];

/**
 * @param {Fixture} fixture
 * @returns {Promise<{original:string,examined:number,aliases:string[]}>}
 */
async function check(fixture){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-ntfs-shortname-'));
  const marker='PRIVATE_SOURCE_ORIGINAL_CANARY_'+fixture.original;
  /** @type {string[]} */
  const aliases=[];
  let examined=0;
  try{
    await fs.writeFile(path.join(root,fixture.original),marker,{flag:'wx'});
    const base=fixture.original.slice(0,fixture.original.lastIndexOf('.'))
      .replace(/[^A-Za-z0-9]/gu,'').toUpperCase();
    /** @type {Set<string>} */
    const stems=new Set([base.slice(0,6)]);
    for(let count=1;count<=6;count++)stems.add(base.slice(0,count));
    for(const stem of stems){
      for(let index=1;index<=9;index++){
        const candidate=stem+'~'+String(index)+'.'+fixture.extension;
        if(candidate.toLowerCase()===fixture.original.toLowerCase())continue;
        examined++;
        let text;
        try{
          text=await fs.readFile(path.join(root,candidate),'utf8');
        }catch(error){
          if(/** @type {NodeJS.ErrnoException} */(error).code==='ENOENT')continue;
          throw error;
        }
        if(text===marker)aliases.push(candidate);
      }
    }
    return {original:fixture.original,examined,aliases};
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

/** @returns {Promise<void>} */
async function main(){
  const results=[];
  for(const fixture of fixtures)results.push(await check(fixture));
  console.log('NTFS_SHORTNAME_ALIAS_GRID '+JSON.stringify({
    node:process.version,platform:process.platform,
    candidateChecks:results.reduce((sum,row)=>sum+row.examined,0),
    found:results.filter(row=>row.aliases.length),
    results
  }));
}
if(require.main===module)main().catch(error=>{
  console.error(error);process.exitCode=1;
});
module.exports={check,main};
