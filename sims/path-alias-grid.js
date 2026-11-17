'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');

/** @type {[string,string,string][]} */
const pairs=[
  ['ascii-case','a','A'],
  ['greek-final-sigma','σ','ς'],
  ['long-s','s','ſ'],
  ['micro-sign','μ','µ'],
  ['greek-beta-symbol','β','ϐ'],
  ['greek-theta-symbol','θ','ϑ'],
  ['greek-pi-symbol','π','ϖ'],
  ['greek-phi-symbol','φ','ϕ'],
  ['kelvin-sign','K','K'],
  ['angstrom-sign','Å','Å'],
  ['german-sharp-s','ß','ẞ'],
  ['turkish-dotless-i','I','ı'],
  ['turkish-dotted-i','i̇','İ'],
  ['combining-accent','é','é'],
  ['deseret','𐐀','𐐨'],
  ['german-expansion','SS','ß']
];

/**
 * Read the actual filename-equivalence relation on the running filesystem.
 * This diagnostic deliberately uses exclusive creates to detect aliases
 * without overwriting either file or assuming a particular platform policy.
 * @returns {Promise<void>}
 */
async function main(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-path-alias-'));
  /** @type {{id:string,first:string,second:string,lowerEqual:boolean,upperEqual:boolean,secondExists:boolean,entries:string[]}[]} */
  const observed=[];
  try{
    for(const [id,first,second] of pairs){
      const dir=path.join(root,id);
      await fs.mkdir(dir);
      const firstName='probe-'+first+'.js';
      const secondName='probe-'+second+'.js';
      await fs.writeFile(path.join(dir,firstName),'first',{flag:'wx'});
      let secondExists=true;
      try{
        await fs.writeFile(path.join(dir,secondName),'second',{flag:'wx'});
      }catch(error){
        if(/** @type {NodeJS.ErrnoException} */(error).code!=='EEXIST')throw error;
        secondExists=false;
      }
      const entries=(await fs.readdir(dir)).sort();
      observed.push({
        id,first:firstName,second:secondName,
        lowerEqual:firstName.toLowerCase()===secondName.toLowerCase(),
        upperEqual:firstName.toUpperCase()===secondName.toUpperCase(),
        secondExists,entries
      });
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
  console.log('PATH_ALIAS_GRID '+JSON.stringify({
    node:process.version,platform:process.platform,
    unsafeLowerMisses:observed.filter(p=>!p.secondExists&&!p.lowerEqual).map(p=>p.id),
    observed
  }));
}

if(require.main===module)main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});

module.exports={main};
