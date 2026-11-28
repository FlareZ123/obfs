'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {verifyScoPrivateSourceDigests}=require('../src/sco-private-integrity');

const digest='0'.repeat(64);

/**
 * The private source verifier is a second input boundary. Direct callers may
 * supply a partition without going through the compiler's file-inventory
 * checks; it must reject the same cross-platform aliases before filesystem
 * reads, rather than merely comparing JS-lowercased full paths.
 */
for(const {label,paths} of [
  {label:'NFC-equivalent filenames',
    paths:['caf\u00e9.mjs','cafe\u0301.mjs']},
  {label:'equal uppercase Greek final-sigma filenames',
    paths:['\u03a3.mjs','\u03c2.mjs']},
  {label:'case-aliased ancestor directories',
    paths:['PRIVATE/a.mjs','private/b.mjs']},
  {label:'file/directory overlap',
    paths:['bundle','bundle/module.mjs']}
]) {
  test('SCO private commitment refuses '+label,async()=>{
    const partition={privateSourceDigests:paths.map(name=>({
      path:name,sha256:digest
    }))};
    await assert.rejects(
      ()=>verifyScoPrivateSourceDigests(partition,os.tmpdir()),
      error=>error instanceof TypeError &&
        /path duplicated|Ambiguous directory spelling|File conflicts with directory/u
          .test(error.message),
      'The portable conflict must be caught before filesystem lookup'
    );
  });
}

test('SCO private verifier still accepts distinct deployed files',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sco-portable-positive-'));
  try{
    const names=['private/a.mjs','private/b.mjs'];
    const privateSourceDigests=[];
    for(let i=0;i<names.length;i++){
      const code='export const n='+i+';\n';
      const target=path.join(root,names[i]);
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.writeFile(target,code);
      privateSourceDigests.push({
        path:names[i],
        sha256:createHash('sha256').update(code).digest('hex')
      });
    }
    await verifyScoPrivateSourceDigests({privateSourceDigests},root);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
