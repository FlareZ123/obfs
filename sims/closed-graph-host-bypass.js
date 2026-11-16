'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');

// Independent public-file attack: no source originals, compiler, build seed,
// trusted service, or name map are used to copy and run the published program.
const published=path.join(__dirname,'../examples/closed-graph-host/after');
const names=['entry.mjs','logic.mjs','state.mjs'];
const guard=/^\n;\(\(\)=>\{const h=globalThis\.location\?\.hostname\?\.toLowerCase\(\);if\(!\[[^\]]+\]\.includes\(h\)\)throw Error\('Unauthorized execution host'\)\}\)\(\);\n/u;

async function main() {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-host-bypass-'));
  try {
    let removed=0;
    for(const name of names){
      const source=await fs.readFile(path.join(published,name),'utf8');
      assert.match(source,guard,'Published source differs from the tested guard grammar');
      const rewritten=source.replace(guard,'');
      assert.notEqual(rewritten,source);
      await atomicWrite(path.join(dir,name),rewritten);
      removed++;
    }
    const entry=pathToFileURL(path.join(dir,'entry.mjs')).href;
    const runner='globalThis.location={hostname:"attacker.example"};'+
      'globalThis.events=[];'+
      'import('+JSON.stringify(entry)+').then(()=>{'+
      'process.stdout.write(JSON.stringify({events:globalThis.events,answer:globalThis.answer}));'+
      '},error=>{console.error(error);process.exitCode=1;});';
    const child=spawnSync(process.execPath,['--input-type=module','-e',runner],{
      encoding:'utf8',timeout:15000
    });
    if(child.error)throw child.error;
    assert.equal(child.status,0,child.stderr);
    const outcome=JSON.parse(child.stdout);
    assert.deepEqual(outcome,{events:['state','logic','entry'],answer:24});
    console.log(JSON.stringify({removedGuards:removed,unauthorizedHost:'attacker.example',
      publishedOnly:true,stillRunnable:true,...outcome}));
  }finally{
    await fs.rm(dir,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
