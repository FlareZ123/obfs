'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {main}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');

const packageName='sno-external-resolution-probe';

/**
 * Run native or generated SNO entry through Node's real CommonJS resolver.
 * @param {string} entry
 * @returns {number}
 */
function execute(entry) {
  const script='process.stdout.write(String(require(process.argv[1])))';
  const child=spawnSync(process.execPath,['-e',script,entry],{
    encoding:'utf8',timeout:15000
  });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return Number(child.stdout);
}

/**
 * Check the undeclared dependency boundary both with isolated and shared
 * parent node_modules directories. This is intentionally a negative witness:
 * the compiler cannot preserve code supplied by a different deployment.
 * @param {boolean} shared
 * @returns {Promise<void>}
 */
async function checkResolution(shared) {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-package-lookup-'));
  try {
    const root=path.join(temp,shared?'shared/input':'input');
    const output=path.join(temp,shared?'shared/output':'output');
    const sourcePackage=path.join(temp,shared?'shared/node_modules':'input/node_modules',
      packageName,'index.js');
    const outputPackage=path.join(temp,'output/node_modules',
      packageName,'index.js');
    const inputEntry=path.join(root,'entry.cjs');
    const code=`const privateMarker=13;module.exports=require('${packageName}')+privateMarker;`;
    await atomicWrite(inputEntry,code);
    await atomicWrite(sourcePackage,'module.exports=103;');
    if(!shared)await atomicWrite(outputPackage,'module.exports=107;');

    assert.equal(execute(inputEntry),116);
    await main('sno',['--root',root,'--entry','entry.cjs',
      '--out',output,'--seed','sno-bare-dependency-resolution']);

    const generated=await fs.readFile(path.join(output,'entry.cjs'),'utf8');
    assert.doesNotMatch(generated,/privateMarker/u,
      'The compiler should still transform a private lexical binding');
    const actual=execute(path.join(output,'sno-entry.cjs'));
    if(shared) {
      assert.equal(actual,116,'Shared resolver context preserves package lookup');
    } else {
      assert.equal(actual,120,
        'A distinct external node_modules changes observable SNO behavior');
      assert.notEqual(actual,execute(inputEntry));
    }
  } finally {
    await fs.rm(temp,{recursive:true,force:true});
  }
}

test('SNO source/output sibling dependency divergence survives a valid launcher manifest',async()=>{
  await checkResolution(false);
});

test('SNO preserves a native bare require when source and output use one external ancestor',async()=>{
  await checkResolution(true);
});
