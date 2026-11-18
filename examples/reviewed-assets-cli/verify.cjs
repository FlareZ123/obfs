'use strict';

const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {atomicWrite}=require('../../src/atomic');

/** @param {'coo'|'sno'} mode @param {string[]} args */
function run(mode,args) {
  const result=spawnSync(process.execPath,[path.join(__dirname,'../../bin/'+mode+'.js'),...args],{
    encoding:'utf8',timeout:10000
  });
  return result;
}

async function main(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-reviewed-example-'));
  const source=path.join(__dirname,'source');
  const manifest=path.join(__dirname,'reviewed.json');
  const approved=JSON.parse(await fs.readFile(manifest,'utf8'));
  const css=await fs.readFile(path.join(source,'theme.css'));
  assert.equal(createHash('sha256').update(css).digest('hex'),approved[0].sha256);
  try {
    for(const [mode,entry] of /** @type {Array<['coo'|'sno',string]>} */ ([
      ['coo','browser.mjs'],['sno','server.cjs']
    ])) {
      const out=path.join(root,mode);
      const command=run(mode,['--root',source,'--entry',entry,'--out',out,
        '--reviewed-assets',manifest,'--seed','reviewed-example']);
      assert.equal(command.status,0,command.stderr);
      assert.deepEqual(await fs.readFile(path.join(out,'theme.css')),css);
      if(mode==='coo'){
        const module=await import(pathToFileURL(path.join(out,'browser.mjs')).href);
        assert.equal(module.result,17);
      }else{
        assert.equal(require(path.join(out,'sno-entry.cjs')).result,17);
      }
      console.log(mode+' approved content unchanged; original and obfuscated result 17');
    }
    const bad=path.join(root,'stale-review.json');
    await atomicWrite(bad,JSON.stringify([{path:'theme.css',sha256:'0'.repeat(64)}]));
    const failed=run('coo',['--root',source,'--entry','browser.mjs',
      '--out',path.join(root,'invalid'),'--reviewed-assets',bad]);
    assert.notEqual(failed.status,0);
    assert.match(failed.stderr,/Opaque asset differs from reviewed bytes/);
    await assert.rejects(fs.stat(path.join(root,'invalid')),{code:'ENOENT'});
    console.log('Stale independent review refused before any output files were emitted');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
