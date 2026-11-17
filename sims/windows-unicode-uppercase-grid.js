'use strict';

const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');

/**
 * Construct single-code-point Unicode groups that JavaScript uppercases to
 * the same one-code-point string, but does not lowercase to a common value.
 * These are plausible filesystem aliases missed by a lowercase-only guard.
 * The Windows filesystem's equivalence relation is measured through actual
 * exclusive file creation, never deduced from Unicode case conversion.
 *
 * @returns {{left:string,right:string,upper:string}[]}
 */
function candidatePairs(){
  /** @type {Map<string,string[]>} */
  const groups=new Map();
  for(let cp=0;cp<=0x10ffff;cp++){
    if(cp>=0xd800&&cp<=0xdfff)continue;
    const character=String.fromCodePoint(cp);
    const upper=character.toUpperCase();
    if(Array.from(upper).length!==1)continue;
    const group=groups.get(upper);
    if(group)group.push(character);
    else groups.set(upper,[character]);
  }
  /** @type {{left:string,right:string,upper:string}[]} */
  const candidates=[];
  for(const [upper,characters] of groups){
    for(let i=0;i<characters.length;i++){
      for(let j=i+1;j<characters.length;j++){
        const left=characters[i],right=characters[j];
        if(left.toLowerCase()===right.toLowerCase())continue;
        candidates.push({left,right,upper});
      }
    }
  }
  return candidates;
}

/**
 * @param {{left:string,right:string,upper:string}} pair
 * @param {string} directory
 * @returns {Promise<{left:string,right:string,upper:string,actualAlias:boolean}>}
 */
async function inspectPair(pair,directory){
  await fs.mkdir(directory);
  const first='case-'+pair.left+'.js';
  const second='case-'+pair.right+'.js';
  await fs.writeFile(path.join(directory,first),'original',{flag:'wx'});
  let actualAlias=false;
  try{
    await fs.writeFile(path.join(directory,second),'second',{flag:'wx'});
  }catch(error){
    if(/** @type {NodeJS.ErrnoException} */(error).code!=='EEXIST')throw error;
    actualAlias=true;
  }
  if(actualAlias){
    const original=await fs.readFile(path.join(directory,first),'utf8');
    if(original!=='original')throw Error('Exclusive file creation changed original file');
  }
  return {...pair,actualAlias};
}

/** @returns {Promise<void>} */
async function main(){
  const pairs=candidatePairs();
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-case-upper-grid-'));
  /** @type {Awaited<ReturnType<typeof inspectPair>>[]} */
  const observed=[];
  try{
    for(let i=0;i<pairs.length;i++){
      observed.push(await inspectPair(pairs[i],path.join(root,String(i))));
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
  const aliases=observed.filter(item=>item.actualAlias);
  console.log('WINDOWS_UNICODE_UPPERCASE_GRID '+JSON.stringify({
    node:process.version,platform:process.platform,
    scannedCodePoints:0x110000-0x800,
    candidatePairs:pairs.length,
    aliasCount:aliases.length,
    aliasPairs:aliases.map(x=>({
      first:x.left.codePointAt(0)?.toString(16),
      second:x.right.codePointAt(0)?.toString(16),
      uppercase:x.upper.codePointAt(0)?.toString(16)
    }))
  }));
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});

module.exports={candidatePairs,inspectPair,main};
