'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {atomicWrite}=require('../src/atomic');
const {main}=require('../src/cli');

const source=[
  "'use strict';",
  'function route(x){var value=x*3;if(value>10){value+=1;}else{value-=1;}return value;}',
  'console.log(route(7));'
].join('\n');

/** @param {string} file @returns {Promise<{stdout:string,stderr:string}>} */
async function execute(file){
  return promisify(execFile)(process.execPath,[file],{
    timeout:15000,windowsHide:true,encoding:'utf8'
  });
}

test('SNO CLI selected native CFG builds runnable integrity-checked launcher',{
  timeout:30000
},async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-statement-cli-'));
  try{
    const sourceRoot=path.join(root,'source');
    const output=path.join(root,'output');
    const input=path.join(sourceRoot,'entry.cjs');
    await atomicWrite(input,source);
    const reference=await execute(input);
    await main('sno',['--root',sourceRoot,'--out',output,'--entry','entry.cjs',
      '--seed','statement-flow-cli-20261116',
      '--statement-flow','entry.cjs:route']);
    const actual=await execute(path.join(output,'sno-entry.cjs'));
    assert.equal(actual.stdout,reference.stdout);
    assert.equal(actual.stderr,reference.stderr);
    assert.match(await fs.readFile(path.join(output,'entry.cjs'),'utf8'),/switch\(/u);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('SCO CLI rejects experimental native CFG selection at admission',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-statement-sco-cli-'));
  try{
    await assert.rejects(()=>main('sco',['--root',root,'--entry','entry.cjs',
      '--statement-flow','entry.cjs:route']),/SCO CLI experimental VMs are unavailable/);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
