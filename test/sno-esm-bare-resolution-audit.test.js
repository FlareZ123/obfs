'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {main}=require('../src/cli');
const {atomicWrite}=require('../src/atomic');
const {directBareImports}=require('../src/sno-bare-audit');

const packageName='sno-esm-resolution-probe';

/**
 * Run a native or generated SNO entry in a separate Node process.
 * @param {string} entry
 * @returns {number}
 */
function execute(entry) {
  const child=spawnSync(process.execPath,['-e',
    'process.stdout.write(String(require(process.argv[1])))',entry],{
      encoding:'utf8',timeout:15000
    });
  if(child.error)throw child.error;
  assert.equal(child.status,0,child.stderr);
  return Number(child.stdout);
}

/**
 * @param {string} root
 * @param {number} importValue
 * @param {number} requireValue
 * @returns {Promise<void>}
 */
async function writePackage(root,importValue,requireValue) {
  const directory=path.join(root,'node_modules',packageName);
  await atomicWrite(path.join(directory,'package.json'),JSON.stringify({
    type:'module',
    exports:{'.':{import:'./import.mjs',require:'./require.cjs'}}
  }));
  await atomicWrite(path.join(directory,'import.mjs'),
    'export const value='+String(importValue)+';');
  await atomicWrite(path.join(directory,'require.cjs'),
    'module.exports='+String(requireValue)+';');
}

/**
 * @param {string} root
 * @returns {Promise<void>}
 */
async function writeApplication(root) {
  await atomicWrite(path.join(root,'engine.mjs'),
    "import {value} from '"+packageName+"';export default value+13;");
  await atomicWrite(path.join(root,'entry.cjs'),
    "module.exports=require('./engine.mjs').default;");
}

/**
 * @param {(directory:string)=>Promise<void>} callback
 * @returns {Promise<void>}
 */
async function fixture(callback) {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-sno-esm-bare-audit-'));
  try {await callback(temp);}
  finally {await fs.rm(temp,{recursive:true,force:true});}
}

test('opt-in SNO ESM audit detects a different import-condition dependency before publication',async()=>{
  await fixture(async temp=>{
    const source=path.join(temp,'source');
    const output=path.join(temp,'output');
    const guarded=path.join(temp,'guarded');
    await writeApplication(source);
    await writePackage(source,103,401);
    await writePackage(output,107,401);
    assert.equal(execute(path.join(source,'entry.cjs')),116);

    await main('sno',['--root',source,'--entry','entry.cjs',
      '--out',output,'--seed','sno-esm-relocation-control']);
    assert.equal(execute(path.join(output,'sno-entry.cjs')),120,
      'Without the optional audit the relocated ESM import selects different package bytes');

    await writePackage(guarded,107,401);
    await assert.rejects(
      main('sno',['--root',source,'--entry','entry.cjs',
        '--out',guarded,'--seed','sno-esm-relocation-control','--audit-bare-esm']),
      error=>error instanceof Error&&
        /SNO ESM bare dependency resolution differs: engine\.mjs -> sno-esm-resolution-probe/u.test(error.message)&&
        /import\.mjs/u.test(error.message)
    );
    await assert.rejects(fs.stat(path.join(guarded,'sno-entry.cjs')),{code:'ENOENT'});
    await assert.rejects(fs.stat(path.join(guarded,'engine.mjs')),{code:'ENOENT'});
  });
});

test('opt-in SNO ESM audit accepts one shared dependency and preserves emitted bytes',async()=>{
  await fixture(async temp=>{
    const root=path.join(temp,'project');
    const source=path.join(root,'source');
    const output=path.join(root,'output');
    const control=path.join(root,'control');
    await writeApplication(source);
    await writePackage(root,103,401);
    const args=['--root',source,'--entry','entry.cjs',
      '--seed','sno-esm-shared-dependency'];
    await main('sno',[...args,'--out',output,'--audit-bare-esm']);
    await main('sno',[...args,'--out',control]);
    for(const filename of ['engine.mjs','entry.cjs','sno-entry.cjs']) {
      assert.deepEqual(
        await fs.readFile(path.join(output,filename)),
        await fs.readFile(path.join(control,filename))
      );
    }
    assert.equal(execute(path.join(source,'entry.cjs')),116);
    assert.equal(execute(path.join(output,'sno-entry.cjs')),116);
  });
});

test('ESM audit collects static, re-export, literal dynamic and import.meta.resolve specifiers',()=>{
  const files=[
    {path:'entry.mjs',sourceType:'module',code:
      "import value from 'alpha';export {value as other} from 'beta';"+
      "export * from 'gamma';void import('delta');"+
      "const resolved=import.meta.resolve('epsilon');"+
      "import 'node:fs';import './relative.mjs';"},
    {path:'dynamic.cjs',sourceType:'commonjs',code:
      "module.exports=import('zeta');"}
  ];
  assert.deepEqual([...directBareImports(files)],[
    ['entry.mjs',['alpha','beta','delta','epsilon','gamma']],
    ['dynamic.cjs',['zeta']]
  ]);
});

test('ESM audit refuses unresolved dynamic imports, aliases, package imports and opaque modules',()=>{
  for(const code of [
    "void import(specifier);",
    "const resolved=import.meta.resolve(specifier);",
    "const resolve=import.meta.resolve;resolve('pkg');",
    "import '#internal';",
    "eval(\"import('pkg')\");",
    "new Function(\"return import('pkg')\")();"
  ]) {
    assert.throws(()=>directBareImports([{
      path:'entry.mjs',sourceType:'module',code
    }]),/cannot prove literal imports/u);
  }
  assert.throws(()=>directBareImports([{
    path:'opaque.mjs',sourceType:'asset',
    code:Buffer.from("import value from 'pkg';")
  }]),/cannot inspect opaque JavaScript/u);
});

test('ESM audit flag is restricted to SNO',async()=>{
  await fixture(async temp=>{
    const source=path.join(temp,'source');
    await atomicWrite(path.join(source,'entry.mjs'),'export default 7;');
    await assert.rejects(main('coo',[
      '--root',source,'--entry','entry.mjs','--audit-bare-esm'
    ]),/--audit-bare-esm is SNO-only/u);
  });
});
