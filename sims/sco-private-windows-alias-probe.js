'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {atomicWrite}=require('../src/atomic');
const {createScoHandler}=require('../src');

/**
 * Compare the actual filesystem's name resolution with the case-only
 * lowercasing used by the in-memory SCO private-source publication guard.
 *
 * On NTFS, case-insensitive matching can use different Unicode tables than
 * JavaScript String.prototype.toLowerCase. This probe does not infer which
 * names are aliases based on Unicode semantics: it actually reads the file
 * through the alternate spelling and inspects the directory's entries.
 *
 * @typedef {{name:string,original:string,alias:string}} CaseFixture
 */

/** @type {CaseFixture[]} */
const fixtures=[
  {name:'long-s',original:'secret.mjs',alias:'\u017fecret.mjs'},
  {name:'dotless-i',original:'index.mjs',alias:'\u0131ndex.mjs'},
  {name:'final-sigma',original:'\u03c3igma.mjs',alias:'\u03c2igma.mjs'},
  {name:'sharp-s',original:'pass.mjs',alias:'pa\u00df.mjs'}
];

/** @param {string} file @returns {Promise<string|null>} */
async function readIfPresent(file) {
  try {
    return await fs.readFile(file,'utf8');
  }catch(error){
    if(/** @type {NodeJS.ErrnoException} */ (error).code==='ENOENT')return null;
    throw error;
  }
}

/**
 * @param {CaseFixture} sample
 * @returns {Promise<object>}
 */
async function probe(sample) {
  assert.notEqual(sample.original.toLowerCase(),sample.alias.toLowerCase(),
    'The fixture must differ under the actual source guard mapping');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-fs-alias-'));
  const protectedDirectory=path.join(root,'private');
  const canary='PRIVATE_'+sample.name+'_CANARY_20261117';
  const originalSource='export const privateValue='+JSON.stringify(canary)+';\n';
  try{
    const originalPath=path.join(protectedDirectory,sample.original);
    await atomicWrite(originalPath,originalSource);
    const alternativePath=path.join(protectedDirectory,sample.alias);
    const actual=await readIfPresent(alternativePath);
    const entries=await fs.readdir(protectedDirectory);
    const filesystemAlias=actual===originalSource&&
      entries.length===1&&entries[0]===sample.original;
    /** @type {boolean|null} */
    let publicationAdmitted=null;
    /** @type {number|null} */
    let publicStatus=null;
    if(filesystemAlias){
      const privatePath='private/'+sample.original;
      const aliasPath='private/'+sample.alias;
      try {
        const server=http.createServer(createScoHandler([
          {path:'visible.mjs',sourceType:'module',
            code:'export const visible = 1;',privateModulePaths:[privatePath]},
          {path:aliasPath,sourceType:'module',code:originalSource}
        ]));
        publicationAdmitted=true;
        try {
          await new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(undefined)));
          const address=server.address();
          assert.ok(address&&typeof address!=='string');
          const encoded=aliasPath.split('/').map(encodeURIComponent).join('/');
          const response=await fetch('http://127.0.0.1:'+address.port+'/obfs/'+encoded);
          publicStatus=response.status;
        }finally{
          await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve(undefined)));
        }
      }catch(error){
        if(!(error instanceof TypeError)||!/must not serve private source/u.test(error.message)){
          throw error;
        }
        publicationAdmitted=false;
      }
    }
    return {
      fixture:sample.name,original:sample.original,alias:sample.alias,
      jsLowerCaseCollides:sample.original.toLowerCase()===sample.alias.toLowerCase(),
      jsUpperCaseCollides:sample.original.toUpperCase()===sample.alias.toUpperCase(),
      filesystemAlias,entries,publicationAdmitted,publicStatus
    };
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}

async function main(){
  const cases=[];
  for(const sample of fixtures)cases.push(await probe(sample));
  const summary={
    source:'sims/sco-private-windows-alias-probe.js',
    node:process.version,platform:process.platform,
    aliasFixtures:cases.filter(x=>x.filesystemAlias).length,
    aliasCasesPublished:cases.filter(x=>x.filesystemAlias&&x.publicStatus===200).length,
    cases
  };
  console.log('SCO_PRIVATE_WINDOWS_ALIAS_PROBE '+JSON.stringify(summary));
  for(const item of cases){
    if(item.filesystemAlias&&item.publicationAdmitted){
      assert.equal(item.publicStatus,200,'An accepted alias should be publicly retrievable');
    }
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
